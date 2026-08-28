import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import test from "node:test";

const repositoryRoot = path.resolve(import.meta.dirname, "..");
const localCI = fs.readFileSync(
  path.join(repositoryRoot, "scripts/run-local-ci.sh"),
  "utf8",
);
const testWorkflow = fs.readFileSync(
  path.join(repositoryRoot, ".github/workflows/test.yml"),
  "utf8",
);

test("live CDP suites have a bounded command lifetime", () => {
  assert.match(localCI, /run_logged_bounded 120 multiple-accounts-e2e/);
  assert.match(localCI, /run_logged_bounded 120 public-api/);
  assert.equal(localCI.match(/run_logged_bounded 120 native-ui/g)?.length, 2);
  assert.match(localCI, /return 75/);
});

test("hosted CI retries one timed-out live suite from a clean profile", () => {
  assert.match(testWorkflow, /run-with-timeout\.mjs \\\n+\s+480 scripts\/run-local-ci\.sh/);
  assert.match(testWorkflow, /for suite_attempt in 1 2/);
  assert.match(testWorkflow, /test_exit_code.*75/);
  assert.match(testWorkflow, /starting one clean suite retry/);
  assert.match(testWorkflow, /if-no-files-found: warn/);
});
