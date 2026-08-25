#!/usr/bin/env bash

set -euo pipefail

usage() {
  cat <<'EOF'
Usage: scripts/release-launcher.sh <release-notes.md>

Builds, signs, notarizes, and publishes the launcher version declared in
src/macOS/project.yaml. Run it from a clean main branch after pushing the
release commit.

Required environment:
  CHATGPTX_CODESIGN_IDENTITY   Developer ID Application identity
  CHATGPTX_DEVELOPMENT_TEAM   Apple Developer team identifier

Notarization requires one of:
  CHATGPTX_NOTARYTOOL_PROFILE

or:
  APP_STORE_CONNECT_KEY_ID
  APP_STORE_CONNECT_ISSUER_ID
  APP_STORE_CONNECT_API_KEY_PATH

APP_STORE_CONNECT_API_KEY_P8 can replace APP_STORE_CONNECT_API_KEY_PATH.

Sparkle reads the private key from the macOS Keychain account
com.chatgptx.launcher. CHATGPTX_SPARKLE_PRIVATE_KEY can supply an exported key
instead. CHATGPTX_SPARKLE_TOOLS_DIR can point to a Sparkle bin directory;
otherwise the script downloads the pinned Sparkle release tools.
EOF
}

if [[ "${1:-}" == "--help" || "${1:-}" == "-h" ]]; then
  usage
  exit 0
fi

[[ $# -eq 1 ]] || {
  usage >&2
  exit 2
}

[[ "$(uname -s)" == "Darwin" ]] || {
  echo "Launcher releases require macOS." >&2
  exit 1
}

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
REPO_ROOT="$(cd "$SCRIPT_DIR/.." && pwd)"
PROJECT_FILE="$REPO_ROOT/src/macOS/project.yaml"
APPCAST_FILE="$REPO_ROOT/appcast.xml"
RELEASE_NOTES_FILE="$(cd "$(dirname "$1")" && pwd)/$(basename "$1")"
SPARKLE_VERSION=2.9.3
SPARKLE_ACCOUNT=com.chatgptx.launcher
SPARKLE_PUBLIC_KEY=lkJyHKoZxlwe1nhfrrfLVHvsCnSwX3JLYD9G8XoIw7Y=

[[ -f "$RELEASE_NOTES_FILE" ]] || {
  echo "Release notes not found: $RELEASE_NOTES_FILE" >&2
  exit 1
}
[[ -s "$RELEASE_NOTES_FILE" ]] || {
  echo "Release notes are empty: $RELEASE_NOTES_FILE" >&2
  exit 1
}
[[ -n "${CHATGPTX_CODESIGN_IDENTITY:-}" ]] || {
  echo "CHATGPTX_CODESIGN_IDENTITY is required." >&2
  exit 1
}
[[ -n "${CHATGPTX_DEVELOPMENT_TEAM:-}" ]] || {
  echo "CHATGPTX_DEVELOPMENT_TEAM is required." >&2
  exit 1
}

for command in codesign curl ditto gh git pandoc plutil rg sort spctl tar xcodebuild xcrun; do
  command -v "$command" >/dev/null || {
    echo "$command is required." >&2
    exit 1
  }
done

cd "$REPO_ROOT"

[[ "$(git branch --show-current)" == "main" ]] || {
  echo "Launcher releases must run from main." >&2
  exit 1
}
[[ -z "$(git status --porcelain)" ]] || {
  echo "The working tree must be clean." >&2
  exit 1
}

git fetch origin main
HEAD_SHA="$(git rev-parse HEAD)"
ORIGIN_MAIN_SHA="$(git rev-parse origin/main)"
[[ "$HEAD_SHA" == "$ORIGIN_MAIN_SHA" ]] || {
  echo "Local main must match origin/main." >&2
  exit 1
}

MARKETING_VERSION="$(
  awk '$1 == "MARKETING_VERSION:" { print $2; exit }' "$PROJECT_FILE"
)"
BUILD_NUMBER="$(
  awk '$1 == "CURRENT_PROJECT_VERSION:" { print $2; exit }' "$PROJECT_FILE"
)"

