#!/usr/bin/env node

import { pathToFileURL } from "node:url";

const LOST_COMMUNICATION_MESSAGE =
  "The hosted runner lost communication with the server.";
const COLOR_PICKER_TIMEOUT_MESSAGE =
  "Timed out waiting for native UI state during color-picker:";
const STATUS_LABELS = new Set(["pending", "in-progress", "failed", "success"]);

function requirePositiveInteger(value, name) {
  const number = Number(value);
  if (!Number.isInteger(number) || number < 1) {
    throw new Error(`${name} must be a positive integer`);
  }
  return number;
}

export function isRetryableRunnerAnnotation(annotation) {
  return (
    annotation?.annotation_level === "failure" &&
    typeof annotation.message === "string" &&
    annotation.message.startsWith(LOST_COMMUNICATION_MESSAGE)
  );
}

export function isRetryableNativeUiLog(log) {
  return (
    typeof log === "string" &&
    log.includes("passed public-api") &&
    log.includes("starting native-ui") &&
    log.includes("native-ui failed; complete captured output follows:") &&
    log.includes(COLOR_PICKER_TIMEOUT_MESSAGE) &&
    log.includes("[data-thread-colors-indicator]") &&
    log.includes("=== null")
  );
}

export async function findRetryableFailures({
  github,
  repository,
  runId,
  runAttempt,
}) {
  const response = await github.get(
    `/repos/${repository}/actions/runs/${runId}/attempts/${runAttempt}/jobs?per_page=100`,
  );
  const jobs = response.jobs ?? [];
  const failures = [];
  const bindingPassedEarlierTests =
    jobs.some(
      (job) => job.name === "generate" && job.conclusion === "success",
    ) &&
    jobs.some(
      (job) =>
        job.name === "validate-candidate / static" &&
        job.conclusion === "success",
    );

  for (const job of jobs) {
    if (job.conclusion !== "failure") continue;
    const annotations = await github.get(
      `/repos/${repository}/check-runs/${job.id}/annotations?per_page=100`,
    );
    for (const annotation of annotations) {
      if (isRetryableRunnerAnnotation(annotation)) {
        failures.push({
          kind: "runner-lost-communication",
          jobId: job.id,
          jobName: job.name,
          message: annotation.message,
        });
      }
    }

    if (
      failures.some((failure) => failure.jobId === job.id) ||
      !bindingPassedEarlierTests ||
      job.name !== "validate-candidate / end-to-end"
    ) {
      continue;
    }
    const log = await github.getText(
      `/repos/${repository}/actions/jobs/${job.id}/logs`,
    );
    if (isRetryableNativeUiLog(log)) {
      failures.push({
        kind: "native-ui-color-picker-timeout",
        jobId: job.id,
        jobName: job.name,
        message: COLOR_PICKER_TIMEOUT_MESSAGE,
      });
    }
  }

  return failures;
}

export async function findRunIssue({ github, repository, runId, serverUrl }) {
  const runUrl = `${serverUrl}/${repository}/actions/runs/${runId}`;
  const issues = await github.get(
    `/repos/${repository}/issues?state=open&per_page=100`,
  );
  const candidates = issues.filter(
    (issue) =>
      issue.pull_request == null &&
      /^ChatGPT [0-9]+(?:\.[0-9]+)+ available$/.test(issue.title) &&
      issue.labels.some((label) => STATUS_LABELS.has(label.name)),
  );

  for (const issue of candidates) {
    const comments = await github.get(
      `/repos/${repository}/issues/${issue.number}/comments?per_page=100`,
    );
    if (comments.some((comment) => comment.body?.includes(runUrl))) {
      return issue;
    }
  }

  return null;
}

function retryReason(failures) {
  const kinds = new Set(failures.map((failure) => failure.kind));
  if (kinds.has("runner-lost-communication")) {
    return "GitHub reported that the hosted runner lost communication";
  }
  return "The binding passed its earlier agent tests, but candidate validation hit the known native-UI color-picker timing failure";
}

