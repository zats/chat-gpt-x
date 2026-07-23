#!/usr/bin/env bash

set -euo pipefail

APP_VERSION="${1:-}"
DOWNLOAD_URL="${2:-}"
OUTPUT_ROOT="${3:-}"
EXPECTED_URL="https://persistent.oaistatic.com/codex-app-prod/ChatGPT-darwin-arm64-$APP_VERSION.zip"

[[ "$APP_VERSION" =~ ^[0-9]+(\.[0-9]+)+$ ]] || {
  echo "version must contain only numeric dot-separated components" >&2
  exit 1
}
[[ "$DOWNLOAD_URL" == "$EXPECTED_URL" ]] || {
  echo "download URL must be $EXPECTED_URL" >&2
  exit 1
}
[[ -n "$OUTPUT_ROOT" ]] || {
  echo "usage: scripts/download-chatgpt-version.sh <version> <download-url> <empty-output-directory>" >&2
  exit 1
}
[[ ! -e "$OUTPUT_ROOT" ]] || {
  echo "output path already exists: $OUTPUT_ROOT" >&2
  exit 1
}

for command in codesign curl ditto shasum; do
  command -v "$command" >/dev/null || {
    echo "$command is required" >&2
    exit 1
  }
done

TEMP_ROOT="$(mktemp -d "${TMPDIR:-/tmp}/chatgptx-version-download.XXXXXX")"
ARCHIVE="$TEMP_ROOT/ChatGPT.zip"

cleanup() {
  rm -rf "$TEMP_ROOT"
}
trap cleanup EXIT INT TERM

curl --fail --location --retry 3 --silent --show-error \
  "$DOWNLOAD_URL" --output "$ARCHIVE"
mkdir -p "$OUTPUT_ROOT"
ditto -x -k "$ARCHIVE" "$OUTPUT_ROOT"

APP_PATH="$OUTPUT_ROOT/ChatGPT.app"
PLIST="$APP_PATH/Contents/Info.plist"
ASAR="$APP_PATH/Contents/Resources/app.asar"
[[ -f "$PLIST" && -f "$ASAR" ]] || {
  echo "download did not contain a complete ChatGPT.app" >&2
  exit 1
}

ACTUAL_VERSION="$(/usr/libexec/PlistBuddy -c 'Print CFBundleShortVersionString' "$PLIST")"
[[ "$ACTUAL_VERSION" == "$APP_VERSION" ]] || {
  echo "downloaded ChatGPT version $ACTUAL_VERSION, expected $APP_VERSION" >&2
  exit 1
}

codesign --verify --deep --strict "$APP_PATH"
printf '%s\n' "$APP_PATH"
