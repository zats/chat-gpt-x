import assert from "node:assert/strict";
import test from "node:test";
import type {
  PlatformApi,
  SettingsCategoryTransform,
  SettingsControl,
  SettingsGroupTransform,
  SettingsItemTransform,
  SettingsTransformRegistration,
  SettingsUiApi,
} from "../../platform/types";
import type {
  ExtensionManagement,
  InstalledExtension,
} from "../../platform/utilities/extension-management.ts";
import { activateExtensions, createExtensionRows } from "./extensions.ts";

function deferred<T>(): {
  readonly promise: Promise<T>;
  readonly resolve: (value: T) => void;
} {
  let resolve!: (value: T) => void;
  const promise = new Promise<T>((finish) => {
    resolve = finish;
  });
  return { promise, resolve };
}

function createSettingsApiHarness() {
  const registrations: string[] = [];
  const itemTransforms: SettingsItemTransform[] = [];
  let itemInvalidations = 0;
  const registration = (
    invalidate?: () => void,
  ): SettingsTransformRegistration => ({
    dispose() {},
    invalidate: invalidate ?? (() => {}),
  });
  const api = {
    settings: {
      ui: {
        toggle() {
          return {} as SettingsControl;
        },
      },
      transformCategories(_transform: SettingsCategoryTransform) {
        registrations.push("categories");
        return registration();
      },
      transformGroups(_transform: SettingsGroupTransform) {
        registrations.push("groups");
        return registration();
      },
      transformItems(transform: SettingsItemTransform) {
        registrations.push("items");
        itemTransforms.push(transform);
        return registration(() => {
          itemInvalidations += 1;
        });
      },
    },
  } as PlatformApi;
  return {
    api,
    registrations,
    itemTransforms,
    get itemInvalidations() {
      return itemInvalidations;
    },
  };
}

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

test("manager settings transformers register before a pending extension list resolves", async () => {
  const listing = deferred<readonly InstalledExtension[]>();
  const harness = createSettingsApiHarness();
  const management = {
    list: () => listing.promise,
    async setEnabled() {
      return [];
    },
  } as ExtensionManagement;

  const activation = activateExtensions(harness.api, management);
  assert.deepEqual(harness.registrations, ["categories", "groups", "items"]);

  harness.api.settings.transformCategories((categories) => categories);
  harness.api.settings.transformGroups((groups) => groups);
  harness.api.settings.transformItems((items) => items);
  assert.deepEqual(harness.registrations, [
    "categories",
    "groups",
    "items",
    "categories",
    "groups",
    "items",
  ]);

  listing.resolve([]);
  await activation;
});

test("manager settings items refresh after the extension list resolves", async () => {
  const listing = deferred<readonly InstalledExtension[]>();
  const harness = createSettingsApiHarness();
  const management = {
    list: () => listing.promise,
    async setEnabled() {
      return [];
    },
  } as ExtensionManagement;

  const activation = activateExtensions(harness.api, management);
  const transform = harness.itemTransforms[0];
  assert.ok(transform);
  const context = {
    pane: { id: "extensions.installed", label: "Extensions" },
    group: { id: "extensions.installed", items: [] },
  };
  assert.deepEqual(transform([], context), []);
  assert.equal(harness.itemInvalidations, 0);

  listing.resolve([
    {
      id: "thread-colors",
      name: "Thread Colors",
      description: "Adds native thread colors.",
      version: "1.2.3",
      enabled: true,
      required: false,
    },
  ]);
  await activation;

  assert.equal(harness.itemInvalidations, 1);
  const items = transform([], context);
  assert.equal(items.length, 1);
  assert.equal(items[0]?.id, "extensions.item.thread-colors");
  assert.equal(items[0]?.label, "Thread Colors");
});