export async function retryTransientRebindFailure({
  github,
  repository,
  runId,
  runAttempt,
  serverUrl = "https://github.com",
  maxRunAttempts = 2,
}) {
  const failures = await findRetryableFailures({
    github,
    repository,
    runId,
    runAttempt,
  });
  if (failures.length === 0) {
    return { outcome: "not-transient", failures };
  }

  const issue = await findRunIssue({ github, repository, runId, serverUrl });
  const runUrl = `${serverUrl}/${repository}/actions/runs/${runId}`;
  const reason = retryReason(failures);
  if (runAttempt >= maxRunAttempts) {
    if (issue) {
      await github.post(
        `/repos/${repository}/issues/${issue.number}/comments`,
        {
          body: `${reason} again. The automatic retry limit of ${maxRunAttempts} attempts is reached. The issue remains failed: [workflow run](${runUrl}).`,
        },
      );
    }
    return {
      outcome: "retry-limit-reached",
      failures,
      issueNumber: issue?.number,
    };
  }

  await github.post(
    `/repos/${repository}/actions/runs/${runId}/rerun-failed-jobs`,
    {},
  );

  if (issue) {
    const labels = issue.labels
      .map((label) => label.name)
      .filter((label) => !STATUS_LABELS.has(label));
    labels.push("in-progress");
    await github.patch(`/repos/${repository}/issues/${issue.number}`, { labels });
    await github.post(
      `/repos/${repository}/issues/${issue.number}/comments`,
      {
        body: `${reason}. Automatically rerunning failed jobs as attempt ${runAttempt + 1} of ${maxRunAttempts}: [workflow run](${runUrl}).`,
      },
    );
  }

  return { outcome: "retried", failures, issueNumber: issue?.number };
}

export function createGitHubClient({ token }) {
  if (!token) throw new Error("GH_TOKEN is required");

  async function request(method, path, body, parseJson = true) {
    const response = await fetch(`https://api.github.com${path}`, {
      method,
      headers: {
        Accept: "application/vnd.github+json",
        Authorization: `Bearer ${token}`,
        "User-Agent": "chatgptx-transient-rebind-retry",
        "X-GitHub-Api-Version": "2022-11-28",
      },
      body: body === undefined ? undefined : JSON.stringify(body),
    });
    if (!response.ok) {
      const details = (await response.text()).slice(0, 1_000);
      throw new Error(
        `GitHub API ${method} ${path} failed with ${response.status}: ${details}`,
      );
    }
    const responseBody = await response.text();
    if (!parseJson) return responseBody;
    return responseBody === "" ? null : JSON.parse(responseBody);
  }

  return {
    get: (path) => request("GET", path),
    getText: (path) => request("GET", path, undefined, false),
    patch: (path, body) => request("PATCH", path, body),
    post: (path, body) => request("POST", path, body),
  };
}

async function main() {
  const repository = process.env.GITHUB_REPOSITORY;
  if (!repository || !/^[^/]+\/[^/]+$/.test(repository)) {
    throw new Error("GITHUB_REPOSITORY must be owner/repository");
  }
  const runId = requirePositiveInteger(
    process.env.SOURCE_RUN_ID,
    "SOURCE_RUN_ID",
  );
  const runAttempt = requirePositiveInteger(
    process.env.SOURCE_RUN_ATTEMPT,
    "SOURCE_RUN_ATTEMPT",
  );
  const result = await retryTransientRebindFailure({
    github: createGitHubClient({ token: process.env.GH_TOKEN }),
    repository,
    runId,
    runAttempt,
    serverUrl: process.env.GITHUB_SERVER_URL || "https://github.com",
  });

  if (result.outcome === "not-transient") {
    console.log("No retryable transient rebind failure was found.");
    return;
  }
  if (result.outcome === "retry-limit-reached") {
    console.error(
      `Retryable transient failure found, but run attempt ${runAttempt} reached the automatic retry limit.`,
    );
    process.exitCode = 1;
    return;
  }
  console.log(
    `Requested failed-job rerun for workflow run ${runId}; next attempt is ${runAttempt + 1}.`,
  );
  if (!result.issueNumber) {
    console.warn(
      "No version issue was linked to the workflow run; issue labels were not changed.",
    );
  }
}

if (import.meta.url === pathToFileURL(process.argv[1]).href) {
  main().catch((error) => {
    console.error(error instanceof Error ? error.message : String(error));
    process.exitCode = 1;
  });
}
