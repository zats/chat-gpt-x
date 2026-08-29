#!/bin/bash

set -euo pipefail

marker_value="chatgptx-extension-test-v1"
local_build_marker_value="ChatGPTX local extension build"
watchdog_label_prefix="com.chatgptx.launcher.extension-test."
process_group_directory_name="process-groups"
cleanup_session=""
cleanup_launcher_pid=""
cleanup_complete=true

usage() {
  cat >&2 <<'USAGE'
usage:
  test-extension.sh start <absolute-package-directory>
  test-extension.sh status <absolute-session-directory>
  test-extension.sh ui press <absolute-session-directory> <AXRole> <label>
  test-extension.sh ui press-wait <absolute-session-directory> <AXRole> <label> <AXRole|*> <label> [timeout]
  test-extension.sh ui wait <absolute-session-directory> <AXRole|*> <label> [timeout]
  test-extension.sh stop <absolute-session-directory>
USAGE
}

script_directory="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd -P)"
skill_directory="$(cd "$script_directory/.." && pwd -P)"

resolve_launcher() {
  local candidate
  candidate="$(cd "$skill_directory/../../.." && pwd -P)/MacOS/ChatGPTX"
  if [[ "$candidate" != /* || ! -x "$candidate" ]]; then
    echo "The ChatGPTX launcher executable is unavailable: $candidate" >&2
    exit 1
  fi
  printf '%s\n' "$candidate"
}

find_computer_use_app() {
  local source_codex_home="$1"
  local service_suffix="/Contents/MacOS/SkyComputerUseService"
  local candidate
  local -a candidates
  candidates=(
    "$source_codex_home/computer-use/Codex Computer Use.app"
    "$HOME/.codex/computer-use/Codex Computer Use.app"
  )
  if [[ -n "${SKY_CUA_SERVICE_PATH:-}" ]]; then
    candidates+=("$SKY_CUA_SERVICE_PATH")
  fi

  for candidate in "${candidates[@]}"; do
    if [[ -x "$candidate$service_suffix" ]]; then
      printf '%s\n' "$candidate"
      return 0
    fi
  done

  echo "The primary Computer Use service was not found." >&2
  echo "Start the primary ChatGPT app once, then try again." >&2
  return 1
}

resolve_safe_temporary_root() {
  local candidate="${TMPDIR:-/tmp}"
  local resolved
  local mode
  if [[ "$candidate" != /* || ! -d "$candidate" ]]; then
    echo "The temporary directory must be an absolute directory: $candidate" >&2
    return 1
  fi
  resolved="$(cd "$candidate" && pwd -P)"
  mode="$((8#$(/usr/bin/stat -f %p "$resolved")))"
  if (( (mode & 0022) != 0 && (mode & 01000) == 0 )); then
    echo "The temporary directory is writable by other users without the sticky bit: $resolved" >&2
    return 1
  fi
  printf '%s\n' "$resolved"
}

validate_session() {
  local requested="$1"
  local resolved
  local safe_temporary_root
  if [[ "$requested" != /* || ! -d "$requested" || -L "$requested" ]]; then
    echo "The test session is not a regular absolute directory: $requested" >&2
    exit 1
  fi
  resolved="$(cd "$requested" && pwd -P)"
  safe_temporary_root="$(resolve_safe_temporary_root)"
  if [[ "$(dirname "$resolved")" != "$safe_temporary_root" ]]; then
    echo "The test session is outside the safe temporary directory: $resolved" >&2
    exit 1
  fi
  if [[ "$(basename "$resolved")" != chatgptx-extension-test.* ]]; then
    echo "The directory is not a ChatGPTX extension test session: $resolved" >&2
    exit 1
  fi
  if [[ ! -f "$resolved/.chatgptx-extension-test" ||
    -L "$resolved/.chatgptx-extension-test" ]] ||
    [[ "$(<"$resolved/.chatgptx-extension-test")" != "$marker_value" ]]; then
    echo "The ChatGPTX extension test marker is missing: $resolved" >&2
    exit 1
  fi
  if [[ ( -e "$resolved/electron-profile" ||
      -L "$resolved/electron-profile" ) &&
      ( ! -d "$resolved/electron-profile" ||
        -L "$resolved/electron-profile" ) ]] ||
    [[ ( -e "$resolved/codex-home" || -L "$resolved/codex-home" ) &&
      ( ! -d "$resolved/codex-home" ||
        -L "$resolved/codex-home" ) ]]; then
    echo "The ChatGPTX extension test session is incomplete: $resolved" >&2
    exit 1
  fi
  printf '%s\n' "$resolved"
}

session_process_ids() {
  local session="$1"
  local launcher="$2"
  "$launcher" --extension-test-process list "$session"
}

record_session_process() {
  local session="$1"
  local process_id="$2"
  local launcher="$3"
  "$launcher" --extension-test-process record "$session" "$process_id"
}

signal_session_processes() {
  local session="$1"
  local signal_name="$2"
  local launcher="$3"
  "$launcher" --extension-test-process signal "$session" "$signal_name"
}

stop_launcher_process() {
  local process_id="$1"
  local deadline
  local kill_deadline
  [[ "$process_id" =~ ^[1-9][0-9]*$ ]] || return 0
  /bin/kill -0 "$process_id" 2>/dev/null || return 0
  /bin/kill -TERM "$process_id" 2>/dev/null || true
  deadline=$((SECONDS + 5))
  while /bin/kill -0 "$process_id" 2>/dev/null; do
    if ((SECONDS >= deadline)); then
      /bin/kill -KILL "$process_id" 2>/dev/null || true
      break
    fi
    /bin/sleep 0.1
  done
  kill_deadline=$((SECONDS + 5))
  while /bin/kill -0 "$process_id" 2>/dev/null &&
    ((SECONDS < kill_deadline)); do
    /bin/sleep 0.1
  done
}

purge_session_private_data() {
  local session="$1"
  local launcher="$2"
  "$launcher" --extension-test-process purge "$session"
}

remove_session() {
  local session="$1"
  local launcher="$2"
  "$launcher" --extension-test-process remove "$session"
}

stop_session_processes() {
  local session="$1"
  local launcher="$2"
  local process_ids=""
  local deadline
  local kill_deadline
  if ! process_ids="$(session_process_ids "$session" "$launcher")"; then
    echo "The isolated process records could not be validated." >&2
    return 1
  fi
  [[ -n "$process_ids" ]] || return 0
  signal_session_processes "$session" TERM "$launcher"
  deadline=$((SECONDS + 10))
  while ((SECONDS < deadline)); do
    if ! process_ids="$(session_process_ids "$session" "$launcher")"; then
      echo "The isolated process records became invalid." >&2
      return 1
    fi
    [[ -n "$process_ids" ]] || return 0
    /bin/sleep 0.1
  done
  signal_session_processes "$session" KILL "$launcher"
  kill_deadline=$((SECONDS + 5))
  while ((SECONDS < kill_deadline)); do
    if ! process_ids="$(session_process_ids "$session" "$launcher")"; then
      echo "The isolated process records became invalid." >&2
      return 1
    fi
    [[ -n "$process_ids" ]] || return 0
    /bin/sleep 0.1
  done
  echo "The isolated ChatGPT process did not stop." >&2
  return 1
}

remove_watchdog_job() {
  local session="$1"
  local label_file="$session/watchdog.label"
  local label
  [[ -f "$label_file" && ! -L "$label_file" ]] || return 0
  label="$(<"$label_file")"
  if [[ "$label" =~ ^com\.chatgptx\.launcher\.extension-test\.[a-z0-9-]+$ ]]; then
    /bin/launchctl remove "$label" 2>/dev/null || true
  fi
}

cleanup_failed_start() {
  local status="$1"
  local launcher
  local process_ids=""
  local stop_failed=false
  trap - EXIT INT TERM
  if [[ "$cleanup_complete" != "true" &&
    -n "$cleanup_session" &&
    -d "$cleanup_session" &&
    ! -L "$cleanup_session" &&
    -f "$cleanup_session/.chatgptx-extension-test" ]] &&
    [[ "$(<"$cleanup_session/.chatgptx-extension-test")" == "$marker_value" ]]; then
    stop_launcher_process "$cleanup_launcher_pid"
    wait "$cleanup_launcher_pid" 2>/dev/null || true
    launcher="$(resolve_launcher)"
    if [[ ! -f "$cleanup_session/.chatgpt-executable" ||
      -L "$cleanup_session/.chatgpt-executable" ]]; then
      remove_watchdog_job "$cleanup_session"
      remove_session "$cleanup_session" "$launcher"
      exit "$status"
    fi
    stop_session_processes "$cleanup_session" "$launcher" || stop_failed=true
    if ! process_ids="$(session_process_ids "$cleanup_session" "$launcher")"; then
      stop_failed=true
    fi
    if [[ "$stop_failed" == "true" || -n "$process_ids" ]]; then
      purge_session_private_data "$cleanup_session" "$launcher" || true
      echo "A failed isolated ChatGPT process is still running: $cleanup_session" >&2
      echo "Private test data was removed. The watchdog will keep stopping the process." >&2
    else
      remove_watchdog_job "$cleanup_session"
      remove_session "$cleanup_session" "$launcher"
    fi
  fi
  exit "$status"
}

find_bridge_log() {
  local session="$1"
  local launcher="$2"
  local log_directory="$session/codex-home/extensions/log"
  local candidate
  local process_id
  local process_ids
  [[ -f "$session/app.pid" && ! -L "$session/app.pid" ]] || return 1
  process_id="$(<"$session/app.pid")"
  [[ "$process_id" =~ ^[1-9][0-9]*$ ]] || return 1
  process_ids="$(session_process_ids "$session" "$launcher" 2>/dev/null)" ||
    return 1
  printf '%s\n' "$process_ids" | /usr/bin/grep -Fxq "$process_id" || return 1
  candidate="$log_directory/bridge-$process_id.log"
  if [[ -f "$candidate" && ! -L "$candidate" ]]; then
    printf '%s\t%s\n' "$process_id" "$candidate"
    return 0
  fi
  return 1
}

find_latest_bridge_log() {
  local session="$1"
  local log_directory="$session/codex-home/extensions/log"
  local candidate
  local candidate_time
  local latest_log=""
  local latest_time=0
  for candidate in "$log_directory"/bridge-*.log; do
    [[ -f "$candidate" && ! -L "$candidate" ]] || continue
    candidate_time="$(/usr/bin/stat -f %m "$candidate" 2>/dev/null || true)"
    [[ "$candidate_time" =~ ^[0-9]+$ ]] || continue
    if ((candidate_time >= latest_time)); then
      latest_time="$candidate_time"
      latest_log="$candidate"
    fi
  done
  [[ -n "$latest_log" ]] || return 1
  printf '0\t%s\n' "$latest_log"
}

verify_activation_marker() {
  local marker="$1"
  local phase="$2"
  local activation_status
  if [[ ! -f "$marker" || -L "$marker" ]]; then
    echo "The $phase activation result is unavailable." >&2
    return 1
  fi
  activation_status="$(/usr/bin/plutil -extract status raw -o - "$marker")"
  if [[ "$activation_status" != "activated" ]]; then
    echo "The $phase activation did not pass: $activation_status" >&2
    tail -n 1 "$marker" >&2
    return 1
  fi
}

start_watchdog() {
  local session="$1"
  local nonce="$2"
  local launcher="$3"
  local temporary_root="$4"
  local label="$watchdog_label_prefix$nonce"
  local startup_deadline
  local deadline
  startup_deadline="$(( $(/bin/date +%s) + 180 ))"
  deadline="$(( $(/bin/date +%s) + 1800 ))"
  /bin/cp "$script_directory/session-watchdog.sh" "$session/watchdog.sh"
  /bin/chmod 0700 "$session/watchdog.sh"
  printf '%s\n' "$label" > "$session/watchdog.label"
  /bin/launchctl submit \
    -l "$label" \
    -o /dev/null \
    -e /dev/null \
    -- \
    /bin/bash "$session/watchdog.sh" \
      "$session" "$startup_deadline" "$deadline" "$launcher" \
      "$temporary_root" 30 "$label"
}

start_test() {
  local package_directory
  local manifest
  local extension_id
  local extension_main
  local build_marker
  local expected_api_version
  local package_compatibility
  local settings_type=""
  local settings_main=""
  local launcher
  local source_codex_home
  local source_auth
  local source_extensions
  local source_update_lock
  local computer_use_app
  local session
  local test_codex_home
  local electron_profile
  local test_package
  local activation_nonce
  local activation_root=""
  local main_activation_marker
  local settings_activation_marker=""
  local launcher_pid
  local launcher_status=0
  local app_pid=""
  local bridge_log=""
  local bridge_record=""
  local diagnostic_record=""
  local deadline
  local temporary_root
  local -a launcher_arguments

  if [[ $# -ne 1 || "$1" != /* ]]; then
    usage
    exit 64
  fi
  package_directory="${1%/}"
  manifest="$package_directory/package.json"
  if [[ ! -d "$package_directory" || -L "$package_directory" ||
    ! -f "$manifest" || -L "$manifest" ]]; then
    echo "The extension package is invalid: $package_directory" >&2
    exit 1
  fi
  build_marker="$package_directory/.chatgptx-local-build"
  if [[ ! -f "$build_marker" || -L "$build_marker" ||
    "$(<"$build_marker")" != "$local_build_marker_value" ]]; then
    echo "The package was not produced by the bundled ChatGPTX build script." >&2
    exit 1
  fi
  if [[ ! -f "$package_directory/.chatgptx-api-version" ||
    -L "$package_directory/.chatgptx-api-version" ]]; then
    echo "The package API version marker is unavailable." >&2
    exit 1
  fi
  expected_api_version="$(<"$package_directory/.chatgptx-api-version")"
  if [[ ! "$expected_api_version" =~ ^[0-9]+\.[0-9]+\.[0-9]+$ ]]; then
    echo "The package API version marker is invalid." >&2
    exit 1
  fi

  extension_id="$(/usr/bin/plutil -extract id raw -o - "$manifest")"
  if [[ ! "$extension_id" =~ ^[a-z0-9][a-z0-9._-]*$ ||
    "$extension_id" == "extensions" ||
    "$extension_id" == "api-test-suite" ]]; then
    echo "The extension package has an invalid or reserved ID: $extension_id" >&2
    exit 1
  fi
  activation_root=".chatgptx-test/$extension_id"
  extension_main="$(/usr/bin/plutil -extract main raw -o - "$manifest")"
  if [[ "$extension_main" != "contents/main.js" ||
    ! -f "$package_directory/$extension_main" ||
    -L "$package_directory/$extension_main" ]]; then
    echo "The extension main entry point is invalid." >&2
    exit 1
  fi
  package_compatibility="$(
    /usr/bin/plutil -extract compatibility.chatgptApi raw -o - "$manifest"
  )"
  if [[ "$package_compatibility" != "^$expected_api_version" ]]; then
    echo "The package API compatibility does not match its build marker." >&2
    exit 1
  fi
  if settings_type="$(/usr/bin/plutil -type settings "$manifest" 2>/dev/null)"; then
    if [[ "$settings_type" != "dictionary" ]]; then
      echo "The extension settings declaration is invalid." >&2
      exit 1
    fi
    settings_main="$(
      /usr/bin/plutil -extract settings.main raw -o - "$manifest"
    )"
    if [[ "$settings_main" != "contents/settings.js" ||
      ! -f "$package_directory/$settings_main" ||
      -L "$package_directory/$settings_main" ]]; then
      echo "The extension Settings entry point is invalid." >&2
      exit 1
    fi
  fi
  if [[ -n "$(/usr/bin/find "$package_directory" -type l -print -quit)" ]]; then
    echo "The extension test package must not contain symbolic links." >&2
    exit 1
  fi

  launcher="$(resolve_launcher)"
  source_codex_home="${CODEX_HOME:-$HOME/.codex}"
  source_auth="$source_codex_home/auth.json"
  source_extensions="$source_codex_home/extensions"
  source_update_lock="$source_extensions/update.lock"
  if [[ ! -f "$source_auth" || -L "$source_auth" ]]; then
    echo "Authentication is unavailable at $source_auth." >&2
    echo "Sign in in the primary ChatGPT app, then try again." >&2
    exit 1
  fi
  if [[ ! -f "$source_update_lock" || -L "$source_update_lock" ]]; then
    echo "The active ChatGPTX component lock is unavailable: $source_update_lock" >&2
    exit 1
  fi
  computer_use_app="$(find_computer_use_app "$source_codex_home")"

  temporary_root="$(resolve_safe_temporary_root)"
  session="$(/usr/bin/mktemp -d "$temporary_root/chatgptx-extension-test.XXXXXX")"
  test_codex_home="$session/codex-home"
  electron_profile="$session/electron-profile"
  test_package="$session/test-package"
  /bin/mkdir -p \
    "$test_codex_home" \
    "$electron_profile" \
    "$session/$process_group_directory_name"
  /bin/chmod 0700 \
    "$session" \
    "$test_codex_home" \
    "$electron_profile" \
    "$session/$process_group_directory_name"
  printf '%s\n' "$marker_value" > "$session/.chatgptx-extension-test"
  /bin/chmod 0600 "$session/.chatgptx-extension-test"
  cleanup_session="$session"
  cleanup_complete=false
  trap 'cleanup_failed_start "$?"' EXIT
  trap 'exit 130' INT
  trap 'exit 143' TERM

  /usr/bin/lockf -k "$source_update_lock" \
    /bin/bash "$script_directory/seed-test-components.sh" \
      "$source_extensions" "$test_codex_home/extensions" \
      "$expected_api_version"

  activation_nonce="$(/usr/bin/uuidgen | /usr/bin/tr '[:upper:]' '[:lower:]')"
  /bin/cp "$script_directory/record-test-session.cjs" \
    "$session/record-test-session.cjs"
  /bin/chmod 0600 "$session/record-test-session.cjs"
  start_watchdog "$session" "$activation_nonce" "$launcher" "$temporary_root"

  /bin/cp "$source_auth" "$test_codex_home/auth.json"
  /bin/chmod 0600 "$test_codex_home/auth.json"
  /bin/cp "$skill_directory/assets/test-codex-global-state.json" \
    "$test_codex_home/.codex-global-state.json"
  /bin/chmod 0600 "$test_codex_home/.codex-global-state.json"
  /bin/cp -R "$package_directory" "$test_package"

  main_activation_marker="$test_codex_home/extensions/state/extensions/$activation_root/$activation_nonce-main.json"
  /usr/bin/osascript -l JavaScript \
    "$script_directory/instrument-test-package.js" \
    "$test_package/$extension_main" \
    "$extension_id" \
    main \
    "$activation_root/$activation_nonce-main.json"
  if [[ -n "$settings_main" ]]; then
    settings_activation_marker="$test_codex_home/extensions/state/extensions/$activation_root/$activation_nonce-settings.json"
    /usr/bin/osascript -l JavaScript \
      "$script_directory/instrument-test-package.js" \
      "$test_package/$settings_main" \
      "$extension_id" \
      settings \
      "$activation_root/$activation_nonce-settings.json"
  fi

  launcher_arguments=(
    --test-extension
    --extension "$test_package"
  )
  launcher_arguments+=(
    "--user-data-dir=$electron_profile"
    -SUEnableAutomaticChecks NO
  )

  /usr/bin/env \
    CODEX_HOME="$test_codex_home" \
    SKY_CUA_SERVICE_PATH="$computer_use_app" \
    CODEX_ELECTRON_SKIP_COMPUTER_USE_CANONICAL_REFRESH=1 \
    CHATGPTX_EXTENSION_TEST_RECORDER="$launcher" \
    CHATGPTX_EXTENSION_TEST_ROOT="$session" \
    "$launcher" \
    "${launcher_arguments[@]}" \
    >/dev/null \
    2>"$session/launcher.stderr.log" &
  launcher_pid=$!
  cleanup_launcher_pid="$launcher_pid"

  deadline=$((SECONDS + 120))
  while ((SECONDS < deadline)); do
    if bridge_record="$(find_bridge_log "$session" "$launcher")"; then
      app_pid="${bridge_record%%$'\t'*}"
      bridge_log="${bridge_record#*$'\t'}"
      break
    fi
    if [[ -n "$launcher_pid" ]] &&
      ! /bin/kill -0 "$launcher_pid" 2>/dev/null; then
      set +e
      cleanup_launcher_pid=""
      wait "$launcher_pid"
      launcher_status=$?
      launcher_pid=""
      set -e
      if [[ "$launcher_status" != "0" ]]; then
        break
      fi
    fi
    /bin/sleep 0.2
  done

  if [[ "$launcher_status" != "0" ||
    ! "$app_pid" =~ ^[1-9][0-9]*$ ||
    ! -f "$bridge_log" ]]; then
    if [[ -n "$launcher_pid" ]]; then
      stop_launcher_process "$launcher_pid"
      cleanup_launcher_pid=""
      wait "$launcher_pid" 2>/dev/null || true
      launcher_pid=""
    fi
    [[ -f "$session/launcher.stderr.log" ]] &&
      tail -n 80 "$session/launcher.stderr.log" >&2
    if diagnostic_record="$(find_latest_bridge_log "$session")"; then
      echo "Latest isolated bridge diagnostics:" >&2
      tail -n 80 "${diagnostic_record#*$'\t'}" >&2
    fi
    echo "The isolated ChatGPT extension test did not start." >&2
    exit 1
  fi
  record_session_process "$session" "$app_pid" "$launcher"

  deadline=$((SECONDS + 45))
  while ((SECONDS < deadline)); do
    if /usr/bin/grep -F '"event":"extension-injection-failed"' "$bridge_log" \
      | /usr/bin/grep -Fq "\"id\":\"$extension_id\""; then
      tail -n 40 "$bridge_log" >&2
      echo "The extension failed during source injection." >&2
      exit 1
    fi
    if /usr/bin/grep -F '"event":"injected"' "$bridge_log" \
      | /usr/bin/grep -Fq "\"$extension_id\""; then
      break
    fi
    /bin/sleep 0.2
  done
  if ! /usr/bin/grep -F '"event":"injected"' "$bridge_log" \
    | /usr/bin/grep -Fq "\"$extension_id\""; then
    tail -n 40 "$bridge_log" >&2
    echo "The extension did not report successful source injection." >&2
    exit 1
  fi

  deadline=$((SECONDS + 15))
  while ((SECONDS < deadline)); do
    if [[ -f "$main_activation_marker" ]] &&
      { [[ -z "$settings_activation_marker" ]] ||
        [[ -f "$settings_activation_marker" ]]; }; then
      break
    fi
    /bin/sleep 0.1
  done
  verify_activation_marker "$main_activation_marker" "main"
  if [[ -n "$settings_activation_marker" ]]; then
    verify_activation_marker "$settings_activation_marker" "Settings"
  fi
  /bin/rm -f -- "$session/launcher.stderr.log"

  cleanup_complete=true
  trap - EXIT INT TERM
  printf 'Session: %s\n' "$session"
  printf 'Process ID: %s\n' "$app_pid"
  printf 'Source injection: passed for %s\n' "$extension_id"
  printf 'Synchronous activation: passed for %s\n' "$extension_id"
  printf 'Safety lease: the app stops and copied auth is removed after 30 minutes.\n'
  printf 'Next: verify the requested behavior in the isolated ChatGPT window.\n'
}

show_status() {
  local session
  local launcher
  local process_ids
  session="$(validate_session "$1")"
  launcher="$(resolve_launcher)"
  if ! process_ids="$(session_process_ids "$session" "$launcher")"; then
    echo "The isolated process records could not be validated." >&2
    exit 1
  fi
  if [[ -n "$process_ids" ]]; then
    printf 'running: %s\n' "$(printf '%s' "$process_ids" | /usr/bin/paste -sd, -)"
  else
    printf 'stopped\n'
  fi
  if [[ -f "$session/codex-home/auth.json" ]]; then
    printf 'copied auth: present until stop or lease expiry\n'
  else
    printf 'copied auth: removed\n'
  fi
}

run_ui_probe() {
  local operation="${1:-}"
  local requested_session="${2:-}"
  local session
  local launcher
  if [[ -z "$requested_session" ]]; then
    usage
    exit 64
  fi
  session="$(validate_session "$requested_session")"
  launcher="$(resolve_launcher)"
  if [[ "$operation" == "press" && $# -eq 4 ]]; then
    "$launcher" \
      --extension-test-ui press "$session" "$3" "$4"
  elif [[ "$operation" == "press-wait" && ( $# -eq 6 || $# -eq 7 ) ]]; then
    if [[ $# -eq 7 ]]; then
      "$launcher" \
        --extension-test-ui press-wait "$session" "$3" "$4" "$5" "$6" "$7"
    else
      "$launcher" \
        --extension-test-ui press-wait "$session" "$3" "$4" "$5" "$6"
    fi
  elif [[ "$operation" == "wait" && ( $# -eq 4 || $# -eq 5 ) ]]; then
    if [[ $# -eq 5 ]]; then
      "$launcher" \
        --extension-test-ui wait "$session" "$3" "$4" "$5"
    else
      "$launcher" \
        --extension-test-ui wait "$session" "$3" "$4"
    fi
  else
    usage
    exit 64
  fi
}

stop_test() {
  local session
  local launcher
  local process_ids=""
  session="$(validate_session "$1")"
  launcher="$(resolve_launcher)"
  if ! stop_session_processes "$session" "$launcher" ||
    ! process_ids="$(session_process_ids "$session" "$launcher")" ||
    [[ -n "$process_ids" ]]; then
    purge_session_private_data "$session" "$launcher" || true
    echo "The isolated ChatGPT process is still running." >&2
    echo "Private test data was removed. The watchdog will keep stopping the process." >&2
    exit 1
  fi
  remove_watchdog_job "$session"
  remove_session "$session" "$launcher"
  printf 'Stopped the isolated app and removed its test session: %s\n' "$session"
}

if [[ $# -lt 2 ]]; then
  usage
  exit 64
fi

command_name="$1"
shift
case "$command_name" in
  start)
    start_test "$@"
    ;;
  status)
    [[ $# -eq 1 ]] || { usage; exit 64; }
    show_status "$1"
    ;;
  ui)
    [[ $# -ge 4 && $# -le 7 ]] || { usage; exit 64; }
    run_ui_probe "$@"
    ;;
  stop)
    [[ $# -eq 1 ]] || { usage; exit 64; }
    stop_test "$1"
    ;;
  *)
    usage
    exit 64
    ;;
esac
