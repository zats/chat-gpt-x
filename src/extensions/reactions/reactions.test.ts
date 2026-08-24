import { describe, expect, mock, test } from "bun:test";
import type {
  AssistantSelectionContext,
  AssistantSelectionMenuItem,
} from "../../platform/types";
import {
  REACTION_ACTION_ID,
  REACTIONS,
  transformAssistantSelectionItems,
} from "./reactions";

describe("reactions extension", () => {
  test("places React after Add to chat and creates the selected reaction", async () => {
    const createResponseAnnotation = mock(
      async (_annotation: string, _options?: { submit?: boolean }) => {},
    );
    const context: AssistantSelectionContext = Object.freeze({
      selectedText: "The worktree is clean.",
      createResponseAnnotation,
    });
    const builtIns: readonly AssistantSelectionMenuItem[] = [
      {
        kind: "action",
        id: "selectedTextOverlay.addToCodex",
        label: "Add to chat",
        origin: "app",
      },
      {
        kind: "action",
        id: "selectedTextOverlay.moreDetails",
        label: "More details",
        origin: "app",
      },
    ];

    const transformed = transformAssistantSelectionItems(builtIns, context);
    expect(transformed.map((item) => item.id)).toEqual([
      "selectedTextOverlay.addToCodex",
      REACTION_ACTION_ID,
      "selectedTextOverlay.moreDetails",
    ]);

    const parent = transformed[1];
    expect(parent.kind).toBe("action");
    if (parent.kind !== "action") throw new Error("React action is missing");
    expect(parent.items?.map((item) => item.label)).toEqual(
      REACTIONS,
    );
    expect(parent.items?.map((item) => item.labelScale)).toEqual(
      REACTIONS.map(() => 2),
    );
    expect(parent.items?.map((item) => item.verticalPadding)).toEqual(
      REACTIONS.map(() => 4),
    );

    parent.items?.[0]?.onClick?.({ metaKey: false });
    await Promise.resolve();
    expect(createResponseAnnotation).toHaveBeenCalledWith(
      `User reacted with ${REACTIONS[0]}`,
      { submit: false },
    );

    parent.items?.[1]?.onClick?.({ metaKey: true });
    await Promise.resolve();
    expect(createResponseAnnotation).toHaveBeenLastCalledWith(
      `User reacted with ${REACTIONS[1]}`,
      { submit: true },
    );
  });

  test("uses the configured emoji sequence", () => {
    const context: AssistantSelectionContext = Object.freeze({
      selectedText: "Selected",
      async createResponseAnnotation() {},
    });
    const items: readonly AssistantSelectionMenuItem[] = [
      {
        kind: "action",
        id: "selectedTextOverlay.addToCodex",
        label: "Add to chat",
        origin: "app",
      },
    ];

    const transformed = transformAssistantSelectionItems(items, context, [
      "🎉",
      "👨‍👩‍👧‍👦",
    ]);
    const parent = transformed[1];
    expect(parent?.kind).toBe("action");
    if (parent?.kind !== "action") throw new Error("React action is missing");
    expect(parent.items?.map((item) => item.label)).toEqual([
      "🎉",
      "👨‍👩‍👧‍👦",
    ]);
  });

  test("keeps the menu unchanged when Add to chat is unavailable", () => {
    const createResponseAnnotation = mock(
      async (_annotation: string, _options?: { submit?: boolean }) => {},
    );
    const context: AssistantSelectionContext = Object.freeze({
      selectedText: "Selected",
      createResponseAnnotation,
    });
    const items: readonly AssistantSelectionMenuItem[] = [
      {
        kind: "action",
        id: "selectedTextOverlay.moreDetails",
        label: "More details",
        origin: "app",
      },
    ];

    expect(transformAssistantSelectionItems(items, context)).toBe(items);
  });
});
