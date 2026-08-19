import assert from "node:assert/strict";
import { test } from "node:test";

import {
  issueBody,
  parseArguments,
  parseSparkleFeed,
  triggerChatGPTRebind,
} from "./trigger-chatgpt-rebind.mjs";

const version = "26.730.61639";
const previousVersion = "26.727.51351";
const downloadUrl =
  "https://persistent.oaistatic.com/codex-app-prod/ChatGPT-darwin-arm64-26.730.61639.zip";
const latest = { version, downloadUrl };

function fakeGitHub({
  pinned = previousVersion,
  bindings = [pinned],
  issue = null,
} = {}) {
  const calls = [];
  return {
    calls,
    async readPinnedVersion() {
      calls.push(["readPinnedVersion"]);
      return pinned;
    },
    async bindingDirectoryExists(bindingVersion) {
      calls.push(["bindingDirectoryExists", bindingVersion]);
      return bindings.includes(bindingVersion);
    },
    async findIssueByTitle(title) {
      calls.push(["findIssueByTitle", title]);
      return issue;
    },
    async ensurePendingLabel() {
      calls.push(["ensurePendingLabel"]);
    },
    async createIssue(title, body) {
      calls.push(["createIssue", title, body]);
      return { number: 23, url: "https://github.test/issues/23" };
    },
    async addPendingLabel(issueNumber) {
      calls.push(["addPendingLabel", issueNumber]);
    },
  };
}

test("parses the latest Sparkle item", () => {
  const xml = `<rss><channel><item><title>${version}</title><enclosure url="${downloadUrl.replaceAll("&", "&amp;")}" /></item></channel></rss>`;
  assert.deepEqual(parseSparkleFeed(xml), latest);
});

test("accepts only the optional force flag", () => {
  assert.deepEqual(parseArguments([]), { force: false });
  assert.deepEqual(parseArguments(["--force"]), { force: true });
  assert.throws(() => parseArguments(["--override"]), /usage:/);
  assert.throws(() => parseArguments(["--force", "extra"]), /usage:/);
});

test("standard issue metadata matches the Cloudflare worker", () => {
  assert.deepEqual(JSON.parse(issueBody(latest)), {
    schema: 1,
    version,
    download_url: downloadUrl,
  });
});

test("stops when the latest binding exists", async () => {
  const github = fakeGitHub({ pinned: version });
  const result = await triggerChatGPTRebind({
    github,
    readLatestVersion: async () => latest,
  });

  assert.deepEqual(result, { version, outcome: "binding-exists" });
  assert.deepEqual(github.calls, [
    ["readPinnedVersion"],
    ["bindingDirectoryExists", version],
  ]);
});

test("stops when the latest binding exists outside the development pin", async () => {
  const github = fakeGitHub({
    bindings: [previousVersion, version],
  });
  const result = await triggerChatGPTRebind({
    github,
    readLatestVersion: async () => latest,
  });

  assert.deepEqual(result, { version, outcome: "binding-exists" });
  assert.deepEqual(github.calls, [
    ["readPinnedVersion"],
    ["bindingDirectoryExists", previousVersion],
    ["bindingDirectoryExists", version],
  ]);
});

test("fails when the development pin has no binding directory", async () => {
  const github = fakeGitHub({ bindings: [version] });

  await assert.rejects(
    triggerChatGPTRebind({
      github,
      readLatestVersion: async () => latest,
    }),
    new RegExp(
      `bindings/manifest\\.json pins ${previousVersion.replaceAll(".", "\\.")}, but its binding directory is missing`,
    ),
  );
  assert.deepEqual(github.calls, [
    ["readPinnedVersion"],
    ["bindingDirectoryExists", previousVersion],
  ]);
});

test("stops when an exact issue exists", async () => {
  const github = fakeGitHub({ issue: 19 });
  const result = await triggerChatGPTRebind({
    github,
    readLatestVersion: async () => latest,
  });

  assert.deepEqual(result, {
    version,
    outcome: "issue-exists",
    issueNumber: 19,
  });
  assert.equal(github.calls.at(-1)[0], "findIssueByTitle");
});

test("creates and labels a standard issue for an unknown build", async () => {
  const github = fakeGitHub();
  const result = await triggerChatGPTRebind({
    github,
    readLatestVersion: async () => latest,
  });

  assert.deepEqual(result, {
    version,
    outcome: "issue-created",
    issueNumber: 23,
    issueUrl: "https://github.test/issues/23",
  });
  assert.deepEqual(
    github.calls.slice(-3).map(([name]) => name),
    ["ensurePendingLabel", "createIssue", "addPendingLabel"],
  );
  const createCall = github.calls.find(([name]) => name === "createIssue");
  assert.deepEqual(JSON.parse(createCall[2]), {
    schema: 1,
    version,
    download_url: downloadUrl,
  });
});

test("force creates a correction request for a known latest binding", async () => {
  const github = fakeGitHub({
    bindings: [previousVersion, version],
    issue: 19,
  });
  const result = await triggerChatGPTRebind({
    force: true,
    github,
    readLatestVersion: async () => latest,
  });

  assert.equal(result.force, true);
  assert.equal(
    github.calls.some(([name]) => name === "findIssueByTitle"),
    false,
  );
  assert.deepEqual(
    github.calls.filter(([name]) => name === "bindingDirectoryExists"),
    [["bindingDirectoryExists", previousVersion]],
  );
  const createCall = github.calls.find(([name]) => name === "createIssue");
  assert.deepEqual(JSON.parse(createCall[2]), {
    schema: 1,
    version,
    download_url: downloadUrl,
    force: true,
  });
});
