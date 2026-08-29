#!/bin/bash

set -u

marker_value="chatgptx-extension-test-v1"
watchdog_label="${7:-}"

remove_watchdog_job() {
  trap - EXIT INT TERM
  /bin/launchctl remove "$watchdog_label" >/dev/null 2>&1 || true
}

if [[ "$watchdog_label" =~ ^com\.chatgptx\.launcher\.extension-test\.[a-z0-9-]+$ ]]; then
  trap remove_watchdog_job EXIT
  trap 'exit 130' INT
  trap 'exit 143' TERM
fi

if [[ $# -ne 7 || "$1" != /* || ! "$2" =~ ^[1-9][0-9]*$ ||
  ! "$3" =~ ^[1-9][0-9]*$ || "$4" != /* || ! -x "$4" ||
  "$5" != /* || ! -d "$5" || -L "$5" ||
  ! "$6" =~ ^[1-9][0-9]*$ ||
  ! "$watchdog_label" =~ ^com\.chatgptx\.launcher\.extension-test\.[a-z0-9-]+$ ]]; then
  exit 64
fi

requested_session="${1%/}"
startup_deadline="$2"
deadline="$3"
launcher="$4"
temporary_root_candidate="${5%/}"
startup_empty_grace="$6"
if [[ ! -d "$requested_session" || -L "$requested_session" ]]; then
  exit 1
fi
temporary_root="$(cd "$temporary_root_candidate" && pwd -P)"
session="$(cd "$requested_session" && pwd -P)"

if [[ ! -d "$session" || -L "$session" ||
  "$(dirname "$session")" != "$temporary_root" ||
  "$(basename "$session")" != chatgptx-extension-test.* ||
  ! -f "$session/.chatgptx-extension-test" ||
  -L "$session/.chatgptx-extension-test" ||
  "$(<"$session/.chatgptx-extension-test")" != "$marker_value" ||
  ! -d "$session/electron-profile" || -L "$session/electron-profile" ||
  ! -d "$session/codex-home" || -L "$session/codex-home" ||
  ! -d "$session/process-groups" || -L "$session/process-groups" ]]; then
  exit 1
fi

session_process_ids() {
  "$launcher" --extension-test-process list "$session"
}

signal_session_processes() {
  "$launcher" --extension-test-process signal "$session" "$1"
}

purge_session_private_data() {
  "$launcher" --extension-test-process purge "$session"
}

remove_session() {
  "$launcher" --extension-test-process remove "$session"
}

refresh_session_process_ids() {
  process_list_had_failure=false
  while ! process_ids="$(session_process_ids 2>/dev/null)"; do
    process_list_had_failure=true
    purge_session_private_data || true
    if [[ ! -e "$session" && ! -L "$session" ]]; then
      return 1
    fi
    /bin/sleep 1
  done
}

started=false
process_ids=""
while (( $(/bin/date +%s) < startup_deadline )); do
  if process_ids="$(session_process_ids 2>/dev/null)" &&
    [[ -n "$process_ids" ]]; then
    started=true
    break
  fi
  /bin/sleep 0.1
done

if [[ "$started" != "true" ]]; then
  if [[ -e "$session/.chatgpt-executable" ||
    -L "$session/.chatgpt-executable" ]]; then
    empty_since=0
    while [[ "$started" != "true" ]]; do
      purge_session_private_data || true
      refresh_session_process_ids || exit 1
      current_time="$(/bin/date +%s)"
      if [[ -n "$process_ids" ]]; then
        started=true
      elif [[ "$process_list_had_failure" == "true" ]]; then
        empty_since=0
      elif ((empty_since == 0)); then
        empty_since="$current_time"
      elif ((current_time - empty_since >= startup_empty_grace)); then
        if ! purge_session_private_data; then
          empty_since=0
        else
          refresh_session_process_ids || exit 1
          if [[ -n "$process_ids" ]]; then
            started=true
          elif [[ "$process_list_had_failure" == "true" ]]; then
            empty_since=0
          else
            remove_session || exit 1
            exit 0
          fi
        fi
      fi
      [[ "$started" == "true" ]] || /bin/sleep 1
    done
  else
    while ! purge_session_private_data; do
      if [[ ! -e "$session" && ! -L "$session" ]]; then
        exit 0
      fi
      /bin/sleep 1
    done
    remove_session || exit 1
    exit 0
  fi
fi

no_process_since=0
while (( $(/bin/date +%s) < deadline )); do
  current_time="$(/bin/date +%s)"
  refresh_session_process_ids || exit 1
  if [[ -n "$process_ids" ]]; then
    no_process_since=0
  elif ((no_process_since == 0)); then
    no_process_since="$current_time"
  elif ((current_time - no_process_since >= 30)); then
    remove_session || exit 1
    exit 0
  fi
  /bin/sleep 1
done

quiet_passes=0
drain_deadline=$((SECONDS + 30))
while ((quiet_passes < 3 && SECONDS < drain_deadline)); do
  refresh_session_process_ids || exit 1
  if [[ -z "$process_ids" ]]; then
    quiet_passes=$((quiet_passes + 1))
  else
    quiet_passes=0
    if ! signal_session_processes TERM; then
      purge_session_private_data || true
      /bin/sleep 0.2
      continue
    fi
  fi
  /bin/sleep 0.2
done

if ((quiet_passes < 3)); then
  purge_session_private_data || true
  quiet_passes=0
  while ((quiet_passes < 3)); do
    refresh_session_process_ids || exit 1
    if [[ -z "$process_ids" ]]; then
      quiet_passes=$((quiet_passes + 1))
    else
      quiet_passes=0
      if ! signal_session_processes KILL; then
        purge_session_private_data || true
        /bin/sleep 1
        continue
      fi
    fi
    purge_session_private_data || true
    /bin/sleep 1
  done
  purge_session_private_data || exit 1
fi

remove_session
