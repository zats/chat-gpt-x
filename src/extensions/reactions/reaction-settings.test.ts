import { describe, expect, mock, test } from "bun:test";
import type { ExtensionStorage } from "../../platform/utilities/extension-storage";
import {
  DEFAULT_REACTION_TEXT,
  createReactionSettings,
  parseReactionText,
} from "./reaction-settings";

function memoryStorage(initial?: string): {
  readonly storage: ExtensionStorage;
  readonly read: () => string | undefined;
  readonly writes: ReturnType<typeof mock>;
  readonly deletes: ReturnType<typeof mock>;
} {
  let contents = initial;
  const writes = mock(async (_path: string, next: string) => {
    contents = next;
  });
  const deletes = mock(async (_path: string) => {
    contents = undefined;
  });
  return {
    storage: {
      async listFiles() {
        return contents === undefined ? [] : ["settings.json"];
      },
      async readTextFile() {
        return contents;
      },
      writeTextFile: writes,
      deleteFile: deletes,
    },
    read: () => contents,
    writes,
    deletes,
  };
}

describe("reaction settings", () => {
  test("accepts complete RGI emoji sequences and rejects other text", () => {
    expect(parseReactionText(DEFAULT_REACTION_TEXT)).toEqual([
      "👍",
      "👎",
      "🤔",
      "🤬",
    ]);
    expect(parseReactionText("👨‍👩‍👧‍👦🇺🇸👍🏽❤️")).toEqual([
      "👨‍👩‍👧‍👦",
      "🇺🇸",
      "👍🏽",
      "❤️",
    ]);
    expect(parseReactionText("")).toBeUndefined();
    expect(parseReactionText("👍 text")).toBeUndefined();
  });

  test("loads, persists, and resets one extension-scoped settings file", async () => {
    const memory = memoryStorage(JSON.stringify({ emojis: "🎉✅" }));
    const settings = createReactionSettings(memory.storage);
    const changes: string[] = [];
    const subscription = settings.subscribe((text) => changes.push(text));

    await settings.load();
    expect(settings.text).toBe("🎉✅");
    expect(settings.emojis).toEqual(["🎉", "✅"]);
    await settings.setText("🔥🚀");
    expect(JSON.parse(memory.read() ?? "null")).toEqual({ emojis: "🔥🚀" });
    await expect(settings.setText("not emoji")).rejects.toThrow(
      "RGI emoji",
    );
    await settings.reset();
    expect(settings.text).toBe(DEFAULT_REACTION_TEXT);
    expect(memory.read()).toBeUndefined();
    expect(changes).toEqual(["🎉✅", "🔥🚀", DEFAULT_REACTION_TEXT]);
    expect(memory.writes).toHaveBeenCalledTimes(1);
    expect(memory.deletes).toHaveBeenCalledTimes(1);
    subscription.dispose();
  });
});
