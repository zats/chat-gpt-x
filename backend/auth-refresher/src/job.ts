import {
  accessTokenExpiry,
  externalAuthDocument,
  refreshAuth,
  validateAccessToken,
} from "./auth";
import { publishEnvironmentSecret } from "./github";
import type { Env, JobStore, SafeError } from "./types";

const dayMilliseconds = 24 * 60 * 60 * 1000;
const leaseMilliseconds = 10 * 60 * 1000;

interface JobDependencies {
  fetchImpl?: typeof fetch;
  now?: () => Date;
  randomUUID?: () => string;
  publishSecret?: (env: Env, value: string, fetchImpl: typeof fetch) => Promise<void>;
}

export interface JobResult {
  outcome: "completed" | "lease-held";
  validUntil?: string;
  nextRun?: string;
  warning?: SafeError;
}

export async function runRefreshJob(
  env: Env,
  store: JobStore,
  scheduledTime: number,
  dependencies: JobDependencies = {},
): Promise<JobResult> {
  const fetchImpl = dependencies.fetchImpl ?? fetch;
  const now = dependencies.now ?? (() => new Date());
  const owner = dependencies.randomUUID
    ? dependencies.randomUUID()
    : crypto.randomUUID();
  const startedAt = now();
  const acquired = await store.acquireLease(
    owner,
    startedAt,
    new Date(startedAt.getTime() + leaseMilliseconds),
  );
  if (!acquired) {
    console.log("[auth-refresher] run skipped", { reason: "lease-held" });
    return { outcome: "lease-held" };
  }

  console.log("[auth-refresher] refresh started", {
    scheduledTime: new Date(scheduledTime).toISOString(),
  });
  try {
    const current = await store.loadAuth(owner);
    const refreshedAt = now();
    const refreshed = await refreshAuth(current, refreshedAt, fetchImpl);

    // Save a rotated refresh token before any later operation can fail.
    await store.saveRefreshedAuth(owner, refreshed, refreshedAt);

    const validUntil = accessTokenExpiry(refreshed.tokens.access_token);
    if (validUntil.getTime() <= now().getTime()) {
      throw safeFailure(
        "access_token_already_expired",
        "The refreshed access token is already expired",
      );
    }

    await validateAccessToken(refreshed, fetchImpl);
    const validatedAt = now();
    const mirror = externalAuthDocument(refreshed, validatedAt);
    const publish = dependencies.publishSecret ?? publishEnvironmentSecret;
    await publish(env, JSON.stringify(mirror), fetchImpl);
    const publishedAt = now();

    const nextRun = new Date(scheduledTime + dayMilliseconds);
    const warning =
      validUntil.getTime() <= nextRun.getTime()
        ? safeFailure(
            "token_expires_before_next_run",
            "The access token expires no later than the next daily run",
          )
        : null;
    await store.complete(owner, {
      validUntil,
      validatedAt,
      githubPublishedAt: publishedAt,
      completedAt: now(),
      warning,
    });

    if (warning) {
      console.error("[auth-refresher] validity check failed", {
        code: warning.code,
        validUntil: validUntil.toISOString(),
        nextRun: nextRun.toISOString(),
      });
    }
    console.log("[auth-refresher] refresh completed", {
      validUntil: validUntil.toISOString(),
      nextRun: nextRun.toISOString(),
      health: warning ? "unhealthy" : "healthy",
    });
    return {
      outcome: "completed",
      validUntil: validUntil.toISOString(),
      nextRun: nextRun.toISOString(),
      ...(warning ? { warning } : {}),
    };
  } catch (error) {
    const safe = safeError(error);
    try {
      await store.recordFailure(owner, now(), safe);
    } catch (recordError) {
      console.error("[auth-refresher] failure record failed", {
        error: safeError(recordError),
      });
    }
    console.error("[auth-refresher] refresh failed", { error: safe });
    throw error;
  } finally {
    try {
      await store.releaseLease(owner);
    } catch (error) {
      console.error("[auth-refresher] lease release failed", {
        error: safeError(error),
      });
    }
  }
}

export function safeError(error: unknown): SafeError {
  if (
    typeof error === "object" &&
    error !== null &&
    "code" in error &&
    typeof error.code === "string" &&
    "message" in error &&
    typeof error.message === "string"
  ) {
    return { code: error.code, message: error.message };
  }
  if (error instanceof Error) {
    return { code: "unexpected_error", message: error.message };
  }
  return { code: "unexpected_error", message: "An unknown error occurred" };
}

function safeFailure(code: string, message: string): SafeError & Error {
  return Object.assign(new Error(message), { code });
}
