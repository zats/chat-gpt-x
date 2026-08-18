import { describe, expect, it } from "vitest";
import { healthStatus } from "./index";
import type { HealthRecord } from "./types";

const base: HealthRecord = {
  revision: 3,
  refreshedAt: "2026-08-14T04:17:00.000Z",
  validUntil: "2026-08-16T04:17:00.000Z",
  validatedAt: "2026-08-14T04:17:01.000Z",
  githubPublishedAt: "2026-08-14T04:17:02.000Z",
  lastSuccessAt: "2026-08-14T04:17:02.000Z",
  lastErrorAt: null,
  lastErrorCode: null,
  lastErrorMessage: null,
};

describe("health status", () => {
  it("is healthy after a recent clean publication", () => {
    expect(
      healthStatus(base, new Date("2026-08-15T04:00:00.000Z")),
    ).toBe("healthy");
  });

  it("is unhealthy when the latest run recorded an error", () => {
    expect(
      healthStatus(
        {
          ...base,
          lastErrorAt: "2026-08-14T04:17:02.000Z",
          lastErrorCode: "token_expires_before_next_run",
        },
        new Date("2026-08-15T04:00:00.000Z"),
      ),
    ).toBe("unhealthy");
  });

  it("is stale 36 hours after the last success", () => {
    expect(
      healthStatus(base, new Date("2026-08-15T16:17:03.000Z")),
    ).toBe("stale");
  });
});
