#!/usr/bin/env node

import { chmod, copyFile, mkdir, writeFile } from "node:fs/promises";
import path from "node:path";
import { pathToFileURL } from "node:url";

export function selectCIAuthentication({ primaryJson, secondaryJson = "" }) {
  if (!primaryJson) {
    throw new Error("CHATGPTX_PRIMARY_AUTH_JSON is required");
  }

  const primary = parseAuthentication(primaryJson, "primary");
  switch (primary.auth_mode) {
    case "apikey":
      if (
        typeof primary.OPENAI_API_KEY !== "string" ||
        primary.OPENAI_API_KEY.length === 0 ||
        primary.tokens != null
      ) {
        throw new Error("API-key authentication is malformed");
      }
      return { mode: "apikey", primaryJson, secondaryJson: null };

    case "chatgpt": {
      validateChatGPTAuthentication(primary, "primary");
      if (!secondaryJson) {
        throw new Error(
          "CHATGPTX_SECONDARY_AUTH_JSON is required for ChatGPT authentication",
        );
      }
      const secondary = parseAuthentication(secondaryJson, "secondary");
      validateChatGPTAuthentication(secondary, "secondary");
      return { mode: "chatgpt", primaryJson, secondaryJson };
    }

    default:
      throw new Error(`unsupported authentication mode: ${primary.auth_mode}`);
  }
}

export async function materializeCIAuthentication({
  authRoot,
  candidateRoot,
  primaryJson,
  secondaryJson,
}) {
  const selected = selectCIAuthentication({ primaryJson, secondaryJson });
  await mkdir(authRoot, { recursive: true, mode: 0o700 });
  await chmod(authRoot, 0o700);

  const primaryPath = path.join(authRoot, "primary.json");
  await writePrivateFile(primaryPath, selected.primaryJson);

  let secondaryPath = null;
  if (selected.secondaryJson !== null) {
    secondaryPath = path.join(authRoot, "secondary.json");
    await writePrivateFile(secondaryPath, selected.secondaryJson);
  }

  if (candidateRoot && selected.mode === "chatgpt") {
    await mkdir(candidateRoot, { recursive: true, mode: 0o700 });
    await chmod(candidateRoot, 0o700);
    await copyPrivateFile(primaryPath, path.join(candidateRoot, "primary.json"));
    await copyPrivateFile(
      secondaryPath,
      path.join(candidateRoot, "secondary.json"),
    );
  }

  return { mode: selected.mode, primaryPath, secondaryPath };
}

function parseAuthentication(value, label) {
  try {
    const authentication = JSON.parse(value);
    if (
      !authentication ||
      typeof authentication !== "object" ||
      Array.isArray(authentication)
    ) {
      throw new Error();
    }
    return authentication;
  } catch {
    throw new Error(`${label} authentication JSON is malformed`);
  }
}

function validateChatGPTAuthentication(authentication, label) {
  if (
    authentication.auth_mode !== "chatgpt" ||
    !authentication.tokens ||
    typeof authentication.tokens !== "object" ||
    typeof authentication.tokens.access_token !== "string" ||
    authentication.tokens.access_token.length === 0 ||
    typeof authentication.tokens.refresh_token !== "string" ||
    authentication.tokens.refresh_token.length === 0
  ) {
    throw new Error(`${label} ChatGPT authentication is malformed`);
  }
}

async function writePrivateFile(filePath, contents) {
  await writeFile(filePath, contents, { mode: 0o600 });
  await chmod(filePath, 0o600);
}

async function copyPrivateFile(source, destination) {
  await copyFile(source, destination);
  await chmod(destination, 0o600);
}

async function main() {
  const [authRoot, candidateRoot] = process.argv.slice(2);
  if (!authRoot || process.argv.length > 4) {
    throw new Error(
      "usage: scripts/materialize-ci-auth.mjs <auth-root> [candidate-root]",
    );
  }
  const result = await materializeCIAuthentication({
    authRoot,
    candidateRoot,
    primaryJson: process.env.PRIMARY_AUTH_JSON ?? "",
    secondaryJson: process.env.SECONDARY_AUTH_JSON ?? "",
  });
  process.stdout.write(`${result.mode}\n`);
}

if (import.meta.url === pathToFileURL(process.argv[1]).href) {
  main().catch((error) => {
    process.stderr.write(`${error instanceof Error ? error.message : error}\n`);
    process.exitCode = 1;
  });
}
