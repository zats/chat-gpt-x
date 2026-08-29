"use strict";

const extensionIdPattern = /^[a-z0-9][a-z0-9._-]*$/i;

function createExtensionStorage(extensionId) {
  if (!extensionIdPattern.test(extensionId)) {
    throw new TypeError("Invalid extension id");
  }

  const request = async (method, parameters) => {
    if (!globalThis.__CGPTX_RUNTIME__) {
      throw new Error("ChatGPTX runtime is unavailable");
    }
    return globalThis.__CGPTX_RUNTIME__.request(method, {
      extensionId,
      ...parameters,
    });
  };

  return Object.freeze({
    async listFiles() {
      const result = await request("extension-storage.list", {});
      if (
        !Array.isArray(result) ||
        !result.every((path) => typeof path === "string")
      ) {
        throw new TypeError("Invalid extension storage listing");
      }
      return Object.freeze([...result]);
    },

    async readTextFile(path) {
      const result = await request("extension-storage.read-text", { path });
      if (result === null) return undefined;
      if (typeof result !== "string") {
        throw new TypeError("Invalid extension storage contents");
      }
      return result;
    },

    async writeTextFile(path, contents) {
      await request("extension-storage.write-text", { path, contents });
    },

    async deleteFile(path) {
      await request("extension-storage.delete", { path });
    },
  });
}
