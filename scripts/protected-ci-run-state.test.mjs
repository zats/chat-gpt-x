#!/usr/bin/env node

import assert from "node:assert/strict";
import test from "node:test";

import { classifyProtectedCIRun } from "./protected-ci-run-state.mjs";

const now = Date.parse("2026-08-24T12:20:00Z");
const stallTimeoutMs = 15 * 60 * 1_000;

function classify(run) {
  return classifyProtectedCIRun(run, { now, stallTimeoutMs });
}

test("accepts only a successful completed run", () => {
  assert.equal(classify({ status: "completed", conclusion: "success" }), "success");
  assert.equal(classify({ status: "completed", conclusion: "failure" }), "failure");
  assert.equal(classify({ status: "completed", conclusion: "cancelled" }), "failure");
});

test("marks an active end-to-end job as stalled at the time limit", () => {
  assert.equal(
    classify({
      status: "in_progress",
      jobs: [
        {
          name: "test / end-to-end",
          status: "in_progress",
          startedAt: "2026-08-24T12:05:00Z",
        },
      ],
    }),
    "stalled",
  );
});

test("keeps a recent end-to-end job running", () => {
  assert.equal(
    classify({
      status: "in_progress",
      jobs: [
        {
          name: "test / end-to-end",
          status: "in_progress",
          startedAt: "2026-08-24T12:05:01Z",
        },
      ],
    }),
    "running",
  );
});

test("does not treat a queued end-to-end job or another old job as stalled", () => {
  assert.equal(
    classify({
      status: "in_progress",
      jobs: [
        {
          name: "test / static",
          status: "in_progress",
          startedAt: "2026-08-24T11:00:00Z",
        },
        {
          name: "test / end-to-end",
          status: "queued",
          startedAt: "2026-08-24T11:00:00Z",
        },
      ],
    }),
    "running",
  );
});

test("does not guess when GitHub omits a valid start time", () => {
  assert.equal(
    classify({
      status: "in_progress",
      jobs: [
        {
          name: "test / end-to-end",
          status: "in_progress",
          startedAt: null,
        },
      ],
    }),
    "running",
  );
});
