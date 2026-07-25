import { afterEach, describe, expect, it, vi } from "vitest";
import worker, { checkCodexVersion } from "./index";

const env = {
  GITHUB_TOKEN: "test-token",
  GITHUB_OWNER: "zats",
  GITHUB_REPO: "chat-gpt-x",
  GITHUB_BRANCH: "main",
};

const version = "26.715.72359";
const downloadUrl =
  "https://persistent.oaistatic.com/codex-app-prod/ChatGPT-darwin-arm64-26.715.72359.zip";
const feed = `<?xml version="1.0"?>
<rss><channel><item>
<title>${version}</title>
<pubDate>Wed, 22 Jul 2026 09:06:22 +0000</pubDate>
<enclosure url="${downloadUrl}" />
</item></channel></rss>`;
const previousVersion = "26.715.70719";

function response(body: unknown, status = 200): Response {
  return new Response(
    status === 204
      ? null
      : typeof body === "string"
        ? body
        : JSON.stringify(body),
    { status },
  );
}

afterEach(() => {
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});

describe("job logging", () => {
  it("logs scheduled job start and failure", async () => {
    const error = new Error("feed unavailable");
    vi.stubGlobal("fetch", vi.fn().mockRejectedValue(error));
    const log = vi.spyOn(console, "log").mockImplementation(() => {});
    const logError = vi.spyOn(console, "error").mockImplementation(() => {});
    let pending: Promise<unknown> | undefined;
    const ctx = {
      waitUntil(promise: Promise<unknown>) {
        pending = promise;
      },
    } as ExecutionContext;

    await worker.scheduled({} as ScheduledEvent, env, ctx);

    expect(log).toHaveBeenCalledWith("[version-watcher] check started", {
      trigger: "scheduled",
    });
    await expect(pending).rejects.toThrow("feed unavailable");
    expect(logError).toHaveBeenCalledWith(
      "[version-watcher] check failed",
      expect.objectContaining({
        trigger: "scheduled",
        error: expect.objectContaining({
          name: "Error",
          message: "feed unavailable",
        }),
      }),
    );
  });

  it("logs HTTP job completion with its result", async () => {
    vi.stubGlobal(
      "fetch",
      vi
        .fn()
        .mockResolvedValueOnce(response(feed))
        .mockResolvedValueOnce(
          response(JSON.stringify({ chatgpt: version, downloadUrl })),
        )
        .mockResolvedValueOnce(response([])),
    );
    const log = vi.spyOn(console, "log").mockImplementation(() => {});

    const result = await worker.fetch(
      new Request("https://version-watcher.test/check"),
      env,
    );

    expect(result.status).toBe(200);
    expect(log).toHaveBeenNthCalledWith(
      1,
      "[version-watcher] check started",
      { trigger: "http" },
    );
    expect(log).toHaveBeenNthCalledWith(
      2,
      "[version-watcher] check completed",
      {
        trigger: "http",
        version,
        outcome: "binding-exists",
      },
    );
  });
});

describe("version detection", () => {
  it("stops when the manifest pins the latest version and its folder exists", async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(response(feed))
      .mockResolvedValueOnce(
        response(
          JSON.stringify({
            chatgpt: version,
            downloadUrl,
          }),
        ),
      )
      .mockResolvedValueOnce(response([]));
    vi.stubGlobal("fetch", fetchMock);

    await expect(checkCodexVersion(env)).resolves.toMatchObject({
      version,
      outcome: "binding-exists",
    });
    expect(fetchMock).toHaveBeenCalledTimes(3);
    expect(fetchMock.mock.calls[2][0]).toContain(
      `/contents/src/platform/bindings/${version}`,
    );
  });

  it("fails when the pinned binding folder is missing", async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(response(feed))
      .mockResolvedValueOnce(
        response(
          JSON.stringify({
            chatgpt: version,
            downloadUrl,
          }),
        ),
      )
      .mockResolvedValueOnce(response({}, 404));
    vi.stubGlobal("fetch", fetchMock);

    await expect(checkCodexVersion(env)).rejects.toThrow(
      `bindings/manifest.json pins ${version}, but its binding directory is missing`,
    );
    expect(fetchMock).toHaveBeenCalledTimes(3);
  });

  it("stops when an issue with the exact version title exists", async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(response(feed))
      .mockResolvedValueOnce(
        response(
          JSON.stringify({
            chatgpt: previousVersion,
            downloadUrl:
              "https://persistent.oaistatic.com/codex-app-prod/ChatGPT-darwin-arm64-26.715.70719.zip",
          }),
        ),
      )
      .mockResolvedValueOnce(response([]))
      .mockResolvedValueOnce(
        response({
          items: [
            {
              number: 18,
              title: `ChatGPT ${version} available soon`,
            },
            {
              number: 19,
              title: `ChatGPT ${version} available`,
            },
          ],
        }),
      );
    vi.stubGlobal("fetch", fetchMock);

    await expect(checkCodexVersion(env)).resolves.toMatchObject({
      version,
      outcome: "issue-exists",
      issueNumber: 19,
    });
    expect(fetchMock).toHaveBeenCalledTimes(4);
  });

  it("creates one issue for an unbound and unreported version", async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(response(feed))
      .mockResolvedValueOnce(
        response(
          JSON.stringify({
            chatgpt: previousVersion,
            downloadUrl:
              "https://persistent.oaistatic.com/codex-app-prod/ChatGPT-darwin-arm64-26.715.70719.zip",
          }),
        ),
      )
      .mockResolvedValueOnce(response([]))
      .mockResolvedValueOnce(response({ items: [] }))
      .mockResolvedValueOnce(response({}, 404))
      .mockResolvedValueOnce(response({ name: "pending" }, 201))
      .mockResolvedValueOnce(response({ number: 21 }, 201))
      .mockResolvedValueOnce(response([{ name: "pending" }]));
    vi.stubGlobal("fetch", fetchMock);

    await expect(checkCodexVersion(env)).resolves.toMatchObject({
      version,
      outcome: "issue-created",
      issueNumber: 21,
    });

    const labelCreateRequest = fetchMock.mock.calls.at(-3);
    expect(labelCreateRequest?.[0]).toMatch(/\/labels$/);
    expect(JSON.parse(labelCreateRequest?.[1]?.body as string)).toMatchObject({
      name: "pending",
    });
    const issueRequest = fetchMock.mock.calls.at(-2);
    expect(issueRequest?.[0]).toContain("/issues");
    const issuePayload = JSON.parse(issueRequest?.[1]?.body as string);
    expect(issuePayload).toMatchObject({
      title: `ChatGPT ${version} available`,
    });
    expect(JSON.parse(issuePayload.body)).toEqual({
      schema: 1,
      version,
      download_url: downloadUrl,
    });
    const issueLabelRequest = fetchMock.mock.calls.at(-1);
    expect(issueLabelRequest?.[0]).toContain("/issues/21/labels");
    expect(JSON.parse(issueLabelRequest?.[1]?.body as string)).toEqual({
      labels: ["pending"],
    });
    expect(fetchMock).toHaveBeenCalledTimes(8);
  });
});
