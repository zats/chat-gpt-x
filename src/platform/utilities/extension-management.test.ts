import assert from "node:assert/strict";
import test from "node:test";
import { createExtensionManagement } from "./extension-management.ts";

test("extension management validates and freezes runtime metadata", async () => {
  globalThis.__CGPTX_RUNTIME__ = {
    async request(method, parameters) {
      assert.equal(method, "extensions.list");
      assert.deepEqual(parameters, {
        authorization: "manager-authorization",
      });
      return [
        {
          id: "thread-colors",
          name: "Thread Colors",
          description: "Adds thread colors.",
          version: "1.0.0",
          enabled: false,
          required: false,
          settingsPaneId: "thread-colors.settings",
        },
      ];
    },
  };

  const result = await createExtensionManagement(
    "manager-authorization",
  ).list();
  assert.equal(result[0]?.name, "Thread Colors");
  assert.equal(result[0]?.settingsPaneId, "thread-colors.settings");
  assert(Object.isFrozen(result));
  assert(Object.isFrozen(result[0]));
});

test("extension management writes enablement through the runtime", async () => {
  globalThis.__CGPTX_RUNTIME__ = {
    async request(method, parameters) {
      assert.equal(method, "extensions.set-enabled");
      assert.deepEqual(parameters, {
        authorization: "manager-authorization",
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

  const result = await createExtensionManagement(
    "manager-authorization",
  ).setEnabled("thread-colors", true);
  assert.equal(result[0]?.enabled, true);
});

test("extension management rejects malformed runtime data", async () => {
  globalThis.__CGPTX_RUNTIME__ = {
    async request() {
      return [{ id: "thread-colors", enabled: true }];
    },
  };

  await assert.rejects(
    createExtensionManagement("manager-authorization").list(),
    /Invalid installed extension listing/,
  );
});

test("extension management requires manager authorization", () => {
  assert.throws(
    () => createExtensionManagement(""),
    /authorization is required/,
  );
});

test("extension management captures its authorized runtime bridge", async () => {
  let authorizedRequests = 0;
  let interceptedRequests = 0;
  globalThis.__CGPTX_RUNTIME__ = {
    async request(method, parameters) {
      authorizedRequests += 1;
      assert.equal(method, "extensions.list");
      assert.deepEqual(parameters, {
        authorization: "manager-authorization",
      });
      return [];
    },
  };
  const management = createExtensionManagement(
    "manager-authorization",
  );
  globalThis.__CGPTX_RUNTIME__ = {
    async request() {
      interceptedRequests += 1;
      return [];
    },
  };

  assert.deepEqual(await management.list(), []);
  assert.equal(authorizedRequests, 1);
  assert.equal(interceptedRequests, 0);
});
