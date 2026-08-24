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
  echo "       scripts/run-local-ci.sh <api-key-auth.json>" >&2
  echo "       scripts/run-local-ci.sh --use-current-accounts" >&2
}

if [[ "$USE_CURRENT_ACCOUNTS" == "1" ]]; then
  [[ "$#" == "0" ]] || {
    usage
    exit 1
  }
  SOURCE_CODEX_ROOT="${CODEX_HOME:-$HOME/.codex}"
  PRIMARY_AUTH="$SOURCE_CODEX_ROOT/auth.json"
  SOURCE_ACCOUNTS_ROOT="$SOURCE_CODEX_ROOT/extensions/state/multiple-accounts"
  [[ -f "$PRIMARY_AUTH" ]] || {
    echo "current authentication must exist" >&2
    exit 1
  }
else
  [[ "$#" == "1" || "$#" == "2" ]] || {
    usage
    exit 1
  }
  [[ -f "$PRIMARY_AUTH" ]] || {
    echo "primary authentication file does not exist" >&2
    exit 1
  }
  if [[ -n "$SECONDARY_AUTH" && ! -f "$SECONDARY_AUTH" ]]; then
    echo "secondary authentication file does not exist" >&2
    exit 1
  fi
fi

for command in bun jq sqlite3 xcodegen xcodebuild codesign curl lsof rg; do
  command -v "$command" >/dev/null || {
    echo "$command is required" >&2
    exit 1
  }
done

AUTH_MODE="$(jq -er '.auth_mode' "$PRIMARY_AUTH")"
case "$AUTH_MODE" in
  apikey)
    jq -e '
      .auth_mode == "apikey"
      and (.OPENAI_API_KEY | type == "string" and length > 0)
      and (.tokens == null)
    ' "$PRIMARY_AUTH" >/dev/null || {
      echo "API-key authentication is malformed" >&2
      exit 1
    }
    NO_PROFILE=1
    ;;
  chatgpt)
    jq -e '
      .auth_mode == "chatgpt"
      and (.tokens | type == "object")
      and (.tokens.access_token | type == "string" and length > 0)
      and (.tokens.refresh_token | type == "string" and length > 0)
    ' "$PRIMARY_AUTH" >/dev/null || {
      echo "ChatGPT authentication is malformed" >&2
      exit 1
    }
    NO_PROFILE=0
    if [[ "$USE_CURRENT_ACCOUNTS" == "1" ]]; then
      [[ -d "$SOURCE_ACCOUNTS_ROOT" ]] || {
        echo "multiple-accounts storage must exist for ChatGPT authentication" >&2
        exit 1
      }
    elif [[ -z "$SECONDARY_AUTH" ]]; then
      echo "secondary authentication is required for ChatGPT authentication" >&2
      exit 1
    fi
    ;;
  *)
    echo "unsupported authentication mode: $AUTH_MODE" >&2
    exit 1
    ;;
esac
export CHATGPTX_TEST_NO_PROFILE="$NO_PROFILE"

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

validate_app_build() {
  local phase="$1"
  local actual_version
  local actual_asar
  actual_version="$(/usr/libexec/PlistBuddy -c 'Print CFBundleShortVersionString' "$PLIST")"
  [[ "$actual_version" == "$APP_VERSION" ]] || {
    echo "ChatGPT changed during $phase: expected version $APP_VERSION, found $actual_version" >&2
    return 1
  }
  actual_asar="$(shasum -a 256 "$ASAR" | awk '{print $1}')"
  [[ "$actual_asar" == "$EXPECTED_ASAR" ]] || {
    echo "ChatGPT changed during $phase: $APP_VERSION app.asar hash does not match its binding manifest" >&2
    return 1
  }
}

validate_app_build startup

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

