import assert from "node:assert/strict";
import test from "node:test";
import path from "node:path";
import { fileURLToPath } from "node:url";

import {
  classifyPath,
  compareVersions,
  findUtilityConsumers,
  isBootstrap,
  releaseTag,
  validateUpdateIndex,
} from "./component-releases.mjs";

const repositoryRoot = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  "..",
);

test("classifies predictable component paths", () => {
  assert.deepEqual(classifyPath("src/platform/types.d.ts"), {
    kind: "chatgptApi",
  });
  assert.deepEqual(
    classifyPath("src/platform/bindings/26.721.31836/host.js"),
    {
      kind: "binding",
      chatgpt: "26.721.31836",
    },
  );
  assert.deepEqual(
    classifyPath("src/extensions/thread-colors/thread-colors.ts"),
    {
      kind: "extension",
      id: "thread-colors",
    },
  );
  assert.deepEqual(
    classifyPath("src/platform/utilities/extension-storage.ts"),
    {
      kind: "utilities",
    },
  );
  assert.equal(classifyPath("src/platform/bindings/manifest.json"), null);
});

test("compares strict semantic versions", () => {
  assert.equal(compareVersions("1.0.0", "1.0.0"), 0);
  assert.ok(compareVersions("1.0.1", "1.0.0") > 0);
  assert.ok(compareVersions("2.0.0", "1.99.99") > 0);
  assert.throws(() => compareVersions("1.0", "1.0.0"));
});

test("marks only consumers of the changed utility module", () => {
  assert.deepEqual(
    findUtilityConsumers(
      repositoryRoot,
      new Set(["src/platform/utilities/extension-management.ts"]),
    ),
    ["extensions"],
  );
  assert.deepEqual(
    findUtilityConsumers(
      repositoryRoot,
      new Set(["src/platform/utilities/extension-storage.ts"]),
    ).sort(),
    ["multiple-accounts", "thread-colors"],
  );
});

test("uses predictable release tags", () => {
  assert.equal(
    releaseTag({ kind: "chatgptApi", version: "1.0.0" }),
    "chatgpt-api-v1.0.0",
  );
  assert.equal(
    releaseTag({
      kind: "binding",
      chatgpt: "26.721.31836",
      version: "1.0.1",
    }),
    "binding-26.721.31836-v1.0.1",
  );
  assert.equal(
    releaseTag({
      kind: "extension",
      id: "thread-colors",
      version: "0.1.0",
    }),
    "extension-thread-colors-v0.1.0",
  );
});

test("bootstraps when the release planner did not exist at the base", () => {
  const released = {
    chatgptApi: {
      version: "1.0.0",
      release: "chatgpt-api-v1.0.0",
    },
  };

  assert.equal(isBootstrap(released, false), true);
  assert.equal(isBootstrap(released, true), false);
  assert.equal(isBootstrap(null, true), true);
});

test("validates the schema-v2 public component index", () => {
  const bindingManifests = new Map([
    [
      "26.721.41059",
      {
        version: "1.0.0",
        chatgpt: "26.721.41059",
        chatgptApi: "1.0.2",
      },
    ],
  ]);
  const extensionManifests = new Map([
    [
      "api-test-suite",
      {
        id: "api-test-suite",
        version: "0.0.5",
        private: true,
        compatibility: {
          chatgpt: "26.721.41059",
          chatgptApi: "1.0.2",
        },
      },
    ],
    [
      "thread-colors",
      {
        id: "thread-colors",
        version: "0.1.1",
        compatibility: {
          chatgpt: "26.721.41059",
          chatgptApi: "^1.0.0",
        },
      },
    ],
  ]);
  const index = {
    schemaVersion: 2,
    generation: 10,
    releaseBaseURL:
      "https://github.com/zats/chat-gpt-x/releases/download",
    chatgptApis: {
      "1.0.2": {
        release: "chatgpt-api-v1.0.2",
        sha256: "a".repeat(64),
      },
    },
    bindings: {
      "26.721.41059": {
        version: "1.0.0",
        chatgptApi: "1.0.2",
        release: "binding-26.721.41059-v1.0.0",
        sha256: "b".repeat(64),
      },
    },
    extensions: {
      "thread-colors": {
        version: "0.1.1",
        compatibility: {
          chatgpt: "26.721.41059",
          chatgptApi: "^1.0.0",
        },
        release: "extension-thread-colors-v0.1.1",
        sha256: "c".repeat(64),
      },
    },
  };

  assert.doesNotThrow(() =>
    validateUpdateIndex(index, {
      platform: { version: "1.0.2" },
      bindingManifests,
      extensionManifests,
    }),
  );

  index.extensions["api-test-suite"] = {
    version: "0.0.5",
    compatibility: {
      chatgpt: "26.721.41059",
      chatgptApi: "1.0.2",
    },
    release: "extension-api-test-suite-v0.0.5",
    sha256: "d".repeat(64),
  };
  assert.throws(
    () =>
      validateUpdateIndex(index, {
        platform: { version: "1.0.2" },
        bindingManifests,
        extensionManifests,
      }),
    /every public extension exactly once/,
  );
});
