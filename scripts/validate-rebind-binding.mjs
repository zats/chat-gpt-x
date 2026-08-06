#!/usr/bin/env node

import { execFileSync } from "node:child_process";
import { readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");

export function validateRebindBinding({
  appVersion,
  baseManifest,
  currentManifest,
  mode,
}) {
  if (!/^\d+(?:\.\d+)+$/.test(appVersion)) {
    throw new Error("app version must contain numeric dot-separated components");
  }
  if (mode !== "new" && mode !== "correction") {
    throw new Error("binding mode must be new or correction");
  }
  if (currentManifest.chatgpt !== appVersion) {
    throw new Error(`binding manifest must target ChatGPT ${appVersion}`);
  }
  if (mode === "new") {
    if (baseManifest !== null) {
      throw new Error(`binding ${appVersion} already existed at the workflow base`);
    }
    if (currentManifest.version !== "1.0.0") {
      throw new Error("a new binding must use version 1.0.0");
    }
    return;
  }

  if (baseManifest === null) {
    throw new Error(`binding ${appVersion} did not exist at the workflow base`);
  }
  if (baseManifest.chatgpt !== appVersion) {
    throw new Error(`base binding manifest must target ChatGPT ${appVersion}`);
  }
  const match = /^(\d+)\.(\d+)\.(\d+)$/.exec(baseManifest.version);
  if (!match) {
    throw new Error("base binding version must use major.minor.patch");
  }
  const expectedVersion = `${match[1]}.${match[2]}.${Number(match[3]) + 1}`;
  if (currentManifest.version !== expectedVersion) {
    throw new Error(
      `corrected binding version must increase from ${baseManifest.version} to ${expectedVersion}`,
    );
  }
}

function readJsonAtRevision(revision, relativePath) {
  try {
    return JSON.parse(
      execFileSync("git", ["-C", root, "show", `${revision}:${relativePath}`], {
        encoding: "utf8",
        stdio: ["ignore", "pipe", "pipe"],
      }),
    );
  } catch (error) {
    if (error?.status === 128) return null;
    throw error;
  }
}

function main() {
  const [mode, baseSha, appVersion] = process.argv.slice(2);
  if (!mode || !baseSha || !appVersion || process.argv.length !== 5) {
    throw new Error(
      "usage: scripts/validate-rebind-binding.mjs <new|correction> <base-sha> <version>",
    );
  }
  const bindingPath = `src/platform/bindings/${appVersion}/manifest.json`;
  validateRebindBinding({
    appVersion,
    baseManifest: readJsonAtRevision(baseSha, bindingPath),
    currentManifest: JSON.parse(readFileSync(path.join(root, bindingPath), "utf8")),
    mode,
  });
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  try {
    main();
  } catch (error) {
    process.stderr.write(`${error instanceof Error ? error.message : error}\n`);
    process.exitCode = 1;
  }
}
