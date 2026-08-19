"use strict";

const fs = require("node:fs");
const path = require("node:path");

const extensionIdPattern = /^[a-z0-9][a-z0-9._-]*$/i;
const semanticVersionPattern = /^(0|[1-9][0-9]*)\.(0|[1-9][0-9]*)\.(0|[1-9][0-9]*)$/;
const updateLockFileName = "update.lock";
// Node does not expose Darwin O_EXLOCK. This flag uses the BSD flock that the
// component store uses for the same file.
const darwinExclusiveOpenFlag = 0x00000020;

function readExtensionEntries({
  configurationFile,
  versions,
  extensionsDirectory,
}) {
  if (!configurationFile) {
    return listInstalledExtensions(extensionsDirectory, versions)
      .filter((extension) => extension.enabled)
      .map((extension) => ({
        id: extension.id,
        enabled: true,
        path: path.join(
          extensionPackageDirectory(extensionsDirectory, extension.path),
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

function listInstalledExtensions(extensionsDirectory, versions) {
  const settings = readSettings(extensionsDirectory);
  const selected = selectedExtensions(versions);
  return selected.map((extension) => {
    const { id } = extension;
    if (!Object.hasOwn(settings.extensions, id)) {
      throw new Error("Extension settings are missing selected extension: " + id);
    }
    const manifest = readExtensionManifest(extensionsDirectory, extension);
    const setting = settings.extensions[id];
    return Object.freeze({
      id,
      name: manifest.name,
      description: manifest.description,
      version: manifest.version,
      enabled: manifest.required === true ? true : setting.enabled,
      required: manifest.required === true,
      path: extension.path,
    });
  });
}

function setExtensionEnabled(
  extensionsDirectory,
  versions,
  extensionId,
  enabled,
) {
  if (!extensionIdPattern.test(extensionId) || typeof enabled !== "boolean") {
    throw new TypeError("Invalid extension enablement request");
  }
  const extension = selectedExtensions(versions).find(
    (candidate) => candidate.id === extensionId,
  );
  if (!extension) {
    throw new Error("Unknown installed extension: " + extensionId);
  }
  const manifest = readExtensionManifest(extensionsDirectory, extension);
  if (manifest.required === true && !enabled) {
    throw new Error("Cannot disable a required extension");
  }
  withExclusiveMutationLock(extensionsDirectory, () => {
    const settings = readSettings(extensionsDirectory);
    if (!Object.hasOwn(settings.extensions, extensionId)) {
      throw new Error("Unknown installed extension: " + extensionId);
    }
    settings.extensions[extensionId] = {
      ...settings.extensions[extensionId],
      enabled,
    };
    atomicWriteJson(path.join(extensionsDirectory, "settings.json"), settings);
  });
}

function withExclusiveMutationLock(extensionsDirectory, operation) {
  if (process.platform !== "darwin") {
    return operation();
  }

  const lockFile = path.join(extensionsDirectory, updateLockFileName);
  const flags =
    fs.constants.O_CREAT | fs.constants.O_RDWR | darwinExclusiveOpenFlag;
  let descriptor;
  for (;;) {
    try {
      descriptor = fs.openSync(lockFile, flags, 0o600);
      break;
    } catch (error) {
      if (error?.code !== "EINTR") throw error;
    }
  }
  try {
    return operation();
  } finally {
    fs.closeSync(descriptor);
  }
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

function readExtensionManifest(extensionsDirectory, extension) {
  const { id } = extension;
  let manifest;
  try {
    manifest = JSON.parse(
      fs.readFileSync(
        path.join(
          extensionPackageDirectory(extensionsDirectory, extension.path),
          "package.json",
        ),
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

function selectedExtensions(versions) {
  if (!versions || !Array.isArray(versions.extensions)) {
    throw new Error("Invalid component versions lock");
  }
  const ids = new Set();
  return [...versions.extensions]
    .map((extension) => {
      if (
        !extension ||
        !extensionIdPattern.test(extension.id) ||
        ids.has(extension.id) ||
        typeof extension.path !== "string"
      ) {
        throw new Error("Invalid locked extension");
      }
      ids.add(extension.id);
      return extension;
    })
    .sort((left, right) => left.id.localeCompare(right.id));
}

function extensionPackageDirectory(extensionsDirectory, relativePath) {
  if (
    path.isAbsolute(relativePath) ||
    relativePath.split(/[\\/]/).includes("..")
  ) {
    throw new Error("Invalid extension package path: " + relativePath);
  }
  const directory = path.resolve(extensionsDirectory, relativePath);
  const root = path.resolve(extensionsDirectory) + path.sep;
  if (!directory.startsWith(root)) {
    throw new Error("Extension package path escapes the store");
  }
  return directory;
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
