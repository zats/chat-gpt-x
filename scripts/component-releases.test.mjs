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
  validateCatalogHistory,
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

test("validates the schema-v3 public component index", () => {
  const bindingManifests = new Map([
    [
      "26.721.41059",
      {
        version: "1.0.0",
        chatgpt: "26.721.41059",
        chatgptApi: "1.0.3",
        asarSha256: "d".repeat(64),
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
          chatgptApi: "1.0.3",
        },
      },
    ],
    [
      "thread-colors",
      {
        id: "thread-colors",
        version: "0.1.1",
        compatibility: {
          chatgptApi: "^1.0.0",
        },
      },
    ],
  ]);
  const index = {
    schemaVersion: 3,
    generation: 10,
    minimumLauncherVersion: "1.0.0",
    releaseBaseURL:
      "https://github.com/zats/chat-gpt-x/releases/download",
    chatgptApis: {
      "1.0.3": {
        release: "chatgpt-api-v1.0.3",
        sha256: "a".repeat(64),
      },
    },
    bindings: {
      "26.721.41059": {
        version: "1.0.0",
        chatgptApi: "1.0.3",
        asarSha256: "d".repeat(64),
        release: "binding-26.721.41059-v1.0.0",
        sha256: "b".repeat(64),
      },
    },
    extensions: {
      "thread-colors": {
        versions: {
          "0.1.0": {
            compatibility: {
              chatgptApi: "^1.0.0",
            },
            release: "extension-thread-colors-v0.1.0",
            sha256: "e".repeat(64),
          },
          "0.1.1": {
            compatibility: {
              chatgptApi: "^1.0.0",
            },
            release: "extension-thread-colors-v0.1.1",
            sha256: "c".repeat(64),
          },
        },
      },
    },
  };

  assert.doesNotThrow(() =>
    validateUpdateIndex(index, {
      platform: { version: "1.0.3" },
      bindingManifests,
      extensionManifests,
    }),
  );

  index.chatgptApis["1.0.4"] = {
    release: "chatgpt-api-v1.0.4",
    sha256: "f".repeat(64),
  };
  assert.doesNotThrow(() =>
    validateUpdateIndex(index, {
      platform: { version: "1.0.3" },
      bindingManifests,
      extensionManifests,
    }),
  );
  delete index.chatgptApis["1.0.4"];

  const missingCurrentApi = structuredClone(index);
  delete missingCurrentApi.chatgptApis["1.0.3"];
  assert.throws(
    () =>
      validateUpdateIndex(missingCurrentApi, {
        platform: { version: "1.0.3" },
        bindingManifests,
        extensionManifests,
      }),
    /missing ChatGPT API 1\.0\.3/,
  );

  const unsupportedRuntime = structuredClone(index);
  unsupportedRuntime.chatgptApis = {
    "1.0.2": {
      release: "chatgpt-api-v1.0.2",
      sha256: "a".repeat(64),
    },
  };
  unsupportedRuntime.bindings["26.721.41059"].chatgptApi = "1.0.2";
  const unsupportedBindingManifests = new Map([
    [
      "26.721.41059",
      {
        ...bindingManifests.get("26.721.41059"),
        chatgptApi: "1.0.2",
      },
    ],
  ]);
  assert.throws(
    () =>
      validateUpdateIndex(unsupportedRuntime, {
        platform: { version: "1.0.2" },
        bindingManifests: unsupportedBindingManifests,
        extensionManifests,
      }),
    /cannot load remote binding packages/,
  );

  const missingBinding = structuredClone(index);
  delete missingBinding.bindings["26.721.41059"];
  assert.throws(
    () =>
      validateUpdateIndex(missingBinding, {
        platform: { version: "1.0.3" },
        bindingManifests,
        extensionManifests,
      }),
    /every binding exactly once/,
  );

  index.extensions["api-test-suite"] = {
    versions: {
      "0.0.5": {
        compatibility: {
          chatgptApi: "1.0.3",
        },
        release: "extension-api-test-suite-v0.0.5",
        sha256: "f".repeat(64),
      },
    },
  };
  assert.throws(
    () =>
      validateUpdateIndex(index, {
        platform: { version: "1.0.3" },
        bindingManifests,
        extensionManifests,
      }),
    /every public extension exactly once/,
  );
});

