"use strict";

const fs = require("node:fs");
const path = require("node:path");

const extensionIdPattern = /^[a-z0-9][a-z0-9._-]*$/i;
const semanticVersionPattern = /^(0|[1-9][0-9]*)\.(0|[1-9][0-9]*)\.(0|[1-9][0-9]*)$/;
const updateLockFileName = "update.lock";
// Node does not expose Darwin O_EXLOCK. This flag uses the BSD flock that the
// component store uses for the same file.
const darwinExclusiveOpenFlag = 0x00000020;

function compareExtensionIds(left, right) {
  if (left.id === right.id) return 0;
  return left.id < right.id ? -1 : 1;
}

function readExtensionEntries({
  configurationFile,
  versions,
  extensionsDirectory,
}) {
  return readExtensionLaunch({
    configurationFile,
    versions,
    extensionsDirectory,
  }).extensions;
}

function readExtensionLaunch({
  configurationFile,
  versions,
  extensionsDirectory,
}) {
  if (!configurationFile) {
    const installed = listInstalledExtensions(extensionsDirectory, versions);
    const extensions = installed
      .filter((extension) => extension.enabled)
      .map((extension) => ({
        id: extension.id,
        configured: false,
        enabled: true,
        path: path.join(
          extensionPackageDirectory(extensionsDirectory, extension.path),
          "contents/main.js",
        ),
      }));
    const settings = readExtensionSettingsEntries(
      extensionsDirectory,
      versions,
    );
    return Object.freeze({
      extensions: Object.freeze(extensions),
      settings: Object.freeze(settings),
      storageExtensionIds: Object.freeze([
        ...new Set([
          ...extensions.map((extension) => extension.id),
          ...settings.map((extension) => extension.id),
        ]),
      ]),
    });
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
    parsed.schemaVersion !== 3 ||
    !Array.isArray(parsed.extensions)
  ) {
    throw new Error("Invalid ChatGPTX launch configuration");
  }

  const ids = new Set();
  const settings = [];
  const storageExtensionIds = [];
  const extensions = parsed.extensions.flatMap((extension) => {
    if (
      !hasExactKeys(
        extension,
        extension?.settingsPath === undefined
          ? ["enabled", "id", "path"]
          : [
              "enabled",
              "id",
              "path",
              "settingsPaneId",
              "settingsPath",
            ],
      ) ||
      typeof extension.id !== "string" ||
      !extensionIdPattern.test(extension.id) ||
      ids.has(extension.id) ||
      typeof extension.enabled !== "boolean" ||
      typeof extension.path !== "string" ||
      !path.isAbsolute(extension.path) ||
      (extension.settingsPath !== undefined &&
        (typeof extension.settingsPath !== "string" ||
          !path.isAbsolute(extension.settingsPath) ||
          typeof extension.settingsPaneId !== "string" ||
          !extension.settingsPaneId.startsWith(`${extension.id}.`) ||
          extension.settingsPaneId.length <= extension.id.length + 1))
    ) {
      throw new Error("Invalid ChatGPTX launch extension");
    }
    ids.add(extension.id);
    if (extension.settingsPath !== undefined) {
      settings.push({
        id: extension.id,
        paneId: extension.settingsPaneId,
        path: extension.settingsPath,
      });
    }
    if (extension.enabled || extension.settingsPath !== undefined) {
      storageExtensionIds.push(extension.id);
    }
    if (!extension.enabled) return [];
    return [{
      id: extension.id,
      configured: true,
      enabled: true,
      path: extension.path,
    }];
  });
  return Object.freeze({
    extensions: Object.freeze(extensions),
    settings: Object.freeze(settings),
    storageExtensionIds: Object.freeze(storageExtensionIds),
  });
}

function readExtensionSettingsEntries(extensionsDirectory, versions) {
  return selectedExtensions(versions)
    .map((extension) => ({
      extension,
      manifest: readExtensionManifest(extensionsDirectory, extension),
    }))
    .filter(({ manifest }) => manifest.settings)
    .map(({ extension, manifest }) => ({
      id: extension.id,
      paneId: manifest.settings.pane,
      path: path.join(
        extensionPackageDirectory(extensionsDirectory, extension.path),
        manifest.settings.main,
      ),
    }));
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
      ...(manifest.settings
        ? {
            settingsPaneId: manifest.settings.pane,
          }
        : {}),
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
  const settingsValid =
    manifest?.settings === undefined ||
    (hasExactKeys(manifest.settings, ["main", "pane"]) &&
      manifest.settings.main === "contents/settings.js" &&
      typeof manifest.settings.pane === "string" &&
      manifest.settings.pane.startsWith(`${id}.`) &&
      manifest.settings.pane.length > id.length + 1);
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
    (manifest.required !== undefined && typeof manifest.required !== "boolean") ||
    !settingsValid
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
    .sort(compareExtensionIds);
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
  readExtensionLaunch,
  readExtensionSettingsEntries,
  setExtensionEnabled,
};
