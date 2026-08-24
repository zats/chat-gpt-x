import type { Disposable } from "../../platform/types";
import {
  createExtensionStorage,
  type ExtensionStorage,
} from "../../platform/utilities/extension-storage";

const EXTENSION_ID = "reactions";
const SETTINGS_FILE = "settings.json";
const SHARED_SETTINGS_KEY = Symbol.for("chatgptx.reactions.settings");
const rgiEmojiPattern = new RegExp("\\p{RGI_Emoji}", "gv");

export const DEFAULT_REACTION_TEXT = "👍👎🤔🤬";

export interface ReactionSettings {
  readonly text: string;
  readonly emojis: readonly string[];
  load(): Promise<void>;
  setText(text: string): Promise<void>;
  reset(): Promise<void>;
  subscribe(listener: (text: string) => void): Disposable;
}

export function parseReactionText(text: string): readonly string[] | undefined {
  if (typeof text !== "string" || text.length === 0) return undefined;
  const emojis = text.match(rgiEmojiPattern);
  if (!emojis || emojis.join("") !== text) return undefined;
  return Object.freeze(emojis);
}

export function createReactionSettings(
  storage: ExtensionStorage,
): ReactionSettings {
  let text = DEFAULT_REACTION_TEXT;
  let emojis = parseReactionText(text) ?? Object.freeze([]);
  let operations: Promise<void> = Promise.resolve();
  let loadOperation: Promise<void> | undefined;
  const listeners = new Set<(text: string) => void>();

  const apply = (nextText: string): void => {
    const nextEmojis = parseReactionText(nextText);
    if (!nextEmojis) {
      throw new TypeError("Reaction settings must contain only RGI emoji");
    }
    if (text === nextText) return;
    text = nextText;
    emojis = nextEmojis;
    for (const listener of listeners) listener(text);
  };
  const enqueue = (operation: () => Promise<void>): Promise<void> => {
    const result = operations.then(operation);
    operations = result.catch(() => {});
    return result;
  };

  return Object.freeze({
    get text() {
      return text;
    },
    get emojis() {
      return emojis;
    },
    load() {
      loadOperation ??= enqueue(async () => {
        const contents = await storage.readTextFile(SETTINGS_FILE);
        if (contents === undefined) return;
        const parsed: unknown = JSON.parse(contents);
        if (
          !parsed ||
          typeof parsed !== "object" ||
          Array.isArray(parsed) ||
          !("emojis" in parsed) ||
          typeof parsed.emojis !== "string"
        ) {
          throw new TypeError("Invalid reaction settings file");
        }
        apply(parsed.emojis);
      });
      return loadOperation;
    },
    setText(nextText) {
      const nextEmojis = parseReactionText(nextText);
      if (!nextEmojis) {
        return Promise.reject(
          new TypeError("Reaction settings must contain only RGI emoji"),
        );
      }
      return enqueue(async () => {
        await storage.writeTextFile(
          SETTINGS_FILE,
          `${JSON.stringify({ emojis: nextText }, null, 2)}\n`,
        );
        apply(nextText);
      });
    },
    reset() {
      return enqueue(async () => {
        await storage.deleteFile(SETTINGS_FILE);
        apply(DEFAULT_REACTION_TEXT);
      });
    },
    subscribe(listener) {
      if (typeof listener !== "function") {
        throw new TypeError("Reaction settings listener must be a function");
      }
      listeners.add(listener);
      let disposed = false;
      return Object.freeze({
        dispose() {
          if (disposed) return;
          disposed = true;
          listeners.delete(listener);
        },
      });
    },
  });
}

export function sharedReactionSettings(): ReactionSettings {
  const sharedGlobal = globalThis as typeof globalThis & {
    [SHARED_SETTINGS_KEY]?: ReactionSettings;
  };
  sharedGlobal[SHARED_SETTINGS_KEY] ??= createReactionSettings(
    createExtensionStorage(EXTENSION_ID),
  );
  return sharedGlobal[SHARED_SETTINGS_KEY];
}
