#!/usr/bin/env bash

set -euo pipefail

REPO_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
USE_CURRENT_ACCOUNTS=0
if [[ "${1:-}" == "--use-current-accounts" ]]; then
  USE_CURRENT_ACCOUNTS=1
  shift
fi

PRIMARY_AUTH="${1:-}"
SECONDARY_AUTH="${2:-}"
APP_PATH="${CHATGPT_APP_PATH:-}"
PORT="${CHATGPTX_CI_PORT:-9451}"
KEEP_WORKDIR="${CHATGPTX_KEEP_CI_WORKDIR:-0}"
SOURCE_ACCOUNTS_ROOT=""

usage() {
  echo "usage: scripts/run-local-ci.sh <primary-auth.json> <secondary-auth.json>" >&2
  echo "       scripts/run-local-ci.sh --use-current-accounts" >&2
}

if [[ "$USE_CURRENT_ACCOUNTS" == "1" ]]; then
  [[ "$#" == "0" ]] || {
    usage
    exit 1
  }
  SOURCE_CODEX_ROOT="${CODEX_HOME:-$HOME/.codex}"
  PRIMARY_AUTH="$SOURCE_CODEX_ROOT/auth.json"
  SOURCE_ACCOUNTS_ROOT="$SOURCE_CODEX_ROOT/extensions/multiple-accounts"
  [[ -f "$PRIMARY_AUTH" && -d "$SOURCE_ACCOUNTS_ROOT" ]] || {
    echo "current authentication and multiple-accounts storage must exist" >&2
    exit 1
  }
else
  [[ "$#" == "2" && -f "$PRIMARY_AUTH" && -f "$SECONDARY_AUTH" ]] || {
    usage
    exit 1
  }
fi

for command in bun jq sqlite3 xcodegen xcodebuild codesign curl lsof rg; do
  command -v "$command" >/dev/null || {
    echo "$command is required" >&2
    exit 1
  }
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
APP_EXECUTABLE=""
[[ -f "$PLIST" ]] && APP_EXECUTABLE="$(/usr/libexec/PlistBuddy -c 'Print CFBundleExecutable' "$PLIST")"
APP_BIN="$APP_PATH/Contents/MacOS/$APP_EXECUTABLE"
CODEX_BIN="$APP_PATH/Contents/Resources/codex"
[[ -x "$APP_BIN" && -x "$CODEX_BIN" && -f "$ASAR" ]] || {
  echo "ChatGPT.app is missing or incomplete" >&2
  exit 1
}
CODEX_CLI_VERSION="$("$CODEX_BIN" --version | awk '{print $2}')"

APP_VERSION="$(/usr/libexec/PlistBuddy -c 'Print CFBundleShortVersionString' "$PLIST")"
BINDING_DIR="$REPO_ROOT/src/platform/bindings/$APP_VERSION"
MANIFEST="$BINDING_DIR/manifest.json"
[[ -f "$MANIFEST" ]] || {
  echo "no binding exists for ChatGPT $APP_VERSION" >&2
  exit 1
}
EXPECTED_ASAR="$(jq -er '.asarSha256' "$MANIFEST")"
ACTUAL_ASAR="$(shasum -a 256 "$ASAR" | awk '{print $1}')"
[[ "$ACTUAL_ASAR" == "$EXPECTED_ASAR" ]] || {
  echo "ChatGPT $APP_VERSION app.asar does not match its binding manifest" >&2
  exit 1
}

if pgrep -f "$APP_PATH/Contents/MacOS/$APP_EXECUTABLE" >/dev/null; then
  echo "quit ChatGPT before running local CI" >&2
  exit 1
fi
if lsof -nP -iTCP:"$PORT" -sTCP:LISTEN >/dev/null 2>&1; then
  echo "port $PORT is already in use" >&2
  exit 1
fi

TEMP_ROOT="${TMPDIR:-/tmp}"
WORK_ROOT="$(mktemp -d "${TEMP_ROOT%/}/chatgptx-local-ci.XXXXXX")"
TEST_HOME="$WORK_ROOT/home"
CODEX_ROOT="$TEST_HOME/.codex"
PROFILE_ROOT="$WORK_ROOT/profile"
WORKSPACE_ROOT="$REPO_ROOT"
LOG_ROOT="$WORK_ROOT/logs"
RELEASE_ROOT="$WORK_ROOT/release"
APP_PID=""

cleanup() {
  if [[ -n "$APP_PID" ]] && kill -0 "$APP_PID" 2>/dev/null; then
    kill -TERM "$APP_PID" 2>/dev/null || true
    wait "$APP_PID" 2>/dev/null || true
  fi
  if [[ "$KEEP_WORKDIR" == "1" ]]; then
    echo "kept local CI workdir: $WORK_ROOT"
  else
    rm -rf "$WORK_ROOT"
  fi
}
trap cleanup EXIT INT TERM