[[ "$MARKETING_VERSION" =~ ^[0-9]+\.[0-9]+\.[0-9]+$ ]] || {
  echo "MARKETING_VERSION must be a semantic version." >&2
  exit 1
}
[[ "$BUILD_NUMBER" =~ ^[1-9][0-9]*$ ]] || {
  echo "CURRENT_PROJECT_VERSION must be a positive integer." >&2
  exit 1
}

TAG="launcher-v$MARKETING_VERSION"
ARCHIVE_NAME="ChatGPTX-$MARKETING_VERSION.zip"
DOWNLOAD_URL="https://github.com/zats/chat-gpt-x/releases/download/$TAG/$ARCHIVE_NAME"
FEED_URL="https://raw.githubusercontent.com/zats/chat-gpt-x/main/appcast.xml"

if git ls-remote --exit-code --tags origin "refs/tags/$TAG" \
    >/dev/null 2>&1; then
  echo "Tag already exists: $TAG" >&2
  exit 1
fi
if gh release view "$TAG" --repo zats/chat-gpt-x >/dev/null 2>&1; then
  echo "GitHub Release already exists: $TAG" >&2
  exit 1
fi
if rg -q "<sparkle:version>$BUILD_NUMBER</sparkle:version>" "$APPCAST_FILE"; then
  echo "Build $BUILD_NUMBER already exists in appcast.xml." >&2
  exit 1
fi
if rg -q \
    "<sparkle:shortVersionString>$MARKETING_VERSION</sparkle:shortVersionString>" \
    "$APPCAST_FILE"; then
  echo "Version $MARKETING_VERSION already exists in appcast.xml." >&2
  exit 1
fi
LATEST_BUILD_NUMBER="$(
  rg -o '<sparkle:version>[0-9]+' "$APPCAST_FILE" \
    | rg -o '[0-9]+' \
    | sort -nr \
    | head -1 \
    || true
)"
if [[ -n "$LATEST_BUILD_NUMBER" ]] && ((BUILD_NUMBER <= LATEST_BUILD_NUMBER)); then
  echo "Build $BUILD_NUMBER must be greater than $LATEST_BUILD_NUMBER." >&2
  exit 1
fi

RELEASE_ROOT="$(mktemp -d "${TMPDIR:-/tmp}/chatgptx-launcher-release.XXXXXX")"
# Invoked by the trap below.
# shellcheck disable=SC2329
cleanup() {
  if [[ -n "${RELEASE_ROOT:-}" && -d "$RELEASE_ROOT" ]]; then
    rm -rf "$RELEASE_ROOT"
  fi
}
trap cleanup EXIT INT TERM

BUILD_DIR="$RELEASE_ROOT/build"
CHATGPTX_BUILD_DIR="$BUILD_DIR" \
  CHATGPTX_BUILD_CONFIGURATION=Release \
  CHATGPTX_CODESIGN_IDENTITY="$CHATGPTX_CODESIGN_IDENTITY" \
  CHATGPTX_DEVELOPMENT_TEAM="$CHATGPTX_DEVELOPMENT_TEAM" \
  src/macOS/scripts/build.sh

APP_PATH="$BUILD_DIR/ChatGPTX.app"
[[ -d "$APP_PATH" ]] || {
  echo "Release build did not produce $APP_PATH" >&2
  exit 1
}

