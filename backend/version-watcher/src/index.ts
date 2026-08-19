interface Env {
  GITHUB_TOKEN: string;
  GITHUB_OWNER: string;
  GITHUB_REPO: string;
  GITHUB_BRANCH: string;
}

interface CheckResult {
  version: string;
  outcome: "binding-exists" | "issue-exists" | "issue-created";
  issueNumber?: number;
}

interface LatestCodexVersion {
  version: string;
  downloadUrl: string;
}

type CheckTrigger = "scheduled" | "http";

const userAgent = "chat-gpt-x-version-watch-cloudflare-worker";
const feedUrl =
  "https://persistent.oaistatic.com/codex-app-prod/appcast.xml";
const pendingLabel = "pending";

export default {
  async scheduled(
    _event: ScheduledEvent,
    env: Env,
    ctx: ExecutionContext,
  ): Promise<void> {
    ctx.waitUntil(runLoggedCheck(env, "scheduled"));
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
      return Response.json(await runLoggedCheck(env, "http"));
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      return Response.json({ error: "check failed", message }, { status: 500 });
    }
  },
};

async function runLoggedCheck(
  env: Env,
  trigger: CheckTrigger,
): Promise<CheckResult> {
  console.log("[version-watcher] check started", { trigger });
  try {
    const result = await checkCodexVersion(env);
    console.log("[version-watcher] check completed", { trigger, ...result });
    return result;
  } catch (error) {
    console.error("[version-watcher] check failed", {
      trigger,
      error:
        error instanceof Error
          ? {
              name: error.name,
              message: error.message,
              stack: error.stack,
            }
          : String(error),
    });
    throw error;
  }
}

export async function checkCodexVersion(env: Env): Promise<CheckResult> {
  const latest = await readSparkleFeed();
  const pinnedVersion = await readPinnedVersion(env);

  if (!(await bindingDirectoryExists(env, pinnedVersion))) {
    throw new Error(
      `bindings/manifest.json pins ${pinnedVersion}, but its binding directory is missing`,
    );
  }

  const latestBindingExists =
    pinnedVersion === latest.version ||
    (await bindingDirectoryExists(env, latest.version));
  if (latestBindingExists) {
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

  await ensurePendingLabel(env);
  const issueNumber = await createIssue(env, title, issueBody(latest));
  await addPendingLabel(env, issueNumber);

  return {
    version: latest.version,
    outcome: "issue-created",
    issueNumber,
  };
}

async function readPinnedVersion(env: Env): Promise<string> {
  const path =
    `/repos/${env.GITHUB_OWNER}/${env.GITHUB_REPO}` +
    `/contents/src/platform/bindings/manifest.json` +
    `?ref=${encodeURIComponent(env.GITHUB_BRANCH)}`;
  const response = await githubFetch(env, path, {
    headers: {
      Accept: "application/vnd.github.raw+json",
    },
  });
  if (!response.ok) {
    throw new Error(
      `Pinned binding manifest lookup failed: ${response.status} ${await response.text()}`,
    );
  }

  const manifest = JSON.parse(await response.text()) as {
    chatgpt?: unknown;
  };
  if (
    typeof manifest.chatgpt !== "string" ||
    !/^\d+(?:\.\d+)+$/.test(manifest.chatgpt)
  ) {
    throw new Error(
      "bindings/manifest.json chatgpt must be numeric dot-separated components",
    );
  }
  return manifest.chatgpt;
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

async function ensurePendingLabel(env: Env): Promise<void> {
  const repositoryPath = `/repos/${env.GITHUB_OWNER}/${env.GITHUB_REPO}`;
  const response = await githubFetch(
    env,
    `${repositoryPath}/labels/${encodeURIComponent(pendingLabel)}`,
  );
  if (response.ok) return;
  if (response.status !== 404) {
    throw new Error(
      `Pending label lookup failed: ${response.status} ${await response.text()}`,
    );
  }
  await githubJson(env, `${repositoryPath}/labels`, {
    method: "POST",
    body: JSON.stringify({
      name: pendingLabel,
      color: "D4C5F9",
      description: "Waiting for binding generation",
    }),
  });
}

async function addPendingLabel(env: Env, issueNumber: number): Promise<void> {
  await githubJson(
    env,
    `/repos/${env.GITHUB_OWNER}/${env.GITHUB_REPO}/issues/${issueNumber}/labels`,
    {
      method: "POST",
      body: JSON.stringify({ labels: [pendingLabel] }),
    },
  );
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
  return JSON.stringify(
    {
      schema: 1,
      version: latest.version,
      download_url: latest.downloadUrl,
    },
    null,
    2,
  );
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
