import { describe, expect, mock, test } from "bun:test";
import type {
  AssistantSelectionContext,
  AssistantSelectionMenuItem,
} from "../../platform/types";
import {
  REACTIONS,
  transformAssistantSelectionItems,
} from "./reactions";

describe("reactions extension", () => {
  test("adds direct reactions below the native toolbar", async () => {
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
      "selectedTextOverlay.moreDetails",
      "reactions.reaction-1",
      "reactions.reaction-2",
      "reactions.reaction-3",
      "reactions.reaction-4",
    ]);

    const reactions = transformed.slice(builtIns.length);
    expect(reactions.map((item) => item.label)).toEqual(REACTIONS);
    expect(reactions.map((item) => item.placement)).toEqual(
      REACTIONS.map(() => "below"),
    );
    expect(reactions.map((item) => item.labelScale)).toEqual(
      REACTIONS.map(() => 2),
    );
    expect(reactions.map((item) => item.verticalPadding)).toEqual(
      REACTIONS.map(() => 4),
    );

    reactions[0]?.onClick?.({ metaKey: false });
    await Promise.resolve();
    expect(createResponseAnnotation).toHaveBeenCalledWith(
      `User reacted with ${REACTIONS[0]}`,
      { submit: false },
    );

    reactions[1]?.onClick?.({ metaKey: true });
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
    expect(transformed.slice(items.length).map((item) => item.label)).toEqual([
      "🎉",
      "👨‍👩‍👧‍👦",
    ]);
  });

  test("adds reactions when the assistant toolbar has another native action", () => {
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

    expect(
      transformAssistantSelectionItems(items, context)
        .slice(items.length)
        .map((item) => item.label),
    ).toEqual(REACTIONS);
  });
});
