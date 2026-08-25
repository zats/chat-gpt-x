#!/usr/bin/env bash

set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
MACOS_DIR="$(cd "$SCRIPT_DIR/.." && pwd)"
REPO_ROOT="$(cd "$MACOS_DIR/../.." && pwd)"
CONFIGURATION="${CHATGPTX_BUILD_CONFIGURATION:-Release}"
OUTPUT_DIR="${CHATGPTX_BUILD_DIR:-$REPO_ROOT/.builds}"
XCODEBUILD_SIGNING_ARGUMENTS=(CODE_SIGN_STYLE=Automatic)

if [[ -n "${CHATGPTX_CODESIGN_IDENTITY:-}" ]]; then
  [[ -n "${CHATGPTX_DEVELOPMENT_TEAM:-}" ]] || {
    echo "CHATGPTX_DEVELOPMENT_TEAM is required with CHATGPTX_CODESIGN_IDENTITY" >&2
    exit 1
  }
  XCODEBUILD_SIGNING_ARGUMENTS=(
    CODE_SIGN_STYLE=Manual
    "CODE_SIGN_IDENTITY=$CHATGPTX_CODESIGN_IDENTITY"
    "DEVELOPMENT_TEAM=$CHATGPTX_DEVELOPMENT_TEAM"
    CODE_SIGN_INJECT_BASE_ENTITLEMENTS=NO
    "OTHER_CODE_SIGN_FLAGS=--timestamp"
  )
fi

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

BUILD_OUTPUT_DIR="$BUILD_ROOT/products"
BUILT_APP_PATH="$BUILD_OUTPUT_DIR/ChatGPTX.app"
APP_PATH="$OUTPUT_DIR/ChatGPTX.app"
mkdir -p "$BUILD_ROOT/generated" "$BUILD_OUTPUT_DIR" "$OUTPUT_DIR"
ln -s "$MACOS_DIR/ChatGPTX" "$BUILD_ROOT/generated/ChatGPTX"
ln -s "$MACOS_DIR/ChatGPTXTests" "$BUILD_ROOT/generated/ChatGPTXTests"

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
  "${XCODEBUILD_SIGNING_ARGUMENTS[@]}" \
  build

mkdir -p "$BUILD_ROOT/profiles"
TEST_BUILD_OUTPUT_DIR="$BUILD_ROOT/test-products"
TEST_CONFIGURATION="Debug"
TEST_ROOT_DIR="$BUILD_ROOT/test-environment"
TEST_HOME_DIR="$TEST_ROOT_DIR/home"
TEST_CODEX_HOME_DIR="$TEST_ROOT_DIR/codex-home"
mkdir -p \
  "$TEST_BUILD_OUTPUT_DIR" \
  "$TEST_HOME_DIR" \
  "$TEST_CODEX_HOME_DIR"
HOME="$TEST_HOME_DIR" \
  CODEX_HOME="$TEST_CODEX_HOME_DIR" \
  CHATGPTX_UNIT_TESTING=1 \
  LLVM_PROFILE_FILE="$BUILD_ROOT/profiles/%p.profraw" \
  xcodebuild \
  -project "$BUILD_ROOT/generated/ChatGPTX.xcodeproj" \
  -scheme ChatGPTX \
  -configuration "$TEST_CONFIGURATION" \
  -derivedDataPath "$BUILD_ROOT/TestDerivedData" \
  CONFIGURATION_BUILD_DIR="$TEST_BUILD_OUTPUT_DIR" \
  CHATGPTX_TEST_ROOT_PATH="$TEST_ROOT_DIR" \
  -only-testing:ChatGPTXTests \
  test

[[ -d "$BUILT_APP_PATH" ]] || {
  echo "build succeeded without producing $BUILT_APP_PATH" >&2
  exit 1
}

rm -rf "$APP_PATH"
mv "$BUILT_APP_PATH" "$APP_PATH"
