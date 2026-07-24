"use strict";

const assert = require("node:assert/strict");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const test = require("node:test");
const { readExtensionEntries } = require("./extension-launch-config.cjs");

test("launch configuration selects only the requested extension", () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "chatgptx-launch-config."));
  const configurationFile = path.join(root, "launch.json");
  const settingsFile = path.join(root, "settings.json");
  const extensionsDirectory = path.join(root, "extensions");

  try {
    fs.writeFileSync(
      configurationFile,
      JSON.stringify({ extensions: ["api-test-suite"] }),
    );
    fs.writeFileSync(
      settingsFile,
      JSON.stringify({
        extensions: [
          {
            id: "thread-colors",
            enabled: true,
            path: "/ignored/thread-colors.js",
          },
        ],
      }),
    );

    assert.deepEqual(
      readExtensionEntries({
        configurationFile,
        settingsFile,
        extensionsDirectory,
      }),
      [
        {
          id: "api-test-suite",
          enabled: true,
          path: path.join(
            extensionsDirectory,
            "api-test-suite",
            "contents/main.js",
          ),
        },
      ],
    );
    assert.equal(fs.existsSync(configurationFile), false);
  } finally {
    fs.rmSync(root, { recursive: true, force: true });
  }
});

test("invalid launch configuration does not use persistent settings", () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "chatgptx-launch-config."));
  const configurationFile = path.join(root, "launch.json");
  const settingsFile = path.join(root, "settings.json");

  try {
    fs.writeFileSync(configurationFile, JSON.stringify({ extensions: null }));
    fs.writeFileSync(
      settingsFile,
      JSON.stringify({
        extensions: [
          {
            id: "thread-colors",
            enabled: true,
            path: "/thread-colors.js",
          },
        ],
      }),
    );

    assert.throws(
      () =>
        readExtensionEntries({
          configurationFile,
          settingsFile,
          extensionsDirectory: path.join(root, "extensions"),
        }),
      /Invalid ChatGPTX launch configuration/,
    );
    assert.equal(fs.existsSync(configurationFile), false);
  } finally {
    fs.rmSync(root, { recursive: true, force: true });
  }
});
