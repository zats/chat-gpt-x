import assert from "node:assert/strict";
import test from "node:test";

import {
  classifyPath,
  compareVersions,
  isBootstrap,
  releaseTag,
} from "./component-releases.mjs";

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
