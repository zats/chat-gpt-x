"use strict";

const fs = require("node:fs");
const path = require("node:path");

const extensionIdPattern = /^[a-z0-9][a-z0-9._-]*$/i;

function readExtensionEntries({
  configurationFile,
  versions,
  extensionsDirectory,
}) {
  if (!configurationFile) {
    return versions.extensions
      .filter((extension) => extension.enabled)
      .map((extension) => ({
        id: extension.id,
        enabled: true,
        path: path.join(
          extensionsDirectory,
          extension.path,
          "contents/main.js",
        ),
      }));
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
    !hasExactKeys(parsed, ["schemaVersion", "extensions"]) ||
    parsed.schemaVersion !== 1 ||
    !Array.isArray(parsed.extensions)
  ) {
    throw new Error("Invalid ChatGPTX launch configuration");
  }

  const ids = new Set();
  return parsed.extensions.map((extension) => {
    if (
      !hasExactKeys(extension, ["id", "path"]) ||
      typeof extension.id !== "string" ||
      !extensionIdPattern.test(extension.id) ||
      ids.has(extension.id) ||
      typeof extension.path !== "string" ||
      !path.isAbsolute(extension.path)
    ) {
      throw new Error("Invalid ChatGPTX launch extension");
    }
    ids.add(extension.id);
    return {
      id: extension.id,
      enabled: true,
      path: extension.path,
    };
  });
}

function hasExactKeys(value, keys) {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    return false;
  }
  const actual = Object.keys(value).sort();
  const expected = [...keys].sort();
  return (
    actual.length === expected.length &&
    actual.every((key, index) => key === expected[index])
  );
}

module.exports = { readExtensionEntries };
