import assert from "node:assert/strict";
import { test } from "node:test";

import { validateRebindBinding } from "./validate-rebind-binding.mjs";

const appVersion = "26.730.61639";

test("accepts a new 1.0.0 binding", () => {
  assert.doesNotThrow(() =>
    validateRebindBinding({
      appVersion,
      baseManifest: null,
      currentManifest: { chatgpt: appVersion, version: "1.0.0" },
      mode: "new",
    }),
  );
});

test("rejects a new binding when the directory existed", () => {
  assert.throws(
    () =>
      validateRebindBinding({
        appVersion,
        baseManifest: { chatgpt: appVersion, version: "1.0.2" },
        currentManifest: { chatgpt: appVersion, version: "1.0.3" },
        mode: "new",
      }),
    /already existed/,
  );
});

test("accepts exactly one patch increment for a correction", () => {
  assert.doesNotThrow(() =>
    validateRebindBinding({
      appVersion,
      baseManifest: { chatgpt: appVersion, version: "1.4.9" },
      currentManifest: { chatgpt: appVersion, version: "1.4.10" },
      mode: "correction",
    }),
  );
  assert.throws(
    () =>
      validateRebindBinding({
        appVersion,
        baseManifest: { chatgpt: appVersion, version: "1.4.9" },
        currentManifest: { chatgpt: appVersion, version: "1.5.0" },
        mode: "correction",
      }),
    /must increase.*1\.4\.10/,
  );
});
