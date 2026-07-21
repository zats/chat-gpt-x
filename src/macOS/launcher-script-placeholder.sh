#!/usr/bin/env bash
# Placeholder launcher for the ChatGPT extension platform.
#
# Launches the stock, unmodified ChatGPT.app with the platform bridge injected
# via NODE_OPTIONS=--require (see AGENTS.md § Non-invasive). Later replaced by
# a proper macOS launcher app with the same mechanics.
#
# Usage: launcher-script-placeholder.sh [extra ChatGPT args...]
# Set CHATGPT_APP_PATH to override macOS bundle discovery.

set -euo pipefail

REPO_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
BRIDGE="$REPO_ROOT/src/platform/bridge/main.cjs"
APP_PATH="${CHATGPT_APP_PATH:-}"

if [[ -z "$APP_PATH" ]]; then
  APP_PATH="$(osascript -l JavaScript -e '
    ObjC.import("AppKit");
    const url = $.NSWorkspace.sharedWorkspace
      .URLForApplicationWithBundleIdentifier("com.openai.codex");
    url ? ObjC.unwrap(url.path) : "";
  ' 2>/dev/null)"
fi

PLIST="$APP_PATH/Contents/Info.plist"
APP_EXECUTABLE=""
[[ -f "$PLIST" ]] && \
  APP_EXECUTABLE="$(/usr/libexec/PlistBuddy -c 'Print CFBundleExecutable' "$PLIST" 2>/dev/null || true)"
APP_BIN="$APP_PATH/Contents/MacOS/$APP_EXECUTABLE"

[[ -f "$BRIDGE" ]] || { echo "bridge not found: $BRIDGE" >&2; exit 1; }
[[ -n "$APP_PATH" && -x "$APP_BIN" ]] || {
  echo "ChatGPT.app was not found; set CHATGPT_APP_PATH to its location" >&2
  exit 1
}

ESCAPED_BRIDGE="${BRIDGE//\\/\\\\}"
ESCAPED_BRIDGE="${ESCAPED_BRIDGE//\"/\\\"}"
REQUIRE_OPTION="--require \"$ESCAPED_BRIDGE\""

# `env` scopes NODE_OPTIONS to the app process only — nothing is exported
# into the caller's environment, and the bridge no-ops in every child process
# that is not the Electron browser process (see main.cjs header).
exec env NODE_OPTIONS="$REQUIRE_OPTION${NODE_OPTIONS:+ $NODE_OPTIONS}" "$APP_BIN" "$@"
