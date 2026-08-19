#!/usr/bin/env bash

set -euo pipefail

INDEX_FILE="${1:-}"
MODE="${2:-}"
REPOSITORY="${GITHUB_REPOSITORY:-zats/chat-gpt-x}"
INDEX_RELEASE="updates"

[[ -f "$INDEX_FILE" ]] || {
  echo "usage: scripts/publish-update-index.sh <latest.json> <target-sha|--verify-only>" >&2
  exit 1
}
[[ "$MODE" == "--verify-only" || "$MODE" =~ ^[0-9a-f]{40}$ ]] || {
  echo "usage: scripts/publish-update-index.sh <latest.json> <target-sha|--verify-only>" >&2
  exit 1
}

command -v gh >/dev/null || {
  echo "gh is required" >&2
  exit 1
}
command -v jq >/dev/null || {
  echo "jq is required" >&2
  exit 1
}

if command -v sha256sum >/dev/null; then
  SHA256_COMMAND=(sha256sum)
elif command -v shasum >/dev/null; then
  SHA256_COMMAND=(shasum -a 256)
else
  echo "sha256sum or shasum is required" >&2
  exit 1
fi

hash_file() {
  local digest
  read -r digest _ < <("${SHA256_COMMAND[@]}" "$1")
  printf '%s\n' "$digest"
}

download_release_asset() {
  local release="$1"
  local pattern="$2"
  local directory="$3"
  local attempts=1
  local attempt

  if [[ "$MODE" != "--verify-only" ]]; then
    attempts=30
  fi
  for ((attempt = 1; attempt <= attempts; attempt += 1)); do
    if gh release download "$release" \
      --repo "$REPOSITORY" \
      --pattern "$pattern" \
      --dir "$directory"
    then
      return
    fi
    if ((attempt < attempts)); then
      echo "Waiting for $release/$pattern" >&2
      sleep 10
    fi
  done
  echo "release asset is unavailable: $release/$pattern" >&2
  return 1
}

jq -e '
  .schemaVersion == 3 and
  (.generation | type) == "number" and
  (.generation | floor) == .generation and
  .generation >= 0 and
  (.minimumLauncherVersion | type) == "string" and
  (.chatgptApis | type) == "object" and
  (.bindings | type) == "object" and
  (.extensions | type) == "object"
' "$INDEX_FILE" >/dev/null

verification_root="$(
  mktemp -d "${RUNNER_TEMP:-/tmp}/chatgptx-update-index.XXXXXX"
)"
trap 'rm -rf "$verification_root"' EXIT

while IFS=$'\t' read -r release expected_sha; do
  release_root="$verification_root/$release"
  archive_name="$release.zip"
  checksum_name="$release.zip.sha256"
  [[ "$release" =~ ^[A-Za-z0-9._-]+$ &&
    "$expected_sha" =~ ^[0-9a-f]{64}$ ]] || {
    echo "updates/latest.json has invalid release metadata" >&2
    exit 1
  }
  mkdir -p "$release_root"
  download_release_asset "$release" "$checksum_name" "$release_root"
  download_release_asset "$release" "$archive_name" "$release_root"
  checksum_values="$(
    awk '
      NR == 1 && NF == 2 { print $1 "\t" $2 }
      END { if (NR != 1 || NF != 2) exit 1 }
    ' "$release_root/$checksum_name"
  )" || {
    echo "release checksum asset is invalid for $release" >&2
    exit 1
  }
  IFS=$'\t' read -r checksum_sha checksum_archive <<< "$checksum_values"
  [[ "$checksum_sha" == "$expected_sha" &&
    "$checksum_archive" == "$archive_name" ]] || {
    echo "updates/latest.json checksum does not match $release" >&2
    exit 1
  }
  archive_sha="$(hash_file "$release_root/$archive_name")"
  [[ "$archive_sha" == "$expected_sha" &&
    "$archive_sha" == "$checksum_sha" ]] || {
    echo "release archive does not match updates/latest.json for $release" >&2
    exit 1
  }
done < <(
  jq -r '
    [.chatgptApis[], .bindings[], (.extensions[].versions[])]
    | .[]
    | [.release, .sha256]
    | @tsv
  ' "$INDEX_FILE"
)

if [[ "$MODE" == "--verify-only" ]]; then
  echo "Verified every component referenced by $INDEX_FILE"
  exit 0
fi

