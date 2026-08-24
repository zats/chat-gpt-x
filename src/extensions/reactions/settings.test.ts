import { describe, expect, mock, test } from "bun:test";
import type {
  PlatformApi,
  SettingsCategory,
  SettingsGroup,
  SettingsItem,
} from "../../platform/types";
import type { ReactionSettings } from "./reaction-settings";
import {
  activateReactionSettings,
  REACTIONS_SETTINGS_PANE_ID,
} from "./settings";

function fixture() {
  let categoryTransform:
    | ((categories: readonly SettingsCategory[]) => readonly SettingsCategory[])
    | undefined;
  let groupTransform:
    | ((groups: readonly SettingsGroup[], pane: SettingsCategory["panes"][number]) => readonly SettingsGroup[])
    | undefined;
  let itemTransform:
    | ((items: readonly SettingsItem[], context: {
        pane: SettingsCategory["panes"][number];
        group: SettingsGroup;
      }) => readonly SettingsItem[])
    | undefined;
  const invalidate = mock(() => {});
  const registration = () => ({ invalidate, dispose() {} });
  const api = {
    settings: {
      ui: {
        textField: (options: unknown) => ({ kind: "textField", options }),
        button: (options: unknown) => ({ kind: "button", options }),
        inline: (controls: readonly unknown[]) => ({ kind: "inline", controls }),
      },
      transformCategories(transform: typeof categoryTransform) {
        categoryTransform = transform;
        return registration();
      },
      transformGroups(transform: typeof groupTransform) {
        groupTransform = transform;
        return registration();
      },
      transformItems(transform: typeof itemTransform) {
        itemTransform = transform;
        return registration();
      },
    },
  } as unknown as PlatformApi;
  return {
    api,
    invalidate,
    categories: () => categoryTransform,
    groups: () => groupTransform,
    items: () => itemTransform,
  };
}

function settingsFixture(): ReactionSettings & {
  readonly setText: ReturnType<typeof mock>;
  readonly reset: ReturnType<typeof mock>;
} {
  let text = "👍👎🤔🤬";
  let emojis: readonly string[] = ["👍", "👎", "🤔", "🤬"];
  const listeners = new Set<(text: string) => void>();
  const setText = mock(async (next: string) => {
    text = next;
    emojis = next.match(new RegExp("\\p{RGI_Emoji}", "gv")) ?? [];
    for (const listener of listeners) listener(text);
  });
  const reset = mock(async () => {
    text = "👍👎🤔🤬";
    emojis = ["👍", "👎", "🤔", "🤬"];
    for (const listener of listeners) listener(text);
  });
  return {
    get text() {
      return text;
    },
    get emojis() {
      return emojis;
    },
    async load() {},
    setText,
    reset,
    subscribe(listener) {
      listeners.add(listener);
      return { dispose: () => listeners.delete(listener) };
    },
  };
}

describe("reactions settings provider", () => {
  test("adds searchable native settings and controls reaction emoji state", async () => {
    const host = fixture();
    const settings = settingsFixture();
    await activateReactionSettings(host.api, settings);

    const categories = host.categories()?.([
      { id: "integrations", label: "Integrations", panes: [] },
    ]);
    const pane = categories?.[0]?.panes[0];
    expect(pane?.id).toBe(REACTIONS_SETTINGS_PANE_ID);
    expect(pane?.keywords).toContain("reaction");
    expect(pane?.keywords).toContain("emoji");

    const groups = host.groups()?.([], pane!);
    const group = groups?.[0];
    expect(group?.keywords).toContain("emoji");
    const items = host.items()?.([], { pane: pane!, group: group! });
    expect(items?.map((item) => item.label)).toEqual(["Emojis"]);
    expect(items?.[0]?.keywords).toContain("reaction");
    const defaultInline = items?.[0]?.control as unknown as {
      kind: string;
      controls: readonly Array<{ kind: string; options: unknown }>;
    };
    expect(defaultInline.kind).toBe("inline");
    expect(defaultInline.controls.map((control) => control.kind)).toEqual([
      "textField",
    ]);

    const textOptions = (defaultInline.controls[0] as {
      options: { onChange(value: string): void | Promise<void> };
    }).options;
    textOptions.onChange("plain text");
    expect(settings.setText).not.toHaveBeenCalled();
    const invalidItems = host.items()?.([], { pane: pane!, group: group! });
    expect(invalidItems?.[0]?.description).toBe("Enter emoji only.");
    const invalidInline = invalidItems?.[0]?.control as unknown as {
      controls: readonly Array<{
        kind: string;
        options: { onClick?(): void | Promise<void> };
      }>;
    };
    expect(invalidInline.controls.map((control) => control.kind)).toEqual([
      "textField",
      "button",
    ]);

    await textOptions.onChange("🎉🚀");
    expect(settings.setText).toHaveBeenCalledWith("🎉🚀");

    const changedItems = host.items()?.([], { pane: pane!, group: group! });
    const changedInline = changedItems?.[0]?.control as unknown as {
      controls: readonly Array<{
        kind: string;
        options: { label?: string; onClick?(): void | Promise<void> };
      }>;
    };
    expect(changedInline.controls[1]?.options.label).toBe("Reset");
    await changedInline.controls[1]?.options.onClick?.();
    expect(settings.reset).toHaveBeenCalledTimes(1);
    const resetItems = host.items()?.([], { pane: pane!, group: group! });
    const resetInline = resetItems?.[0]?.control as unknown as {
      controls: readonly Array<{ options: { value: string } }>;
    };
    const resetTextOptions = resetInline.controls[0]!.options;
    expect(resetTextOptions.value).toBe("👍👎🤔🤬");
    expect(resetInline.controls).toHaveLength(1);
  });
});
