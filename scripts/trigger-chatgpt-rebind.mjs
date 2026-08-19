#!/usr/bin/env node

import { execFile as execFileCallback } from "node:child_process";
import { promisify } from "node:util";
import { pathToFileURL } from "node:url";

const execFile = promisify(execFileCallback);

export const feedUrl =
  "https://persistent.oaistatic.com/codex-app-prod/appcast.xml";
const pendingLabel = "pending";

export function parseArguments(arguments_) {
  if (arguments_.length === 0) return { force: false };
  if (arguments_.length === 1 && arguments_[0] === "--force") {
    return { force: true };
  }
  throw new Error("usage: scripts/trigger-chatgpt-rebind.mjs [--force]");
}

export function parseSparkleFeed(xml) {
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
  return { version, downloadUrl };
}

export async function triggerChatGPTRebind({
  force = false,
  github,
  readLatestVersion,
}) {
  const latest = await readLatestVersion();
  const pinnedVersion = await github.readPinnedVersion();

  if (!(await github.bindingDirectoryExists(pinnedVersion))) {
    throw new Error(
      `bindings/manifest.json pins ${pinnedVersion}, but its binding directory is missing`,
    );
  }

  if (!force) {
    const latestBindingExists =
      pinnedVersion === latest.version ||
      (await github.bindingDirectoryExists(latest.version));
    if (latestBindingExists) {
      return {
        version: latest.version,
        outcome: "binding-exists",
      };
    }
  }

  const title = `ChatGPT ${latest.version} available`;
  if (!force) {
    const existingIssueNumber = await github.findIssueByTitle(title);
    if (existingIssueNumber !== null) {
      return {
        version: latest.version,
        outcome: "issue-exists",
        issueNumber: existingIssueNumber,
      };
    }
  }

  await github.ensurePendingLabel();
  const issue = await github.createIssue(
    title,
    issueBody(latest, { force }),
  );
  await github.addPendingLabel(issue.number);

  return {
    version: latest.version,
    outcome: "issue-created",
    issueNumber: issue.number,
    issueUrl: issue.url,
    ...(force ? { force: true } : {}),
  };
}

export function issueBody(latest, { force = false } = {}) {
  return JSON.stringify(
    {
      schema: 1,
      version: latest.version,
      download_url: latest.downloadUrl,
      ...(force ? { force: true } : {}),
    },
    null,
    2,
  );
}

