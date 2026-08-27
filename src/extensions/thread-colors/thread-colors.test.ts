import assert from "node:assert/strict";
import test from "node:test";

import type {
  AppearanceColorScheme,
  ColorPickerOptions,
  ColorPickerSession,
  HeaderCssProperties,
  PlatformApi,
  ThreadContext,
  ThreadMenuActionItem,
  ThreadMenuItem,
  ThreadMenuTransform,
} from "../../platform/types";
import {
  COLOR_ITEM_ID,
  CUSTOM_COLOR_ITEM_ID,
  PALETTE_ICON_SVG,
  THREAD_COLORS,
  activate,
  apcaContrast,
  complementaryColor,
  customThemeColors,
  deactivate,
  foregroundForBackground,
  transformThreadMenuItems,
} from "./thread-colors.ts";

function action(id: string, label: string): ThreadMenuActionItem {
  return { kind: "action", id, label, origin: "app" };
}

test("Color is inserted immediately before the first native separator", () => {
  const items: readonly ThreadMenuItem[] = [
    action("app.pin", "Pin"),
    action("app.rename", "Rename"),
    { kind: "separator", id: "app.separator", origin: "app" },
    action("app.copy", "Copy"),
  ];
  const result = transformThreadMenuItems(items, () => {}, () => {});
  assert.deepEqual(
    result.map((item) => item.id),
    ["app.pin", "app.rename", COLOR_ITEM_ID, "app.separator", "app.copy"],
  );
});

test("Color appends when ChatGPT supplies no separator", () => {
  const items: readonly ThreadMenuItem[] = [action("app.rename", "Rename")];
  assert.equal(
    transformThreadMenuItems(items, () => {}, () => {}).at(-1)?.id,
    COLOR_ITEM_ID,
  );
});

test("Color uses the palette icon and exact requested swatches", () => {
  const color = transformThreadMenuItems([], () => {}, () => {})[0];
  assert.equal(color?.kind, "action");
  if (color?.kind !== "action") return;
  assert.equal(color.label, "Color");
  assert.deepEqual(color.icon, { kind: "svg", source: PALETTE_ICON_SVG });
  assert.deepEqual(
    color.items?.map((item) =>
      item.kind === "action"
        ? {
            id: item.id,
            label: item.label,
            icon: item.icon,
            disabled: item.disabled,
          }
        : item,
    ),
    [
      ...THREAD_COLORS.map(({ id, label, icon }) => ({
        id: `thread-colors.${id}`,
        label,
        icon,
        disabled: undefined,
      })),
      {
        id: CUSTOM_COLOR_ITEM_ID,
        label: "Custom",
        icon: { kind: "color", light: "#9B9B9B", dark: "#9B9B9B" },
        disabled: undefined,
      },
    ],
  );
});

test("custom colors preserve the selected scheme and generate the other in OKLCH", () => {
  assert.deepEqual(customThemeColors("#336699", "light"), {
    light: "#336699",
    dark: "#023C6B",
  });
  assert.deepEqual(customThemeColors("#336699", "dark"), {
    light: "#7DB3EA",
    dark: "#336699",
  });
  assert.equal(complementaryColor("#FFFFFF", "dark"), "#000000");
  assert.equal(complementaryColor("#000000", "light"), "#FFFFFF");
});

test("presets keep exact backgrounds and choose the higher APCA contrast foreground", () => {
  const expected = [
    ["blue", "#3A83F7", "#3A83F7", "#FFFFFF", "#FFFFFF"],
    ["green", "#53B559", "#53B559", "#FFFFFF", "#FFFFFF"],
    ["yellow", "#F6C543", "#F6C543", "#000000", "#000000"],
    ["pink", "#F077AF", "#F077AF", "#FFFFFF", "#FFFFFF"],
    ["orange", "#EE7C37", "#EE7C37", "#FFFFFF", "#FFFFFF"],
    ["purple", "#A67DE2", "#A67DE2", "#FFFFFF", "#FFFFFF"],
    ["black", "#000000", "#000000", "#FFFFFF", "#FFFFFF"],
  ] as const;

  assert.deepEqual(
    THREAD_COLORS.slice(1).map((preset) => [
      preset.id,
      preset.properties["--header-background-color"]?.light,
      preset.properties["--header-background-color"]?.dark,
      preset.properties["--header-foreground-color"]?.light,
      preset.properties["--header-foreground-color"]?.dark,
    ]),
    expected,
  );

  for (const preset of THREAD_COLORS) {
    const background = preset.properties["--header-background-color"];
    const foreground = preset.properties["--header-foreground-color"];
    if (!background || !foreground) continue;
    for (const theme of ["light", "dark"] as const) {
      const expected = foregroundForBackground(background[theme]);
      assert.equal(foreground[theme], expected, `${preset.label} ${theme}`);
      assert.ok(
        Math.abs(apcaContrast(expected, background[theme])) >= 45,
        `${preset.label} ${theme} reaches APCA Lc45`,
      );
      assert.ok(
        Math.abs(apcaContrast(expected, background[theme])) >=
          Math.abs(
            apcaContrast(
              expected === "#000000" ? "#FFFFFF" : "#000000",
              background[theme],
            ),
          ),
        `${preset.label} ${theme} uses the stronger contrast`,
      );
    }
  }
});

