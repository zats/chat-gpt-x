#!/usr/bin/env node

import assert from "node:assert/strict";
import { mkdtemp, readFile, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { spawnSync } from "node:child_process";
import test from "node:test";

const repository = "zats/chat-gpt-x";
const baseSha = "1".repeat(40);
const headSha = "2".repeat(40);
const validationId = "binding-26.818.61809";

async function runProtectedCI(scenario, mode = "") {
  const directory = await mkdtemp(join(tmpdir(), "chatgptx-protected-ci-"));
  const ghPath = join(directory, "gh");
  const logPath = join(directory, "gh.log");
  const countPath = join(directory, "dispatch-count");
  await writeFile(
    ghPath,
    `#!/usr/bin/env bash
set -euo pipefail
echo "$*" >> "$GH_LOG"

if [[ "$1 $2" == "workflow run" ]]; then
  count=0
  [[ ! -f "$GH_COUNT" ]] || count="$(<"$GH_COUNT")"
  echo "$((count + 1))" > "$GH_COUNT"
  exit 0
fi

if [[ "$1 $2" == "run list" ]]; then
  count="$(<"$GH_COUNT")"
  run_head="${headSha}"
  if [[ "$GH_SCENARIO" == "moving-main" ]]; then
    run_head="${"3".repeat(40)}"
  fi
  if [[ "$count" == "1" ]]; then
    printf '[{"databaseId":101,"displayTitle":"CI (${validationId})","headSha":"%s"}]\\n' "$run_head"
  else
    printf '[{"databaseId":102,"displayTitle":"CI (${validationId}-runner-retry-2)","headSha":"%s"}]\\n' "$run_head"
  fi
  exit 0
fi

if [[ "$1 $2" == "run view" ]]; then
  if [[ "$*" == *"--jq .status"* ]]; then
    echo completed
  elif [[ "$GH_SCENARIO" == "failure" ]]; then
    printf '{"status":"completed","conclusion":"failure","jobs":[]}\\n'
  elif [[ "$GH_SCENARIO" == "stall-once" && "$3" == "101" ]]; then
    printf '{"status":"in_progress","conclusion":"","jobs":[{"name":"test / end-to-end","status":"in_progress","startedAt":"2000-01-01T00:00:00Z"}]}\\n'
  else
    printf '{"status":"completed","conclusion":"success","jobs":[]}\\n'
  fi
  exit 0
fi

if [[ "$1" == "api" ]]; then
  exit 0
fi

echo "Unexpected gh command: $*" >&2
exit 1
`,
    { mode: 0o755 },
  );

  const result = spawnSync(
    "bash",
    ["scripts/run-protected-ci.sh", validationId, baseSha, headSha, mode].filter(Boolean),
    {
      cwd: new URL("..", import.meta.url),
      encoding: "utf8",
      env: {
        ...process.env,
        GH_COUNT: countPath,
        GH_LOG: logPath,
        GH_SCENARIO: scenario,
        GITHUB_REPOSITORY: repository,
        PATH: `${directory}:${process.env.PATH}`,
        RUNNER_TEMP: directory,
      },
    },
  );

  return {
    ...result,
    log: await readFile(logPath, "utf8"),
  };
}

test("force-cancels one stalled run and starts one fresh protected run", async () => {
  const result = await runProtectedCI("stall-once");

  assert.equal(result.status, 0, result.stderr);
  assert.equal(result.log.match(/workflow run ci\.yml/g)?.length, 2);
  assert.match(result.log, /validation_id=binding-26\.818\.61809-runner-retry-2/);
  assert.match(
    result.log,
    /api --method POST repos\/zats\/chat-gpt-x\/actions\/runs\/101\/force-cancel/,
  );
});

test("does not retry a completed test failure", async () => {
  const result = await runProtectedCI("failure");

  assert.equal(result.status, 1);
  assert.equal(result.log.match(/workflow run ci\.yml/g)?.length, 1);
  assert.doesNotMatch(result.log, /force-cancel/);
});

test("rejects a protected candidate when main moved before dispatch", async () => {
  const result = await runProtectedCI("moving-main");

  assert.equal(result.status, 1);
  assert.match(result.stderr, /Main changed before protected CI started/);
  assert.match(result.log, /force-cancel/);
});

test("repairs publication on the current main commit", async () => {
  const result = await runProtectedCI("moving-main", "--repair-components");

  assert.equal(result.status, 0, result.stderr);
  assert.match(result.log, /repair_component_releases=true/);
  assert.doesNotMatch(result.log, /force-cancel/);
});
