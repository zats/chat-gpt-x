import type {
  AssistantSelectionContext,
  AssistantSelectionMenuActionItem,
  AssistantSelectionMenuItem,
  Disposable,
  PlatformApi,
} from "../../platform/types";

const EXTENSION_ID = "reactions";
const ADD_TO_CHAT_ID = "selectedTextOverlay.addToCodex";

export const REACTION_ACTION_ID = `${EXTENSION_ID}.react`;

export const REACTIONS = Object.freeze([
  Object.freeze({ id: "thumbs-up", emoji: "👍" }),
  Object.freeze({ id: "thumbs-down", emoji: "👎" }),
  Object.freeze({ id: "unsure", emoji: "🤷" }),
  Object.freeze({ id: "angry", emoji: "🤬" }),
] as const);

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
): readonly AssistantSelectionMenuActionItem[] {
  return REACTIONS.map(({ id, emoji }) => ({
    kind: "action" as const,
    id: `${EXTENSION_ID}.${id}`,
    label: emoji,
    labelScale: 2,
    verticalPadding: 4,
    onClick: (activation) =>
      createReaction(context, emoji, activation.metaKey),
  }));
}

export function transformAssistantSelectionItems(
  items: readonly AssistantSelectionMenuItem[],
  context: AssistantSelectionContext,
): readonly AssistantSelectionMenuItem[] {
  const addToChatIndex = items.findIndex((item) => item.id === ADD_TO_CHAT_ID);
  if (addToChatIndex < 0) return items;
  const reactAction: AssistantSelectionMenuActionItem = {
    kind: "action",
    id: REACTION_ACTION_ID,
    label: "React",
    items: reactionItems(context),
  };
  return [
    ...items.slice(0, addToChatIndex + 1),
    reactAction,
    ...items.slice(addToChatIndex + 1),
  ];
}

let registration: Disposable | undefined;

export function activate(api: PlatformApi): void {
  registration?.dispose();
  registration = api.menus.assistantSelection.transformItems(
    transformAssistantSelectionItems,
  );
}

export function deactivate(): void {
  registration?.dispose();
  registration = undefined;
}
