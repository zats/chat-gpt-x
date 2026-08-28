import assert from "node:assert/strict";
import { mkdtemp, readFile, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { spawnSync } from "node:child_process";
import test from "node:test";

const repository = "zats/chat-gpt-x";
const branch = "main";
const sourceSha = "1".repeat(40);

async function runWaiter(scenario) {
  const directory = await mkdtemp(join(tmpdir(), "chatgptx-push-ci-"));
  const ghPath = join(directory, "gh");
  const countPath = join(directory, "count");
  await writeFile(
    ghPath,
    `#!/usr/bin/env bash
set -euo pipefail
if [[ "$1" == "api" ]]; then
  if [[ "$GH_SCENARIO" == "moved" ]]; then
    printf '%s\n' '${"2".repeat(40)}'
  else
    printf '%s\n' '${sourceSha}'
  fi
  exit 0
fi
if [[ "$1 $2" == "run list" ]]; then
  count=0
  [[ ! -f "$GH_COUNT" ]] || count="$(<"$GH_COUNT")"
  count=$((count + 1))
  printf '%s\n' "$count" > "$GH_COUNT"
  if [[ "$count" == "1" ]]; then
    printf '[{"databaseId":10,"status":"in_progress","conclusion":"","headSha":"${sourceSha}","createdAt":"2026-01-01T00:00:00Z"}]\n'
  else
    printf '[{"databaseId":10,"status":"completed","conclusion":"success","headSha":"${sourceSha}","createdAt":"2026-01-01T00:00:00Z"}]\n'
  fi
  exit 0
fi
exit 1
`,
    { mode: 0o755 },
  );

  const result = spawnSync(
    process.execPath,
    [
      "scripts/wait-for-push-ci.mjs",
      repository,
      branch,
      sourceSha,
      "1000",
      "1",
    ],
    {
      cwd: new URL("..", import.meta.url),
      encoding: "utf8",
      env: {
        ...process.env,
        GH_COUNT: countPath,
        GH_SCENARIO: scenario,
        PATH: `${directory}:${process.env.PATH}`,
      },
    },
  );
  return { ...result, count: await readFile(countPath, "utf8").catch(() => "0") };
}

test("waits for exact-source push CI to succeed", async () => {
  const result = await runWaiter("success");
  assert.equal(result.status, 0, result.stderr);
  assert.equal(result.count.trim(), "2");
  assert.equal(JSON.parse(result.stdout).databaseId, 10);
});

test("stops when the selected source is no longer current", async () => {
  const result = await runWaiter("moved");
  assert.equal(result.status, 1);
  assert.match(result.stderr, /is no longer current main/);
  assert.equal(result.count.trim(), "0");
});
