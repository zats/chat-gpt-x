#!/usr/bin/env bash

set -euo pipefail

ARTIFACTS_FILE="${1:-}"
TARGET_SHA="${2:-}"

[[ -f "$ARTIFACTS_FILE" && "$TARGET_SHA" =~ ^[0-9a-f]{40}$ ]] || {
  echo "usage: scripts/publish-component-releases.sh <artifacts.json> <target-sha>" >&2
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

verify_archive() {
  local release="$1"
  local archive="$2"
  local checksum="$3"
  local expected_sha="$4"
  local archive_name="$release.zip"
  local checksum_values
  local checksum_sha
  local checksum_archive
  local archive_sha

  [[ -f "$archive" && -f "$checksum" ]] || {
    echo "release assets are missing for $release" >&2
    return 1
  }
  [[ "$(basename "$archive")" == "$archive_name" &&
    "$(basename "$checksum")" == "$archive_name.sha256" &&
    "$expected_sha" =~ ^[0-9a-f]{64}$ ]] || {
    echo "release asset metadata is invalid for $release" >&2
    return 1
  }

  checksum_values="$(
    awk '
      NR == 1 && NF == 2 { print $1 "\t" $2 }
      END { if (NR != 1 || NF != 2) exit 1 }
    ' "$checksum"
  )" || {
    echo "checksum asset is invalid for $release" >&2
    return 1
  }
  IFS=$'\t' read -r checksum_sha checksum_archive <<< "$checksum_values"
  [[ "$checksum_sha" == "$expected_sha" &&
    "$checksum_archive" == "$archive_name" ]] || {
    echo "checksum asset does not match expected content for $release" >&2
    return 1
  }

  archive_sha="$(hash_file "$archive")"
  [[ "$archive_sha" == "$expected_sha" &&
    "$archive_sha" == "$checksum_sha" ]] || {
    echo "release archive does not match expected content for $release" >&2
    return 1
  }
}

publish() {
  local component="$1"
  local release
  local archive
  local checksum
  local expected_sha
  local existing

  release="$(jq -er '.release' <<< "$component")"
  archive="$(jq -er '.archivePath' <<< "$component")"
  checksum="$(jq -er '.checksumPath' <<< "$component")"
  expected_sha="$(jq -er '.sha256' <<< "$component")"
  verify_archive "$release" "$archive" "$checksum" "$expected_sha"

  existing="$(
    gh release view "$release" \
      --repo "$GITHUB_REPOSITORY" \
      --json isDraft,targetCommitish \
      2>/dev/null || true
  )"
  if [[ -n "$existing" ]]; then
    jq -e \
      --arg target "$TARGET_SHA" \
      '.isDraft == false and .targetCommitish == $target' \
      <<< "$existing" >/dev/null || {
        echo "existing release $release targets different content" >&2
        exit 1
      }
    local verification_root
    verification_root="$(mktemp -d "${RUNNER_TEMP:-/tmp}/chatgptx-release-check.XXXXXX")"
    gh release download "$release" \
      --repo "$GITHUB_REPOSITORY" \
      --pattern "$release.zip" \
      --dir "$verification_root"
    gh release download "$release" \
      --repo "$GITHUB_REPOSITORY" \
      --pattern "$release.zip.sha256" \
      --dir "$verification_root"
    verify_archive \
      "$release" \
      "$verification_root/$release.zip" \
      "$verification_root/$release.zip.sha256" \
      "$expected_sha" || {
      rm -rf "$verification_root"
      echo "existing release $release has different content" >&2
      exit 1
    }
    rm -rf "$verification_root"
    echo "$release already contains the expected artifact"
    return
  fi

  gh release create "$release" \
    "$archive" \
    "$checksum" \
    --repo "$GITHUB_REPOSITORY" \
    --target "$TARGET_SHA" \
    --title "$release" \
    --notes "Published from $TARGET_SHA." \
    --latest=false
}

while IFS= read -r component; do
  publish "$component"
done < <(jq -c '.artifacts[]' "$ARTIFACTS_FILE")
