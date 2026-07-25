#!/usr/bin/env bash

set -euo pipefail

BASE_SHA="${1:-}"
[[ "$BASE_SHA" =~ ^([0-9a-f]{40}|HEAD)$ ]] || {
  echo "usage: scripts/refresh-update-index-hashes.sh <base-sha>" >&2
  exit 1
}

task_root="$(
  mktemp -d "${RUNNER_TEMP:-/tmp}/chatgptx-refresh-index.XXXXXX"
)"
trap 'rm -rf "$task_root"' EXIT

node scripts/component-releases.mjs "$BASE_SHA" --worktree \
  > "$task_root/plan.json"
node scripts/build-component-releases.mjs \
  "$task_root/plan.json" \
  "$task_root/artifacts" \
  --write-index updates/latest.json
node scripts/component-releases.mjs "$BASE_SHA" --worktree \
  > "$task_root/verified-plan.json"
node scripts/build-component-releases.mjs \
  "$task_root/verified-plan.json" \
  "$task_root/verified-artifacts"
