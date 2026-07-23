interface Env {
  GITHUB_TOKEN: string;
  GITHUB_OWNER: string;
  GITHUB_REPO: string;
  GITHUB_BRANCH: string;
}

interface CheckResult {
  version: string;
  outcome: "binding-exists" | "issue-exists" | "workflow-dispatched";
  issueNumber?: number;
}

interface LatestCodexVersion {
  version: string;
  downloadUrl: string;
}

const userAgent = "chat-gpt-x-version-watch-cloudflare-worker";
const feedUrl =
  "https://persistent.oaistatic.com/codex-app-prod/appcast.xml";

export default {
  async scheduled(
    _event: ScheduledEvent,
    env: Env,
    ctx: ExecutionContext,
  ): Promise<void> {
    ctx.waitUntil(checkCodexVersion(env));
  },

  async fetch(request: Request, env: Env): Promise<Response> {
    const url = new URL(request.url);
    if (url.pathname !== "/check") {
      return Response.json({ error: "Not found" }, { status: 404 });
    }

    if (request.method !== "GET" && request.method !== "POST") {
      return Response.json({ error: "Method not allowed" }, { status: 405 });
    }

    try {
      return Response.json(await checkCodexVersion(env));
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      console.error(message);
      return Response.json({ error: "check failed", message }, { status: 500 });
    }
  },
};

export async function checkCodexVersion(env: Env): Promise<CheckResult> {
  const latest = await readSparkleFeed();

  if (await bindingDirectoryExists(env, latest.version)) {
    return {
      version: latest.version,
      outcome: "binding-exists",
    };
  }

  const title = `ChatGPT ${latest.version} available`;
  const existingIssueNumber = await findIssueByTitle(env, title);
  if (existingIssueNumber) {
    return {
      version: latest.version,
      outcome: "issue-exists",
      issueNumber: existingIssueNumber,
    };
  }

  const issueNumber = await createIssue(env, title, issueBody(latest));
  await dispatchRebind(env, latest, issueNumber);

  return {
    version: latest.version,
    outcome: "workflow-dispatched",
    issueNumber,
  };
}

async function readSparkleFeed(): Promise<LatestCodexVersion> {
  const response = await fetch(feedUrl, {
    headers: {
      Accept: "application/xml,text/xml,*/*",
      "User-Agent":
        "Mozilla/5.0 (compatible; CodexVersionWatch/1.0; +https://github.com/zats/chat-gpt-x)",
    },
  });

  if (!response.ok) {
    throw new Error(
      `Sparkle feed failed: ${response.status} ${await response.text()}`,
    );
  }

  const xml = await response.text();
  const item = matchFirst(
    xml,
    /<item\b[^>]*>([\s\S]*?)<\/item>/i,
    "Sparkle feed has no items",
  );
  const enclosure = matchFirst(
    item,
    /<enclosure\b[^>]*>/i,
    "Latest Sparkle item has no enclosure",
    0,
  );
  const version = xmlDecode(
    matchFirst(
      item,
      /<title\b[^>]*>([\s\S]*?)<\/title>/i,
      "Latest Sparkle item has no title",
    ).trim(),
  );
  const downloadUrl = xmlDecode(
    matchFirst(
      enclosure,
      /\burl=(["'])(.*?)\1/i,
      "Latest Sparkle item has no enclosure url",
      2,
    ).trim(),
  );
  if (!version || !downloadUrl) {
    throw new Error("Latest Sparkle item is missing title or enclosure url");
  }

  return {
    version,
    downloadUrl,
  };
}

async function bindingDirectoryExists(
  env: Env,
  version: string,
): Promise<boolean> {
  const path =
    `/repos/${env.GITHUB_OWNER}/${env.GITHUB_REPO}` +
    `/contents/src/platform/bindings/${encodeURIComponent(version)}` +
    `?ref=${encodeURIComponent(env.GITHUB_BRANCH)}`;
  const response = await githubFetch(env, path);
  if (response.ok) return true;
  if (response.status === 404) return false;
  throw new Error(
    `Binding lookup failed: ${response.status} ${await response.text()}`,
  );
}

async function findIssueByTitle(
  env: Env,
  title: string,
): Promise<number | null> {
  const query = encodeURIComponent(
    `repo:${env.GITHUB_OWNER}/${env.GITHUB_REPO} is:issue in:title "${title}"`,
  );
  const result = await githubJson<{
    items: Array<{ number: number; title: string }>;
  }>(env, `/search/issues?q=${query}&per_page=100`);
  return result.items.find((issue) => issue.title === title)?.number ?? null;
}

async function createIssue(
  env: Env,
  title: string,
  body: string,
): Promise<number> {
  const issue = await githubJson<{ number: number }>(
    env,
    `/repos/${env.GITHUB_OWNER}/${env.GITHUB_REPO}/issues`,
    {
      method: "POST",
      body: JSON.stringify({ title, body }),
    },
  );
  return issue.number;
}

async function dispatchRebind(
  env: Env,
  latest: LatestCodexVersion,
  issueNumber: number,
): Promise<void> {
  const response = await githubFetch(
    env,
    `/repos/${env.GITHUB_OWNER}/${env.GITHUB_REPO}/dispatches`,
    {
      method: "POST",
      body: JSON.stringify({
        event_type: "chatgpt-version-detected",
        client_payload: {
          version: latest.version,
          download_url: latest.downloadUrl,
          issue_number: issueNumber,
        },
      }),
    },
  );
  if (!response.ok) {
    throw new Error(
      `Workflow dispatch failed: ${response.status} ${await response.text()}`,
    );
  }
}

async function githubJson<T>(
  env: Env,
  path: string,
  init: RequestInit = {},
): Promise<T> {
  const response = await githubFetch(env, path, init);
  if (!response.ok) {
    throw new Error(
      `GitHub request failed: ${response.status} ${await response.text()}`,
    );
  }
  return response.json();
}

function githubFetch(
  env: Env,
  path: string,
  init: RequestInit = {},
): Promise<Response> {
  return fetch(`https://api.github.com${path}`, {
    ...init,
    headers: {
      Accept: "application/vnd.github+json",
      Authorization: `Bearer ${env.GITHUB_TOKEN}`,
      "Content-Type": "application/json",
      "User-Agent": userAgent,
      "X-GitHub-Api-Version": "2022-11-28",
      ...init.headers,
    },
  });
}

function issueBody(latest: LatestCodexVersion): string {
  return `ChatGPT version detected from the Sparkle feed.

| Field | Value |
| --- | --- |
| Version | \`${latest.version}\` |
| Feed URL | ${feedUrl} |
| Download URL | ${latest.downloadUrl} |
`;
}

function matchFirst(
  value: string,
  pattern: RegExp,
  error: string,
  group = 1,
): string {
  const match = value.match(pattern);
  if (!match?.[group]) throw new Error(error);
  return match[group];
}

function xmlDecode(value: string): string {
  return value
    .replace(/&quot;/g, '"')
    .replace(/&apos;/g, "'")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&amp;/g, "&");
}