generation="$(jq -er '.generation' "$INDEX_FILE")"
index_sha="$(hash_file "$INDEX_FILE")"
notes="Selected generation $generation with index SHA-256 $index_sha from $MODE after all referenced component releases were verified."
current_root="$verification_root/current"
mkdir -p "$current_root"
index_release_exists=false
current_index_exists=false
upload_required=false
upload_with_clobber=false
release_metadata=""
if release_metadata="$(
  gh release view "$INDEX_RELEASE" \
    --repo "$REPOSITORY" \
    --json assets,body \
    2>/dev/null
)"; then
  index_release_exists=true
  jq -e '(.assets | type) == "array"' <<< "$release_metadata" >/dev/null || {
    echo "Published update index release has invalid asset metadata" >&2
    exit 1
  }
  release_body_state="$(
    jq -er '
      .body |
      if test(
        "^Selected generation [0-9]+ with index SHA-256 [0-9a-f]{64} from [0-9a-f]{40} after all referenced component releases were verified\\.$"
      ) then
        capture(
          "^Selected generation (?<generation>[0-9]+) with index SHA-256 (?<indexSha>[0-9a-f]{64}) from [0-9a-f]{40} after all referenced component releases were verified\\.$"
        ) + {format: "modern"}
      elif test(
        "^Generation [0-9]+ published from [0-9a-f]{40} after all referenced component releases were verified\\.$"
      ) then
        capture(
          "^Generation (?<generation>[0-9]+) published from [0-9a-f]{40} after all referenced component releases were verified\\.$"
        ) + {indexSha: "-", format: "legacy"}
      else
        error("invalid update index release body")
      end |
      (.generation | tonumber) as $generation |
      select(($generation | floor) == $generation and $generation >= 0) |
      [$generation, .indexSha, .format] |
      @tsv
    ' <<< "$release_metadata"
  )" || {
    echo "Published update index release does not record valid publication state" >&2
    exit 1
  }
  IFS=$'\t' read -r body_generation body_index_sha body_format \
    <<< "$release_body_state"

  if jq -e \
    --arg name "$(basename "$INDEX_FILE")" \
    'any(.assets[]; .name == $name)' \
    <<< "$release_metadata" >/dev/null
  then
    current_index_exists=true
    download_release_asset \
      "$INDEX_RELEASE" \
      "$(basename "$INDEX_FILE")" \
      "$current_root"
    current_index="$current_root/$(basename "$INDEX_FILE")"
    current_generation="$(
      jq -er '
        .generation |
        select(type == "number" and floor == . and . >= 0)
      ' "$current_index"
    )" || {
      echo "Published update index has an invalid generation" >&2
      exit 1
    }
    current_index_sha="$(hash_file "$current_index")"
    if [[ "$body_format" == "modern" ]] &&
      ((current_generation == body_generation)) &&
      [[ "$current_index_sha" != "$body_index_sha" ]]
    then
      echo "Published generation $current_generation does not match its selected index hash" >&2
      exit 1
    fi
  fi

  if ((body_generation > generation)); then
    if [[ "$current_index_exists" == true ]] &&
      ((current_generation >= body_generation))
    then
      echo "Generation $generation is already superseded by $current_generation"
      exit 0
    else
      echo "Generation $generation is older than recorded generation $body_generation" >&2
      exit 1
    fi
  fi
  if ((body_generation == generation)); then
    if [[ "$body_format" == "modern" && "$body_index_sha" != "$index_sha" ]]; then
      echo "Generation $generation is already selected with different content" >&2
      exit 1
    fi
    if [[ "$body_format" == "legacy" ]] && {
      [[ "$current_index_exists" == false ]] ||
        ((current_generation < body_generation));
    }; then
      echo "Generation $generation cannot be recovered without its published index hash" >&2
      exit 1
    fi
  fi

  if [[ "$current_index_exists" == true ]]; then
    if ((current_generation > generation)); then
      echo "Generation $generation is already superseded by $current_generation"
      exit 0
    fi
    if ((current_generation == generation)); then
      cmp "$INDEX_FILE" "$current_index" || {
        echo "Generation $generation is already published with different content" >&2
        exit 1
      }
      echo "Generation $generation is already published; verifying its release metadata"
    else
      upload_required=true
      upload_with_clobber=true
    fi
  else
    upload_required=true
  fi
fi

if [[ "$index_release_exists" == true ]]; then
  gh release edit "$INDEX_RELEASE" \
    --repo "$REPOSITORY" \
    --title "ChatGPTX update index" \
    --notes "$notes"
  if [[ "$upload_required" == true && "$upload_with_clobber" == true ]]; then
    gh release upload "$INDEX_RELEASE" \
      "$INDEX_FILE" \
      --repo "$REPOSITORY" \
      --clobber
  elif [[ "$upload_required" == true ]]; then
    gh release upload "$INDEX_RELEASE" \
      "$INDEX_FILE" \
      --repo "$REPOSITORY"
  fi
else
  gh release create "$INDEX_RELEASE" \
    "$INDEX_FILE" \
    --repo "$REPOSITORY" \
    --target "$MODE" \
    --title "ChatGPTX update index" \
    --notes "$notes" \
    --latest=false
fi

published_root="$verification_root/published"
mkdir -p "$published_root"
gh release download "$INDEX_RELEASE" \
  --repo "$REPOSITORY" \
  --pattern "$(basename "$INDEX_FILE")" \
  --dir "$published_root"
cmp "$INDEX_FILE" "$published_root/$(basename "$INDEX_FILE")"

published_sha="$(
  gh api \
    --method PATCH \
    "repos/$REPOSITORY/git/refs/tags/$INDEX_RELEASE" \
    -f sha="$MODE" \
    -F force=true \
    --jq '.object.sha'
)"
[[ "$published_sha" == "$MODE" ]] || {
  echo "$INDEX_RELEASE tag does not point to $MODE" >&2
  exit 1
}
echo "Published update index generation $generation"
