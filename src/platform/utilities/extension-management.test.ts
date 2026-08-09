import assert from "node:assert/strict";
import test from "node:test";
import { createExtensionManagement } from "./extension-management.ts";

test("extension management validates and freezes runtime metadata", async () => {
  globalThis.__CGPTX_RUNTIME__ = {
    async request(method, parameters) {
      assert.equal(method, "extensions.list");
      assert.deepEqual(parameters, {});
      return [
        {
          id: "thread-colors",
          name: "Thread Colors",
          description: "Adds thread colors.",
          version: "1.0.0",
          enabled: false,
          required: false,
        },
      ];
    },
  };

  const result = await createExtensionManagement().list();
  assert.equal(result[0]?.name, "Thread Colors");
  assert(Object.isFrozen(result));
  assert(Object.isFrozen(result[0]));
});

test("extension management writes enablement through the runtime", async () => {
  globalThis.__CGPTX_RUNTIME__ = {
    async request(method, parameters) {
      assert.equal(method, "extensions.set-enabled");
      assert.deepEqual(parameters, {
        extensionId: "thread-colors",
        enabled: true,
      });
      return [
        {
          id: "thread-colors",
          name: "Thread Colors",
          description: "Adds thread colors.",
          version: "1.0.0",
          enabled: true,
          required: false,
        },
      ];
    },
  };

  const result = await createExtensionManagement().setEnabled(
    "thread-colors",
    true,
  );
  assert.equal(result[0]?.enabled, true);
});

test("extension management rejects malformed runtime data", async () => {
  globalThis.__CGPTX_RUNTIME__ = {
    async request() {
      return [{ id: "thread-colors", enabled: true }];
    },
  };

  await assert.rejects(
    createExtensionManagement().list(),
    /Invalid installed extension listing/,
  );
});
