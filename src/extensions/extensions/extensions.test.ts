import assert from "node:assert/strict";
import test from "node:test";
import type { SettingsControl, SettingsUiApi } from "../../platform/types";
import { createExtensionRows } from "./extensions.ts";

test("extension rows use package titles and descriptions as search text", () => {
  const controls: Array<{ checked: boolean; disabled?: boolean }> = [];
  const ui = {
    toggle(options) {
      controls.push(options);
      return {} as SettingsControl;
    },
  } as SettingsUiApi;
  const rows = createExtensionRows(
    [
      {
        id: "thread-colors",
        name: "Thread Colors",
        description: "Adds native thread colors.",
        version: "1.2.3",
        enabled: false,
        required: false,
      },
    ],
    ui,
    () => {},
  );

  assert.equal(rows[0]?.label, "Thread Colors");
  assert.equal(rows[0]?.description, "Adds native thread colors.");
  assert.deepEqual(rows[0]?.keywords, ["thread-colors", "1.2.3"]);
  assert.equal(controls[0]?.checked, false);
  assert.equal(controls[0]?.disabled, false);
});

test("the required manager row cannot disable itself", () => {
  let disabled: boolean | undefined;
  const ui = {
    toggle(options) {
      disabled = options.disabled;
      return {} as SettingsControl;
    },
  } as SettingsUiApi;
  createExtensionRows(
    [
      {
        id: "extensions",
        name: "Extensions",
        description: "Manages extensions.",
        version: "0.1.0",
        enabled: true,
        required: true,
      },
    ],
    ui,
    () => {},
  );
  assert.equal(disabled, true);
});
