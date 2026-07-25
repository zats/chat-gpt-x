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

jq -e '
  .schemaVersion == 2 and
  (.generation | type) == "number" and
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
  checksum_name="$release.zip.sha256"
  mkdir -p "$release_root"
  gh release download "$release" \
    --repo "$REPOSITORY" \
    --pattern "$checksum_name" \
    --dir "$release_root"
  read -r actual_sha archive_name < "$release_root/$checksum_name"
  [[ "$actual_sha" == "$expected_sha" && "$archive_name" == "$release.zip" ]] || {
    echo "updates/latest.json checksum does not match $release" >&2
    exit 1
  }
done < <(
  jq -r '
    [.chatgptApis[], .bindings[], .extensions[]]
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
notes="Generation $generation published from $MODE after all referenced component releases were verified."
if gh release view "$INDEX_RELEASE" --repo "$REPOSITORY" >/dev/null 2>&1; then
  gh release upload "$INDEX_RELEASE" \
    "$INDEX_FILE" \
    --repo "$REPOSITORY" \
    --clobber
  gh release edit "$INDEX_RELEASE" \
    --repo "$REPOSITORY" \
    --title "ChatGPTX update index" \
    --notes "$notes"
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
