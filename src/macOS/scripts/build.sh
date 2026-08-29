#!/usr/bin/env bash

set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
MACOS_DIR="$(cd "$SCRIPT_DIR/.." && pwd)"
REPO_ROOT="$(cd "$MACOS_DIR/../.." && pwd)"
CONFIGURATION="${CHATGPTX_BUILD_CONFIGURATION:-Release}"
OUTPUT_DIR="${CHATGPTX_BUILD_DIR:-$REPO_ROOT/.builds}"
XCODEBUILD_SIGNING_ARGUMENTS=(CODE_SIGN_STYLE=Automatic)
XCODEBUILD_VERSION_ARGUMENTS=()

if [[ -n "${CHATGPTX_MARKETING_VERSION:-}" ]]; then
  [[ "$CHATGPTX_MARKETING_VERSION" =~ ^[0-9]+\.[0-9]+\.[0-9]+$ ]] || {
    echo "CHATGPTX_MARKETING_VERSION must be a semantic version" >&2
    exit 1
  }
  XCODEBUILD_VERSION_ARGUMENTS+=(
    "MARKETING_VERSION=$CHATGPTX_MARKETING_VERSION"
  )
fi

if [[ -n "${CHATGPTX_BUILD_NUMBER:-}" ]]; then
  [[ "$CHATGPTX_BUILD_NUMBER" =~ ^[1-9][0-9]*$ ]] || {
    echo "CHATGPTX_BUILD_NUMBER must be a positive integer" >&2
    exit 1
  }
  XCODEBUILD_VERSION_ARGUMENTS+=(
    "CURRENT_PROJECT_VERSION=$CHATGPTX_BUILD_NUMBER"
  )
fi

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

BUILD_ARGUMENTS=(
  -project "$BUILD_ROOT/generated/ChatGPTX.xcodeproj" \
  -scheme ChatGPTX \
  -configuration "$CONFIGURATION" \
  -derivedDataPath "$BUILD_ROOT/DerivedData" \
  CONFIGURATION_BUILD_DIR="$BUILD_OUTPUT_DIR" \
  "${XCODEBUILD_SIGNING_ARGUMENTS[@]}"
)
if [[ -z "${CHATGPTX_CODESIGN_IDENTITY:-}" ]]; then
  BUILD_ARGUMENTS+=(ENABLE_HARDENED_RUNTIME=NO)
fi
if ((${#XCODEBUILD_VERSION_ARGUMENTS[@]} > 0)); then
  BUILD_ARGUMENTS+=("${XCODEBUILD_VERSION_ARGUMENTS[@]}")
fi
BUILD_ARGUMENTS+=(build)
xcodebuild "${BUILD_ARGUMENTS[@]}"

BUNDLED_ASSET_CATALOG="$BUILT_APP_PATH/Contents/Resources/Assets.car"
LOOSE_ICON_OVERLAY="$BUILT_APP_PATH/Contents/Resources/InjectedDockIconOverlay.png"
[[ -f "$BUNDLED_ASSET_CATALOG" ]] || {
  echo "build did not compile $BUNDLED_ASSET_CATALOG" >&2
  exit 1
}
if ! xcrun assetutil --info "$BUNDLED_ASSET_CATALOG" \
  | /usr/bin/grep -F '"Name" : "InjectedDockIconOverlay"' >/dev/null; then
  echo "compiled asset catalog does not contain InjectedDockIconOverlay" >&2
  exit 1
fi
[[ ! -e "$LOOSE_ICON_OVERLAY" ]] || {
  echo "build contains obsolete loose Dock icon overlay" >&2
  exit 1
}

SOURCE_SKILLS="$MACOS_DIR/ChatGPTX/Resources/Skills"
BUNDLED_SKILLS="$BUILT_APP_PATH/Contents/Resources/Skills"
SOURCE_PLATFORM_API="$REPO_ROOT/src/platform/types.d.ts"
BUNDLED_SKILL_PLATFORM_API="$BUNDLED_SKILLS/build-chatgptx-extensions/references/platform-api.d.ts"
[[ -f "$BUNDLED_SKILLS/build-chatgptx-extensions/SKILL.md" ]] || {
  echo "build did not bundle the ChatGPTX extension skill" >&2
  exit 1
}
[[ -x "$BUNDLED_SKILLS/build-chatgptx-extensions/scripts/test-extension.sh" ]] || {
  echo "bundled ChatGPTX extension test script is not executable" >&2
  exit 1
}
cmp -s "$SOURCE_PLATFORM_API" "$BUNDLED_SKILL_PLATFORM_API" || {
  echo "bundled ChatGPTX extension API snapshot is out of date" >&2
  exit 1
}
/usr/bin/diff -qr "$SOURCE_SKILLS" "$BUNDLED_SKILLS" >/dev/null || {
  echo "bundled ChatGPTX skills do not match their source" >&2
  exit 1
}

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
TEST_ARGUMENTS=(
  -project "$BUILD_ROOT/generated/ChatGPTX.xcodeproj" \
  -scheme ChatGPTX \
  -configuration "$TEST_CONFIGURATION" \
  -derivedDataPath "$BUILD_ROOT/TestDerivedData" \
  CONFIGURATION_BUILD_DIR="$TEST_BUILD_OUTPUT_DIR" \
  CHATGPTX_TEST_ROOT_PATH="$TEST_ROOT_DIR"
)
if ((${#XCODEBUILD_VERSION_ARGUMENTS[@]} > 0)); then
  TEST_ARGUMENTS+=("${XCODEBUILD_VERSION_ARGUMENTS[@]}")
fi
TEST_ARGUMENTS+=(
  -only-testing:ChatGPTXTests
  test
)
HOME="$TEST_HOME_DIR" \
  CODEX_HOME="$TEST_CODEX_HOME_DIR" \
  CHATGPTX_UNIT_TESTING=1 \
  LLVM_PROFILE_FILE="$BUILD_ROOT/profiles/%p.profraw" \
  xcodebuild "${TEST_ARGUMENTS[@]}"

[[ -d "$BUILT_APP_PATH" ]] || {
  echo "build succeeded without producing $BUILT_APP_PATH" >&2
  exit 1
}

rm -rf "$APP_PATH"
mv "$BUILT_APP_PATH" "$APP_PATH"
