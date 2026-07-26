#!/usr/bin/env bash

set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
MACOS_DIR="$(cd "$SCRIPT_DIR/.." && pwd)"
REPO_ROOT="$(cd "$MACOS_DIR/../.." && pwd)"
CONFIGURATION="${CHATGPTX_BUILD_CONFIGURATION:-Release}"
OUTPUT_DIR="${CHATGPTX_BUILD_DIR:-$REPO_ROOT/.builds}"
REQUIRED_BUN_VERSION="1.3.14"

command -v bun >/dev/null || {
  echo "bun is required: brew install oven-sh/bun/bun" >&2
  exit 1
}
command -v xcodegen >/dev/null || {
  echo "xcodegen is required: brew install xcodegen" >&2
  exit 1
}
command -v xcodebuild >/dev/null || {
  echo "xcodebuild is required; install Xcode command-line tools" >&2
  exit 1
}
[[ "$(bun --version)" == "$REQUIRED_BUN_VERSION" ]] || {
  echo "bun $REQUIRED_BUN_VERSION is required" >&2
  exit 1
}

BUILD_ROOT="$(mktemp -d "${TMPDIR:-/tmp}/chatgptx-build.XXXXXX")"
cleanup() {
  rm -rf "$BUILD_ROOT"
}
trap cleanup EXIT INT TERM

BUILD_OUTPUT_DIR="$BUILD_ROOT/products"
BUILT_APP_PATH="$BUILD_OUTPUT_DIR/ChatGPTX.app"
APP_PATH="$OUTPUT_DIR/ChatGPTX.app"
mkdir -p "$BUILD_ROOT/generated" "$BUILD_OUTPUT_DIR" "$OUTPUT_DIR"
ln -s "$REPO_ROOT/src/platform" "$BUILD_ROOT/platform"
ln -s "$MACOS_DIR/ChatGPTX" "$BUILD_ROOT/generated/ChatGPTX"
ln -s "$MACOS_DIR/scripts" "$BUILD_ROOT/generated/scripts"

xcodegen generate \
  --spec "$MACOS_DIR/project.yaml" \
  --project-root "$MACOS_DIR" \
  --project "$BUILD_ROOT/generated"

xcodebuild \
  -project "$BUILD_ROOT/generated/ChatGPTX.xcodeproj" \
  -scheme ChatGPTX \
  -configuration "$CONFIGURATION" \
  -derivedDataPath "$BUILD_ROOT/DerivedData" \
  CONFIGURATION_BUILD_DIR="$BUILD_OUTPUT_DIR" \
  CHATGPTX_REPO_ROOT="$REPO_ROOT" \
  build

[[ -d "$BUILT_APP_PATH" ]] || {
  echo "build succeeded without producing $BUILT_APP_PATH" >&2
  exit 1
}

rm -rf "$APP_PATH"
mv "$BUILT_APP_PATH" "$APP_PATH"