export function createGitHubClient({ branch, fetchImpl, repository, token }) {
  const repositoryPath = `/repos/${repository}`;

  async function githubFetch(path, init = {}) {
    return fetchImpl(`https://api.github.com${path}`, {
      ...init,
      headers: {
        Accept: "application/vnd.github+json",
        Authorization: `Bearer ${token}`,
        "Content-Type": "application/json",
        "User-Agent": "chat-gpt-x-local-version-trigger",
        "X-GitHub-Api-Version": "2022-11-28",
        ...init.headers,
      },
    });
  }

  async function githubJson(path, init = {}) {
    const response = await githubFetch(path, init);
    if (!response.ok) {
      throw new Error(
        `GitHub request failed: ${response.status} ${await response.text()}`,
      );
    }
    return response.json();
  }

  return {
    async readPinnedVersion() {
      const response = await githubFetch(
        `${repositoryPath}/contents/src/platform/bindings/manifest.json?ref=${encodeURIComponent(branch)}`,
        { headers: { Accept: "application/vnd.github.raw+json" } },
      );
      if (!response.ok) {
        throw new Error(
          `Pinned binding manifest lookup failed: ${response.status} ${await response.text()}`,
        );
      }
      const manifest = JSON.parse(await response.text());
      if (
        typeof manifest.chatgpt !== "string" ||
        !/^\d+(?:\.\d+)+$/.test(manifest.chatgpt)
      ) {
        throw new Error(
          "bindings/manifest.json chatgpt must be numeric dot-separated components",
        );
      }
      return manifest.chatgpt;
    },

    async bindingDirectoryExists(version) {
      const response = await githubFetch(
        `${repositoryPath}/contents/src/platform/bindings/${encodeURIComponent(version)}?ref=${encodeURIComponent(branch)}`,
      );
      if (response.ok) return true;
      if (response.status === 404) return false;
      throw new Error(
        `Binding lookup failed: ${response.status} ${await response.text()}`,
      );
    },

    async findIssueByTitle(title) {
      const query = encodeURIComponent(
        `repo:${repository} is:issue in:title "${title}"`,
      );
      const result = await githubJson(
        `/search/issues?q=${query}&per_page=100`,
      );
      return result.items.find((issue) => issue.title === title)?.number ?? null;
    },

    async ensurePendingLabel() {
      const response = await githubFetch(
        `${repositoryPath}/labels/${encodeURIComponent(pendingLabel)}`,
      );
      if (response.ok) return;
      if (response.status !== 404) {
        throw new Error(
          `Pending label lookup failed: ${response.status} ${await response.text()}`,
        );
      }
      await githubJson(`${repositoryPath}/labels`, {
        method: "POST",
        body: JSON.stringify({
          name: pendingLabel,
          color: "D4C5F9",
          description: "Waiting for binding generation",
        }),
      });
    },

    async createIssue(title, body) {
      const issue = await githubJson(`${repositoryPath}/issues`, {
        method: "POST",
        body: JSON.stringify({ title, body }),
      });
      return { number: issue.number, url: issue.html_url };
    },

    async addPendingLabel(issueNumber) {
      await githubJson(`${repositoryPath}/issues/${issueNumber}/labels`, {
        method: "POST",
        body: JSON.stringify({ labels: [pendingLabel] }),
      });
    },
  };
}

async function readLatestVersion(fetchImpl) {
  const response = await fetchImpl(feedUrl, {
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
  return parseSparkleFeed(await response.text());
}

async function resolveRepository() {
  const configuredRepository =
    process.env.CHATGPTX_GITHUB_REPOSITORY ?? process.env.GITHUB_REPOSITORY;
  const ghArguments = ["repo", "view"];
  if (configuredRepository) ghArguments.push(configuredRepository);
  ghArguments.push("--json", "nameWithOwner,defaultBranchRef");
  const { stdout } = await execFile("gh", ghArguments, {
    maxBuffer: 1024 * 1024,
  });
  const repository = JSON.parse(stdout);
  const branch =
    process.env.CHATGPTX_GITHUB_BRANCH ?? repository.defaultBranchRef?.name;
  if (!repository.nameWithOwner || !branch) {
    throw new Error("GitHub repository or default branch could not be resolved");
  }
  return { repository: repository.nameWithOwner, branch };
}

async function main() {
  const { force } = parseArguments(process.argv.slice(2));
  const [{ repository, branch }, tokenResult] = await Promise.all([
    resolveRepository(),
    execFile("gh", ["auth", "token"], { maxBuffer: 1024 * 1024 }),
  ]);
  const token = tokenResult.stdout.trim();
  if (!token) throw new Error("gh auth token returned no token");

  const github = createGitHubClient({
    branch,
    fetchImpl: fetch,
    repository,
    token,
  });
  const result = await triggerChatGPTRebind({
    force,
    github,
    readLatestVersion: () => readLatestVersion(fetch),
  });
  process.stdout.write(
    `${JSON.stringify({ repository, branch, ...result }, null, 2)}\n`,
  );
}

function matchFirst(value, pattern, error, group = 1) {
  const match = value.match(pattern);
  if (!match?.[group]) throw new Error(error);
  return match[group];
}

function xmlDecode(value) {
  return value
    .replace(/&quot;/g, '"')
    .replace(/&apos;/g, "'")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&amp;/g, "&");
}

if (import.meta.url === pathToFileURL(process.argv[1]).href) {
  main().catch((error) => {
    process.stderr.write(`${error instanceof Error ? error.message : error}\n`);
    process.exitCode = 1;
  });
}
