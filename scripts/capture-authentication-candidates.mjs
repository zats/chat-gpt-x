#!/usr/bin/env node

import {
  chmod,
  mkdir,
  readFile,
  readdir,
  rename,
  stat,
  writeFile,
} from "node:fs/promises";
import path from "node:path";

const [primaryPath, secondaryPath, codexRoot, outputRoot] =
  process.argv.slice(2);

if (!primaryPath || !secondaryPath || !codexRoot || !outputRoot) {
  throw new Error(
    "usage: capture-authentication-candidates.mjs <primary.json> <secondary.json> <codex-root> <output-root>",
  );
}

function decodeTokenClaims(token) {
  if (typeof token !== "string") return undefined;
  const parts = token.split(".");
  if (parts.length < 2) return undefined;
  try {
    return JSON.parse(
      Buffer.from(parts[1], "base64url").toString("utf8"),
    );
  } catch {
    return undefined;
  }
}

function nonEmptyString(...values) {
  return values.find(
    (value) => typeof value === "string" && value.trim().length > 0,
  );
}

function authenticationUserId(authentication) {
  const idClaims = decodeTokenClaims(authentication.tokens?.id_token);
  const accessClaims = decodeTokenClaims(authentication.tokens?.access_token);
  const idAuthentication = idClaims?.["https://api.openai.com/auth"];
  const accessAuthentication =
    accessClaims?.["https://api.openai.com/auth"];
  return nonEmptyString(
    idAuthentication?.chatgpt_user_id,
    idAuthentication?.user_id,
    accessAuthentication?.chatgpt_user_id,
    accessAuthentication?.chatgpt_account_user_id,
    accessAuthentication?.user_id,
    idClaims?.sub,
    accessClaims?.sub,
  );
}

function timestampNanoseconds(value) {
  const match =
    /^(\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2})(?:\.(\d{1,9}))?Z$/.exec(
      value,
    );
  if (!match) throw new Error("authentication has an invalid last_refresh");
  const milliseconds = Date.parse(`${match[1]}Z`);
  if (!Number.isFinite(milliseconds)) {
    throw new Error("authentication has an invalid last_refresh");
  }
  const fraction = (match[2] ?? "").padEnd(9, "0");
  return BigInt(milliseconds) * 1_000_000n + BigInt(fraction);
}

function canonicalJson(value) {
  if (Array.isArray(value)) {
    return `[${value.map(canonicalJson).join(",")}]`;
  }
  if (value && typeof value === "object") {
    return `{${Object.keys(value)
      .sort()
      .map((key) => `${JSON.stringify(key)}:${canonicalJson(value[key])}`)
      .join(",")}}`;
  }
  return JSON.stringify(value);
}

async function readAuthentication(filePath) {
  const contents = await readFile(filePath, "utf8");
  const authentication = JSON.parse(contents);
  if (
    !authentication ||
    typeof authentication !== "object" ||
    Array.isArray(authentication) ||
    !authentication.tokens ||
    typeof authentication.tokens !== "object" ||
    typeof authentication.last_refresh !== "string"
  ) {
    throw new Error(`invalid authentication file: ${filePath}`);
  }
  const userId = authenticationUserId(authentication);
  if (!userId) {
    throw new Error(`authentication user id is missing: ${filePath}`);
  }
  return {
    canonical: canonicalJson(authentication),
    contents,
    userId,
    lastRefresh: authentication.last_refresh,
    timestamp: timestampNanoseconds(authentication.last_refresh),
  };
}

async function existingFile(filePath) {
  try {
    return (await stat(filePath)).isFile();
  } catch (error) {
    if (error?.code === "ENOENT") return false;
    throw error;
  }
}

const primary = await readAuthentication(primaryPath);
const secondary = await readAuthentication(secondaryPath);
if (primary.userId === secondary.userId) {
  throw new Error("primary and secondary authentication identify the same user");
}

const outputPaths = {
  [primary.userId]: path.join(outputRoot, "primary.json"),
  [secondary.userId]: path.join(outputRoot, "secondary.json"),
};
const sourcePaths = [primaryPath, secondaryPath];
const activePath = path.join(codexRoot, "auth.json");
if (await existingFile(activePath)) sourcePaths.push(activePath);

const accountsRoot = path.join(
  codexRoot,
  "extensions",
  "multiple-accounts",
);
try {
  for (const entry of await readdir(accountsRoot, { withFileTypes: true })) {
    if (entry.isFile() && /^auth-.+\.json$/.test(entry.name)) {
      sourcePaths.push(path.join(accountsRoot, entry.name));
    }
  }
} catch (error) {
  if (error?.code !== "ENOENT") throw error;
}

for (const outputPath of Object.values(outputPaths)) {
  if (await existingFile(outputPath)) sourcePaths.push(outputPath);
}

const selected = new Map();
for (const sourcePath of new Set(sourcePaths)) {
  const candidate = await readAuthentication(sourcePath);
  if (!Object.hasOwn(outputPaths, candidate.userId)) continue;
  const current = selected.get(candidate.userId);
  if (!current || candidate.timestamp > current.timestamp) {
    selected.set(candidate.userId, candidate);
  } else if (
    candidate.timestamp === current.timestamp &&
    candidate.canonical !== current.canonical
  ) {
    throw new Error(
      `authentication differs at the same last_refresh: ${candidate.lastRefresh}`,
    );
  }
}

await mkdir(outputRoot, { recursive: true, mode: 0o700 });
await chmod(outputRoot, 0o700);
for (const [userId, outputPath] of Object.entries(outputPaths)) {
  const candidate = selected.get(userId);
  if (!candidate) throw new Error("authentication candidate is missing");
  const temporaryPath = `${outputPath}.${process.pid}.tmp`;
  await writeFile(temporaryPath, candidate.contents, { mode: 0o600 });
  await rename(temporaryPath, outputPath);
  await chmod(outputPath, 0o600);
}
