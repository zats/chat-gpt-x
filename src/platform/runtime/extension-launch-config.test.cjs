"use strict";

const assert = require("node:assert/strict");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const test = require("node:test");
const { readExtensionEntries } = require("./extension-launch-config.cjs");

const versions = {
  extensions: [
    {
      id: "thread-colors",
      enabled: true,
      path: "components/extensions/thread-colors/0.1.1",
    },
  ],
};

test("locked extensions are resolved in locked order", () => {
  const extensionsDirectory = "/tmp/codex/extensions";
  assert.deepEqual(
    readExtensionEntries({
      versions,
      extensionsDirectory,
    }),
    [
      {
        id: "thread-colors",
        enabled: true,
        path: path.join(
          extensionsDirectory,
          "components/extensions/thread-colors/0.1.1/contents/main.js",
        ),
      },
    ],
  );
});

test("launch configuration replaces the complete extension set", () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "chatgptx-launch-config."));
  const configurationFile = path.join(root, "launch.json");
  const extensionPath = path.join(root, "api-test-suite/contents/main.js");

  try {
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
        versions,
        extensionsDirectory: path.join(root, "extensions"),
      }),
      [
        {
          id: "api-test-suite",
          enabled: true,
          path: extensionPath,
        },
      ],
    );
    assert.equal(fs.existsSync(configurationFile), false);
  } finally {
    fs.rmSync(root, { recursive: true, force: true });
  }
});

test("invalid launch configuration is rejected and consumed", () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "chatgptx-launch-config."));
  const configurationFile = path.join(root, "launch.json");

  try {
    fs.writeFileSync(configurationFile, JSON.stringify({ extensions: null }));

    assert.throws(
      () =>
        readExtensionEntries({
          configurationFile,
          versions,
          extensionsDirectory: path.join(root, "extensions"),
        }),
      /Invalid ChatGPTX launch configuration/,
    );
    assert.equal(fs.existsSync(configurationFile), false);
  } finally {
    fs.rmSync(root, { recursive: true, force: true });
  }
});
