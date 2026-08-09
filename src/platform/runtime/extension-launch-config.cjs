"use strict";

const fs = require("node:fs");
const path = require("node:path");

const extensionIdPattern = /^[a-z0-9][a-z0-9._-]*$/i;
const semanticVersionPattern = /^(0|[1-9][0-9]*)\.(0|[1-9][0-9]*)\.(0|[1-9][0-9]*)$/;

function readExtensionEntries({ configurationFile, extensionsDirectory }) {
  if (!configurationFile) {
    return listInstalledExtensions(extensionsDirectory)
      .filter((extension) => extension.enabled)
      .map((extension) => ({
        id: extension.id,
        enabled: true,
        path: path.join(
          extensionPackageDirectory(extensionsDirectory, extension.id),
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
    return { id: extension.id, enabled: true, path: extension.path };
  });
}

function listInstalledExtensions(extensionsDirectory) {
  const settings = readSettings(extensionsDirectory);
  const packageRoot = path.join(
    extensionsDirectory,
    "components/extensions",
  );
  const packageIds = fs
    .readdirSync(packageRoot, { withFileTypes: true })
    .filter((entry) => entry.isDirectory())
    .map((entry) => entry.name)
    .sort((left, right) => left.localeCompare(right));
  const settingIds = Object.keys(settings.extensions).sort((left, right) =>
    left.localeCompare(right),
  );
  if (
    packageIds.length !== settingIds.length ||
    packageIds.some((id, index) => id !== settingIds[index])
  ) {
    throw new Error("Extension settings must contain every installed extension id");
  }

  return settingIds.map((id) => {
    const manifest = readExtensionManifest(extensionsDirectory, id);
    const setting = settings.extensions[id];
    return Object.freeze({
      id,
      name: manifest.name,
      description: manifest.description,
      version: manifest.version,
      enabled: manifest.required === true ? true : setting.enabled,
      required: manifest.required === true,
    });
  });
}

function setExtensionEnabled(extensionsDirectory, extensionId, enabled) {
  if (!extensionIdPattern.test(extensionId) || typeof enabled !== "boolean") {
    throw new TypeError("Invalid extension enablement request");
  }
  const settings = readSettings(extensionsDirectory);
  if (!Object.hasOwn(settings.extensions, extensionId)) {
    throw new Error("Unknown installed extension: " + extensionId);
  }
  const manifest = readExtensionManifest(extensionsDirectory, extensionId);
  if (manifest.required === true && !enabled) {
    throw new Error("Cannot disable a required extension");
  }
  settings.extensions[extensionId] = {
    ...settings.extensions[extensionId],
    enabled,
  };
  atomicWriteJson(path.join(extensionsDirectory, "settings.json"), settings);
}

function readSettings(extensionsDirectory) {
  const parsed = JSON.parse(
    fs.readFileSync(path.join(extensionsDirectory, "settings.json"), "utf8"),
  );
  if (
    !hasExactKeys(parsed, ["schemaVersion", "extensions"]) ||
    parsed.schemaVersion !== 1 ||
    !parsed.extensions ||
    typeof parsed.extensions !== "object" ||
    Array.isArray(parsed.extensions)
  ) {
    throw new Error("Invalid extension settings");
  }
  for (const [id, setting] of Object.entries(parsed.extensions)) {
    if (
      !extensionIdPattern.test(id) ||
      !setting ||
      typeof setting !== "object" ||
      Array.isArray(setting) ||
      typeof setting.enabled !== "boolean"
    ) {
      throw new Error("Invalid extension settings");
    }
  }
  return parsed;
}

function readExtensionManifest(extensionsDirectory, id) {
  let manifest;
  try {
    manifest = JSON.parse(
      fs.readFileSync(
        path.join(extensionPackageDirectory(extensionsDirectory, id), "package.json"),
        "utf8",
      ),
    );
  } catch {
    throw new Error("Invalid installed extension package: " + id);
  }
  if (
    !manifest ||
    typeof manifest !== "object" ||
    Array.isArray(manifest) ||
    manifest.id !== id ||
    typeof manifest.name !== "string" ||
    manifest.name.length === 0 ||
    typeof manifest.description !== "string" ||
    !semanticVersionPattern.test(manifest.version) ||
    manifest.main !== "contents/main.js" ||
    (manifest.required !== undefined && typeof manifest.required !== "boolean")
  ) {
    throw new Error("Invalid installed extension package: " + id);
  }
  return manifest;
}

function extensionPackageDirectory(extensionsDirectory, id) {
  if (!extensionIdPattern.test(id)) {
    throw new Error("Invalid extension id: " + id);
  }
  return path.join(extensionsDirectory, "components/extensions", id);
}

function atomicWriteJson(file, value) {
  const temporary = path.join(
    path.dirname(file),
    `.${path.basename(file)}.${process.pid}.${Date.now()}.tmp`,
  );
  try {
    fs.writeFileSync(temporary, JSON.stringify(value, null, 2) + "\n", {
      encoding: "utf8",
      mode: 0o600,
    });
    fs.renameSync(temporary, file);
  } finally {
    try {
      fs.unlinkSync(temporary);
    } catch {}
  }
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

module.exports = {
  listInstalledExtensions,
  readExtensionEntries,
  setExtensionEnabled,
};
