import type {
  AssistantSelectionContext,
  AssistantSelectionMenuActionItem,
  AssistantSelectionMenuItem,
  Disposable,
  PlatformApi,
} from "../../platform/types";
import { sharedReactionSettings } from "./reaction-settings";

const EXTENSION_ID = "reactions";

export const REACTIONS = Object.freeze(["👍", "👎", "🤔", "🤬"]);

function createReaction(
  context: AssistantSelectionContext,
  emoji: string,
  submit: boolean,
): void {
  void context
    .createResponseAnnotation(`User reacted with ${emoji}`, { submit })
    .catch((error: unknown) => {
      console.error("[reactions] Could not create the reaction", error);
    });
}

function reactionItems(
  context: AssistantSelectionContext,
  emojis: readonly string[],
): readonly AssistantSelectionMenuActionItem[] {
  return emojis.map((emoji, index) => ({
    kind: "action" as const,
    id: `${EXTENSION_ID}.reaction-${index + 1}`,
    label: emoji,
    placement: "below",
    labelScale: 2,
    verticalPadding: 4,
    onClick: (activation) =>
      createReaction(context, emoji, activation.metaKey),
  }));
}

export function transformAssistantSelectionItems(
  items: readonly AssistantSelectionMenuItem[],
  context: AssistantSelectionContext,
  emojis: readonly string[] = REACTIONS,
): readonly AssistantSelectionMenuItem[] {
  return [...items, ...reactionItems(context, emojis)];
}

let registration: Disposable | undefined;

export function activate(api: PlatformApi): void {
  const settings = sharedReactionSettings();
  void settings.load().catch((error: unknown) => {
    console.error(`[${EXTENSION_ID}] settings load failed`, error);
  });
  registration?.dispose();
  registration = api.menus.assistantSelection.transformItems((items, context) =>
    transformAssistantSelectionItems(items, context, settings.emojis),
  );
}

export function deactivate(): void {
  registration?.dispose();
  registration = undefined;
}
