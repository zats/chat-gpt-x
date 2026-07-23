import { afterEach, describe, expect, it, vi } from "vitest";
import { checkCodexVersion } from "./index";

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
  vi.unstubAllGlobals();
});

describe("version detection", () => {
  it("stops before issue lookup when the binding folder exists", async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(response(feed))
      .mockResolvedValueOnce(response([]));
    vi.stubGlobal("fetch", fetchMock);

    await expect(checkCodexVersion(env)).resolves.toMatchObject({
      version,
      outcome: "binding-exists",
    });
    expect(fetchMock).toHaveBeenCalledTimes(2);
    expect(fetchMock.mock.calls[1][0]).toContain(
      `/contents/src/platform/bindings/${version}`,
    );
  });

  it("stops when an issue with the exact version title exists", async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(response(feed))
      .mockResolvedValueOnce(response({}, 404))
      .mockResolvedValueOnce(
        response({
          items: [
            { number: 18, title: `ChatGPT ${version} available soon` },
            { number: 19, title: `ChatGPT ${version} available` },
          ],
        }),
      );
    vi.stubGlobal("fetch", fetchMock);

    await expect(checkCodexVersion(env)).resolves.toMatchObject({
      version,
      outcome: "issue-exists",
      issueNumber: 19,
    });
    expect(fetchMock).toHaveBeenCalledTimes(3);
  });

  it("creates one issue and dispatches its binding workflow", async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(response(feed))
      .mockResolvedValueOnce(response({}, 404))
      .mockResolvedValueOnce(response({ items: [] }))
      .mockResolvedValueOnce(response({ number: 21 }, 201))
      .mockResolvedValueOnce(response(null, 204));
    vi.stubGlobal("fetch", fetchMock);

    await expect(checkCodexVersion(env)).resolves.toMatchObject({
      version,
      outcome: "workflow-dispatched",
      issueNumber: 21,
    });

    const issueRequest = fetchMock.mock.calls.at(-2);
    expect(issueRequest?.[0]).toContain("/issues");
    expect(JSON.parse(issueRequest?.[1]?.body as string)).toMatchObject({
      title: `ChatGPT ${version} available`,
    });
    const dispatchRequest = fetchMock.mock.calls.at(-1);
    expect(dispatchRequest?.[0]).toContain("/dispatches");
    expect(JSON.parse(dispatchRequest?.[1]?.body as string)).toEqual({
      event_type: "chatgpt-version-detected",
      client_payload: {
        version,
        download_url: downloadUrl,
        issue_number: 21,
      },
    });
    expect(fetchMock).toHaveBeenCalledTimes(5);
  });
});