mkdir -p "$CODEX_ROOT" "$PROFILE_ROOT" "$LOG_ROOT" "$RELEASE_ROOT"
chmod 700 "$TEST_HOME" "$CODEX_ROOT" "$PROFILE_ROOT"
cp "$PRIMARY_AUTH" "$CODEX_ROOT/auth.json"
chmod 600 "$CODEX_ROOT/auth.json"

run_logged() {
  local name="$1"
  shift
  local log_file="$LOG_ROOT/$name.log"
  if "$@" >"$log_file" 2>&1; then
    return
  fi
  echo "$name failed" >&2
  rg -n -i 'error:|failed|failure|exception|fatal' "$log_file" >&2 || true
  return 1
}

run_logged extensions env HOME="$TEST_HOME" CODEX_HOME="$CODEX_ROOT" "$REPO_ROOT/src/extensions/build.sh"

EXTENSION_SETTINGS="$CODEX_ROOT/extensions/settings.json"

MULTIPLE_ACCOUNTS_ROOT="$CODEX_ROOT/extensions/multiple-accounts"
mkdir -p "$MULTIPLE_ACCOUNTS_ROOT"

launch_app() {
  local name="$1"
  env HOME="$TEST_HOME" CODEX_HOME="$CODEX_ROOT" \
    NODE_OPTIONS="--require \"$REPO_ROOT/src/platform/bridge/main.cjs\"" \
    "$APP_BIN" \
    --user-data-dir="$PROFILE_ROOT" \
    --remote-debugging-port="$PORT" \
    >"$LOG_ROOT/$name.stdout.log" 2>"$LOG_ROOT/$name.stderr.log" &
  APP_PID=$!
  local deadline=$((SECONDS + 30))
  until curl -fsS "http://127.0.0.1:$PORT/json" 2>/dev/null \
    | jq -e 'any(.[]; .type == "page" and (.url | startswith("app:")))' \
      >/dev/null 2>&1; do
    if ! kill -0 "$APP_PID" 2>/dev/null; then
      echo "ChatGPT exited during $name" >&2
      return 1
    fi
    (( SECONDS < deadline )) || {
      echo "ChatGPT did not expose CDP during $name" >&2
      return 1
    }
    sleep 0.1
  done
}

stop_app() {
  [[ -n "$APP_PID" ]] || return
  kill -TERM "$APP_PID"
  local deadline=$((SECONDS + 15))
  while kill -0 "$APP_PID" 2>/dev/null; do
    [[ "$(ps -o state= -p "$APP_PID" | tr -d ' ')" == Z ]] && break
    (( SECONDS < deadline )) || {
      echo "ChatGPT did not exit" >&2
      return 1
    }
    sleep 0.1
  done
  wait "$APP_PID" 2>/dev/null || true
  APP_PID=""
}

launch_app initialize
if [[ "$USE_CURRENT_ACCOUNTS" == "1" ]]; then
  run_logged initialize-readiness node "$REPO_ROOT/scripts/wait-for-chatgpt-ready.mjs" "$PORT"
  CURRENT_USER_ID="$(jq -er '.currentUserId' "$LOG_ROOT/initialize-readiness.log")"
  CURRENT_FILE_NAME="auth-$(node -e 'process.stdout.write(encodeURIComponent(process.argv[1]))' "$CURRENT_USER_ID").json"
  while IFS= read -r candidate; do
    [[ "$(basename "$candidate")" == "$CURRENT_FILE_NAME" ]] && continue
    SECONDARY_AUTH="$candidate"
    break
  done < <(find "$SOURCE_ACCOUNTS_ROOT" -maxdepth 1 -type f -name 'auth-*.json' | sort)
  [[ -n "$SECONDARY_AUTH" ]] || {
    echo "no alternate current account exists" >&2
    exit 1
  }
  run_logged initialize-alternate node "$REPO_ROOT/scripts/wait-for-chatgpt-ready.mjs" \
    "$PORT" 90000 "$SECONDARY_AUTH"
  SECONDARY_USER_ID="$(jq -er '.inspectedUserId' "$LOG_ROOT/initialize-alternate.log")"
else
  run_logged initialize-readiness node "$REPO_ROOT/scripts/wait-for-chatgpt-ready.mjs" \
    "$PORT" 90000 "$SECONDARY_AUTH"
  CURRENT_USER_ID="$(jq -er '.currentUserId' "$LOG_ROOT/initialize-readiness.log")"
  SECONDARY_USER_ID="$(jq -er '.inspectedUserId' "$LOG_ROOT/initialize-readiness.log")"
