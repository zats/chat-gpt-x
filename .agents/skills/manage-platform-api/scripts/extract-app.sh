#!/usr/bin/env bash
# Locate the ChatGPT desktop app, verify its version, and deterministically
# extract app.asar into a temp directory for binding research.
#
# Usage:
#   extract-app.sh [--app /path/to/ChatGPT.app]
#                  [--expect-version <CFBundleShortVersionString>]
#                  [--expect-sha256 <sha256 of Contents/Resources/app.asar>]
#                  [--keep]                 # do not auto-clean on failure paths
#
# Output: single JSON object on stdout:
#   { "appPath", "appVersion", "electronVersion", "asarSha256",
#     "expectationsMet": true|false, "extractDir" }
# Diagnostics go to stderr. Exit codes:
#   0 success (check expectationsMet in JSON)
#   1 usage / environment error
#   2 app not found or unreadable
#   3 extraction failed
#
# The caller is responsible for deleting extractDir when finished.

set -euo pipefail

APP_PATH="/Applications/ChatGPT.app"
EXPECT_VERSION=""
EXPECT_SHA256=""

while [[ $# -gt 0 ]]; do
  case "$1" in
    --app) APP_PATH="$2"; shift 2 ;;
    --expect-version) EXPECT_VERSION="$2"; shift 2 ;;
    --expect-sha256) EXPECT_SHA256="$2"; shift 2 ;;
    --keep) shift ;; # temp dirs are always kept on success; flag accepted for symmetry
    *) echo "unknown argument: $1" >&2; exit 1 ;;
  esac
done

PLIST="$APP_PATH/Contents/Info.plist"
ASAR="$APP_PATH/Contents/Resources/app.asar"

[[ -f "$PLIST" && -f "$ASAR" ]] || {
  echo "app not found or incomplete at: $APP_PATH" >&2; exit 2;
}

APP_VERSION="$(/usr/libexec/PlistBuddy -c 'Print CFBundleShortVersionString' "$PLIST")"
FRAMEWORK_PLIST="$APP_PATH/Contents/Frameworks/Codex Framework.framework/Resources/Info.plist"
ELECTRON_VERSION="unknown"
[[ -f "$FRAMEWORK_PLIST" ]] && \
  ELECTRON_VERSION="$(/usr/libexec/PlistBuddy -c 'Print CFBundleShortVersionString' "$FRAMEWORK_PLIST" 2>/dev/null || echo unknown)"

# Authoritative version key: hash the artifact itself, never trust the plist's
# ElectronAsarIntegrity entry (it can disagree mid-update).
ASAR_SHA256="$(shasum -a 256 "$ASAR" | awk '{print $1}')"

MET=true
[[ -n "$EXPECT_VERSION" && "$EXPECT_VERSION" != "$APP_VERSION" ]] && MET=false
[[ -n "$EXPECT_SHA256" && "$EXPECT_SHA256" != "$ASAR_SHA256" ]] && MET=false

EXTRACT_DIR="$(mktemp -d "${TMPDIR:-/tmp}/chatgpt-app-${APP_VERSION}.XXXXXX")"
if ! npx --yes @electron/asar extract "$ASAR" "$EXTRACT_DIR" >&2; then
  rm -rf "$EXTRACT_DIR"
  echo "asar extraction failed" >&2
  exit 3
fi

printf '{"appPath":"%s","appVersion":"%s","electronVersion":"%s","asarSha256":"%s","expectationsMet":%s,"extractDir":"%s"}\n' \
  "$APP_PATH" "$APP_VERSION" "$ELECTRON_VERSION" "$ASAR_SHA256" "$MET" "$EXTRACT_DIR"