capture_authentication() {
  [[ "$NO_PROFILE" == "0" ]] || return 0
  [[ -n "${CHATGPTX_AUTH_OUTPUT_DIR:-}" ]] || return 0
  [[ -f "$PRIMARY_AUTH" && -f "$SECONDARY_AUTH" && -f "$CODEX_ROOT/auth.json" ]] || return 0
  node "$REPO_ROOT/scripts/capture-authentication-candidates.mjs" \
    "$PRIMARY_AUTH" \
    "$SECONDARY_AUTH" \
    "$CODEX_ROOT" \
    "$CHATGPTX_AUTH_OUTPUT_DIR"
}

isolated_process_ids() {
  ps eww -axo pid=,command= \
    | awk -v root="$WORK_ROOT" \
      'index($0, "CHATGPTX_CI_PROCESS_MARKER=" root) { print $1 }'
}

stop_isolated_processes() {
  local process_ids=()
  while IFS= read -r process_id; do
    [[ "$process_id" =~ ^[0-9]+$ ]] && process_ids+=("$process_id")
  done < <(isolated_process_ids)
  (( ${#process_ids[@]} > 0 )) || return 0

  kill -TERM "${process_ids[@]}" 2>/dev/null || true
  local deadline=$((SECONDS + 15))
  while (( SECONDS < deadline )); do
    local running=0
    for process_id in "${process_ids[@]}"; do
      if kill -0 "$process_id" 2>/dev/null \
        && [[ "$(ps -o state= -p "$process_id" | tr -d ' ')" != Z ]]; then
        running=1
        break
      fi
    done
    [[ "$running" == "0" ]] && break
    sleep 0.1
  done

  process_ids=()
  while IFS= read -r process_id; do
    [[ "$process_id" =~ ^[0-9]+$ ]] && process_ids+=("$process_id")
  done < <(isolated_process_ids)
  (( ${#process_ids[@]} > 0 )) || return 0
  kill -KILL "${process_ids[@]}" 2>/dev/null || true

  deadline=$((SECONDS + 5))
  while (( SECONDS < deadline )); do
    process_ids=()
    while IFS= read -r process_id; do
      [[ "$process_id" =~ ^[0-9]+$ ]] && process_ids+=("$process_id")
    done < <(isolated_process_ids)
    (( ${#process_ids[@]} > 0 )) || return 0
    kill -KILL "${process_ids[@]}" 2>/dev/null || true
    sleep 0.1
  done
  echo "isolated ChatGPT processes did not exit" >&2
  return 1
}

cleanup() {
  local exit_code="${1:-$?}"
  local capture_exit_code=0
  local process_cleanup_exit_code=0
  local stopped_pid="$APP_PID"
  trap - EXIT INT TERM
  stop_isolated_processes || process_cleanup_exit_code=$?
  if [[ -n "$stopped_pid" ]]; then
    wait "$stopped_pid" 2>/dev/null || true
  fi
  capture_authentication || capture_exit_code=$?
  if [[ "$KEEP_WORKDIR" == "1" ]]; then
    echo "kept local CI workdir: $WORK_ROOT"
  else
    rm -rf "$WORK_ROOT"
  fi
  if [[ "$exit_code" == "0" && "$capture_exit_code" != "0" ]]; then
    exit_code="$capture_exit_code"
  fi
  if [[ "$exit_code" == "0" && "$process_cleanup_exit_code" != "0" ]]; then
    exit_code="$process_cleanup_exit_code"
  fi
  exit "$exit_code"
}
trap 'cleanup $?' EXIT
trap 'exit 130' INT
trap 'exit 143' TERM

mkdir -p "$CODEX_ROOT" "$PROFILE_ROOT" "$LOG_ROOT" "$RELEASE_ROOT"
chmod 700 "$TEST_HOME" "$CODEX_ROOT" "$PROFILE_ROOT"
cp "$PRIMARY_AUTH" "$CODEX_ROOT/auth.json"
chmod 600 "$CODEX_ROOT/auth.json"
capture_authentication

RUN_STARTED_AT="$SECONDS"
PROGRESS_FD="${CHATGPTX_PROGRESS_FD:-1}"
[[ "$PROGRESS_FD" =~ ^[1-9][0-9]*$ ]] || {
  echo "CHATGPTX_PROGRESS_FD must be a positive file descriptor" >&2
  exit 1
}

progress() {
  printf '[ci +%ss] %s\n' "$((SECONDS - RUN_STARTED_AT))" "$1" >&"$PROGRESS_FD"
}

if [[ "$NO_PROFILE" == "1" ]]; then
  progress "API-key authentication detected; profile-dependent gates disabled"
fi

run_logged() {
  local name="$1"
  shift
  local log_file="$LOG_ROOT/$name.log"
  local started_at="$SECONDS"
  progress "starting $name"
  if "$@" >"$log_file" 2>&1; then
    progress "passed $name ($((SECONDS - started_at))s)"
    return
  fi
  progress "failed $name ($((SECONDS - started_at))s)"
  {
    echo "$name failed; complete captured output follows:"
    cat "$log_file"
  } >&2
  return 1
}

wait_for_process_exit() {
  local process_id="$1"
  local deadline="$2"
  while kill -0 "$process_id" 2>/dev/null; do
    [[ "$(ps -o state= -p "$process_id" | tr -d ' ')" == Z ]] && break
    (( SECONDS < deadline )) || return 124
    sleep 0.1
  done
  wait "$process_id"
}

run_logged release-build env \
  HOME="$TEST_HOME" \
  CODEX_HOME="$CODEX_ROOT" \
  CHATGPTX_BUILD_CONFIGURATION=Release \
  CHATGPTX_BUILD_DIR="$RELEASE_ROOT" \
  "$REPO_ROOT/src/macOS/scripts/build.sh"

LAUNCHER_BIN="$RELEASE_ROOT/ChatGPTX.app/Contents/MacOS/ChatGPTX"

run_logged local-extension-build env \
  HOME="$TEST_HOME" \
  CODEX_HOME="$CODEX_ROOT" \
  CHATGPTX_EXTENSION_BUILD_DIR="$WORK_ROOT/extension-builds" \
  "$REPO_ROOT/src/extensions/build.sh"

run_logged local-component-store node \
  "$REPO_ROOT/scripts/stage-local-component-store.mjs" \
  "$CODEX_ROOT/extensions" \
  "$WORK_ROOT/extension-builds"

LOCAL_API_TEST_ROOT="$WORK_ROOT/extension-builds/api-test-suite"
MULTIPLE_ACCOUNTS_ROOT="$CODEX_ROOT/extensions/state/multiple-accounts"
if [[ "$NO_PROFILE" == "0" ]]; then
  mkdir -p "$MULTIPLE_ACCOUNTS_ROOT"
fi

launch_app() {
  local name="$1"
  local mode="${2:-normal}"
  local started_at="$SECONDS"
  validate_app_build "$name launch"
  progress "launching ChatGPT for $name"
  if [[ "$mode" == "api-test" ]]; then
    env HOME="$TEST_HOME" CODEX_HOME="$CODEX_ROOT" \
      CHATGPTX_CI_PROCESS_MARKER="$WORK_ROOT" \
      "$LAUNCHER_BIN" \
      --test-api \
      --extension "$LOCAL_API_TEST_ROOT" \
      "--chatgpt-app=$APP_PATH" \
      "--user-data-dir=$PROFILE_ROOT" \
      "--remote-debugging-port=$PORT" \
      -SUEnableAutomaticChecks NO \
      >"$LOG_ROOT/$name.stdout.log" 2>"$LOG_ROOT/$name.stderr.log" &
    local launcher_pid=$!
    local launcher_exit_code=0
    wait_for_process_exit "$launcher_pid" "$((SECONDS + 30))" \
      || launcher_exit_code=$?
    if [[ "$launcher_exit_code" == "124" ]]; then
      kill -TERM "$launcher_pid" 2>/dev/null || true
      wait "$launcher_pid" 2>/dev/null || true
      APP_PID="$(
        lsof -nP -tiTCP:"$PORT" -sTCP:LISTEN 2>/dev/null \
          | head -n 1 \
          || true
      )"
      if [[ -z "$APP_PID" ]]; then
        APP_PID="$(
          ps -axo pid=,command= \
            | awk -v executable="$APP_BIN" '$2 == executable { print $1; exit }'
        )"
      fi
      cat "$LOG_ROOT/$name.stderr.log" >&2
      echo "ChatGPTX launcher did not exit during $name" >&2
      return 1
    fi
    if [[ "$launcher_exit_code" != "0" ]]; then
      cat "$LOG_ROOT/$name.stderr.log" >&2
      echo "ChatGPTX launcher failed during $name" >&2
      return "$launcher_exit_code"
    fi
    APP_PID=""
  else
    local versions_lock
    local api_relative
    local bridge_file
    versions_lock="$CODEX_ROOT/extensions/versions-lock.json"
    api_relative="$(jq -er '.chatgptApi.path' "$versions_lock")"
    bridge_file="$CODEX_ROOT/extensions/$api_relative/bridge/main.cjs"
    local launch_configuration=""
    if [[ "$mode" == "composition" ]]; then
      launch_configuration="$WORK_ROOT/$name-launch.json"
      node - \
        "$versions_lock" \
        "$CODEX_ROOT/extensions/settings.json" \
        "$CODEX_ROOT/extensions" \
        "$LOCAL_API_TEST_ROOT/contents/main.js" \
        "$launch_configuration" <<'NODE'
const fs = require("node:fs");
const path = require("node:path");
const [versionsFile, settingsFile, root, apiTest, output] =
  process.argv.slice(2);
const versions = JSON.parse(fs.readFileSync(versionsFile, "utf8"));
const settings = JSON.parse(fs.readFileSync(settingsFile, "utf8"));
const extensions = versions.extensions.map((extension) => {
  const packageRoot = path.join(root, extension.path);
  const manifest = JSON.parse(
    fs.readFileSync(path.join(packageRoot, "package.json"), "utf8"),
  );
  return {
    id: extension.id,
    path: path.join(packageRoot, "contents/main.js"),
    enabled:
      extension.required || settings.extensions[extension.id].enabled,
    ...(manifest.settings
      ? {
          settingsPath: path.join(packageRoot, manifest.settings.main),
          settingsPaneId: manifest.settings.pane,
        }
      : {}),
  };
});
extensions.push({ id: "api-test-suite", path: apiTest, enabled: true });
fs.writeFileSync(
  output,
  `${JSON.stringify({ schemaVersion: 3, extensions }, null, 2)}\n`,
);
NODE
      chmod 600 "$launch_configuration"
    fi
    env HOME="$TEST_HOME" CODEX_HOME="$CODEX_ROOT" \
      CHATGPTX_CI_PROCESS_MARKER="$WORK_ROOT" \
      CHATGPTX_LAUNCH_CONFIGURATION="$launch_configuration" \
      CHATGPTX_VERSIONS_LOCK="$versions_lock" \
      NODE_OPTIONS="--require \"$bridge_file\"" \
      "$APP_BIN" \
      --user-data-dir="$PROFILE_ROOT" \
      --remote-debugging-port="$PORT" \
      -SUEnableAutomaticChecks NO \
      >"$LOG_ROOT/$name.stdout.log" 2>"$LOG_ROOT/$name.stderr.log" &
    APP_PID=$!
  fi
  local deadline=$((SECONDS + 30))
  until curl -fsS "http://127.0.0.1:$PORT/json" 2>/dev/null \
    | jq -e 'any(.[]; .type == "page" and (.url | startswith("app:")))' \
      >/dev/null 2>&1; do
    if [[ -n "$APP_PID" ]] && ! kill -0 "$APP_PID" 2>/dev/null; then
      echo "ChatGPT exited during $name" >&2
      return 1
    fi
    (( SECONDS < deadline )) || {
      echo "ChatGPT did not expose CDP during $name" >&2
      return 1
    }
    sleep 0.1
  done
  if [[ -z "$APP_PID" ]]; then
    APP_PID="$(lsof -nP -tiTCP:"$PORT" -sTCP:LISTEN)"
    [[ "$APP_PID" =~ ^[0-9]+$ ]] || {
      echo "ChatGPT PID could not be resolved during $name" >&2
      return 1
    }
  fi
  progress "ChatGPT ready for $name ($((SECONDS - started_at))s)"
}

stop_app() {
  [[ -n "$APP_PID" ]] || return
  local stopped_pid="$APP_PID"
  stop_isolated_processes
  wait "$stopped_pid" 2>/dev/null || true
  APP_PID=""
  capture_authentication
}

launch_app initialize api-test
if [[ "$NO_PROFILE" == "1" ]]; then
  run_logged initialize-readiness node \
    "$REPO_ROOT/scripts/wait-for-chatgpt-ready.mjs" "$PORT"
else
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
fi
deadline=$((SECONDS + 30))
until [[ -f "$CODEX_ROOT/state_5.sqlite" ]]; do
  (( SECONDS < deadline )) || {
    echo "ChatGPT did not initialize state_5.sqlite" >&2
    exit 1
  }
  sleep 0.1
done
stop_app

if [[ "$NO_PROFILE" == "0" ]]; then
  launch_app accounts
  run_logged accounts-readiness node "$REPO_ROOT/scripts/wait-for-chatgpt-ready.mjs" "$PORT"
  run_logged multiple-accounts-e2e node "$REPO_ROOT/src/extensions/multiple-accounts/multiple-accounts.e2e.mjs" "$PORT"
  stop_app
fi

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
  --arg turn_id "$THREAD_ID" \
  '{
    timestamp: $timestamp,
    type: "event_msg",
    payload: {type: "task_started", turn_id: $turn_id}
  }' >> "$ROLLOUT_PATH"
jq -cn \
  --arg timestamp "$NOW_ISO" \
  '{
    timestamp: $timestamp,
    type: "response_item",
    payload: {
      type: "message",
      role: "user",
      content: [
        {type: "input_text", text: "ChatGPTX local CI fixture"}
      ]
    }
  }' >> "$ROLLOUT_PATH"
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
jq -cn \
  --arg timestamp "$NOW_ISO" \
  '{
    timestamp: $timestamp,
    type: "event_msg",
    payload: {
      type: "agent_message",
      message: "ChatGPTX assistant selection fixture",
      phase: "final_answer"
    }
  }' >> "$ROLLOUT_PATH"
jq -cn \
  --arg timestamp "$NOW_ISO" \
  '{
    timestamp: $timestamp,
    type: "response_item",
    payload: {
      type: "message",
      role: "assistant",
      content: [
        {
          type: "output_text",
          text: "ChatGPTX assistant selection fixture"
        }
      ],
      phase: "final_answer"
    }
  }' >> "$ROLLOUT_PATH"
jq -cn \
  --arg timestamp "$NOW_ISO" \
  --arg turn_id "$THREAD_ID" \
  --argjson completed_at "$NOW_SECONDS" \
  '{
    timestamp: $timestamp,
    type: "event_msg",
    payload: {
      type: "task_complete",
      turn_id: $turn_id,
      last_agent_message: "ChatGPTX assistant selection fixture",
      completed_at: $completed_at,
      duration_ms: 1,
      time_to_first_token_ms: 1
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
  'never', 0, 1, 0, '$CODEX_CLI_VERSION', 'ChatGPTX local CI fixture', 'disabled',
  'gpt-5.6-sol', 'low', 'user', 'ChatGPTX local CI fixture', $NOW_SECONDS,
  'legacy'
);
SQL

run_logged unit-tests bun test \
  "$REPO_ROOT/src/extensions/extensions/extensions.test.ts" \
  "$REPO_ROOT/src/extensions/multiple-accounts/multiple-accounts.test.ts" \
  "$REPO_ROOT/src/extensions/reactions/reaction-settings.test.ts" \
  "$REPO_ROOT/src/extensions/reactions/reactions.test.ts" \
  "$REPO_ROOT/src/extensions/reactions/settings.test.ts" \
  "$REPO_ROOT/src/extensions/thread-colors/thread-colors.test.ts" \
  "$REPO_ROOT/src/platform/utilities/extension-management.test.ts" \
  "$REPO_ROOT/src/platform/utilities/extension-storage.test.ts"

if [[ "$USE_CURRENT_ACCOUNTS" == "1" && "$NO_PROFILE" == "0" ]]; then
  THREAD_SELECTION="--select-thread-kind=remote"
else
  THREAD_SELECTION="--select-thread=$THREAD_ID"
fi

launch_app public-api api-test
PUBLIC_API_PID="$APP_PID"
run_logged public-api node "$BINDING_DIR/ui-test.mjs" "$PORT" \
  --public-api-only "$THREAD_SELECTION"

PUBLIC_TOTAL="$(jq -er '.total' "$LOG_ROOT/public-api.log")"
PUBLIC_PASSED="$(jq -er '.passed' "$LOG_ROOT/public-api.log")"
[[ "$PUBLIC_TOTAL" == "$PUBLIC_PASSED" ]] || {
  echo "public API suite failed: $PUBLIC_PASSED/$PUBLIC_TOTAL" >&2
  exit 1
}

PUBLIC_API_BRIDGE_LOG="$CODEX_ROOT/extensions/log/bridge-$PUBLIC_API_PID.log"
PUBLIC_API_RESULTS_FILE=""
deadline=$((SECONDS + 5))
while (( SECONDS < deadline )); do
  if [[ -f "$PUBLIC_API_BRIDGE_LOG" ]]; then
    result_path="$(jq -sr \
      '[.[] | select(.event == "test-results" and .url == "app://-/index.html")][-1].file // empty' \
      "$PUBLIC_API_BRIDGE_LOG")"
    if [[ "$result_path" == "extensions/log/test-results/$PUBLIC_API_PID/"*.json ]]; then
      candidate="$CODEX_ROOT/$result_path"
      if [[ -f "$candidate" ]] && jq -e --slurpfile report "$LOG_ROOT/public-api.log" \
        '. == $report[0].checks' "$candidate" >/dev/null; then
        PUBLIC_API_RESULTS_FILE="$candidate"
        break
      fi
    fi
  fi
  sleep 0.1
done
[[ -n "$PUBLIC_API_RESULTS_FILE" ]] || {
  echo "main renderer public API results were not persisted" >&2
  exit 1
}
progress "verified persisted public API results"
stop_app

launch_app validation composition
if [[ "$NO_PROFILE" == "1" ]]; then
  run_logged native-ui node "$BINDING_DIR/ui-test.mjs" "$PORT" \
    "$THREAD_SELECTION"
else
  run_logged native-ui node "$BINDING_DIR/ui-test.mjs" "$PORT" \
    "--alternate-auth=$SECONDARY_AUTH" "$THREAD_SELECTION"
fi
stop_app

progress "verifying release artifact"
codesign --verify --deep --strict --verbose=2 "$RELEASE_ROOT/ChatGPTX.app" >"$LOG_ROOT/codesign.log" 2>&1
[[ ! -e "$RELEASE_ROOT/ChatGPTX.app/Contents/Resources/component-seed" ]] || {
  echo "release artifact contains bundled platform components" >&2
  exit 1
}
progress "verified release artifact"

UNIT_PASSED="$(awk '/[0-9]+ pass/{passed=$1} END{print passed}' "$LOG_ROOT/unit-tests.log")"
NATIVE_PASSED="$(jq -r '.passed' "$LOG_ROOT/native-ui.log")"
NATIVE_TOTAL="$(jq -r '.total' "$LOG_ROOT/native-ui.log")"
echo "unit: $UNIT_PASSED passed"
echo "public API: $PUBLIC_PASSED/$PUBLIC_TOTAL"
echo "native UI: $NATIVE_PASSED/$NATIVE_TOTAL"
if [[ "$NO_PROFILE" == "1" ]]; then
  echo "authentication: API key; profile-dependent gates disabled"
elif [[ "$USE_CURRENT_ACCOUNTS" == "1" ]]; then
  echo "multiple-accounts: switched to another current account and restored the original"
else
  echo "multiple-accounts: switched to burner 2 and restored burner 1"
fi
echo "release: built, signed, and contains no bundled platform components"
