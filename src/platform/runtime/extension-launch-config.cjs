"use strict";

const fs = require("node:fs");
const path = require("node:path");

const canonicalMain = "contents/main.js";
const extensionIdPattern = /^[a-z0-9][a-z0-9._-]*$/i;

function readExtensionEntries({
  configurationFile,
  settingsFile,
  extensionsDirectory,
}) {
  if (!configurationFile) {
    try {
      const parsed = JSON.parse(fs.readFileSync(settingsFile, "utf8"));
      return Array.isArray(parsed.extensions) ? parsed.extensions : [];
    } catch {
      return [];
    }
  }

  let parsed;
  try {
    parsed = JSON.parse(fs.readFileSync(configurationFile, "utf8"));
  } finally {
    try {
      fs.unlinkSync(configurationFile);
    } catch {}
  }

  if (
    !parsed ||
    !Array.isArray(parsed.extensions) ||
    parsed.extensions.some(
      (extensionId) =>
        typeof extensionId !== "string" ||
        !extensionIdPattern.test(extensionId),
    )
  ) {
    throw new Error("Invalid ChatGPTX launch configuration");
  }

  return parsed.extensions.map((extensionId) => ({
    id: extensionId,
    enabled: true,
    path: path.join(extensionsDirectory, extensionId, canonicalMain),
  }));
}

module.exports = { readExtensionEntries };
