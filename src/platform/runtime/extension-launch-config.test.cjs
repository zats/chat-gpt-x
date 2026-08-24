"use strict";

const assert = require("node:assert/strict");
const { spawn } = require("node:child_process");
const { once } = require("node:events");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const test = require("node:test");
const vm = require("node:vm");
const {
  listInstalledExtensions,
  readExtensionEntries,
  readExtensionLaunch,
  readExtensionSettingsEntries,
  setExtensionEnabled,
} = require("./extension-launch-config.cjs");
const {
  assertExtensionManagerAuthorization,
  createExtensionManagerAuthorization,
  isAuthorizedExtensionManagerEntry,
  orderExtensionEntries,
  wrapExtensionSource,
  wrapExtensionSettingsSource,
} = require("./extension-manager-authorization.cjs");

function makeStore(extensions) {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "chatgptx-extensions."));
  fs.mkdirSync(path.join(root, "components/extensions"), { recursive: true });
  const settings = { schemaVersion: 1, extensions: {} };
  const versions = { schemaVersion: 1, extensions: [] };
  for (const extension of extensions) {
    const version = extension.version ?? "1.0.0";
    const relativePath = path.posix.join(
      "components/extensions",
      extension.id,
      version,
    );
    const directory = path.join(root, relativePath);
    fs.mkdirSync(path.join(directory, "contents"), { recursive: true });
    fs.writeFileSync(
      path.join(directory, "package.json"),
      JSON.stringify({
        id: extension.id,
        name: extension.name,
        description: extension.description,
        version,
        main: "contents/main.js",
        ...(extension.settings
          ? {
              settings: {
                main: "contents/settings.js",
                pane: `${extension.id}.settings`,
              },
            }
          : {}),
        ...(extension.required ? { required: true } : {}),
      }),
    );
    fs.writeFileSync(path.join(directory, "contents/main.js"), "");
    if (extension.settings) {
      fs.writeFileSync(path.join(directory, "contents/settings.js"), "");
    }
    settings.extensions[extension.id] = {
      enabled: extension.enabled,
      ...(extension.channel ? { channel: extension.channel } : {}),
    };
    versions.extensions.push({
      id: extension.id,
      enabled: extension.enabled,
      path: relativePath,
    });
  }
  fs.writeFileSync(path.join(root, "settings.json"), JSON.stringify(settings));
  return { root, versions };
}

test("installed extensions use locked version paths and deterministic id order", () => {
  const { root, versions } = makeStore([
    {
      id: "thread-colors",
      name: "Thread Colors",
      description: "Adds thread colors.",
      enabled: true,
    },
    {
      id: "multiple-accounts",
      name: "Multiple Accounts",
      description: "Switches accounts.",
      enabled: true,
    },
  ]);

  assert.deepEqual(
    readExtensionEntries({ extensionsDirectory: root, versions }),
    [
    {
      id: "multiple-accounts",
      configured: false,
      enabled: true,
      path: path.join(
        root,
        "components/extensions/multiple-accounts/1.0.0/contents/main.js",
      ),
    },
    {
      id: "thread-colors",
      configured: false,
      enabled: true,
      path: path.join(
        root,
        "components/extensions/thread-colors/1.0.0/contents/main.js",
      ),
    },
    ],
  );
});

test("installed extension ids use UTF-16 code-unit order", () => {
  const inputIds = ["aa", "a_a", "a.a", "a-a"];
  const { root, versions } = makeStore(
    inputIds.map((id) => ({
      id,
      name: id,
      description: id,
      enabled: true,
    })),
  );

  assert.deepEqual(
    readExtensionEntries({ extensionsDirectory: root, versions }).map(
      (entry) => entry.id,
    ),
    ["a-a", "a.a", "a_a", "aa"],
  );
});

