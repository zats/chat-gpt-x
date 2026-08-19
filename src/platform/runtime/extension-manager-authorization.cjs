"use strict";

const crypto = require("node:crypto");
const path = require("node:path");

const extensionManagerId = "extensions";

function createExtensionManagerAuthorization() {
  return crypto.randomBytes(32).toString("base64url");
}

function assertExtensionManagerAuthorization(expected, received) {
  const expectedBytes =
    typeof expected === "string" ? Buffer.from(expected) : Buffer.alloc(0);
  const receivedBytes =
    typeof received === "string" ? Buffer.from(received) : Buffer.alloc(0);
  const authorized =
    expectedBytes.length > 0 &&
    expectedBytes.length === receivedBytes.length &&
    crypto.timingSafeEqual(expectedBytes, receivedBytes);
  if (!authorized) {
    throw new Error("Extension management is not authorized");
  }
}

function isAuthorizedExtensionManagerEntry(entry, managerPath) {
  return (
    entry?.id === extensionManagerId &&
    typeof entry.path === "string" &&
    typeof managerPath === "string" &&
    path.resolve(entry.path) === path.resolve(managerPath)
  );
}

function orderExtensionEntries(entries, managerPath) {
  const managerIndex = entries.findIndex(
    (entry) => isAuthorizedExtensionManagerEntry(entry, managerPath),
  );
  if (managerIndex <= 0) return entries;
  return [
    entries[managerIndex],
    ...entries.slice(0, managerIndex),
    ...entries.slice(managerIndex + 1),
  ];
}

function wrapExtensionSource({
  id,
  code,
  managerAuthorization,
  managerAuthorized = false,
}) {
  if (typeof id !== "string" || typeof code !== "string") {
    throw new TypeError("Invalid extension source");
  }
  if (managerAuthorized && id !== extensionManagerId) {
    throw new TypeError("Invalid extension manager identity");
  }
  if (
    managerAuthorized &&
    (typeof managerAuthorization !== "string" ||
      managerAuthorization.length === 0)
  ) {
    throw new TypeError("Extension manager authorization is required");
  }

  const registration = managerAuthorized
    ? `const extensionModule = module.exports; const registeredExtension = { ...extensionModule, activate(api) { return extensionModule.activate(api, ${JSON.stringify(managerAuthorization)}); } };`
    : "const registeredExtension = module.exports;";

  return (
    ";(() => { const module = { exports: {} }; const exports = module.exports; try {\n" +
    code +
    `\n${registration}` +
    `\nwindow.__CGPTX_HOST__?.registerExtension(${JSON.stringify(id)}, registeredExtension);` +
    `\nreturn true; } catch (e) { console.error(${JSON.stringify(`[cgptx-bridge] extension ${id} failed to load`)}, e); return false; } })();`
  );
}

module.exports = {
  assertExtensionManagerAuthorization,
  createExtensionManagerAuthorization,
  isAuthorizedExtensionManagerEntry,
  orderExtensionEntries,
  wrapExtensionSource,
};
