#!/usr/bin/env node

import { execFileSync } from "node:child_process";

const [repository, branch, sourceSha] = process.argv.slice(2, 5);
const timeoutMs = Number(process.argv[5] ?? "3600000");
const pollMs = Number(process.argv[6] ?? "10000");

if (
  !repository ||
  !branch ||
  !/^[0-9a-f]{40}$/.test(sourceSha ?? "") ||
  !Number.isFinite(timeoutMs) ||
  timeoutMs <= 0 ||
  !Number.isFinite(pollMs) ||
  pollMs <= 0
) {
  throw new Error(
    "usage: scripts/wait-for-push-ci.mjs <repository> <branch> <source-sha> [timeout-ms] [poll-ms]",
  );
}

function gh(arguments_) {
  return execFileSync("gh", arguments_, { encoding: "utf8" }).trim();
}

const deadline = Date.now() + timeoutMs;
while (true) {
  const currentBranchSha = gh([
    "api",
    `repos/${repository}/commits/${branch}`,
    "--jq",
    ".sha",
  ]);
  if (currentBranchSha !== sourceSha) {
    throw new Error(
      `The selected source ${sourceSha} is no longer current ${branch}; current ${branch} is ${currentBranchSha}.`,
    );
  }

  const runs = JSON.parse(
    gh([
      "run",
      "list",
      "--repo",
      repository,
      "--workflow",
      "ci.yml",
      "--commit",
      sourceSha,
      "--event",
      "push",
      "--limit",
      "20",
      "--json",
      "databaseId,status,conclusion,headSha,createdAt",
    ]) || "[]",
  );
  const run = runs
    .filter((candidate) => candidate.headSha === sourceSha)
    .sort((left, right) => right.createdAt.localeCompare(left.createdAt))[0];

  if (run?.status === "completed") {
    if (run.conclusion === "success") {
      process.stdout.write(`${JSON.stringify(run)}\n`);
      break;
    }
    throw new Error(
      `Push CI run ${run.databaseId} completed with ${run.conclusion}.`,
    );
  }
  if (Date.now() >= deadline) {
    const state = run ? `${run.status}:${run.conclusion ?? ""}` : "not found";
    throw new Error(
      `Push CI for ${sourceSha} did not succeed within ${timeoutMs}ms; last state: ${state}.`,
    );
  }
  await new Promise((resolve) => setTimeout(resolve, pollMs));
}
