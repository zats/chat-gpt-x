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

function nextTurn(): Promise<void> {
  return new Promise((resolve) => setImmediate(resolve));
}

function installedExtension(enabled: boolean): InstalledExtension {
  return {
    id: "thread-colors",
    name: "Thread Colors",
    description: "Adds native thread colors.",
    version: "1.2.3",
    enabled,
    required: false,
  };
}

function installWindowFocusHarness(): {
  readonly focus: () => void;
  readonly listening: () => boolean;
  readonly restore: () => void;
} {
  type FocusListener = () => void;
  let focusListener: FocusListener | undefined;
  const originalWindow = Object.getOwnPropertyDescriptor(globalThis, "window");
  Object.defineProperty(globalThis, "window", {
    configurable: true,
    value: {
      addEventListener(type: string, listener: FocusListener) {
        assert.equal(type, "focus");
        focusListener = listener;
      },
      removeEventListener(type: string, listener: FocusListener) {
        assert.equal(type, "focus");
        if (focusListener === listener) focusListener = undefined;
      },
    },
  });
  return {
    focus() {
      focusListener?.();
    },
    listening() {
      return focusListener !== undefined;
    },
    restore() {
      if (originalWindow) {
        Object.defineProperty(globalThis, "window", originalWindow);
      } else {
        Reflect.deleteProperty(globalThis, "window");
      }
    },
  };
}

function createSettingsApiHarness() {
  const registrations: string[] = [];
  const itemTransforms: SettingsItemTransform[] = [];
  const toggleStates: boolean[] = [];
  const toggleChanges: Array<(enabled: boolean) => unknown> = [];
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
        toggle(options) {
          toggleStates.push(options.checked);
          toggleChanges.push(options.onChange);
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
    toggleStates,
    toggleChanges,
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

test("manager refreshes an open pane when its renderer regains focus", async (t) => {
  const focusWindow = installWindowFocusHarness();
  t.after(focusWindow.restore);
  let current = Object.freeze([installedExtension(false)]);
  let listCalls = 0;
  const management = {
    async list() {
      listCalls += 1;
      return current;
    },
    async setEnabled() {
      return current;
    },
  } as ExtensionManagement;
  const harness = createSettingsApiHarness();
  const registrations = await activateExtensions(harness.api, management);
  const transform = harness.itemTransforms[0];
  assert.ok(transform);
  const context = {
    pane: { id: "extensions.installed", label: "Extensions" },
    group: { id: "extensions.installed", items: [] },
  };

  assert.equal(listCalls, 1);
  assert.equal(harness.itemInvalidations, 1);
  assert.equal(transform([], context).length, 1);
  assert.equal(harness.toggleStates.at(-1), false);
  await new Promise<void>((resolve) => setImmediate(resolve));
  assert.equal(listCalls, 2);
  assert.equal(harness.itemInvalidations, 1);

  current = Object.freeze([installedExtension(true)]);
  focusWindow.focus();
  await nextTurn();
  assert.equal(listCalls, 3);
  assert.equal(harness.itemInvalidations, 2);
  assert.equal(transform([], context).length, 1);
  assert.equal(harness.toggleStates.at(-1), true);
  await nextTurn();
  assert.equal(harness.itemInvalidations, 2);

  registrations.at(-1)?.dispose();
  assert.equal(focusWindow.listening(), false);
});

test("focus queues one trailing refresh behind an in-flight focus read", async (t) => {
  const focusWindow = installWindowFocusHarness();
  t.after(focusWindow.restore);
  const staleRead = deferred<readonly InstalledExtension[]>();
  const staleReadStarted = deferred<void>();
  let listCalls = 0;
  const management = {
    list() {
      listCalls += 1;
      if (listCalls === 1) {
        return Promise.resolve(Object.freeze([installedExtension(false)]));
      }
      if (listCalls === 2) {
        staleReadStarted.resolve();
        return staleRead.promise;
      }
      return Promise.resolve(Object.freeze([installedExtension(true)]));
    },
    async setEnabled() {
      return Object.freeze([installedExtension(true)]);
    },
  } as ExtensionManagement;
  const harness = createSettingsApiHarness();
  const registrations = await activateExtensions(harness.api, management);
  const transform = harness.itemTransforms[0];
  assert.ok(transform);
  const context = {
    pane: { id: "extensions.installed", label: "Extensions" },
    group: { id: "extensions.installed", items: [] },
  };

  focusWindow.focus();
  await staleReadStarted.promise;
  focusWindow.focus();
  focusWindow.focus();
  staleRead.resolve(Object.freeze([installedExtension(false)]));
  await nextTurn();

  assert.equal(listCalls, 3);
  assert.equal(harness.itemInvalidations, 2);
  assert.equal(transform([], context).length, 1);
  assert.equal(harness.toggleStates.at(-1), true);
  await nextTurn();
  registrations.at(-1)?.dispose();
});

test("manager serializes a focus refresh behind an in-flight enablement", async (t) => {
  const focusWindow = installWindowFocusHarness();
  t.after(focusWindow.restore);
  const enablementRelease = deferred<void>();
  const enablementStarted = deferred<void>();
  const refreshRelease = deferred<void>();
  const refreshStarted = deferred<void>();
  let current = Object.freeze([installedExtension(false)]);
  let listCalls = 0;
  let setCalls = 0;
  const management = {
    async list() {
      listCalls += 1;
      if (listCalls === 3) {
        const captured = current;
        refreshStarted.resolve();
        await refreshRelease.promise;
        return captured;
      }
      return current;
    },
    async setEnabled(id: string, enabled: boolean) {
      setCalls += 1;
      assert.equal(id, "thread-colors");
      assert.equal(enabled, true);
      enablementStarted.resolve();
      await enablementRelease.promise;
      current = Object.freeze([installedExtension(true)]);
      return current;
    },
  } as ExtensionManagement;
  const harness = createSettingsApiHarness();
  const registrations = await activateExtensions(harness.api, management);
  const transform = harness.itemTransforms[0];
  assert.ok(transform);
  const context = {
    pane: { id: "extensions.installed", label: "Extensions" },
    group: { id: "extensions.installed", items: [] },
  };

  assert.equal(transform([], context).length, 1);
  await nextTurn();
  assert.equal(listCalls, 2);
  const toggle = harness.toggleChanges.at(-1);
  assert.ok(toggle);
  const enablement = Promise.resolve(toggle(true));
  await enablementStarted.promise;
  assert.equal(setCalls, 1);

  focusWindow.focus();
  await Promise.resolve();
  assert.equal(listCalls, 2);
  enablementRelease.resolve();
  await refreshStarted.promise;
  assert.equal(listCalls, 3);
  refreshRelease.resolve();
  await enablement;
  await nextTurn();

  assert.equal(harness.itemInvalidations, 2);
  assert.equal(transform([], context).length, 1);
  assert.equal(harness.toggleStates.at(-1), true);
  await nextTurn();
  registrations.at(-1)?.dispose();
});
