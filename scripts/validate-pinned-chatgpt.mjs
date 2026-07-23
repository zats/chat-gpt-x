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
  typeof pinned.appVersion !== "string" ||
  !/^\d+(?:\.\d+)+$/.test(pinned.appVersion)
) {
  throw new Error("bindings/manifest.json appVersion must be numeric");
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
if (!path.basename(downloadUrl.pathname).includes(pinned.appVersion)) {
  throw new Error("downloadUrl must identify the pinned appVersion");
}

const bindingDirectory = path.join(bindingsRoot, pinned.appVersion);
if (!(await stat(bindingDirectory)).isDirectory()) {
  throw new Error(`missing binding directory ${pinned.appVersion}`);
}

const binding = await readJson(path.join(bindingDirectory, "manifest.json"));
if (binding.appVersion !== pinned.appVersion) {
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
        if (manifest.appVersion !== entry.name) {
          throw new Error(
            `${entry.name}/manifest.json appVersion must match its directory`,
          );
        }
        return entry.name;
      }),
  )
).sort(compareVersions);

const latestVersion = versions.at(-1);
if (pinned.appVersion !== latestVersion) {
  throw new Error(
    `bindings/manifest.json must pin the newest binding ${latestVersion}`,
  );
}

console.log(
  JSON.stringify({
    appVersion: pinned.appVersion,
    downloadUrl: pinned.downloadUrl,
  }),
);