fi
[[ "$CURRENT_USER_ID" != "$SECONDARY_USER_ID" ]] || {
  echo "primary and secondary authentication identify the same account" >&2
  exit 1
}
SECONDARY_FILE_NAME="auth-$(node -e 'process.stdout.write(encodeURIComponent(process.argv[1]))' "$SECONDARY_USER_ID").json"
cp "$SECONDARY_AUTH" "$MULTIPLE_ACCOUNTS_ROOT/$SECONDARY_FILE_NAME"
chmod 600 "$MULTIPLE_ACCOUNTS_ROOT/$SECONDARY_FILE_NAME"
deadline=$((SECONDS + 30))
until [[ -f "$CODEX_ROOT/state_5.sqlite" ]]; do
  (( SECONDS < deadline )) || {
    echo "ChatGPT did not initialize state_5.sqlite" >&2
    exit 1
  }
  sleep 0.1
done
stop_app

launch_app accounts
run_logged accounts-readiness node "$REPO_ROOT/scripts/wait-for-chatgpt-ready.mjs" "$PORT"
run_logged multiple-accounts-e2e node "$REPO_ROOT/src/extensions/multiple-accounts/multiple-accounts.e2e.mjs" "$PORT"
stop_app

GLOBAL_STATE="$CODEX_ROOT/.codex-global-state.json"
LOCAL_PROJECT_ID="local-chatgptx-ci"
LOCAL_PROJECT_NAME="$(basename "$WORKSPACE_ROOT")"
LOCAL_PROJECT_UPDATED_AT="$(( $(date +%s) * 1000 ))"
jq \
  --arg workspace "$WORKSPACE_ROOT" \
  --arg projectId "$LOCAL_PROJECT_ID" \
  --arg projectName "$LOCAL_PROJECT_NAME" \
  --argjson projectUpdatedAt "$LOCAL_PROJECT_UPDATED_AT" \
  '
    .["electron-persisted-atom-state"]["app-shell-bottom-panel-launcher-visible"] = true
    | .["electron-persisted-atom-state"]["sidebar-collapsed-sections-v1"] = {
        chats: false,
        pinned: false,
        threads: false
      }
    | .["electron-persisted-atom-state"]["sidebar-project-expanded-v1-codex:\($projectId)"] = true
    | .["electron-persisted-atom-state"]["electron:onboarding-welcome-pending"] = false
    | .["electron-saved-workspace-roots"] = [$workspace]
    | .["active-workspace-roots"] = [$workspace]
    | .["local-projects"] = {
        ($projectId): {
          id: $projectId,
          name: $projectName,
          rootPaths: [$workspace],
          createdAt: $projectUpdatedAt,
          updatedAt: $projectUpdatedAt
        }
      }
    | .["project-order"] = [$projectId]
    | .["selected-project"] = {
        type: "local",
        projectId: $projectId
      }
  ' "$GLOBAL_STATE" > "$WORK_ROOT/global-state.json"
mv "$WORK_ROOT/global-state.json" "$GLOBAL_STATE"

THREAD_ID="$(node -e '
  const { randomBytes } = require("node:crypto");
  const bytes = randomBytes(16);
  let timestamp = BigInt(Date.now());
  for (let index = 5; index >= 0; index -= 1) {
    bytes[index] = Number(timestamp & 0xffn);
    timestamp >>= 8n;
  }
  bytes[6] = (bytes[6] & 0x0f) | 0x70;
  bytes[8] = (bytes[8] & 0x3f) | 0x80;
  const hex = bytes.toString("hex");
  process.stdout.write(
    `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20)}`,
  );
')"
THREAD_DIR="$CODEX_ROOT/sessions/ci"
ROLLOUT_PATH="$THREAD_DIR/rollout-$THREAD_ID.jsonl"
mkdir -p "$THREAD_DIR"
NOW_SECONDS="$(date +%s)"
NOW_ISO="$(date -u +%Y-%m-%dT%H:%M:%S.000Z)"
jq -cn \
  --arg timestamp "$NOW_ISO" \
  --arg id "$THREAD_ID" \
  --arg cwd "$WORKSPACE_ROOT" \
  --arg cli_version "$CODEX_CLI_VERSION" \
  '{
    timestamp: $timestamp,
    type: "session_meta",
    payload: {
      id: $id,
      session_id: $id,
      timestamp: $timestamp,
      cwd: $cwd,
      originator: "chatgptx-ci",
      cli_version: $cli_version,
      source: "cli",
      model_provider: "openai",
      base_instructions: {text: ""},
      git: null,
      history_mode: "legacy",
      memory_mode: "disabled",
      thread_source: "user",
      context_window: {window_id: $id}
    }
  }' > "$ROLLOUT_PATH"