test("requires exact app.asar identity for each binding", () => {
  const bindingManifests = new Map([
    [
      "26.721.41059",
      {
        version: "1.0.0",
        chatgpt: "26.721.41059",
        chatgptApi: "1.0.3",
        asarSha256: "a".repeat(64),
      },
    ],
  ]);
  const index = {
    schemaVersion: 3,
    generation: 1,
    minimumLauncherVersion: "1.0.0",
    releaseBaseURL:
      "https://github.com/zats/chat-gpt-x/releases/download",
    chatgptApis: {
      "1.0.3": {
        release: "chatgpt-api-v1.0.3",
        sha256: "b".repeat(64),
      },
    },
    bindings: {
      "26.721.41059": {
        version: "1.0.0",
        chatgptApi: "1.0.3",
        asarSha256: "c".repeat(64),
        release: "binding-26.721.41059-v1.0.0",
        sha256: "d".repeat(64),
      },
    },
    extensions: {},
  };

  assert.throws(
    () =>
      validateUpdateIndex(index, {
        platform: { version: "1.0.3" },
        bindingManifests,
        extensionManifests: new Map(),
      }),
    /binding 26\.721\.41059 is stale/,
  );
});

test("rejects ChatGPT compatibility in extension entries", () => {
  const extensionManifests = new Map([
    [
      "thread-colors",
      {
        id: "thread-colors",
        version: "0.1.0",
        compatibility: { chatgptApi: "^1.0.0" },
      },
    ],
  ]);
  const index = {
    schemaVersion: 3,
    generation: 1,
    minimumLauncherVersion: "1.0.0",
    releaseBaseURL:
      "https://github.com/zats/chat-gpt-x/releases/download",
    chatgptApis: {
      "1.0.3": {
        release: "chatgpt-api-v1.0.3",
        sha256: "a".repeat(64),
      },
    },
    bindings: {},
    extensions: {
      "thread-colors": {
        versions: {
          "0.1.0": {
            compatibility: {
              chatgpt: "26.721.41059",
              chatgptApi: "^1.0.0",
            },
            release: "extension-thread-colors-v0.1.0",
            sha256: "b".repeat(64),
          },
        },
      },
    },
  };

  assert.throws(
    () =>
      validateUpdateIndex(index, {
        platform: { version: "1.0.3" },
        bindingManifests: new Map(),
        extensionManifests,
      }),
    /compatibility has unexpected fields/,
  );

  delete index.extensions["thread-colors"].versions["0.1.0"]
    .compatibility.chatgpt;
  index.extensions["thread-colors"].versions["0.1.0"]
    .compatibility.chatgptApi = "banana";
  assert.throws(
    () =>
      validateUpdateIndex(index, {
        platform: { version: "1.0.3" },
        bindingManifests: new Map(),
        extensionManifests,
      }),
    /must declare chatgptApi compatibility/,
  );
});

test("retains immutable API and binding history", () => {
  const chatgpt = "26.721.41059";
  const previous = {
    schemaVersion: 3,
    chatgptApis: {
      "1.0.3": {
        release: "chatgpt-api-v1.0.3",
        sha256: "a".repeat(64),
      },
    },
    bindings: {
      [chatgpt]: {
        version: "1.0.0",
        chatgptApi: "1.0.3",
        asarSha256: "b".repeat(64),
        release: `binding-${chatgpt}-v1.0.0`,
        sha256: "c".repeat(64),
      },
    },
    extensions: {},
  };
  const latest = structuredClone(previous);

  assert.doesNotThrow(() =>
    validateCatalogHistory(latest, previous, new Set()),
  );

  const changedApi = structuredClone(latest);
  changedApi.chatgptApis["1.0.3"].sha256 = "d".repeat(64);
  assert.throws(
    () => validateCatalogHistory(changedApi, previous, new Set()),
    /must not change ChatGPT API 1\.0\.3/,
  );

  const missingApi = structuredClone(latest);
  delete missingApi.chatgptApis["1.0.3"];
  assert.throws(
    () => validateCatalogHistory(missingApi, previous, new Set()),
    /must retain ChatGPT API 1\.0\.3/,
  );

  const changedBinding = structuredClone(latest);
  changedBinding.bindings[chatgpt].sha256 = "e".repeat(64);
  assert.throws(
    () => validateCatalogHistory(changedBinding, previous, new Set()),
    /must not change binding 26\.721\.41059 without a version increment/,
  );

  const correctedBinding = structuredClone(latest);
  correctedBinding.bindings[chatgpt] = {
    ...correctedBinding.bindings[chatgpt],
    version: "1.0.1",
    release: `binding-${chatgpt}-v1.0.1`,
    sha256: "f".repeat(64),
  };
  assert.throws(
    () => validateCatalogHistory(correctedBinding, previous, new Set()),
    /must not change binding 26\.721\.41059 without a version increment/,
  );
  assert.doesNotThrow(() =>
    validateCatalogHistory(
      correctedBinding,
      previous,
      new Set([chatgpt]),
    ),
  );

  const missingBinding = structuredClone(latest);
  delete missingBinding.bindings[chatgpt];
  assert.throws(
    () => validateCatalogHistory(missingBinding, previous, new Set([chatgpt])),
    /must retain binding 26\.721\.41059/,
  );

  const schema2 = structuredClone(previous);
  schema2.schemaVersion = 2;
  delete schema2.bindings[chatgpt].asarSha256;
  assert.doesNotThrow(() =>
    validateCatalogHistory(latest, schema2, new Set()),
  );

  const obsolete = {
    schemaVersion: 2,
    chatgptApis: {
      "1.0.2": {
        release: "chatgpt-api-v1.0.2",
        sha256: "1".repeat(64),
      },
    },
    bindings: {
      "26.721.31836": {
        version: "1.0.3",
        chatgptApi: "1.0.2",
        release: "binding-26.721.31836-v1.0.3",
        sha256: "2".repeat(64),
      },
    },
    extensions: {},
  };
  assert.doesNotThrow(() =>
    validateCatalogHistory(
      { schemaVersion: 3, chatgptApis: {}, bindings: {}, extensions: {} },
      obsolete,
      new Set(),
    ),
  );
});