test("disabled extensions stay installed and are omitted at startup", () => {
  const { root, versions } = makeStore([
    {
      id: "thread-colors",
      name: "Thread Colors",
      description: "Adds thread colors.",
      enabled: false,
      channel: "stable",
      settings: true,
    },
  ]);

  assert.deepEqual(
    readExtensionEntries({ extensionsDirectory: root, versions }),
    [],
  );
  assert.deepEqual(listInstalledExtensions(root, versions), [
    {
      id: "thread-colors",
      name: "Thread Colors",
      description: "Adds thread colors.",
      version: "1.0.0",
      enabled: false,
      required: false,
      settingsPaneId: "thread-colors.settings",
      path: "components/extensions/thread-colors/1.0.0",
    },
  ]);
});

test("settings providers load for disabled extensions in id order", () => {
  const { root, versions } = makeStore([
    {
      id: "thread-colors",
      name: "Thread Colors",
      description: "Adds thread colors.",
      enabled: false,
      settings: true,
    },
    {
      id: "multiple-accounts",
      name: "Multiple Accounts",
      description: "Switches accounts.",
      enabled: false,
    },
    {
      id: "reactions",
      name: "Reactions",
      description: "Adds reactions.",
      enabled: true,
      settings: true,
    },
  ]);

  assert.deepEqual(readExtensionSettingsEntries(root, versions), [
    {
      id: "reactions",
      paneId: "reactions.settings",
      path: path.join(
        root,
        "components/extensions/reactions/1.0.0/contents/settings.js",
      ),
    },
    {
      id: "thread-colors",
      paneId: "thread-colors.settings",
      path: path.join(
        root,
        "components/extensions/thread-colors/1.0.0/contents/settings.js",
      ),
    },
  ]);
});

test("required extensions remain enabled", () => {
  const { root, versions } = makeStore([
    {
      id: "extensions",
      name: "Extensions",
      description: "Manages extensions.",
      enabled: false,
      required: true,
    },
  ]);

  assert.equal(listInstalledExtensions(root, versions)[0].enabled, true);
  assert.equal(
    readExtensionEntries({ extensionsDirectory: root, versions }).length,
    1,
  );
  assert.throws(
    () => setExtensionEnabled(root, versions, "extensions", false),
    /required extension/,
  );
});

test("enablement writes preserve extensible per-extension settings", () => {
  const { root, versions } = makeStore([
    {
      id: "thread-colors",
      name: "Thread Colors",
      description: "Adds thread colors.",
      enabled: false,
      channel: "stable",
    },
  ]);

  setExtensionEnabled(root, versions, "thread-colors", true);
  assert.deepEqual(
    JSON.parse(fs.readFileSync(path.join(root, "settings.json"), "utf8")),
    {
      schemaVersion: 1,
      extensions: {
        "thread-colors": { enabled: true, channel: "stable" },
      },
    },
  );
});

test(
  "enablement waits for the component store lock before it updates settings",
  { skip: process.platform !== "darwin" },
  async () => {
    const { root, versions } = makeStore([
      {
        id: "multiple-accounts",
        name: "Multiple Accounts",
        description: "Switches accounts.",
        enabled: false,
      },
      {
        id: "thread-colors",
        name: "Thread Colors",
        description: "Adds thread colors.",
        enabled: false,
      },
    ]);
    const settingsFile = path.join(root, "settings.json");
    const lockFile = path.join(root, "update.lock");
    const writer = `
      const fs = require("node:fs");
      const settingsFile = ${JSON.stringify(settingsFile)};
      const settings = JSON.parse(fs.readFileSync(settingsFile, "utf8"));
      settings.extensions["multiple-accounts"].enabled = true;
      process.stdout.write("ready\\n");
      Atomics.wait(new Int32Array(new SharedArrayBuffer(4)), 0, 0, 250);
      const temporary = settingsFile + ".writer.tmp";
      fs.writeFileSync(temporary, JSON.stringify(settings));
      fs.renameSync(temporary, settingsFile);
    `;
    const child = spawn(
      "/usr/bin/lockf",
      ["-k", lockFile, process.execPath, "-e", writer],
      { stdio: ["ignore", "pipe", "pipe"] },
    );
    let standardError = "";
    child.stderr.setEncoding("utf8");
    child.stderr.on("data", (data) => {
      standardError += data;
    });
    const exitPromise = once(child, "exit");
    const [ready] = await Promise.race([
      once(child.stdout, "data"),
      exitPromise.then(([code, signal]) => {
        throw new Error(
          `lock holder exited before it was ready: ${code ?? signal}\n${standardError}`,
        );
      }),
    ]);
    assert.equal(ready.toString(), "ready\n");

    const started = Date.now();
    setExtensionEnabled(root, versions, "thread-colors", true);
    assert.ok(Date.now() - started >= 100);

    const [code, signal] = await exitPromise;
    assert.equal(code, 0, `lock holder failed: ${signal}\n${standardError}`);
    assert.deepEqual(JSON.parse(fs.readFileSync(settingsFile, "utf8")), {
      schemaVersion: 1,
      extensions: {
        "multiple-accounts": { enabled: true },
        "thread-colors": { enabled: true },
      },
    });
  },
);

