#!/usr/bin/env bash

set -euo pipefail

VALIDATION_ID="${1:-}"
RELEASE_BASE_SHA="${2:-}"
RELEASE_HEAD_SHA="${3:-}"
MODE="${4:-}"
REPOSITORY="${GITHUB_REPOSITORY:-}"
MAX_RUNNER_ATTEMPTS=2
END_TO_END_STALL_SECONDS=900
RUN_APPEAR_TIMEOUT_SECONDS=120
FORCE_CANCEL_TIMEOUT_SECONDS=120
POLL_SECONDS=10
STATE_DIRECTORY="${RUNNER_TEMP:-/tmp}"

[[ "$VALIDATION_ID" =~ ^[A-Za-z0-9._-]+$ &&
  "$RELEASE_BASE_SHA" =~ ^[0-9a-f]{40}$ &&
  "$RELEASE_HEAD_SHA" =~ ^[0-9a-f]{40}$ &&
  -n "$REPOSITORY" &&
  ( -z "$MODE" || "$MODE" == "--repair-components" ) ]] || {
  echo "usage: scripts/run-protected-ci.sh <validation-id> <release-base-sha> <release-head-sha> [--repair-components]" >&2
  exit 1
}

for (( attempt = 1; attempt <= MAX_RUNNER_ATTEMPTS; attempt += 1 )); do
  attempt_validation_id="$VALIDATION_ID"
  if (( attempt > 1 )); then
    attempt_validation_id="${VALIDATION_ID}-runner-retry-${attempt}"
  fi

  dispatch_arguments=(
    --repo "$REPOSITORY"
    --ref main
    -f protected_run=true
    -f "validation_id=$attempt_validation_id"
    -f "release_base_sha=$RELEASE_BASE_SHA"
    -f "release_head_sha=$RELEASE_HEAD_SHA"
  )
  if [[ "$MODE" == "--repair-components" ]]; then
    dispatch_arguments+=(-f repair_component_releases=true)
  fi
  gh workflow run ci.yml "${dispatch_arguments[@]}"

  validation_title="CI ($attempt_validation_id)"
  run_list_path="$STATE_DIRECTORY/main-ci-runs-$attempt.json"
  run_state_path="$STATE_DIRECTORY/protected-ci-run-$attempt.json"
  run_id=""
  deadline=$((SECONDS + RUN_APPEAR_TIMEOUT_SECONDS))
  while (( SECONDS < deadline )); do
    gh run list \
      --repo "$REPOSITORY" \
      --workflow ci.yml \
      --branch main \
      --event workflow_dispatch \
      --limit 20 \
      --json databaseId,displayTitle,headSha \
      > "$run_list_path"
    run_id="$(
      jq -r \
        --arg title "$validation_title" \
        '[.[] | select(.displayTitle == $title)][0].databaseId // empty' \
        "$run_list_path"
    )"
    [[ -z "$run_id" ]] || break
    sleep 2
  done
  [[ -n "$run_id" ]] || {
    echo "Protected CI did not appear for $validation_title" >&2
    exit 1
  }

  run_head_sha="$(
    jq -r \
      --arg title "$validation_title" \
      '[.[] | select(.displayTitle == $title)][0].headSha // empty' \
      "$run_list_path"
  )"
  if [[ "$MODE" != "--repair-components" && "$run_head_sha" != "$RELEASE_HEAD_SHA" ]]; then
    echo "Main changed before protected CI started: expected $RELEASE_HEAD_SHA, received $run_head_sha." >&2
    gh api \
      --method POST \
      "repos/$REPOSITORY/actions/runs/$run_id/force-cancel" \
      >/dev/null 2>&1 || true
    exit 1
  fi

  while true; do
    if ! gh run view "$run_id" \
      --repo "$REPOSITORY" \
      --json status,conclusion,jobs \
      > "$run_state_path"; then
      echo "Could not read protected CI run $run_id. Will try again." >&2
      sleep "$POLL_SECONDS"
      continue
    fi

    run_state="$(
      node scripts/protected-ci-run-state.mjs \
        "$run_state_path" \
        "$END_TO_END_STALL_SECONDS"
    )"
    case "$run_state" in
      success)
        exit 0
        ;;
      failure)
        echo "Protected CI run $run_id failed." >&2
        exit 1
        ;;
      running)
        sleep "$POLL_SECONDS"
        ;;
      stalled)
        echo "Protected CI run $run_id has a stalled macOS end-to-end job. Force-canceling it." >&2
        gh api \
          --method POST \
          "repos/$REPOSITORY/actions/runs/$run_id/force-cancel"

        cancel_deadline=$((SECONDS + FORCE_CANCEL_TIMEOUT_SECONDS))
        while (( SECONDS < cancel_deadline )); do
          status="$(
            gh run view "$run_id" \
              --repo "$REPOSITORY" \
              --json status \
              --jq .status
          )"
          [[ "$status" != "completed" ]] || break
          sleep 2
        done
        [[ "${status:-}" == "completed" ]] || {
          echo "Protected CI run $run_id did not stop after force-cancel." >&2
          exit 1
        }

        if (( attempt == MAX_RUNNER_ATTEMPTS )); then
          echo "Protected CI used its one automatic replacement runner." >&2
          exit 1
        fi
        echo "Starting one fresh protected CI run after the hosted-runner stall." >&2
        break
        ;;
      *)
        echo "Unknown protected CI run state: $run_state" >&2
        exit 1
        ;;
    esac
  done
done
