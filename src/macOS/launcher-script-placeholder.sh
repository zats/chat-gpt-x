#!/usr/bin/env bash
# Placeholder launcher for the ChatGPT extension platform.
#
# Launches the stock, unmodified ChatGPT.app with the platform bridge injected
# via NODE_OPTIONS=--require (see AGENTS.md § Non-invasive). Later replaced by
# a proper macOS launcher app with the same mechanics.
#
# Usage: launcher-script-placeholder.sh [extra ChatGPT args...]
# Note: NODE_OPTIONS is space-delimited — the repo path must contain no spaces.

set -euo pipefail

REPO_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
BRIDGE="$REPO_ROOT/src/platform/bridge/main.cjs"
APP_BIN="/Applications/ChatGPT.app/Contents/MacOS/ChatGPT"

[[ -f "$BRIDGE" ]] || { echo "bridge not found: $BRIDGE" >&2; exit 1; }
[[ -x "$APP_BIN" ]] || { echo "ChatGPT.app not found at $APP_BIN" >&2; exit 1; }

case "$BRIDGE" in
  *\ *) echo "bridge path contains spaces; NODE_OPTIONS would break: $BRIDGE" >&2; exit 1 ;;
esac

# `env` scopes NODE_OPTIONS to the app process only — nothing is exported
# into the caller's environment, and the bridge no-ops in every child process
# that is not the Electron browser process (see main.cjs header).
exec env NODE_OPTIONS="--require $BRIDGE${NODE_OPTIONS:+ $NODE_OPTIONS}" "$APP_BIN" "$@"
