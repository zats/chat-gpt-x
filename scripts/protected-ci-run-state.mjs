#!/usr/bin/env node

import { readFile } from "node:fs/promises";
import { pathToFileURL } from "node:url";

const END_TO_END_JOB = "test / end-to-end";

export function classifyProtectedCIRun(
  run,
  { now = Date.now(), stallTimeoutMs } = {},
) {
  if (!Number.isFinite(stallTimeoutMs) || stallTimeoutMs <= 0) {
    throw new Error("stallTimeoutMs must be a positive number");
  }

  if (run?.status === "completed") {
    return run.conclusion === "success" ? "success" : "failure";
  }

  const endToEnd = run?.jobs?.find((job) => job.name === END_TO_END_JOB);
  if (endToEnd?.status !== "in_progress") return "running";

  const startedAt = Date.parse(endToEnd.startedAt);
  if (!Number.isFinite(startedAt)) return "running";

  return now - startedAt >= stallTimeoutMs ? "stalled" : "running";
}

async function main() {
  const [runPath, stallTimeoutSecondsText] = process.argv.slice(2);
  const stallTimeoutSeconds = Number(stallTimeoutSecondsText);
  if (!runPath || !Number.isFinite(stallTimeoutSeconds) || stallTimeoutSeconds <= 0) {
    throw new Error(
      "usage: scripts/protected-ci-run-state.mjs <run-json> <stall-timeout-seconds>",
    );
  }

  const run = JSON.parse(await readFile(runPath, "utf8"));
  console.log(
    classifyProtectedCIRun(run, {
      stallTimeoutMs: stallTimeoutSeconds * 1_000,
    }),
  );
}

if (import.meta.url === pathToFileURL(process.argv[1]).href) {
  main().catch((error) => {
    console.error(error instanceof Error ? error.message : error);
    process.exitCode = 1;
  });
}
