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

publish() {
  local component="$1"
  local release
  local archive
  local checksum
  local existing

  release="$(jq -er '.release' <<< "$component")"
  archive="$(jq -er '.archivePath' <<< "$component")"
  checksum="$(jq -er '.checksumPath' <<< "$component")"
  [[ -f "$archive" && -f "$checksum" ]] || {
    echo "release assets are missing for $release" >&2
    exit 1
  }

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
      --pattern "$(basename "$checksum")" \
      --dir "$verification_root"
    cmp "$checksum" "$verification_root/$(basename "$checksum")" || {
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
