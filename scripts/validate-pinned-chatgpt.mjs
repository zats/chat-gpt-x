import { readdir, readFile, stat } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

const repositoryRoot = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  "..",
);
const bindingsRoot = path.join(repositoryRoot, "src/platform/bindings");
const pinnedManifestPath = path.join(bindingsRoot, "manifest.json");

function compareVersions(left, right) {
  const leftParts = left.split(".").map(Number);
  const rightParts = right.split(".").map(Number);
  const count = Math.max(leftParts.length, rightParts.length);
  for (let index = 0; index < count; index += 1) {
    const difference = (leftParts[index] ?? 0) - (rightParts[index] ?? 0);
    if (difference !== 0) return difference;
  }
  return 0;
}

async function readJson(filePath) {
  return JSON.parse(await readFile(filePath, "utf8"));
}

const pinned = await readJson(pinnedManifestPath);
if (
  typeof pinned.chatgpt !== "string" ||
  !/^\d+(?:\.\d+)+$/.test(pinned.chatgpt)
) {
  throw new Error("bindings/manifest.json chatgpt must be numeric");
}

let downloadUrl;
try {
  downloadUrl = new URL(pinned.downloadUrl);
} catch {
  throw new Error("bindings/manifest.json downloadUrl must be a URL");
}
if (downloadUrl.protocol !== "https:") {
  throw new Error("bindings/manifest.json downloadUrl must use HTTPS");
}
if (!path.basename(downloadUrl.pathname).includes(pinned.chatgpt)) {
  throw new Error("downloadUrl must identify the pinned ChatGPT version");
}

const bindingDirectory = path.join(bindingsRoot, pinned.chatgpt);
if (!(await stat(bindingDirectory)).isDirectory()) {
  throw new Error(`missing binding directory ${pinned.chatgpt}`);
}

const binding = await readJson(path.join(bindingDirectory, "manifest.json"));
if (binding.chatgpt !== pinned.chatgpt) {
  throw new Error("pinned and versioned binding manifests disagree");
}

const versions = (
  await Promise.all(
    (await readdir(bindingsRoot, { withFileTypes: true }))
      .filter(
        (entry) =>
          entry.isDirectory() && /^\d+(?:\.\d+)+$/.test(entry.name),
      )
      .map(async (entry) => {
        const manifest = await readJson(
          path.join(bindingsRoot, entry.name, "manifest.json"),
        );
        if (manifest.chatgpt !== entry.name) {
          throw new Error(
            `${entry.name}/manifest.json chatgpt must match its directory`,
          );
        }
        return entry.name;
      }),
  )
).sort(compareVersions);

const latestVersion = versions.at(-1);
if (pinned.chatgpt !== latestVersion) {
  throw new Error(
    `bindings/manifest.json must pin the newest binding ${latestVersion}`,
  );
}

console.log(
  JSON.stringify({
    chatgpt: pinned.chatgpt,
    downloadUrl: pinned.downloadUrl,
  }),
);