test("launch configuration replaces the complete extension set", () => {
  const { root, versions } = makeStore([
    {
      id: "thread-colors",
      name: "Thread Colors",
      description: "Adds thread colors.",
      enabled: true,
    },
  ]);
  const configurationFile = path.join(root, "launch.json");
  const extensionPath = path.join(root, "api-test-suite/contents/main.js");

  fs.writeFileSync(
    configurationFile,
    JSON.stringify({
      schemaVersion: 3,
      extensions: [
        { id: "api-test-suite", path: extensionPath, enabled: true },
      ],
    }),
  );

  assert.deepEqual(
    readExtensionEntries({
      configurationFile,
      versions,
      extensionsDirectory: root,
    }),
    [
      {
        id: "api-test-suite",
        configured: true,
        enabled: true,
        path: extensionPath,
      },
    ],
  );
  assert.equal(fs.existsSync(configurationFile), false);
});

test("settings can retain an extension that is not selected", () => {
  const { root, versions } = makeStore([]);
  fs.writeFileSync(
    path.join(root, "settings.json"),
    JSON.stringify({
      schemaVersion: 1,
      extensions: { missing: { enabled: true } },
    }),
  );

  assert.deepEqual(listInstalledExtensions(root, versions), []);
});

test("selected extensions require settings", () => {
  const { root, versions } = makeStore([
    {
      id: "thread-colors",
      name: "Thread Colors",
      description: "Adds thread colors.",
      enabled: true,
    },
  ]);
  fs.writeFileSync(
    path.join(root, "settings.json"),
    JSON.stringify({ schemaVersion: 1, extensions: {} }),
  );

  assert.throws(
    () => listInstalledExtensions(root, versions),
    /missing selected extension/,
  );
});

test("invalid launch configuration is rejected and consumed", () => {
  const { root, versions } = makeStore([]);
  const configurationFile = path.join(root, "launch.json");
  fs.writeFileSync(configurationFile, JSON.stringify({ extensions: null }));

  assert.throws(
    () =>
      readExtensionEntries({
        configurationFile,
        versions,
        extensionsDirectory: root,
      }),
    /Invalid ChatGPTX launch configuration/,
  );
  assert.equal(fs.existsSync(configurationFile), false);
});

test("launch configuration schema 1 is rejected and consumed", () => {
  const { root, versions } = makeStore([]);
  const configurationFile = path.join(root, "launch-v2.json");
  fs.writeFileSync(
    configurationFile,
    JSON.stringify({
      schemaVersion: 1,
      extensions: [
        {
          id: "extensions",
          enabled: true,
          path: "/tmp/extensions/main.js",
        },
      ],
    }),
  );
  assert.throws(
    () =>
      readExtensionEntries({
        configurationFile,
        versions,
        extensionsDirectory: root,
      }),
    /Invalid ChatGPTX launch configuration/,
  );
  assert.equal(fs.existsSync(configurationFile), false);
});