[[ "$(plutil -extract CFBundleShortVersionString raw "$APP_PATH/Contents/Info.plist")" == "$MARKETING_VERSION" ]]
[[ "$(plutil -extract CFBundleVersion raw "$APP_PATH/Contents/Info.plist")" == "$BUILD_NUMBER" ]]
[[ "$(plutil -extract SUPublicEDKey raw "$APP_PATH/Contents/Info.plist")" == "$SPARKLE_PUBLIC_KEY" ]]
codesign --verify --deep --strict --verbose=2 "$APP_PATH"
codesign -d --verbose=4 "$APP_PATH" 2>&1 \
  | rg -q '^Authority=Developer ID Application:' || {
    echo "ChatGPTX.app does not have a Developer ID Application signature." >&2
    exit 1
  }

NOTARIZATION_ARCHIVE="$RELEASE_ROOT/ChatGPTX-notarization.zip"
ditto -c -k --keepParent "$APP_PATH" "$NOTARIZATION_ARCHIVE"

NOTARY_ARGUMENTS=()
if [[ -n "${CHATGPTX_NOTARYTOOL_PROFILE:-}" ]]; then
  NOTARY_ARGUMENTS+=(--keychain-profile "$CHATGPTX_NOTARYTOOL_PROFILE")
else
  [[ -n "${APP_STORE_CONNECT_KEY_ID:-}" ]] || {
    echo "APP_STORE_CONNECT_KEY_ID is required for notarization." >&2
    exit 1
  }
  [[ -n "${APP_STORE_CONNECT_ISSUER_ID:-}" ]] || {
    echo "APP_STORE_CONNECT_ISSUER_ID is required for notarization." >&2
    exit 1
  }
  API_KEY_PATH="${APP_STORE_CONNECT_API_KEY_PATH:-}"
  if [[ -z "$API_KEY_PATH" && -n "${APP_STORE_CONNECT_API_KEY_P8:-}" ]]; then
    API_KEY_PATH="$RELEASE_ROOT/AuthKey_$APP_STORE_CONNECT_KEY_ID.p8"
    umask 077
    printf '%s\n' "$APP_STORE_CONNECT_API_KEY_P8" > "$API_KEY_PATH"
  fi
  [[ -n "$API_KEY_PATH" && -f "$API_KEY_PATH" ]] || {
    echo "An App Store Connect API key file is required for notarization." >&2
    exit 1
  }
  NOTARY_ARGUMENTS+=(
    --key "$API_KEY_PATH"
    --key-id "$APP_STORE_CONNECT_KEY_ID"
    --issuer "$APP_STORE_CONNECT_ISSUER_ID"
  )
fi

xcrun notarytool submit "$NOTARIZATION_ARCHIVE" \
  --wait "${NOTARY_ARGUMENTS[@]}"
xcrun stapler staple "$APP_PATH"
xcrun stapler validate "$APP_PATH"
spctl --assess --type execute --verbose=2 "$APP_PATH"
codesign --verify --deep --strict --verbose=2 "$APP_PATH"

ARCHIVE_PATH="$RELEASE_ROOT/$ARCHIVE_NAME"
ditto -c -k --keepParent "$APP_PATH" "$ARCHIVE_PATH"

SPARKLE_TOOLS_DIR="${CHATGPTX_SPARKLE_TOOLS_DIR:-}"
if [[ -z "$SPARKLE_TOOLS_DIR" ]]; then
  SPARKLE_DOWNLOAD_DIR="$RELEASE_ROOT/sparkle"
  mkdir -p "$SPARKLE_DOWNLOAD_DIR"
  gh release download "$SPARKLE_VERSION" \
    --repo sparkle-project/Sparkle \
    --pattern "Sparkle-$SPARKLE_VERSION.tar.xz" \
    --dir "$SPARKLE_DOWNLOAD_DIR"
  tar -xf "$SPARKLE_DOWNLOAD_DIR/Sparkle-$SPARKLE_VERSION.tar.xz" \
    -C "$SPARKLE_DOWNLOAD_DIR"
  SPARKLE_TOOLS_DIR="$SPARKLE_DOWNLOAD_DIR/bin"
fi

