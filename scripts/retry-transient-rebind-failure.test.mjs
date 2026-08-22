#!/usr/bin/env node

import assert from "node:assert/strict";
import test from "node:test";

import {
  isRetryableNativeUiLog,
  isRetryableRunnerAnnotation,
  retryTransientRebindFailure,
} from "./retry-transient-rebind-failure.mjs";

const repository = "zats/chat-gpt-x";
const runId = 32582675512;
const runUrl = `https://github.com/${repository}/actions/runs/${runId}`;
const lostCommunication = {
  annotation_level: "failure",
  message:
    "The hosted runner lost communication with the server. Anything that starves it can cause this error.",
};

function fakeGitHub({
  annotations = [lostCommunication],
  issue = true,
  jobs = [
    { id: 10, name: "request", conclusion: "success" },
    { id: 11, name: "generate", conclusion: "failure" },
  ],
  log = "",
} = {}) {
  const calls = [];
  return {
    calls,
    async get(path) {
      calls.push(["GET", path]);
      if (path.includes("/attempts/")) {
        return { jobs };
      }
      if (path.includes("/check-runs/")) return annotations;
      if (path.endsWith("/issues?state=open&per_page=100")) {
        return issue
          ? [
              {
                number: 44,
                title: "ChatGPT 26.818.41705 available",
                labels: [{ name: "failed" }, { name: "binding" }],
              },
            ]
          : [];
      }
      if (path.endsWith("/issues/44/comments?per_page=100")) {
        return [{ body: `Binding generation started: ${runUrl}` }];
      }
      throw new Error(`Unexpected GET ${path}`);
    },
    async getText(path) {
      calls.push(["GET_TEXT", path]);
      return log;
    },
    async patch(path, body) {
      calls.push(["PATCH", path, body]);
      return {};
    },
    async post(path, body) {
      calls.push(["POST", path, body]);
      return {};
    },
  };
}

test("recognizes only the exact hosted-runner lost-communication failure", () => {
  assert.equal(isRetryableRunnerAnnotation(lostCommunication), true);
  assert.equal(
    isRetryableRunnerAnnotation({
      annotation_level: "failure",
      message: "Tests failed with exit code 1.",
    }),
    false,
  );
  assert.equal(
    isRetryableRunnerAnnotation({
      annotation_level: "warning",
      message: lostCommunication.message,
    }),
    false,
  );
});

test("recognizes only the complete known color-picker timing signature", () => {
  const log = `
    [ci +10s] passed public-api (9s)
    [ci +11s] starting native-ui
    native-ui failed; complete captured output follows:
    Error: Timed out waiting for native UI state during color-picker:
    findThreadRow(threadId)?.querySelector('[data-thread-colors-indicator]') === null
  `;
  assert.equal(isRetryableNativeUiLog(log), true);
  assert.equal(
    isRetryableNativeUiLog(log.replace("passed public-api", "failed public-api")),
    false,
  );
  assert.equal(
    isRetryableNativeUiLog(log.replace("=== null", "!== null")),
    false,
  );
});

test("reruns failed jobs once and restores the issue to in-progress", async () => {
  const github = fakeGitHub();
  const result = await retryTransientRebindFailure({
    github,
    repository,
    runId,
    runAttempt: 1,
  });

  assert.equal(result.outcome, "retried");
  assert.equal(result.issueNumber, 44);
  assert.ok(
    github.calls.some(
      ([method, path]) =>
        method === "POST" && path.endsWith(`/${runId}/rerun-failed-jobs`),
    ),
  );
  assert.deepEqual(
    github.calls.find(([method]) => method === "PATCH")[2],
    { labels: ["binding", "in-progress"] },
  );
  assert.match(github.calls.at(-1)[2].body, /attempt 2 of 2/);
});

test("does not retry after the automatic limit", async () => {
  const github = fakeGitHub();
  const result = await retryTransientRebindFailure({
    github,
    repository,
    runId,
    runAttempt: 2,
  });

  assert.equal(result.outcome, "retry-limit-reached");
  assert.equal(
    github.calls.some(
      ([method, path]) =>
        method === "POST" && path.endsWith(`/${runId}/rerun-failed-jobs`),
    ),
    false,
  );
  assert.match(github.calls.at(-1)[2].body, /retry limit of 2 attempts/);
});

test("leaves code failures failed", async () => {
  const github = fakeGitHub({
    annotations: [
      {
        annotation_level: "failure",
        message: "The API test suite failed.",
      },
    ],
  });
  const result = await retryTransientRebindFailure({
    github,
    repository,
    runId,
    runAttempt: 1,
  });

  assert.equal(result.outcome, "not-transient");
  assert.equal(github.calls.length, 2);
});

test("retries the exact color-picker timing failure after earlier tests pass", async () => {
  const github = fakeGitHub({
    annotations: [
      { annotation_level: "failure", message: "Process completed with exit code 1." },
    ],
    jobs: [
      { id: 10, name: "generate", conclusion: "success" },
      {
        id: 11,
        name: "validate-pull-request / static",
        conclusion: "success",
      },
      {
        id: 12,
        name: "validate-pull-request / end-to-end",
        conclusion: "failure",
      },
    ],
    log: `
      [ci +128s] passed public-api (9s)
      [ci +137s] starting native-ui
      native-ui failed; complete captured output follows:
      Error: Timed out waiting for native UI state during color-picker:
      findThreadRow(threadId)?.querySelector('[data-thread-colors-indicator]') === null
    `,
  });
  const result = await retryTransientRebindFailure({
    github,
    repository,
    runId,
    runAttempt: 1,
  });

  assert.equal(result.outcome, "retried");
  assert.match(github.calls.at(-1)[2].body, /color-picker timing failure/);
});