test("retains immutable extension history during schema migration and updates", () => {
  const oldEntry = {
    compatibility: { chatgptApi: "^1.0.0" },
    release: "extension-thread-colors-v0.1.0",
    sha256: "a".repeat(64),
  };
  const latest = {
    schemaVersion: 3,
    extensions: {
      "thread-colors": {
        versions: {
          "0.1.0": oldEntry,
          "0.1.1": {
            compatibility: { chatgptApi: "^1.0.0" },
            release: "extension-thread-colors-v0.1.1",
            sha256: "b".repeat(64),
          },
        },
      },
    },
  };
  const schema2 = {
    schemaVersion: 2,
    extensions: {
      "thread-colors": {
        version: "0.1.0",
        compatibility: {
          chatgpt: "26.721.41059",
          chatgptApi: "^1.0.0",
        },
        release: oldEntry.release,
        sha256: oldEntry.sha256,
      },
    },
  };

  assert.doesNotThrow(() => validateCatalogHistory(latest, schema2));
  assert.doesNotThrow(() =>
    validateCatalogHistory(latest, {
      schemaVersion: 3,
      extensions: {
        "thread-colors": { versions: { "0.1.0": oldEntry } },
      },
    }),
  );

  const changed = structuredClone(latest);
  changed.extensions["thread-colors"].versions["0.1.0"].sha256 =
    "c".repeat(64);
  assert.throws(
    () => validateCatalogHistory(changed, schema2),
    /must not change extension thread-colors 0\.1\.0/,
  );
  delete changed.extensions["thread-colors"].versions["0.1.0"];
  assert.throws(
    () => validateCatalogHistory(changed, schema2),
    /must retain extension thread-colors 0\.1\.0/,
  );
});

test("removes only the unpublished schema-v2 manager bootstrap", () => {
  const previous = {
    schemaVersion: 2,
    extensions: {
      extensions: {
        version: "0.1.0",
        compatibility: {
          chatgpt: ">=26.803.41515 <=26.803.41515",
          chatgptApi: "^1.1.0",
        },
        release: "extension-extensions-v0.1.0",
        sha256:
          "45ae6c2ac40a8792d95a33d7d74ef293427f3d2e17d5724f52548a09a950802c",
      },
    },
  };
  const latest = {
    schemaVersion: 3,
    extensions: {
      extensions: {
        versions: {
          "0.1.1": {
            compatibility: { chatgptApi: "^1.1.0" },
            release: "extension-extensions-v0.1.1",
            sha256: "a".repeat(64),
          },
        },
      },
    },
  };

  assert.doesNotThrow(() => validateCatalogHistory(latest, previous));

  const changedHash = structuredClone(previous);
  changedHash.extensions.extensions.sha256 = "b".repeat(64);
  assert.throws(
    () => validateCatalogHistory(latest, changedHash),
    /must retain extension extensions 0\.1\.0/,
  );

  const schema3 = structuredClone(previous);
  schema3.schemaVersion = 3;
  schema3.extensions.extensions = {
    versions: {
      "0.1.0": {
        compatibility: { chatgptApi: "^1.1.0" },
        release: "extension-extensions-v0.1.0",
        sha256:
          "45ae6c2ac40a8792d95a33d7d74ef293427f3d2e17d5724f52548a09a950802c",
      },
    },
  };
  assert.throws(
    () => validateCatalogHistory(latest, schema3),
    /must retain extension extensions 0\.1\.0/,
  );
});
