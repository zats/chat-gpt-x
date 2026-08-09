#!/usr/bin/env bash

set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
CANONICAL_MAIN="contents/main.js"
REQUIRED_BUN_VERSION="1.3.14"

command -v bun >/dev/null || {
  echo "bun is required: brew install oven-sh/bun/bun" >&2
  exit 1
}
command -v jq >/dev/null || {
  echo "jq is required: brew install jq" >&2
  exit 1
}
[[ "$(bun --version)" == "$REQUIRED_BUN_VERSION" ]] || {
  echo "bun $REQUIRED_BUN_VERSION is required" >&2
  exit 1
}

OUTPUT_ROOT="${CHATGPTX_EXTENSION_BUILD_DIR:-${TMPDIR:-/tmp}/ChatGPTX/extension-builds}"

BUILD_ROOT="$(mktemp -d "${TMPDIR:-/tmp}/chatgptx-extensions.XXXXXX")"
cleanup() {
  rm -rf "$BUILD_ROOT"
}
trap cleanup EXIT INT TERM

mkdir -p "$OUTPUT_ROOT"
OUTPUT_ROOT="$(cd "$OUTPUT_ROOT" && pwd -P)"

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
  extension_build_dir="$OUTPUT_ROOT/$extension_id"
  extension_main_output="$extension_build_dir/$CANONICAL_MAIN"
  build_arguments=(
    "$extension_source"
    --target=browser
    --format=cjs
    --outfile="$built_main"
  )
  if [[ "$extension_id" == "api-test-suite" ]]; then
    case "${CHATGPTX_TEST_NO_PROFILE:-0}" in
      0 | 1) ;;
      *)
        echo "CHATGPTX_TEST_NO_PROFILE must be 0 or 1" >&2
        exit 1
        ;;
    esac
    build_arguments+=(--env='CHATGPTX_TEST_*')
  fi

  mkdir -p "$(dirname "$built_main")" "$(dirname "$extension_main_output")"
  CHATGPTX_TEST_NO_PROFILE="${CHATGPTX_TEST_NO_PROFILE:-0}" bun build \
    "${build_arguments[@]}"
  cp "$built_main" "$extension_main_output"
  cp "$manifest" "$extension_build_dir/package.json"

  echo "$extension_id -> $extension_main_output"
done