test("launch configuration loads settings for a disabled extension", () => {
  const { root, versions } = makeStore([]);
  const configurationFile = path.join(root, "launch-settings.json");
  const mainPath = path.join(root, "reactions/contents/main.js");
  const settingsPath = path.join(root, "reactions/contents/settings.js");
  fs.writeFileSync(
    configurationFile,
    JSON.stringify({
      schemaVersion: 3,
      extensions: [
        {
          id: "reactions",
          path: mainPath,
          enabled: false,
          settingsPath,
          settingsPaneId: "reactions.settings",
        },
      ],
    }),
  );

  assert.deepEqual(
    readExtensionLaunch({
      configurationFile,
      versions,
      extensionsDirectory: root,
    }),
    {
      extensions: [],
      settings: [
        {
          id: "reactions",
          paneId: "reactions.settings",
          path: settingsPath,
        },
      ],
      storageExtensionIds: ["reactions"],
    },
  );
  assert.equal(fs.existsSync(configurationFile), false);
});

test("extension management requires its exact random authorization", () => {
  const authorization = createExtensionManagerAuthorization();
  const otherAuthorization = createExtensionManagerAuthorization();

  assert.notEqual(authorization, otherAuthorization);
  assert.doesNotThrow(() =>
    assertExtensionManagerAuthorization(authorization, authorization),
  );
  for (const rejected of [
    undefined,
    null,
    "",
    otherAuthorization,
    authorization.slice(1),
  ]) {
    assert.throws(
      () =>
        assertExtensionManagerAuthorization(authorization, rejected),
      /not authorized/,
    );
  }
});

test("only the locked extension manager receives management authorization", () => {
  const authorization = createExtensionManagerAuthorization();
  const managerPath =
    "/component-store/extensions/extensions/0.1.1/contents/main.js";
  const code =
    "module.exports = { activate(...arguments_) { return arguments_; } };";

  function load(id, extensionPath, configured = false) {
    let registered;
    const managerAuthorized = isAuthorizedExtensionManagerEntry(
      { id, configured, path: extensionPath },
      managerPath,
    );
    const wrapped = wrapExtensionSource({
      id,
      code,
      managerAuthorization: authorization,
      managerAuthorized,
    });
    const result = vm.runInNewContext(wrapped, {
      console,
      window: {
        __CGPTX_HOST__: {
          registerExtension(extensionId, moduleExports) {
            registered = { id: extensionId, moduleExports };
          },
        },
      },
    });
    assert.equal(result, true);
    assert(registered);
    return { registered, wrapped };
  }

  const manager = load("extensions", managerPath);
  assert.deepEqual(
    Array.from(manager.registered.moduleExports.activate("api")),
    ["api", authorization],
  );

  const ordinary = load("thread-colors", "/tmp/thread-colors/main.js");
  assert.deepEqual(
    Array.from(ordinary.registered.moduleExports.activate("api")),
    ["api"],
  );
  assert.equal(ordinary.wrapped.includes(authorization), false);

  const localOrdinary = load(
    "thread-colors",
    "/tmp/local-thread-colors/main.js",
    true,
  );
  assert.deepEqual(
    Array.from(localOrdinary.registered.moduleExports.activate("api")),
    ["api"],
  );
  assert.equal(localOrdinary.wrapped.includes(authorization), false);

  const forgedManager = load("extensions", "/tmp/forged-manager/main.js");
  assert.deepEqual(
    Array.from(forgedManager.registered.moduleExports.activate("api")),
    ["api"],
  );
  assert.equal(forgedManager.wrapped.includes(authorization), false);

  const localManager = load(
    "extensions",
    "/tmp/local-manager/main.js",
    true,
  );
  assert.deepEqual(
    Array.from(localManager.registered.moduleExports.activate("api")),
    ["api", authorization],
  );
  assert.deepEqual(
    orderExtensionEntries(
      [
        {
          id: "thread-colors",
          configured: false,
          path: "/tmp/thread-colors/main.js",
        },
        {
          id: "extensions",
          configured: false,
          path: "/tmp/forged-manager/main.js",
        },
      ],
      managerPath,
    ).map((entry) => entry.id),
    ["extensions", "thread-colors"],
  );
});

