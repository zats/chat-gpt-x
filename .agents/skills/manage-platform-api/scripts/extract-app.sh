#!/usr/bin/env bash
# Locate the ChatGPT desktop app, verify its version, and deterministically
# extract app.asar into a temp directory for binding research.
#
# Usage:
#   extract-app.sh [--app /path/to/ChatGPT.app]
#                  [--expect-version <CFBundleShortVersionString>]
# Set CHATGPT_APP_PATH to override macOS bundle discovery.
#
# Output: single JSON object on stdout:
#   { "appPath", "appVersion", "electronVersion",
#     "expectationsMet": true|false, "extractDir" }
# Diagnostics go to stderr. Exit codes:
#   0 success (check expectationsMet in JSON)
#   1 usage / environment error
#   2 app not found or unreadable
#   3 extraction failed
#
# The caller is responsible for deleting extractDir when finished.

set -euo pipefail

APP_PATH="${CHATGPT_APP_PATH:-}"
EXPECT_VERSION=""

while [[ $# -gt 0 ]]; do
  case "$1" in
    --app) APP_PATH="$2"; shift 2 ;;
    --expect-version) EXPECT_VERSION="$2"; shift 2 ;;
    *) echo "unknown argument: $1" >&2; exit 1 ;;
  esac
done

if [[ -z "$APP_PATH" ]]; then
  APP_PATH="$(osascript -l JavaScript -e '
    ObjC.import("AppKit");
    const url = $.NSWorkspace.sharedWorkspace
      .URLForApplicationWithBundleIdentifier("com.openai.codex");
    url ? ObjC.unwrap(url.path) : "";
  ' 2>/dev/null)"
fi

PLIST="$APP_PATH/Contents/Info.plist"
ASAR="$APP_PATH/Contents/Resources/app.asar"

[[ -n "$APP_PATH" && -f "$PLIST" && -f "$ASAR" ]] || {
  echo "ChatGPT.app was not found or is incomplete; use --app or CHATGPT_APP_PATH" >&2
  exit 2
}

APP_VERSION="$(/usr/libexec/PlistBuddy -c 'Print CFBundleShortVersionString' "$PLIST")"
FRAMEWORK_PLIST="$APP_PATH/Contents/Frameworks/Codex Framework.framework/Resources/Info.plist"
ELECTRON_VERSION="unknown"
[[ -f "$FRAMEWORK_PLIST" ]] && \
  ELECTRON_VERSION="$(/usr/libexec/PlistBuddy -c 'Print CFBundleShortVersionString' "$FRAMEWORK_PLIST" 2>/dev/null || echo unknown)"

MET=true
[[ -n "$EXPECT_VERSION" && "$EXPECT_VERSION" != "$APP_VERSION" ]] && MET=false

EXTRACT_DIR="$(mktemp -d "${TMPDIR:-/tmp}/chatgpt-app-${APP_VERSION}.XXXXXX")"
if ! npx --yes @electron/asar extract "$ASAR" "$EXTRACT_DIR" >&2; then
  rm -rf "$EXTRACT_DIR"
  echo "asar extraction failed" >&2
  exit 3
fi

printf '{"appPath":"%s","appVersion":"%s","electronVersion":"%s","expectationsMet":%s,"extractDir":"%s"}\n' \
  "$APP_PATH" "$APP_VERSION" "$ELECTRON_VERSION" "$MET" "$EXTRACT_DIR"
