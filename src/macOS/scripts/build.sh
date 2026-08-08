#!/usr/bin/env bash

set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
MACOS_DIR="$(cd "$SCRIPT_DIR/.." && pwd)"
REPO_ROOT="$(cd "$MACOS_DIR/../.." && pwd)"
CONFIGURATION="${CHATGPTX_BUILD_CONFIGURATION:-Release}"
OUTPUT_DIR="${CHATGPTX_BUILD_DIR:-$REPO_ROOT/.builds}"
REQUIRED_BUN_VERSION="1.3.14"

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

use_required_bun() {
  if command -v bun >/dev/null &&
    [[ "$(bun --version)" == "$REQUIRED_BUN_VERSION" ]]; then
    return
  fi

  local architecture
  local archive_name
  local expected_sha256
  architecture="$(uname -m)"
  case "$architecture" in
    arm64)
      archive_name="bun-darwin-aarch64.zip"
      expected_sha256="d8b96221828ad6f97ac7ac0ab7e95872341af763001e8803e8267652c2652620"
      ;;
    x86_64)
      archive_name="bun-darwin-x64.zip"
      expected_sha256="4183df3374623e5bab315c547cfa0974533cd457d86b73b639f7a87974cd6633"
      ;;
    *)
      echo "unsupported macOS architecture: $architecture" >&2
      exit 1
      ;;
  esac

  local cache_home="${XDG_CACHE_HOME:-$HOME/Library/Caches}"
  local bun_dir="$cache_home/ChatGPTX/build-tools/bun/$REQUIRED_BUN_VERSION"
  local bun_path="$bun_dir/bun"
  if [[ ! -x "$bun_path" ]] ||
    [[ "$("$bun_path" --version)" != "$REQUIRED_BUN_VERSION" ]]; then
    local archive_path="$BUILD_ROOT/$archive_name"
    local extracted_dir="$BUILD_ROOT/bun"
    local actual_sha256

    echo "Downloading Bun $REQUIRED_BUN_VERSION"
    curl -fL --progress-bar \
      "https://github.com/oven-sh/bun/releases/download/bun-v$REQUIRED_BUN_VERSION/$archive_name" \
      --output "$archive_path"
    actual_sha256="$(shasum -a 256 "$archive_path" | awk '{print $1}')"
    [[ "$actual_sha256" == "$expected_sha256" ]] || {
      echo "Bun archive checksum mismatch" >&2
      exit 1
    }

    ditto -x -k "$archive_path" "$extracted_dir"
    mkdir -p "$bun_dir"
    install -m 755 \
      "$extracted_dir/${archive_name%.zip}/bun" \
      "$bun_path"
  fi

  PATH="$bun_dir:$PATH"
  export PATH
}

use_required_bun

BUILD_OUTPUT_DIR="$BUILD_ROOT/products"
BUILT_APP_PATH="$BUILD_OUTPUT_DIR/ChatGPTX.app"
APP_PATH="$OUTPUT_DIR/ChatGPTX.app"
mkdir -p "$BUILD_ROOT/generated" "$BUILD_OUTPUT_DIR" "$OUTPUT_DIR"
ln -s "$REPO_ROOT/src/platform" "$BUILD_ROOT/platform"
ln -s "$MACOS_DIR/ChatGPTX" "$BUILD_ROOT/generated/ChatGPTX"
ln -s "$MACOS_DIR/ChatGPTXTests" "$BUILD_ROOT/generated/ChatGPTXTests"
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
  CHATGPTX_REPO_ROOT="$REPO_ROOT" \
  CHATGPTX_TEST_ROOT_PATH="$TEST_ROOT_DIR" \
  -only-testing:ChatGPTXTests \
  test

[[ -d "$BUILT_APP_PATH" ]] || {
  echo "build succeeded without producing $BUILT_APP_PATH" >&2
  exit 1
}

rm -rf "$APP_PATH"
mv "$BUILT_APP_PATH" "$APP_PATH"
