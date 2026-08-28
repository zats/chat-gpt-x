import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import test from "node:test";

const repositoryRoot = path.resolve(import.meta.dirname, "..");
const workflow = fs.readFileSync(
  path.join(repositoryRoot, ".github/workflows/release-launcher.yml"),
  "utf8",
);
const releaseScript = fs.readFileSync(
  path.join(repositoryRoot, "scripts/release-launcher.sh"),
  "utf8",
);

test("launcher releases require a manual run", () => {
  assert.match(workflow, /^on:\n  workflow_dispatch:\s*$/m);
  assert.doesNotMatch(workflow, /^  workflow_run:/m);
});

test("launcher releases wait for exact-source push CI on a low-cost runner", () => {
  assert.match(workflow, /preflight:\n\s+runs-on: ubuntu-latest/);
  assert.match(workflow, /GITHUB_REF_NAME/);
  assert.match(workflow, /node scripts\/wait-for-push-ci\.mjs/);
  assert.match(workflow, /release:\n\s+needs: preflight/);
  assert.match(workflow, /ref: \$\{\{ needs\.preflight\.outputs\.source_sha \}\}/);
});

test("launcher release retries reuse prepared and published state", () => {
  assert.match(workflow, /git diff --quiet -- src\/macOS\/project\.yaml/);
  assert.match(releaseScript, /RESUME_PUBLICATION/);
  assert.match(releaseScript, /Resuming publication of existing release/);
  assert.match(releaseScript, /gh release download/);
  assert.match(releaseScript, /xcrun stapler validate/);
  assert.match(releaseScript, /if \[\[ "\$RESUME_PUBLICATION" == "0" \]\]/);
});
