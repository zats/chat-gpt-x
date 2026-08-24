import assert from "node:assert/strict";
import test from "node:test";

import { filterUnpublishedComponents } from "./filter-unpublished-component-releases.mjs";

test("repairs only current components without complete published assets", () => {
  const plan = {
    repair: true,
    chatgptApi: { release: "chatgpt-api-v1.4.0" },
    bindings: [
      { release: "binding-old-v1.0.0" },
      { release: "binding-new-v1.0.0" },
    ],
    extensions: [
      { release: "extension-old-v1.0.0" },
      { release: "extension-new-v1.0.0" },
    ],
  };
  const filtered = filterUnpublishedComponents(
    plan,
    new Set([
      "binding-old-v1.0.0",
      "extension-old-v1.0.0",
    ]),
  );

  assert.deepEqual(filtered.chatgptApi, plan.chatgptApi);
  assert.deepEqual(filtered.bindings, [plan.bindings[1]]);
  assert.deepEqual(filtered.extensions, [plan.extensions[1]]);
});

test("keeps an empty repair plan so the index can be republished", () => {
  const plan = {
    repair: true,
    chatgptApi: { release: "chatgpt-api-v1.4.0" },
    bindings: [],
    extensions: [],
  };
  const filtered = filterUnpublishedComponents(
    plan,
    new Set(["chatgpt-api-v1.4.0"]),
  );

  assert.equal(filtered.chatgptApi, null);
  assert.deepEqual(filtered.bindings, []);
  assert.deepEqual(filtered.extensions, []);
  assert.equal(filtered.repair, true);
});