GENERATE_APPCAST="$SPARKLE_TOOLS_DIR/generate_appcast"
GENERATE_KEYS="$SPARKLE_TOOLS_DIR/generate_keys"
[[ -x "$GENERATE_APPCAST" ]] || {
  echo "generate_appcast is unavailable in $SPARKLE_TOOLS_DIR" >&2
  exit 1
}

APPCAST_WORK_DIR="$RELEASE_ROOT/appcast"
mkdir -p "$APPCAST_WORK_DIR"
cp "$APPCAST_FILE" "$APPCAST_WORK_DIR/appcast.xml"
cp "$ARCHIVE_PATH" "$APPCAST_WORK_DIR/$ARCHIVE_NAME"
pandoc --from gfm --to html \
  "$RELEASE_NOTES_FILE" \
  --output "$APPCAST_WORK_DIR/ChatGPTX-$MARKETING_VERSION.html"

APPCAST_ARGUMENTS=(
  --download-url-prefix "https://github.com/zats/chat-gpt-x/releases/download/$TAG/"
  --link "https://github.com/zats/chat-gpt-x"
  --maximum-versions 0
  --maximum-deltas 0
  --embed-release-notes
  "$APPCAST_WORK_DIR"
)

if [[ -n "${CHATGPTX_SPARKLE_PRIVATE_KEY:-}" ]]; then
  printf '%s' "$CHATGPTX_SPARKLE_PRIVATE_KEY" \
    | "$GENERATE_APPCAST" --ed-key-file - "${APPCAST_ARGUMENTS[@]}"
else
  [[ -x "$GENERATE_KEYS" ]] || {
    echo "generate_keys is unavailable in $SPARKLE_TOOLS_DIR" >&2
    exit 1
  }
  KEYCHAIN_PUBLIC_KEY="$($GENERATE_KEYS --account "$SPARKLE_ACCOUNT" -p)"
  [[ "$KEYCHAIN_PUBLIC_KEY" == "$SPARKLE_PUBLIC_KEY" ]] || {
    echo "The Sparkle Keychain account does not match SUPublicEDKey." >&2
    exit 1
  }
  "$GENERATE_APPCAST" --account "$SPARKLE_ACCOUNT" \
    "${APPCAST_ARGUMENTS[@]}"
fi

GENERATED_APPCAST="$APPCAST_WORK_DIR/appcast.xml"
rg -q "<sparkle:version>$BUILD_NUMBER</sparkle:version>" \
  "$GENERATED_APPCAST"
rg -Fq "url=\"$DOWNLOAD_URL\"" "$GENERATED_APPCAST"
rg -q 'sparkle:edSignature="[^"]+"' "$GENERATED_APPCAST"
cp "$GENERATED_APPCAST" "$APPCAST_FILE"

gh release create "$TAG" "$ARCHIVE_PATH#$ARCHIVE_NAME" \
  --repo zats/chat-gpt-x \
  --target "$HEAD_SHA" \
  --title "ChatGPTX $MARKETING_VERSION" \
  --notes-file "$RELEASE_NOTES_FILE" \
  --draft
gh release edit "$TAG" --repo zats/chat-gpt-x --draft=false --latest=false

curl --fail --location --silent --show-error --head "$DOWNLOAD_URL" \
  >/dev/null

git add appcast.xml
git commit -m "Publish ChatGPTX $MARKETING_VERSION appcast"
git push origin HEAD:main

for attempt in 1 2 3 4 5 6; do
  if curl --fail --location --silent --show-error "$FEED_URL" \
      | rg -q "<sparkle:version>$BUILD_NUMBER</sparkle:version>"; then
    printf 'Published ChatGPTX %s (%s).\n' \
      "$MARKETING_VERSION" "$BUILD_NUMBER"
    exit 0
  fi
  if ((attempt < 6)); then
    sleep 5
  fi
done

echo "The release is public, but the raw appcast did not refresh in time." >&2
exit 1
