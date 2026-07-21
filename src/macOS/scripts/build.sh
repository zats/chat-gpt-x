#!/usr/bin/env bash

set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
MACOS_DIR="$(cd "$SCRIPT_DIR/.." && pwd)"
REPO_ROOT="$(cd "$MACOS_DIR/../.." && pwd)"
CONFIGURATION="${CHATGPTX_BUILD_CONFIGURATION:-Debug}"
OUTPUT_DIR="${CHATGPTX_BUILD_DIR:-$REPO_ROOT/.builds}"

command -v xcodegen >/dev/null || {
  echo "xcodegen is required: brew install xcodegen" >&2
  exit 1
}
command -v xcodebuild >/dev/null || {
  echo "xcodebuild is required; install Xcode command-line tools" >&2
  exit 1
}

BUILD_ROOT="$(mktemp -d "${TMPDIR:-/tmp}/chatgptx-build.XXXXXX")"
cleanup() {
  rm -rf "$BUILD_ROOT"
}
trap cleanup EXIT INT TERM

mkdir -p "$BUILD_ROOT/generated" "$OUTPUT_DIR"
ln -s "$REPO_ROOT/src/platform" "$BUILD_ROOT/platform"
ln -s "$MACOS_DIR/ChatGPTX" "$BUILD_ROOT/generated/ChatGPTX"

xcodegen generate \
  --spec "$MACOS_DIR/project.yaml" \
  --project-root "$MACOS_DIR" \
  --project "$BUILD_ROOT/generated"

xcodebuild \
  -project "$BUILD_ROOT/generated/ChatGPTX.xcodeproj" \
  -scheme ChatGPTX \
  -configuration "$CONFIGURATION" \
  -derivedDataPath "$BUILD_ROOT/DerivedData" \
  CONFIGURATION_BUILD_DIR="$OUTPUT_DIR" \
  build

APP_PATH="$OUTPUT_DIR/ChatGPTX.app"
[[ -d "$APP_PATH" ]] || {
  echo "build succeeded without producing $APP_PATH" >&2
  exit 1
}
