import assert from "node:assert/strict";
import { access, mkdtemp, readFile, rm, stat } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { test } from "node:test";

import {
  materializeCIAuthentication,
  selectCIAuthentication,
} from "./materialize-ci-auth.mjs";

const apiKey = JSON.stringify({
  auth_mode: "apikey",
  OPENAI_API_KEY: "test-api-key",
  tokens: null,
});
const primary = JSON.stringify({
  auth_mode: "chatgpt",
  tokens: {
    access_token: "primary-access",
    refresh_token: "primary-refresh",
  },
});
const secondary = JSON.stringify({
  auth_mode: "chatgpt",
  tokens: {
    access_token: "secondary-access",
    refresh_token: "secondary-refresh",
  },
});

test("selects two-account ChatGPT authentication", () => {
  assert.deepEqual(
    selectCIAuthentication({ primaryJson: primary, secondaryJson: secondary }),
    { mode: "chatgpt", primaryJson: primary, secondaryJson: secondary },
  );
});

test("selects API-key authentication without a secondary account", () => {
  assert.deepEqual(selectCIAuthentication({ primaryJson: apiKey }), {
    mode: "apikey",
    primaryJson: apiKey,
    secondaryJson: null,
  });
});

test("ignores a secondary value when primary selects API-key mode", () => {
  assert.equal(
    selectCIAuthentication({ primaryJson: apiKey, secondaryJson: secondary })
      .mode,
    "apikey",
  );
});

test("fails only after neither supported mode is complete", () => {
  assert.throws(
    () => selectCIAuthentication({ primaryJson: "" }),
    /PRIMARY_AUTH_JSON is required/,
  );
  assert.throws(
    () => selectCIAuthentication({ primaryJson: primary }),
    /SECONDARY_AUTH_JSON is required/,
  );
  assert.throws(
    () =>
      selectCIAuthentication({
        primaryJson: JSON.stringify({
          auth_mode: "apikey",
          OPENAI_API_KEY: "",
          tokens: null,
        }),
      }),
    /API-key authentication is malformed/,
  );
});

test("materializes only one private file for API-key mode", async () => {
  const root = await mkdtemp(path.join(os.tmpdir(), "chatgptx-ci-auth-test-"));
  try {
    const authRoot = path.join(root, "auth");
    const result = await materializeCIAuthentication({
      authRoot,
      candidateRoot: path.join(root, "candidates"),
      primaryJson: apiKey,
      secondaryJson: "",
    });

    assert.equal(result.mode, "apikey");
    assert.equal(await readFile(result.primaryPath, "utf8"), apiKey);
    assert.equal((await stat(result.primaryPath)).mode & 0o777, 0o600);
    await assert.rejects(
      access(path.join(authRoot, "secondary.json")),
      /ENOENT/,
    );
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

test("materializes and seeds both ChatGPT account files", async () => {
  const root = await mkdtemp(path.join(os.tmpdir(), "chatgptx-ci-auth-test-"));
  try {
    const authRoot = path.join(root, "auth");
    const candidateRoot = path.join(root, "candidates");
    const result = await materializeCIAuthentication({
      authRoot,
      candidateRoot,
      primaryJson: primary,
      secondaryJson: secondary,
    });

    assert.equal(result.mode, "chatgpt");
    assert.equal(await readFile(result.secondaryPath, "utf8"), secondary);
    assert.equal(
      await readFile(path.join(candidateRoot, "primary.json"), "utf8"),
      primary,
    );
    assert.equal(
      await readFile(path.join(candidateRoot, "secondary.json"), "utf8"),
      secondary,
    );
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});
