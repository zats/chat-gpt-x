#!/usr/bin/env bash

set -euo pipefail

VALIDATION_ID="${1:-}"
RELEASE_BASE_SHA="${2:-}"
RELEASE_HEAD_SHA="${3:-}"
MODE="${4:-}"
REPOSITORY="${GITHUB_REPOSITORY:-}"

[[ "$VALIDATION_ID" =~ ^[A-Za-z0-9._-]+$ &&
  "$RELEASE_BASE_SHA" =~ ^[0-9a-f]{40}$ &&
  "$RELEASE_HEAD_SHA" =~ ^[0-9a-f]{40}$ &&
  -n "$REPOSITORY" &&
  ( -z "$MODE" || "$MODE" == "--repair-components" ) ]] || {
  echo "usage: scripts/run-protected-ci.sh <validation-id> <release-base-sha> <release-head-sha> [--repair-components]" >&2
  exit 1
}

dispatch_arguments=(
  --repo "$REPOSITORY"
  --ref main
  -f protected_run=true
  -f "validation_id=$VALIDATION_ID"
  -f "release_base_sha=$RELEASE_BASE_SHA"
  -f "release_head_sha=$RELEASE_HEAD_SHA"
)
if [[ "$MODE" == "--repair-components" ]]; then
  dispatch_arguments+=(-f repair_component_releases=true)
fi
gh workflow run ci.yml "${dispatch_arguments[@]}"

validation_title="CI ($VALIDATION_ID)"
run_id=""
deadline=$((SECONDS + 120))
while (( SECONDS < deadline )); do
  gh run list \
    --repo "$REPOSITORY" \
    --workflow ci.yml \
    --branch main \
    --event workflow_dispatch \
    --limit 20 \
    --json databaseId,displayTitle,headSha \
    > "${RUNNER_TEMP:-/tmp}/main-ci-runs.json"
  run_id="$(
    jq -r \
      --arg headSha "$RELEASE_HEAD_SHA" \
      --arg title "$validation_title" \
      '[.[] | select(.headSha == $headSha and .displayTitle == $title)][0].databaseId // empty' \
      "${RUNNER_TEMP:-/tmp}/main-ci-runs.json"
  )"
  [[ -z "$run_id" ]] || break
  sleep 2
done
[[ -n "$run_id" ]] || {
  echo "Protected CI did not appear for $RELEASE_HEAD_SHA" >&2
  exit 1
}

gh run watch "$run_id" \
  --repo "$REPOSITORY" \
  --exit-status
