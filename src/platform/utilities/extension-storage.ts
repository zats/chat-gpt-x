interface RuntimeBridge {
  request(method: string, parameters: Record<string, unknown>): Promise<unknown>;
}

declare global {
  var __CGPTX_RUNTIME__: RuntimeBridge | undefined;
}

export interface ExtensionStorage {
  listFiles(): Promise<readonly string[]>;
  readTextFile(path: string): Promise<string | undefined>;
  writeTextFile(path: string, contents: string): Promise<void>;
  deleteFile(path: string): Promise<void>;
}

export function createExtensionStorage(extensionId: string): ExtensionStorage {
  if (!/^[a-z0-9][a-z0-9._-]*$/i.test(extensionId)) throw new TypeError("Invalid extension id");

  const request = async (method: string, parameters: Record<string, unknown>): Promise<unknown> => {
    if (!globalThis.__CGPTX_RUNTIME__) throw new Error("ChatGPTX runtime is unavailable");
    return globalThis.__CGPTX_RUNTIME__.request(method, { extensionId, ...parameters });
  };

  return Object.freeze({
    async listFiles(): Promise<readonly string[]> {
      const result = await request("extension-storage.list", {});
      if (!Array.isArray(result) || !result.every((path) => typeof path === "string")) throw new TypeError("Invalid extension storage listing");
      return Object.freeze([...result]);
    },

    async readTextFile(path: string): Promise<string | undefined> {
      const result = await request("extension-storage.read-text", { path });
      if (result === null) return undefined;
      if (typeof result !== "string") throw new TypeError("Invalid extension storage contents");
      return result;
    },

    async writeTextFile(path: string, contents: string): Promise<void> {
      await request("extension-storage.write-text", { path, contents });
    },

    async deleteFile(path: string): Promise<void> {
      await request("extension-storage.delete", { path });
    },
  });
}
