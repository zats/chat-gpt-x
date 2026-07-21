import assert from "node:assert/strict";
import test from "node:test";

import { createExtensionStorage } from "./extension-storage.ts";

test("extension storage scopes every request to the creating extension", async () => {
  const requests: Array<{ method: string; parameters: Record<string, unknown> }> = [];
  globalThis.__CGPTX_RUNTIME__ = {
    async request(method, parameters) {
      requests.push({ method, parameters });
      if (method === "extension-storage.list") return ["auth-user-2.json", "auth-user-1.json"];
      if (method === "extension-storage.read-text") return "contents";
      return null;
    },
  };

  const storage = createExtensionStorage("example-extension");
  assert.deepEqual(await storage.listFiles(), ["auth-user-2.json", "auth-user-1.json"]);
  assert.equal(await storage.readTextFile("auth-user-1.json"), "contents");
  await storage.writeTextFile("auth-user-2.json", "replacement");
  await storage.deleteFile("auth-user-1.json");
  assert.deepEqual(requests, [
    { method: "extension-storage.list", parameters: { extensionId: "example-extension" } },
    { method: "extension-storage.read-text", parameters: { extensionId: "example-extension", path: "auth-user-1.json" } },
    { method: "extension-storage.write-text", parameters: { extensionId: "example-extension", path: "auth-user-2.json", contents: "replacement" } },
    { method: "extension-storage.delete", parameters: { extensionId: "example-extension", path: "auth-user-1.json" } },
  ]);
});

test("extension storage rejects invalid extension ids", () => {
  assert.throws(() => createExtensionStorage("../outside"), /Invalid extension id/);
});

test("extension storage requires the ChatGPTX runtime", async () => {
  globalThis.__CGPTX_RUNTIME__ = undefined;
  await assert.rejects(createExtensionStorage("example-extension").listFiles(), /runtime is unavailable/);
});
