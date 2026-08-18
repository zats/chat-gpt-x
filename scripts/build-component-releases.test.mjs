import assert from "node:assert/strict";
import test from "node:test";

import { applyIndexHashes } from "./build-component-releases.mjs";

test("writes deterministic hashes to matching schema-v3 entries", () => {
  const index = {
    chatgptApis: {
      "1.0.2": { release: "chatgpt-api-v1.0.2", sha256: "0".repeat(64) },
    },
    bindings: {
      "26.721.41059": {
        release: "binding-26.721.41059-v1.0.0",
        sha256: "0".repeat(64),
      },
    },
    extensions: {
      "thread-colors": {
        versions: {
          "0.1.0": {
            release: "extension-thread-colors-v0.1.0",
            sha256: "d".repeat(64),
          },
          "0.1.1": {
            release: "extension-thread-colors-v0.1.1",
            sha256: "0".repeat(64),
          },
        },
      },
    },
  };
  const artifacts = [
    {
      kind: "chatgptApi",
      version: "1.0.2",
      release: "chatgpt-api-v1.0.2",
      sha256: "a".repeat(64),
    },
    {
      kind: "binding",
      chatgpt: "26.721.41059",
      release: "binding-26.721.41059-v1.0.0",
      sha256: "b".repeat(64),
    },
    {
      kind: "extension",
      id: "thread-colors",
      version: "0.1.1",
      release: "extension-thread-colors-v0.1.1",
      sha256: "c".repeat(64),
    },
  ];

  applyIndexHashes(index, artifacts);

  assert.equal(index.chatgptApis["1.0.2"].sha256, "a".repeat(64));
  assert.equal(index.bindings["26.721.41059"].sha256, "b".repeat(64));
  assert.equal(
    index.extensions["thread-colors"].versions["0.1.1"].sha256,
    "c".repeat(64),
  );
  assert.equal(
    index.extensions["thread-colors"].versions["0.1.0"].sha256,
    "d".repeat(64),
  );
});

test("rejects a release that does not match its schema-v3 entry", () => {
  assert.throws(
    () =>
      applyIndexHashes(
        {
          chatgptApis: {},
          bindings: {},
          extensions: {
            "thread-colors": {
              versions: {
                "0.1.0": {
                  release: "extension-thread-colors-v0.1.0",
                  sha256: "0".repeat(64),
                },
              },
            },
          },
        },
        [
          {
            kind: "extension",
            id: "thread-colors",
            version: "0.1.1",
            release: "extension-thread-colors-v0.1.1",
            sha256: "c".repeat(64),
          },
        ],
      ),
    /no matching entry/,
  );
});
