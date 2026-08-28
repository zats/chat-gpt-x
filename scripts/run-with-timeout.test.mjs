import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import test from "node:test";

test("returns the command status before the deadline", () => {
  const result = spawnSync(
    process.execPath,
    [
      "scripts/run-with-timeout.mjs",
      "1",
      process.execPath,
      "-e",
      "process.exit(7)",
    ],
    { encoding: "utf8" },
  );
  assert.equal(result.status, 7, result.stderr);
});

test("stops a command process group at the deadline", () => {
  const startedAt = Date.now();
  const result = spawnSync(
    process.execPath,
    [
      "scripts/run-with-timeout.mjs",
      "0.05",
      process.execPath,
      "-e",
      "setInterval(() => {}, 1000)",
    ],
    { encoding: "utf8" },
  );
  assert.equal(result.status, 75, result.stderr);
  assert.match(result.stderr, /stopping its process group/);
  assert.ok(Date.now() - startedAt < 2_000);
});

test("inherits the configured progress file descriptor", () => {
  const result = spawnSync(
    process.execPath,
    [
      "scripts/run-with-timeout.mjs",
      "1",
      process.execPath,
      "-e",
      'require("node:fs").writeSync(3, "progress\\n")',
    ],
    {
      encoding: "utf8",
      env: { ...process.env, CHATGPTX_PROGRESS_FD: "3" },
      stdio: ["ignore", "pipe", "pipe", "pipe"],
    },
  );
  assert.equal(result.status, 0, result.stderr);
  assert.equal(result.output[3], "progress\n");
});
