import { afterEach, describe, expect, it, vi } from "vitest";
import { jwtAt } from "./test-helpers";
import { runRefreshJob } from "./job";
import type {
  AuthDocument,
  Env,
  HealthRecord,
  JobStore,
  SafeError,
} from "./types";

const scheduledTime = new Date("2026-08-14T04:17:00.000Z").getTime();
const nextRun = "2026-08-15T04:17:00.000Z";

afterEach(() => {
  vi.restoreAllMocks();
});

describe("daily refresh job", () => {
  it("saves rotated auth before validation and GitHub publication", async () => {
    const calls: string[] = [];
    const store = new FakeStore(calls);
    const refreshedAccess = jwtAt("2026-08-16T00:00:00.000Z");
    const fetchMock = vi.fn(async (input: RequestInfo | URL) => {
      if (String(input).includes("oauth/token")) {
        calls.push("refresh");
        return Response.json({
          access_token: refreshedAccess,
          refresh_token: "rotated-refresh",
        });
      }
      calls.push("validate");
      return Response.json({ models: [] });
    }) as typeof fetch;
    let published = "";

    const result = await runRefreshJob(env(), store, scheduledTime, {
      fetchImpl: fetchMock,
      now: fixedClock(),
      randomUUID: () => "lease-1",
      publishSecret: async (_env, value) => {
        calls.push("publish");
        published = value;
      },
    });

    expect(calls).toEqual([
      "acquire",
      "load",
      "refresh",
      "save",
      "validate",
      "publish",
      "complete",
      "release",
    ]);
    expect(result).toMatchObject({
      outcome: "completed",
      nextRun,
      validUntil: "2026-08-16T00:00:00.000Z",
    });
    expect(store.saved?.tokens.refresh_token).toBe("rotated-refresh");
    expect(JSON.parse(published).tokens.refresh_token).toBe("");
    expect(published).not.toContain("rotated-refresh");
  });

  it("publishes but records an error when the token expires by the next run", async () => {
    const store = new FakeStore([]);
    const errorLog = vi.spyOn(console, "error").mockImplementation(() => {});
    let didPublish = false;
    const result = await runRefreshJob(env(), store, scheduledTime, {
      fetchImpl: refreshAndValidateAt("2026-08-15T04:17:00.000Z"),
      now: fixedClock(),
      randomUUID: () => "lease-1",
      publishSecret: async () => {
        didPublish = true;
      },
    });

    expect(didPublish).toBe(true);
    expect(result.warning?.code).toBe("token_expires_before_next_run");
    expect(store.completed?.warning?.code).toBe(
      "token_expires_before_next_run",
    );
    expect(errorLog).toHaveBeenCalledWith(
      "[auth-refresher] validity check failed",
      expect.objectContaining({ nextRun }),
    );
  });

  it("keeps rotated auth but does not publish when validation fails", async () => {
    const calls: string[] = [];
    const store = new FakeStore(calls);
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(
        Response.json({
          access_token: jwtAt("2026-08-16T00:00:00.000Z"),
          refresh_token: "rotated-refresh",
        }),
      )
      .mockResolvedValueOnce(new Response(null, { status: 401 }));
    const publish = vi.fn();
    vi.spyOn(console, "error").mockImplementation(() => {});

    await expect(
      runRefreshJob(env(), store, scheduledTime, {
        fetchImpl: fetchMock,
        now: fixedClock(),
        randomUUID: () => "lease-1",
        publishSecret: publish,
      }),
    ).rejects.toThrow("OpenAI user information request failed");

    expect(store.saved?.tokens.refresh_token).toBe("rotated-refresh");
    expect(publish).not.toHaveBeenCalled();
    expect(store.failure?.code).toBe("access_token_validation_failed");
    expect(calls.indexOf("save")).toBeLessThan(calls.indexOf("failure"));
    expect(calls.at(-1)).toBe("release");
  });

  it("skips a duplicate invocation while a lease is active", async () => {
    const store = new FakeStore([]);
    store.leaseAvailable = false;
    const fetchMock = vi.fn();
    const result = await runRefreshJob(env(), store, scheduledTime, {
      fetchImpl: fetchMock,
      now: fixedClock(),
      randomUUID: () => "lease-2",
    });
    expect(result).toEqual({ outcome: "lease-held" });
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("uses the Worker crypto receiver for the default lease ID", async () => {
    const store = new FakeStore([]);
    store.leaseAvailable = false;
    const randomUUID = vi.spyOn(crypto, "randomUUID");

    await runRefreshJob(env(), store, scheduledTime, {
      now: fixedClock(),
    });

    expect(randomUUID).toHaveBeenCalledOnce();
  });
});

class FakeStore implements JobStore {
  leaseAvailable = true;
  saved: AuthDocument | null = null;
  completed: { warning: SafeError | null } | null = null;
  failure: SafeError | null = null;

  constructor(private readonly calls: string[]) {}

  async acquireLease(): Promise<boolean> {
    this.calls.push("acquire");
    return this.leaseAvailable;
  }

  async loadAuth(): Promise<AuthDocument> {
    this.calls.push("load");
    return {
      auth_mode: "chatgpt",
      tokens: {
        access_token: jwtAt("2026-08-14T12:00:00.000Z"),
        refresh_token: "old-refresh",
        id_token: "old-id",
        account_id: "account-1",
      },
    };
  }

  async saveRefreshedAuth(
    _owner: string,
    auth: AuthDocument,
  ): Promise<void> {
    this.calls.push("save");
    this.saved = auth;
  }

  async complete(
    _owner: string,
    values: { warning: SafeError | null },
  ): Promise<void> {
    this.calls.push("complete");
    this.completed = values;
  }

  async recordFailure(
    _owner: string,
    _at: Date,
    error: SafeError,
  ): Promise<void> {
    this.calls.push("failure");
    this.failure = error;
  }

  async releaseLease(): Promise<void> {
    this.calls.push("release");
  }

  async readHealth(): Promise<HealthRecord | null> {
    return null;
  }
}

function env(): Env {
  return {
    DB: {} as D1Database,
    AUTH_ENCRYPTION_KEY: "unused",
    GITHUB_APP_PRIVATE_KEY: "unused",
    GITHUB_APP_ID: "1",
    GITHUB_INSTALLATION_ID: "2",
    GITHUB_OWNER: "zats",
    GITHUB_REPO: "chat-gpt-x",
    GITHUB_ENVIRONMENT: "codex-agent",
    GITHUB_SECRET_NAME: "CODEX_AGENT_AUTH_JSON",
  };
}

function fixedClock(): () => Date {
  return () => new Date("2026-08-14T04:17:05.000Z");
}

function refreshAndValidateAt(expiry: string): typeof fetch {
  return vi
    .fn()
    .mockResolvedValueOnce(
      Response.json({
        access_token: jwtAt(expiry),
        refresh_token: "rotated-refresh",
      }),
    )
    .mockResolvedValueOnce(Response.json({ models: [] })) as typeof fetch;
}
