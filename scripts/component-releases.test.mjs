import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import {
  mkdirSync,
  mkdtempSync,
  rmSync,
  writeFileSync,
} from "node:fs";
import test from "node:test";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";

import {
  classifyPath,
  compareVersions,
  createReleasePlan,
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
const unpublishedBindingChatGPT = "26.814.41957";
const unpublishedBindingCatalogEntry = {
  version: "1.0.0",
  chatgptApi: "1.0.4",
  release: "binding-26.814.41957-v1.0.0",
  sha256:
    "907fa3a6641a02d698e46ea1885ce7b12060e810aebe4700723a584aa5aa8677",
};
const unpublishedBindingManifest = {
  version: "1.0.0",
  chatgpt: unpublishedBindingChatGPT,
  chatgptApi: "1.0.4",
  asarSha256:
    "881d21270e41ea50a6de7835a3dda3516a001354d034933bb4a97677f3e0c479",
  electronVersion: "151.0.7922.137",
  boundAt: "2026-08-18",
};

function writeJson(root, filePath, value) {
  const absolutePath = path.join(root, filePath);
  mkdirSync(path.dirname(absolutePath), { recursive: true });
  writeFileSync(absolutePath, `${JSON.stringify(value, null, 2)}\n`);
}

function createBindingDeletionFixture(bindingManifest) {
  const root = mkdtempSync(
    path.join(os.tmpdir(), "chatgptx-binding-deletion-test-"),
  );
  const retainedChatGPT = "26.814.41407";
  const retainedManifest = {
    version: "1.0.0",
    chatgpt: retainedChatGPT,
    chatgptApi: "1.0.4",
    asarSha256: "a".repeat(64),
  };
  const apiEntry = {
    release: "chatgpt-api-v1.0.4",
    sha256: "b".repeat(64),
  };
  const retainedSchema2Entry = {
    version: retainedManifest.version,
    chatgptApi: retainedManifest.chatgptApi,
    release: `binding-${retainedChatGPT}-v${retainedManifest.version}`,
    sha256: "c".repeat(64),
  };

  writeJson(root, "src/platform/manifest.json", { version: "1.0.4" });
  writeJson(root, "src/platform/bindings/manifest.json", {
    chatgpt: retainedChatGPT,
  });
  writeJson(
    root,
    `src/platform/bindings/${retainedChatGPT}/manifest.json`,
    retainedManifest,
  );
  writeJson(
    root,
    `src/platform/bindings/${unpublishedBindingChatGPT}/manifest.json`,
    bindingManifest,
  );
  writeJson(root, "updates/latest.json", {
    schemaVersion: 2,
    generation: 25,
    chatgptApis: { "1.0.4": apiEntry },
    bindings: {
      [retainedChatGPT]: retainedSchema2Entry,
      [unpublishedBindingChatGPT]: unpublishedBindingCatalogEntry,
    },
    extensions: {},
  });
  mkdirSync(path.join(root, "src/extensions"), { recursive: true });
  mkdirSync(path.join(root, "scripts"), { recursive: true });
  writeFileSync(path.join(root, "scripts/component-releases.mjs"), "\n");

  execFileSync("git", ["init", "--quiet"], { cwd: root });
  execFileSync("git", ["add", "."], { cwd: root });
  execFileSync(
    "git",
    [
      "-c",
      "user.name=Test",
      "-c",
      "user.email=test@example.com",
      "commit",
      "--quiet",
      "-m",
      "base",
    ],
    { cwd: root },
  );
  const base = execFileSync("git", ["rev-parse", "HEAD"], {
    cwd: root,
    encoding: "utf8",
  }).trim();

  rmSync(
    path.join(root, "src/platform/bindings", unpublishedBindingChatGPT),
    { recursive: true },
  );
  writeJson(root, "updates/latest.json", {
    schemaVersion: 3,
    generation: 26,
    minimumLauncherVersion: "1.1.0",
    releaseBaseURL:
      "https://github.com/zats/chat-gpt-x/releases/download",
    chatgptApis: { "1.0.4": apiEntry },
    bindings: {
      [retainedChatGPT]: {
        ...retainedSchema2Entry,
        asarSha256: retainedManifest.asarSha256,
      },
    },
    extensions: {},
  });

  return { base, root };
}

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
    ["multiple-accounts", "reactions", "thread-colors"],
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

test("omits the exact unpublished binding deletion from release artifacts", () => {
  const { base, root } = createBindingDeletionFixture(
    unpublishedBindingManifest,
  );
  try {
    const plan = createReleasePlan({ base, head: "--worktree", root });

    assert.equal(plan.generation, 26);
    assert.deepEqual(plan.bindings, []);
  } finally {
    rmSync(root, { recursive: true });
  }
});

test("requires the exact unpublished binding source metadata", () => {
  const { base, root } = createBindingDeletionFixture({
    ...unpublishedBindingManifest,
    electronVersion: "151.0.7922.138",
  });
  try {
    assert.throws(
      () => createReleasePlan({ base, head: "--worktree", root }),
      /Missing binding 26\.814\.41957/,
    );
  } finally {
    rmSync(root, { recursive: true });
  }
});

test("permits only the exact unpublished schema-v2 binding deletion", () => {
  const previous = {
    schemaVersion: 2,
    chatgptApis: {},
    bindings: {
      [unpublishedBindingChatGPT]: unpublishedBindingCatalogEntry,
    },
    extensions: {},
  };
  const latest = {
    schemaVersion: 3,
    chatgptApis: {},
    bindings: {},
    extensions: {},
  };

  assert.doesNotThrow(() => validateCatalogHistory(latest, previous));

  const changes = {
    version: "1.0.1",
    chatgptApi: "1.0.3",
    release: "binding-26.814.41957-v1.0.1",
    sha256: "d".repeat(64),
  };
  for (const [field, value] of Object.entries(changes)) {
    const changed = structuredClone(previous);
    changed.bindings[unpublishedBindingChatGPT][field] = value;
    assert.throws(
      () => validateCatalogHistory(latest, changed),
      /must retain binding 26\.814\.41957/,
    );
  }

  const otherChatGPT = "26.814.50000";
  const other = structuredClone(previous);
  other.bindings = {
    [otherChatGPT]: {
      ...unpublishedBindingCatalogEntry,
      release: `binding-${otherChatGPT}-v1.0.0`,
    },
  };
  assert.throws(
    () => validateCatalogHistory(latest, other),
    /must retain binding 26\.814\.50000/,
  );

  const schema3 = structuredClone(previous);
  schema3.schemaVersion = 3;
  assert.throws(
    () => validateCatalogHistory(latest, schema3),
    /must retain binding 26\.814\.41957/,
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

test("removes only known unpublished schema-v2 extensions", () => {
  const fixtures = [
    {
      id: "extensions",
      version: "0.1.0",
      nextVersion: "0.1.1",
      chatgptApi: "^1.1.0",
      release: "extension-extensions-v0.1.0",
      sha256:
        "45ae6c2ac40a8792d95a33d7d74ef293427f3d2e17d5724f52548a09a950802c",
    },
    {
      id: "multiple-accounts",
      version: "0.1.11",
      nextVersion: "0.1.12",
      chatgptApi: "^1.0.0",
      release: "extension-multiple-accounts-v0.1.11",
      sha256:
        "b723ee6ff766550643d45a0ea7323f84fa090b061baf3fef552dc1a76f0cb995",
    },
    {
      id: "thread-colors",
      version: "0.1.11",
      nextVersion: "0.1.12",
      chatgptApi: "^1.0.0",
      release: "extension-thread-colors-v0.1.11",
      sha256:
        "c6e6d09cf874348fc9c445515d0e0198567332c4083676250346c0cb85b9dde9",
    },
  ];

  for (const fixture of fixtures) {
    const previous = {
      schemaVersion: 2,
      extensions: {
        [fixture.id]: {
          version: fixture.version,
          compatibility: {
            chatgpt: ">=26.803.41515 <=26.814.41957",
            chatgptApi: fixture.chatgptApi,
          },
          release: fixture.release,
          sha256: fixture.sha256,
        },
      },
    };
    const latest = {
      schemaVersion: 3,
      extensions: {
        [fixture.id]: {
          versions: {
            [fixture.nextVersion]: {
              compatibility: { chatgptApi: fixture.chatgptApi },
              release: `extension-${fixture.id}-v${fixture.nextVersion}`,
              sha256: "a".repeat(64),
            },
          },
        },
      },
    };

    assert.doesNotThrow(() => validateCatalogHistory(latest, previous));

    const changedHash = structuredClone(previous);
    changedHash.extensions[fixture.id].sha256 = "b".repeat(64);
    assert.throws(
      () => validateCatalogHistory(latest, changedHash),
      new RegExp(
        `must retain extension ${fixture.id} ${fixture.version.replaceAll(".", "\\.")}`,
      ),
    );

    const schema3 = structuredClone(previous);
    schema3.schemaVersion = 3;
    schema3.extensions[fixture.id] = {
      versions: {
        [fixture.version]: {
          compatibility: { chatgptApi: fixture.chatgptApi },
          release: fixture.release,
          sha256: fixture.sha256,
        },
      },
    };
    assert.throws(
      () => validateCatalogHistory(latest, schema3),
      new RegExp(
        `must retain extension ${fixture.id} ${fixture.version.replaceAll(".", "\\.")}`,
      ),
    );
  }
});
