import { runRefreshJob } from "./job";
import { D1JobStore } from "./state";
import type { Env, HealthRecord } from "./types";

const staleAfterMilliseconds = 36 * 60 * 60 * 1000;

export default {
  async scheduled(
    controller: ScheduledController,
    env: Env,
    ctx: ExecutionContext,
  ): Promise<void> {
    const store = new D1JobStore(env);
    ctx.waitUntil(runRefreshJob(env, store, controller.scheduledTime));
  },

  async fetch(request: Request, env: Env): Promise<Response> {
    const url = new URL(request.url);
    if (request.method !== "GET" || url.pathname !== "/health") {
      return Response.json({ error: "Not found" }, { status: 404 });
    }

    const health = await new D1JobStore(env).readHealth();
    if (!health) {
      return Response.json(
        { status: "unhealthy", reason: "not-provisioned" },
        { status: 503 },
      );
    }
    const status = healthStatus(health, new Date());
    return Response.json({ status, ...health }, { status: statusCode(status) });
  },
};

export function healthStatus(
  health: HealthRecord,
  now: Date,
): "healthy" | "unhealthy" | "stale" {
  if (
    health.lastErrorAt &&
    (!health.lastSuccessAt || health.lastErrorAt >= health.lastSuccessAt)
  ) {
    return "unhealthy";
  }
  if (
    !health.lastSuccessAt ||
    now.getTime() - new Date(health.lastSuccessAt).getTime() >
      staleAfterMilliseconds
  ) {
    return "stale";
  }
  return "healthy";
}

function statusCode(status: "healthy" | "unhealthy" | "stale"): number {
  return status === "healthy" ? 200 : 503;
}
