import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import test from "node:test";

const repositoryRoot = path.resolve(import.meta.dirname, "..");
const workflow = fs.readFileSync(
  path.join(repositoryRoot, ".github/workflows/release-launcher.yml"),
  "utf8",
);

test("launcher releases require a manual run", () => {
  assert.match(workflow, /^on:\n  workflow_dispatch:\s*$/m);
  assert.doesNotMatch(workflow, /^  workflow_run:/m);
});

test("launcher releases require current main with successful push CI", () => {
  assert.match(workflow, /GITHUB_REF_NAME/);
  assert.match(workflow, /git rev-parse "origin\/\$DEFAULT_BRANCH"/);
  assert.match(workflow, /--workflow ci\.yml/);
  assert.match(workflow, /--event push/);
  assert.match(workflow, /completed:success:\$SOURCE_SHA/);
});
