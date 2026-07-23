#!/usr/bin/env bash

set -euo pipefail

REPO_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
MANIFEST="$REPO_ROOT/src/platform/bindings/manifest.json"
OUTPUT_ROOT="${1:-}"

[[ -n "$OUTPUT_ROOT" ]] || {
  echo "usage: scripts/download-pinned-chatgpt.sh <empty-output-directory>" >&2
  exit 1
}
[[ ! -e "$OUTPUT_ROOT" ]] || {
  echo "output path already exists: $OUTPUT_ROOT" >&2
  exit 1
}

for command in codesign curl ditto jq node shasum; do
  command -v "$command" >/dev/null || {
    echo "$command is required" >&2
    exit 1
  }
done

node "$REPO_ROOT/scripts/validate-pinned-chatgpt.mjs" >/dev/null

APP_VERSION="$(jq -er '.appVersion' "$MANIFEST")"
DOWNLOAD_URL="$(jq -er '.downloadUrl' "$MANIFEST")"
BINDING_MANIFEST="$REPO_ROOT/src/platform/bindings/$APP_VERSION/manifest.json"
EXPECTED_ASAR="$(jq -er '.asarSha256' "$BINDING_MANIFEST")"
CACHE_ROOT="${CHATGPTX_DOWNLOAD_CACHE_DIR:-}"
TEMP_ROOT="$(mktemp -d "${TMPDIR:-/tmp}/chatgptx-download.XXXXXX")"

cleanup() {
  rm -rf "$TEMP_ROOT"
}
trap cleanup EXIT INT TERM

if [[ -n "$CACHE_ROOT" ]]; then
  mkdir -p "$CACHE_ROOT"
  ARCHIVE="$CACHE_ROOT/ChatGPT-darwin-arm64-$APP_VERSION.zip"
else
  ARCHIVE="$TEMP_ROOT/ChatGPT.zip"
fi

if [[ ! -f "$ARCHIVE" ]]; then
  PARTIAL_ARCHIVE="$TEMP_ROOT/ChatGPT.partial.zip"
  curl --fail --location --retry 3 --silent --show-error \
    "$DOWNLOAD_URL" --output "$PARTIAL_ARCHIVE"
  mv "$PARTIAL_ARCHIVE" "$ARCHIVE"
fi

mkdir -p "$OUTPUT_ROOT"
ditto -x -k "$ARCHIVE" "$OUTPUT_ROOT"
APP_PATH="$OUTPUT_ROOT/ChatGPT.app"
[[ -d "$APP_PATH" ]] || {
  echo "download did not contain ChatGPT.app" >&2
  exit 1
}

ACTUAL_VERSION="$(/usr/libexec/PlistBuddy -c 'Print CFBundleShortVersionString' "$APP_PATH/Contents/Info.plist")"
[[ "$ACTUAL_VERSION" == "$APP_VERSION" ]] || {
  echo "downloaded ChatGPT version $ACTUAL_VERSION, expected $APP_VERSION" >&2
  exit 1
}

ACTUAL_ASAR="$(shasum -a 256 "$APP_PATH/Contents/Resources/app.asar" | awk '{print $1}')"
[[ "$ACTUAL_ASAR" == "$EXPECTED_ASAR" ]] || {
  echo "downloaded app.asar does not match the pinned binding" >&2
  exit 1
}

codesign --verify --deep --strict "$APP_PATH"
printf '%s\n' "$APP_PATH"
