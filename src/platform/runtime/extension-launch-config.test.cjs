"use strict";

const assert = require("node:assert/strict");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const test = require("node:test");
const {
  listInstalledExtensions,
  readExtensionEntries,
  setExtensionEnabled,
} = require("./extension-launch-config.cjs");

function makeStore(extensions) {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "chatgptx-extensions."));
  fs.mkdirSync(path.join(root, "components/extensions"), { recursive: true });
  const settings = { schemaVersion: 1, extensions: {} };
  for (const extension of extensions) {
    const directory = path.join(root, "components/extensions", extension.id);
    fs.mkdirSync(path.join(directory, "contents"), { recursive: true });
    fs.writeFileSync(
      path.join(directory, "package.json"),
      JSON.stringify({
        id: extension.id,
        name: extension.name,
        description: extension.description,
        version: extension.version ?? "1.0.0",
        main: "contents/main.js",
        ...(extension.required ? { required: true } : {}),
      }),
    );
    fs.writeFileSync(path.join(directory, "contents/main.js"), "");
    settings.extensions[extension.id] = {
      enabled: extension.enabled,
      ...(extension.channel ? { channel: extension.channel } : {}),
    };
  }
  fs.writeFileSync(path.join(root, "settings.json"), JSON.stringify(settings));
  return root;
}

test("installed extensions use flat paths and deterministic id order", () => {
  const root = makeStore([
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

  assert.deepEqual(readExtensionEntries({ extensionsDirectory: root }), [
    {
      id: "multiple-accounts",
      enabled: true,
      path: path.join(
        root,
        "components/extensions/multiple-accounts/contents/main.js",
      ),
    },
    {
      id: "thread-colors",
      enabled: true,
      path: path.join(
        root,
        "components/extensions/thread-colors/contents/main.js",
      ),
    },
  ]);
});

test("disabled extensions stay installed and are omitted at startup", () => {
  const root = makeStore([
    {
      id: "thread-colors",
      name: "Thread Colors",
      description: "Adds thread colors.",
      enabled: false,
      channel: "stable",
    },
  ]);

  assert.deepEqual(readExtensionEntries({ extensionsDirectory: root }), []);
  assert.deepEqual(listInstalledExtensions(root), [
    {
      id: "thread-colors",
      name: "Thread Colors",
      description: "Adds thread colors.",
      version: "1.0.0",
      enabled: false,
      required: false,
    },
  ]);
});

test("required extensions remain enabled", () => {
  const root = makeStore([
    {
      id: "extensions",
      name: "Extensions",
      description: "Manages extensions.",
      enabled: false,
      required: true,
    },
  ]);

  assert.equal(listInstalledExtensions(root)[0].enabled, true);
  assert.equal(readExtensionEntries({ extensionsDirectory: root }).length, 1);
  assert.throws(
    () => setExtensionEnabled(root, "extensions", false),
    /required extension/,
  );
});

test("enablement writes preserve extensible per-extension settings", () => {
  const root = makeStore([
    {
      id: "thread-colors",
      name: "Thread Colors",
      description: "Adds thread colors.",
      enabled: false,
      channel: "stable",
    },
  ]);

  setExtensionEnabled(root, "thread-colors", true);
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

test("launch configuration replaces the complete extension set", () => {
  const root = makeStore([
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
      schemaVersion: 1,
      extensions: [{ id: "api-test-suite", path: extensionPath }],
    }),
  );

  assert.deepEqual(
    readExtensionEntries({
      configurationFile,
      extensionsDirectory: root,
    }),
    [{ id: "api-test-suite", enabled: true, path: extensionPath }],
  );
  assert.equal(fs.existsSync(configurationFile), false);
});

test("settings require every id to have a matching flat package", () => {
  const root = makeStore([]);
  fs.writeFileSync(
    path.join(root, "settings.json"),
    JSON.stringify({
      schemaVersion: 1,
      extensions: { missing: { enabled: true } },
    }),
  );

  assert.throws(
    () => listInstalledExtensions(root),
    /every installed extension id/,
  );
});

test("invalid launch configuration is rejected and consumed", () => {
  const root = makeStore([]);
  const configurationFile = path.join(root, "launch.json");
  fs.writeFileSync(configurationFile, JSON.stringify({ extensions: null }));

  assert.throws(
    () =>
      readExtensionEntries({
        configurationFile,
        extensionsDirectory: root,
      }),
    /Invalid ChatGPTX launch configuration/,
  );
  assert.equal(fs.existsSync(configurationFile), false);
});
