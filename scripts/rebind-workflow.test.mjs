#!/usr/bin/env node

import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const workflow = readFileSync(
  new URL("../.github/workflows/rebind-chatgpt.yml", import.meta.url),
  "utf8",
);
const skill = readFileSync(
  new URL("../.agents/skills/rebind-chatgpt-version/SKILL.md", import.meta.url),
  "utf8",
);
const retryWorkflow = readFileSync(
  new URL(
    "../.github/workflows/retry-transient-rebind-failure.yml",
    import.meta.url,
  ),
  "utf8",
);
const apiTestSuite = readFileSync(
  new URL(
    "../src/extensions/api-test-suite/api-test-suite.ts",
    import.meta.url,
  ),
  "utf8",
);

test("the workflow prepares the exact research tree before the agent", () => {
  const extraction = workflow.indexOf(
    "- name: Extract and pin requested ChatGPT research tree",
  );
  const agent = workflow.indexOf("- name: Run Codex rebind agent");

  assert.notEqual(extraction, -1);
  assert.notEqual(agent, -1);
  assert.ok(extraction < agent);
  assert.match(
    workflow.slice(extraction, agent),
    /--app "\$CHATGPT_APP_PATH"[\s\S]*--expect-version "\$APP_VERSION"/,
  );
  assert.match(
    workflow.slice(extraction, agent),
    /shasum -a 256[\s\S]*Contents\/Resources\/app\.asar/,
  );
});

test("issue retries seed the prior generated patch and failure evidence", () => {
  const seed = workflow.indexOf(
    "- name: Seed retry from previous candidate branch",
  );
  const agent = workflow.indexOf("- name: Run Codex rebind agent");
  const seedBlock = workflow.slice(seed, agent);

  assert.notEqual(seed, -1);
  assert.ok(seed < agent);
  const retryPatchStart = seedBlock.indexOf(
    'git diff --binary "$candidate_parent" "$candidate_head"',
  );
  const retryPatchEnd = seedBlock.indexOf(
    '> "$RUNNER_TEMP/previous-binding.patch"',
    retryPatchStart,
  );
  assert.notEqual(retryPatchStart, -1);
  assert.notEqual(retryPatchEnd, -1);
  const retryPatch = seedBlock.slice(
    retryPatchStart,
    retryPatchEnd +
      '> "$RUNNER_TEMP/previous-binding.patch"'.length,
  );
  assert.match(retryPatch, /"\$binding_root"/);
  assert.doesNotMatch(retryPatch, /src\/platform\/bindings\/manifest\.json/);
  assert.doesNotMatch(retryPatch, /updates\/latest\.json/);
  assert.match(
    seedBlock,
    /actions\/jobs\/\$failed_job_id\/logs/,
  );
  assert.match(
    workflow.slice(agent),
    /Read the exact prior validation log at \$PREVIOUS_VALIDATION_LOG/,
  );
  assert.match(
    workflow.slice(agent),
    /Do not dismiss it as transient or only rerun the same test/,
  );
});

test("candidate validation gives native thread selection its full window", () => {
  const timeout = apiTestSuite.match(
    /const THREAD_READINESS_TIMEOUT_MS = (\d+);/,
  );

  assert.ok(timeout);
  assert.ok(Number(timeout[1]) > 60000);
  assert.match(
    apiTestSuite,
    /}, THREAD_READINESS_TIMEOUT_MS\);[\s\S]*no persisted thread menu within 70s/,
  );
});

test("the workflow validates a candidate branch without a pull request", () => {
  assert.match(workflow, /prepare-candidate:/);
  assert.match(workflow, /validate-candidate:/);
  assert.match(workflow, /land-candidate:/);
  assert.match(
    workflow,
    /ref: \$\{\{ needs\.prepare-candidate\.outputs\.head-sha \}\}/,
  );
  assert.match(
    workflow,
    /git push origin "\$EXPECTED_HEAD_SHA:refs\/heads\/main"/,
  );
  assert.match(
    workflow,
    /"\$candidate_sha" == "\$EXPECTED_HEAD_SHA"/,
  );
  assert.match(
    workflow,
    /"\$current_main_sha" == "\$release_base_sha"/,
  );
  assert.doesNotMatch(workflow, /gh pr (create|view|edit|list)/);
  assert.doesNotMatch(workflow, /open-pull-request:/);
});

test("the agent receives the prepared identity and cannot acquire apps", () => {
  const agent = workflow.indexOf("- name: Run Codex rebind agent");
  const finalize = workflow.indexOf("- name: Finalize update index hashes");
  const agentBlock = workflow.slice(agent, finalize);

  assert.match(
    agentBlock,
    /CHATGPT_RESEARCH_DIR: \$\{\{ steps\.research-app\.outputs\.extract-dir \}\}/,
  );
  assert.match(agentBlock, /Do not download or extract any ChatGPT app\./);
  assert.match(agentBlock, /Do not fetch the prior stock app\./);
  assert.match(agentBlock, /Use \$reference_binding and its DERIVATION\.md/);
});

test("the rebind skill honors prepared research inputs", () => {
  assert.match(
    skill,
    /When orchestration supplies an exact stock app path and prepared `app\.asar` research tree/,
  );
  assert.match(skill, /Never download a ChatGPT app during an agent-driven rebind\./);
});

test("transient rebind retries are isolated and limited", () => {
  assert.match(retryWorkflow, /workflows:\s*\n\s*- Rebind ChatGPT/);
  assert.match(retryWorkflow, /workflow_run\.conclusion == 'failure'/);
  assert.match(retryWorkflow, /actions: write/);
  assert.match(
    retryWorkflow,
    /node scripts\/retry-transient-rebind-failure\.mjs/,
  );
});
