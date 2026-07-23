#!/usr/bin/env node

import { readFile } from "node:fs/promises";

const separator = process.argv.indexOf("--");
const authPaths = process.argv.slice(2, separator);
const inspectedPaths = process.argv.slice(separator + 1);

if (separator < 3 || inspectedPaths.length === 0) {
  throw new Error(
    "usage: check-auth-exposure.mjs <auth.json> [...] -- <output-file> [...]",
  );
}

const sensitiveValues = new Set();
for (const authPath of authPaths) {
  const auth = JSON.parse(await readFile(authPath, "utf8"));
  for (const value of [
    auth.OPENAI_API_KEY,
    auth.tokens?.access_token,
    auth.tokens?.account_id,
    auth.tokens?.id_token,
    auth.tokens?.refresh_token,
  ]) {
    if (typeof value === "string" && value.length >= 8) {
      sensitiveValues.add(value);
    }
  }
}

for (const inspectedPath of inspectedPaths) {
  const contents = await readFile(inspectedPath, "utf8");
  for (const value of sensitiveValues) {
    if (contents.includes(value)) {
      throw new Error(`authentication value exposed in ${inspectedPath}`);
    }
  }
  if (/eyJ[A-Za-z0-9_-]{20,}\.[A-Za-z0-9_-]{20,}\.[A-Za-z0-9_-]{20,}/.test(contents)) {
    throw new Error(`JWT-shaped value exposed in ${inspectedPath}`);
  }
}