jq -cn \
  --arg timestamp "$NOW_ISO" \
  '{
    timestamp: $timestamp,
    type: "event_msg",
    payload: {
      type: "user_message",
      message: "ChatGPTX local CI fixture",
      images: [],
      local_images: [],
      text_elements: []
    }
  }' >> "$ROLLOUT_PATH"

sqlite3 "$CODEX_ROOT/state_5.sqlite" <<SQL
INSERT INTO threads (
  id, rollout_path, created_at, updated_at, source, model_provider, cwd, title,
  sandbox_policy, approval_mode, tokens_used, has_user_event, archived,
  cli_version, first_user_message, memory_mode, model, reasoning_effort,
  thread_source, preview, recency_at, history_mode
) VALUES (
  '$THREAD_ID', '$ROLLOUT_PATH', $NOW_SECONDS, $NOW_SECONDS, 'cli', 'openai',
  '$WORKSPACE_ROOT', 'ChatGPTX local CI fixture', '{"type":"disabled"}',
  'never', 0, 0, 0, '$CODEX_CLI_VERSION', 'ChatGPTX local CI fixture', 'disabled',
  'gpt-5.6-sol', 'low', 'user', 'ChatGPTX local CI fixture', $NOW_SECONDS,
  'legacy'
);
SQL

jq '(.extensions[] | select(.id == "api-test-suite") | .enabled) = true' "$EXTENSION_SETTINGS" > "$WORK_ROOT/extensions-settings.json"
mv "$WORK_ROOT/extensions-settings.json" "$EXTENSION_SETTINGS"
chmod 600 "$EXTENSION_SETTINGS"

run_logged unit-tests bun test \
  "$REPO_ROOT/src/extensions/multiple-accounts/multiple-accounts.test.ts" \
  "$REPO_ROOT/src/extensions/thread-colors/thread-colors.test.ts" \
  "$REPO_ROOT/src/platform/utilities/extension-storage.test.ts"

launch_app validation
if [[ "$USE_CURRENT_ACCOUNTS" == "1" ]]; then
  THREAD_SELECTION="--select-thread-kind=remote"
else
  THREAD_SELECTION="--select-thread=$THREAD_ID"
fi
run_logged native-ui node "$BINDING_DIR/ui-test.mjs" "$PORT" \
  "--alternate-auth=$SECONDARY_AUTH" "$THREAD_SELECTION"
stop_app

RESULTS_FILE="$CODEX_ROOT/extensions/log/test-results.json"
[[ -f "$RESULTS_FILE" ]] || {
  echo "public API test results were not reported" >&2
  exit 1
}
PUBLIC_TOTAL="$(jq 'length' "$RESULTS_FILE")"
PUBLIC_PASSED="$(jq '[.[] | select(.pass)] | length' "$RESULTS_FILE")"
[[ "$PUBLIC_TOTAL" == "$PUBLIC_PASSED" ]] || {
  echo "public API suite failed: $PUBLIC_PASSED/$PUBLIC_TOTAL" >&2
  exit 1
}

run_logged release-build env \
  HOME="$TEST_HOME" \
  CODEX_HOME="$CODEX_ROOT" \
  CHATGPTX_BUILD_CONFIGURATION=Release \
  CHATGPTX_BUILD_DIR="$RELEASE_ROOT" \
  "$REPO_ROOT/src/macOS/scripts/build.sh"
codesign --verify --deep --strict --verbose=2 "$RELEASE_ROOT/ChatGPTX.app" >"$LOG_ROOT/codesign.log" 2>&1
diff -rq "$BINDING_DIR" "$RELEASE_ROOT/ChatGPTX.app/Contents/Resources/bindings/$APP_VERSION" >"$LOG_ROOT/binding-diff.log"
diff -q "$REPO_ROOT/src/platform/bridge/main.cjs" "$RELEASE_ROOT/ChatGPTX.app/Contents/Resources/bridge/main.cjs" >"$LOG_ROOT/bridge-diff.log"

UNIT_PASSED="$(awk '/[0-9]+ pass/{passed=$1} END{print passed}' "$LOG_ROOT/unit-tests.log")"
NATIVE_PASSED="$(jq -r '.passed' "$LOG_ROOT/native-ui.log")"
NATIVE_TOTAL="$(jq -r '.total' "$LOG_ROOT/native-ui.log")"
echo "unit: $UNIT_PASSED passed"
echo "public API: $PUBLIC_PASSED/$PUBLIC_TOTAL"
echo "native UI: $NATIVE_PASSED/$NATIVE_TOTAL"
if [[ "$USE_CURRENT_ACCOUNTS" == "1" ]]; then
  echo "multiple-accounts: switched to another current account and restored the original"
else
  echo "multiple-accounts: switched to burner 2 and restored burner 1"
fi
echo "release: built, signed, and source-matched"