test("thread changes and color choices apply complete foreground/background pairs", async () => {
  const updates: HeaderCssProperties[] = [];
  const writes: Array<{ path: string; contents: string }> = [];
  let transform: ThreadMenuTransform | undefined;
  const threadListeners = new Set<
    (thread: ThreadContext | undefined) => void
  >();
  let currentThread: ThreadContext | undefined = {
    threadId: "thread-1",
    title: "First",
  };
  let menuDisposed = false;
  let threadListDisposed = false;
  let threadListProvider:
    | Parameters<PlatformApi["threads"]["list"]["registerItem"]>[0]
    | undefined;
  const threadListInvalidations: Array<string | undefined> = [];
  let appearanceDisposed = false;
  let threadSubscriptionDisposed = false;
  let colorScheme: AppearanceColorScheme = "light";
  let pickerOptions: ColorPickerOptions | undefined;
  let pickerResolve: ((color: `#${string}` | undefined) => void) | undefined;
  let pickerDisposed = false;
  globalThis.__CGPTX_RUNTIME__ = {
    async request(method, parameters) {
      if (method === "extension-storage.read-text") {
        return JSON.stringify({
          colors: {
            "thread-1": { type: "preset", id: "blue" },
            "thread-2": { type: "preset", id: "black" },
          },
        });
      }
      if (method === "extension-storage.write-text") {
        writes.push({
          path: String(parameters.path),
          contents: String(parameters.contents),
        });
      }
      return null;
    },
  };
  const api = {
    menus: {
      thread: {
        transformItems(nextTransform: ThreadMenuTransform) {
          transform = nextTransform;
          return {
            dispose() {
              menuDisposed = true;
            },
          };
        },
      },
    },
    threads: {
      list: {
        registerItem(provider) {
          threadListProvider = provider;
          return {
            invalidate(threadId?: string) {
              threadListInvalidations.push(threadId);
            },
            dispose() {
              threadListDisposed = true;
            },
          };
        },
      },
      getCurrent() {
        return currentThread;
      },
      subscribe(listener: (thread: ThreadContext | undefined) => void) {
        threadListeners.add(listener);
        listener(currentThread);
        return {
          dispose() {
            threadSubscriptionDisposed = true;
            threadListeners.delete(listener);
          },
        };
      },
    },
    appearance: {
      getColorScheme() {
        return colorScheme;
      },
      openColorPicker(options: ColorPickerOptions): ColorPickerSession {
        pickerOptions = options;
        pickerDisposed = false;
        const result = new Promise<`#${string}` | undefined>((resolve) => {
          pickerResolve = resolve;
        });
        return {
          result,
          dispose() {
            pickerDisposed = true;
            pickerResolve?.(undefined);
          },
        };
      },
      header: {
        registerProperties(properties: HeaderCssProperties) {
          updates.push(properties);
          return {
            update(nextProperties: HeaderCssProperties) {
              updates.push(nextProperties);
            },
            dispose() {
              appearanceDisposed = true;
            },
          };
        },
      },
    },
  } as PlatformApi;
  const waitFor = async (condition: () => boolean) => {
    for (let attempt = 0; attempt < 100; attempt += 1) {
      if (condition()) return;
      await new Promise((resolve) => setTimeout(resolve, 0));
    }
    assert.fail("timed out waiting for thread-colors state");
  };
  const selectThread = (thread: ThreadContext | undefined) => {
    currentThread = thread;
    for (const listener of threadListeners) listener(thread);
  };
  const assertCompletePair = (properties: HeaderCssProperties) => {
    assert.ok(properties["--header-background-color"]);
    assert.ok(properties["--header-foreground-color"]);
  };

  activate(api);
  await waitFor(() => updates.length >= 2);
  const originalDocument = globalThis.document;
  const indicator = {
    style: {} as CSSStyleDeclaration,
    setAttribute() {},
  } as HTMLElement;
  Object.defineProperty(globalThis, "document", {
    configurable: true,
    value: { createElement: () => indicator },
  });
  try {
    threadListProvider?.({ threadId: "thread-1", title: "First" })?.view();
    assert.equal(indicator.style.width, "3px");
    assert.equal(indicator.style.height, "100%");
  } finally {
    if (originalDocument === undefined) {
      Reflect.deleteProperty(globalThis, "document");
    } else {
      Object.defineProperty(globalThis, "document", {
        configurable: true,
        value: originalDocument,
      });
    }
  }
  assert.equal(
    typeof threadListProvider?.({ threadId: "thread-1", title: "First" })
      ?.view,
    "function",
  );
  assert.equal(
    threadListProvider?.({ threadId: "thread-3", title: "Third" }),
    undefined,
  );
  assert.deepEqual(updates.at(-1), THREAD_COLORS[1].properties);
  assertCompletePair(updates.at(-1) ?? {});

  selectThread({ threadId: "thread-2", title: "Second" });
  assert.deepEqual(updates.at(-1), THREAD_COLORS[7].properties);
  assertCompletePair(updates.at(-1) ?? {});

  selectThread({ threadId: "thread-3", title: "Third" });
  assert.deepEqual(updates.at(-1), {});
  const parent = transform?.([], currentThread)[0];
  assert.equal(parent?.kind, "action");
  if (parent?.kind !== "action") return;
  const purple = parent.items?.find(
    (item) => item.id === "thread-colors.purple",
  );
  assert.equal(purple?.kind, "action");
  if (purple?.kind !== "action") return;
  purple.onClick?.();
  assert.equal(threadListInvalidations.at(-1), "thread-3");
  assert.equal(
    typeof threadListProvider?.({ threadId: "thread-3", title: "Third" })
      ?.view,
    "function",
  );
  assert.deepEqual(updates.at(-1), THREAD_COLORS[6].properties);
  assertCompletePair(updates.at(-1) ?? {});
  await waitFor(() => writes.length === 1);
  assert.equal(writes[0].path, "settings.json");
  assert.deepEqual(JSON.parse(writes[0].contents), {
    colors: {
      "thread-1": { type: "preset", id: "blue" },
      "thread-2": { type: "preset", id: "black" },
      "thread-3": { type: "preset", id: "purple" },
    },
  });

  const defaultChoice = parent.items?.find(
    (item) => item.id === "thread-colors.default",
  );
  assert.equal(defaultChoice?.kind, "action");
  if (defaultChoice?.kind !== "action") return;
  defaultChoice.onClick?.();
  assert.equal(threadListInvalidations.at(-1), "thread-3");
  assert.equal(
    threadListProvider?.({ threadId: "thread-3", title: "Third" }),
    undefined,
  );
  assert.deepEqual(updates.at(-1), {});
  await waitFor(() => writes.length === 2);
  assert.deepEqual(JSON.parse(writes[1].contents), {
    colors: {
      "thread-1": { type: "preset", id: "blue" },
      "thread-2": { type: "preset", id: "black" },
    },
  });

  const customChoice = parent.items?.find(
    (item) => item.id === CUSTOM_COLOR_ITEM_ID,
  );
  assert.equal(customChoice?.kind, "action");
  if (customChoice?.kind !== "action") return;
  colorScheme = "light";
  customChoice.onClick?.();
  assert.equal(pickerOptions?.initialColor, "#FFFFFF");
  pickerOptions?.onChange("#336699");
  assert.deepEqual(
    updates.at(-1),
    {
      "--header-background-color": {
        light: "#336699",
        dark: "#023C6B",
      },
      "--header-foreground-color": {
        light: "#FFFFFF",
        dark: "#FFFFFF",
      },
    },
  );
  pickerResolve?.("#336699");
  await waitFor(() => writes.length === 3);
  assert.equal(threadListInvalidations.at(-1), "thread-3");
  assert.deepEqual(JSON.parse(writes[2].contents), {
    colors: {
      "thread-1": { type: "preset", id: "blue" },
      "thread-2": { type: "preset", id: "black" },
      "thread-3": { type: "custom", light: "#336699", dark: "#023C6B" },
    },
  });

  customChoice.onClick?.();
  pickerOptions?.onChange("#FF0000");
  pickerResolve?.(undefined);
  await waitFor(
    () =>
      updates.at(-1)?.["--header-background-color"]?.light === "#336699",
  );
  assert.equal(writes.length, 3);

  customChoice.onClick?.();
  selectThread({ threadId: "thread-1", title: "First" });
  assert.equal(pickerDisposed, true);
  assert.deepEqual(updates.at(-1), THREAD_COLORS[1].properties);

  assertCompletePair(updates.at(-1) ?? {});

  deactivate();
  assert.equal(menuDisposed, true);
  assert.equal(threadListDisposed, true);
  assert.equal(appearanceDisposed, true);
  assert.equal(threadSubscriptionDisposed, true);
  globalThis.__CGPTX_RUNTIME__ = undefined;
});
