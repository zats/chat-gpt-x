import { readFile, stat } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

const repositoryRoot = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  "..",
);
const bindingsRoot = path.join(repositoryRoot, "src/platform/bindings");
const pinnedManifestPath = path.join(bindingsRoot, "manifest.json");
const platformManifestPath = path.join(
  repositoryRoot,
  "src/platform/manifest.json",
);

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

const platform = await readJson(platformManifestPath);
if (binding.chatgptApi !== platform.version) {
  throw new Error(
    `pinned binding ${pinned.chatgpt} must use ChatGPT API ${platform.version}`,
  );
}

console.log(
  JSON.stringify({
    chatgpt: pinned.chatgpt,
    downloadUrl: pinned.downloadUrl,
  }),
);