test("settings source registers only the settings provider", () => {
  let registered;
  const wrapped = wrapExtensionSettingsSource({
    id: "reactions",
    paneId: "reactions.settings",
    code: "module.exports = { activate(api) { return api; } };",
  });
  const result = vm.runInNewContext(wrapped, {
    console,
    window: {
      __CGPTX_HOST__: {
        registerExtensionSettings(id, moduleExports, paneId) {
          registered = { id, moduleExports, paneId };
        },
      },
    },
  });

  assert.equal(result, true);
  assert.equal(registered.id, "reactions");
  assert.equal(registered.paneId, "reactions.settings");
  assert.equal(registered.moduleExports.activate("settings-api"), "settings-api");
});

test("an explicit local manager override is authorized and activates first", () => {
  const lockedManagerPath =
    "/component-store/extensions/extensions/0.1.1/contents/main.js";
  const localManagerPath = "/tmp/extensions/contents/main.js";
  const ordered = orderExtensionEntries(
    [
      { id: "z", configured: true, path: "/tmp/z/main.js" },
      { id: "a_a", configured: true, path: "/tmp/a_a/main.js" },
      { id: "extensions", configured: true, path: localManagerPath },
      { id: "aa", configured: true, path: "/tmp/aa/main.js" },
      { id: "a.a", configured: true, path: "/tmp/a.a/main.js" },
      { id: "a-a", configured: true, path: "/tmp/a-a/main.js" },
      { id: "a", configured: true, path: "/tmp/a/main.js" },
    ],
    lockedManagerPath,
  );

  assert.deepEqual(
    ordered.map((entry) => entry.id),
    ["extensions", "a", "a-a", "a.a", "a_a", "aa", "z"],
  );
  assert.deepEqual(
    ordered.map((entry) =>
      isAuthorizedExtensionManagerEntry(entry, lockedManagerPath),
    ),
    [true, false, false, false, false, false, false],
  );
});

test("the manager activates before an earlier third-party id can replace the host", () => {
  const authorization = createExtensionManagerAuthorization();
  const managerPath =
    "/component-store/extensions/extensions/0.1.1/contents/main.js";
  const entries = [
    {
      id: "aaa-third-party",
      configured: false,
      path: "/tmp/aaa-third-party/main.js",
      code: `module.exports = { activate() {
        window.__CGPTX_HOST__ = {
          registerExtension(id, moduleExports) {
            globalThis.intercepted.push({
              id,
              source: moduleExports.activate.toString(),
            });
          },
        };
      } };`,
    },
    {
      id: "extensions",
      configured: false,
      path: managerPath,
      code: `module.exports = { activate(_api, received) {
        globalThis.managerAuthorization = received;
      } };`,
    },
    {
      id: "zzz-third-party",
      configured: false,
      path: "/tmp/zzz-third-party/main.js",
      code: "module.exports = { activate() {} };",
    },
  ];
  const context = {
    console,
    intercepted: [],
    managerAuthorization: undefined,
    window: {
      __CGPTX_HOST__: {
        registerExtension(_id, moduleExports) {
          moduleExports.activate({});
        },
      },
    },
  };

  const ordered = orderExtensionEntries(entries, managerPath);
  assert.deepEqual(
    ordered.map((entry) => entry.id),
    ["extensions", "aaa-third-party", "zzz-third-party"],
  );
  for (const entry of ordered) {
    assert.equal(
      vm.runInNewContext(
        wrapExtensionSource({
          ...entry,
          managerAuthorization: authorization,
          managerAuthorized: isAuthorizedExtensionManagerEntry(
            entry,
            managerPath,
          ),
        }),
        context,
      ),
      true,
    );
  }

  assert.equal(context.managerAuthorization, authorization);
  assert.deepEqual(
    context.intercepted.map((entry) => entry.id),
    ["zzz-third-party"],
  );
  assert.equal(
    context.intercepted.some((entry) => entry.source.includes(authorization)),
    false,
  );
});
