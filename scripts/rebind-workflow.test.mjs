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
    "../.github/workflows/retry-runner-infrastructure-failure.yml",
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

test("runner infrastructure retries are isolated and limited", () => {
  assert.match(retryWorkflow, /workflows:\s*\n\s*- Rebind ChatGPT/);
  assert.match(retryWorkflow, /workflow_run\.conclusion == 'failure'/);
  assert.match(retryWorkflow, /actions: write/);
  assert.match(
    retryWorkflow,
    /node scripts\/retry-runner-infrastructure-failure\.mjs/,
  );
});
