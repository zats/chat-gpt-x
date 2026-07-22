#!/usr/bin/env bash

set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
INSTALL_ROOT="${CHATGPTX_EXTENSIONS_DIR:-$HOME/.codex/extensions}"
GLOBAL_SETTINGS_FILE="$INSTALL_ROOT/settings.json"
CANONICAL_MAIN="contents/main.js"

command -v bun >/dev/null || {
  echo "bun is required: brew install oven-sh/bun/bun" >&2
  exit 1
}
command -v jq >/dev/null || {
  echo "jq is required: brew install jq" >&2
  exit 1
}

BUILD_ROOT="$(mktemp -d "${TMPDIR:-/tmp}/chatgptx-extensions.XXXXXX")"
cleanup() {
  rm -rf "$BUILD_ROOT"
}
trap cleanup EXIT INT TERM

mkdir -p "$INSTALL_ROOT"
INSTALL_ROOT="$(cd "$INSTALL_ROOT" && pwd -P)"
GLOBAL_SETTINGS_FILE="$INSTALL_ROOT/settings.json"

if [[ ! -f "$GLOBAL_SETTINGS_FILE" ]]; then
  jq -n '{extensions: []}' > "$GLOBAL_SETTINGS_FILE"
  chmod 600 "$GLOBAL_SETTINGS_FILE"
fi

manifests=()
if (( $# == 0 )); then
  while IFS= read -r manifest; do
    manifests+=("$manifest")
  done < <(find "$SCRIPT_DIR" -mindepth 2 -maxdepth 2 -name package.json -type f | sort)
else
  for extension_id in "$@"; do
    manifest="$SCRIPT_DIR/$extension_id/package.json"
    [[ -f "$manifest" ]] || {
      echo "unknown extension: $extension_id" >&2
      exit 1
    }
    manifests+=("$manifest")
  done
fi

for manifest in "${manifests[@]}"; do
  extension_dir="$(dirname "$manifest")"
  extension_id="$(jq -er '.id' "$manifest")"
  extension_main="$(jq -er '.main' "$manifest")"
  extension_source="$extension_dir/$extension_id.ts"

  [[ "$(basename "$extension_dir")" == "$extension_id" ]] || {
    echo "extension id must match its directory: $manifest" >&2
    exit 1
  }
  [[ "$extension_main" == "$CANONICAL_MAIN" ]] || {
    echo "extension main must be $CANONICAL_MAIN: $manifest" >&2
    exit 1
  }
  [[ -f "$extension_source" ]] || {
    echo "extension source not found: $extension_source" >&2
    exit 1
  }

  built_main="$BUILD_ROOT/$extension_id/main.js"
  installed_dir="$INSTALL_ROOT/$extension_id"
  installed_main="$installed_dir/$CANONICAL_MAIN"
  default_enabled=true
  [[ "$extension_id" == "api-test-suite" ]] && default_enabled=false

  mkdir -p "$(dirname "$built_main")" "$(dirname "$installed_main")"
  bun build \
    "$extension_source" \
    --target=browser \
    --format=cjs \
    --outfile="$built_main"
  cp "$built_main" "$installed_main"
  cp "$manifest" "$installed_dir/package.json"
  rm -f "$installed_dir/$extension_id.js"

  updated_settings="$(mktemp "$BUILD_ROOT/settings.XXXXXX")"
  jq \
    --arg id "$extension_id" \
    --arg path "$installed_main" \
    --argjson defaultEnabled "$default_enabled" \
    '
      .extensions = (
        (.extensions // []) as $extensions
        | if any($extensions[]; .id == $id) then
            $extensions
            | map(if .id == $id then .path = $path else . end)
          else
            $extensions + [{ id: $id, enabled: $defaultEnabled, path: $path }]
          end
      )
    ' \
    "$GLOBAL_SETTINGS_FILE" > "$updated_settings"
  chmod 600 "$updated_settings"
  mv "$updated_settings" "$GLOBAL_SETTINGS_FILE"

  echo "$extension_id -> $installed_main"
done
