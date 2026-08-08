#!/usr/bin/env bash

set -euo pipefail

REPO_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
APP_VERSION="${1:-}"
DOWNLOAD_URL="${2:-}"
BASE_SHA="${3:-}"
MODE="${4:-}"
BINDING_ROOT="src/platform/bindings/$APP_VERSION"

[[ "$APP_VERSION" =~ ^[0-9]+(\.[0-9]+)+$ && -n "$DOWNLOAD_URL" && -n "$BASE_SHA" ]] &&
  [[ "$MODE" == "new" || "$MODE" == "correction" ]] || {
  echo "usage: scripts/validate-rebind-changes.sh <version> <download-url> <base-sha> <new|correction>" >&2
  exit 1
}
[[ "$(git -C "$REPO_ROOT" rev-parse HEAD)" == "$BASE_SHA" ]] || {
  echo "the rebind agent created commits" >&2
  exit 1
}
[[ -f "$REPO_ROOT/$BINDING_ROOT/manifest.json" ]] || {
  echo "the rebind agent did not create $BINDING_ROOT/manifest.json" >&2
  exit 1
}
node "$REPO_ROOT/scripts/validate-rebind-binding.mjs" \
  "$MODE" \
  "$BASE_SHA" \
  "$APP_VERSION"

shopt -s dotglob nullglob
BINDING_ENTRIES=("$REPO_ROOT/$BINDING_ROOT"/*)
[[ "${#BINDING_ENTRIES[@]}" == "4" ]] || {
  echo "the new binding must contain exactly four files" >&2
  exit 1
}
for binding_entry in "${BINDING_ENTRIES[@]}"; do
  [[ -f "$binding_entry" && ! -L "$binding_entry" ]] || {
    echo "the new binding contains a non-regular file" >&2
    exit 1
  }
  case "$(basename "$binding_entry")" in
    DERIVATION.md | host.js | manifest.json | ui-test.mjs)
      ;;
    *)
      echo "unexpected binding file: $(basename "$binding_entry")" >&2
      exit 1
      ;;
  esac
done

CHANGED_PATHS=()
while IFS= read -r changed_path; do
  CHANGED_PATHS+=("$changed_path")
done < <(
  {
    git -C "$REPO_ROOT" diff --name-only "$BASE_SHA"
    git -C "$REPO_ROOT" ls-files --others --exclude-standard
  } | sort -u
)
[[ "${#CHANGED_PATHS[@]}" -gt 0 ]] || {
  echo "the rebind agent produced no changes" >&2
  exit 1
}

BINDING_CHANGED=false
for changed_path in "${CHANGED_PATHS[@]}"; do
  [[ "$changed_path" != "$BINDING_ROOT/"* ]] || BINDING_CHANGED=true
  if [[ "$MODE" == "new" ]]; then
    case "$changed_path" in
      "$BINDING_ROOT"/* | src/platform/bindings/manifest.json | src/extensions/*/package.json | updates/latest.json)
        ;;
      *)
        echo "rebind changed a forbidden path: $changed_path" >&2
        exit 1
        ;;
    esac
  else
    case "$changed_path" in
      "$BINDING_ROOT"/* | src/platform/bindings/manifest.json | updates/latest.json)
        ;;
      *)
        echo "binding correction changed a forbidden path: $changed_path" >&2
        exit 1
        ;;
    esac
  fi
done
[[ "$BINDING_CHANGED" == "true" ]] || {
  echo "the rebind agent did not change $BINDING_ROOT" >&2
  exit 1
}

jq -e \
  --arg version "$APP_VERSION" \
  '.chatgpt == $version' \
  "$REPO_ROOT/$BINDING_ROOT/manifest.json" >/dev/null
jq -e \
  --arg version "$APP_VERSION" \
  --arg url "$DOWNLOAD_URL" \
  '.chatgpt == $version and .downloadUrl == $url' \
  "$REPO_ROOT/src/platform/bindings/manifest.json" >/dev/null
node "$REPO_ROOT/scripts/validate-pinned-chatgpt.mjs"
release_validation_root="$(
  mktemp -d "${RUNNER_TEMP:-/tmp}/chatgptx-rebind-releases.XXXXXX"
)"
trap 'rm -rf "$release_validation_root"' EXIT
node "$REPO_ROOT/scripts/component-releases.mjs" \
  "$BASE_SHA" \
  --worktree > "$release_validation_root/plan.json"
node "$REPO_ROOT/scripts/build-component-releases.mjs" \
  "$release_validation_root/plan.json" \
  "$release_validation_root/artifacts"
