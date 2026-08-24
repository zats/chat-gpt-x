import assert from "node:assert/strict";
import {
  chmod,
  mkdtemp,
  readFile,
  rm,
  stat,
  writeFile,
} from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { test } from "node:test";

import { suppressOptionalProductUi } from "./suppress-optional-product-ui.mjs";

test("creates the shared optional product UI state", async () => {
  const root = await mkdtemp(path.join(os.tmpdir(), "chatgptx-ui-state-test-"));
  try {
    const codexHome = path.join(root, "codex");
    await suppressOptionalProductUi(codexHome);

    const statePath = path.join(codexHome, ".codex-global-state.json");
    const state = JSON.parse(await readFile(statePath, "utf8"));
    const atomState = state["electron-persisted-atom-state"];
    assert.equal(atomState["electron:onboarding-override"], "app");
    assert.equal(
      atomState["electron:onboarding-projectless-completed"],
      true,
    );
    assert.equal(atomState["electron:onboarding-welcome-pending"], false);
    assert.equal(
      atomState["chatgpt-migration-announcement-completed-v1"],
      true,
    );
    assert.equal((await stat(statePath)).mode & 0o777, 0o600);
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

test("preserves unrelated state and the existing file mode", async () => {
  const root = await mkdtemp(path.join(os.tmpdir(), "chatgptx-ui-state-test-"));
  try {
    const statePath = path.join(root, ".codex-global-state.json");
    await writeFile(
      statePath,
      `${JSON.stringify({
        "electron-persisted-atom-state": { retained: "value" },
        unrelated: { retained: true },
      })}\n`,
    );
    await chmod(statePath, 0o640);

    await suppressOptionalProductUi(root);

    const state = JSON.parse(await readFile(statePath, "utf8"));
    assert.deepEqual(state.unrelated, { retained: true });
    assert.equal(state["electron-persisted-atom-state"].retained, "value");
    assert.equal((await stat(statePath)).mode & 0o777, 0o640);
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

test("rejects an invalid persisted atom state", async () => {
  const root = await mkdtemp(path.join(os.tmpdir(), "chatgptx-ui-state-test-"));
  try {
    await writeFile(
      path.join(root, ".codex-global-state.json"),
      '{"electron-persisted-atom-state":[]}\n',
    );
    await assert.rejects(
      suppressOptionalProductUi(root),
      /invalid electron-persisted-atom-state value/,
    );
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});
