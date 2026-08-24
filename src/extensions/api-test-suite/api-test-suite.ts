/**
 * api-test-suite — mechanical end-to-end test extension.
 *
 * Exercises every public API path declared in src/platform/types.d.ts,
 * deterministically, THROUGH THE PUBLIC API ONLY. It never touches the app's
 * DOM, markup, or internals — those are the binding's domain and change per
 * app version. This suite must stay stable while src/platform/bindings/
 * <version>/ iterates; if a behavior cannot be observed through the public
 * API, the API lacks observability — extend the API, never reach into the
 * app. (Rendering correctness — the chevron really looks right, subtext
 * really renders — is guaranteed by the reuse-first binding strategy and
 * validated once per binding version, recorded in DERIVATION.md.)
 *
 * FAIL-CLOSED CONTRACT: it must be IMPOSSIBLE for this suite to pass without
 * a working binding. Results are written only after every test has run, so
 * missing/partial `__CGPTX_TEST_RESULTS__` means the suite never executed —
 * which any test runner MUST treat as failure, never as a skip.
 *
 * Layer note: requires an authenticated session — the profile menu's
 * built-in items exist only when signed in.
 * Release revisions preserve these deterministic behavioral assertions.
 */

import type {
  AssistantSelectionContext,
  AssistantSelectionMenuItem,
  Disposable,
  HeaderCssPropertiesRegistration,
  PlatformApi,
  ProfileMenuItem,
  ThreadContext,
  ThreadMenuItem,
} from "../../platform/types";

const EXT_ID = "api-test-suite";
const RESULTS_KEY = "__CGPTX_TEST_RESULTS__";
const NO_PROFILE = process.env.CHATGPTX_TEST_NO_PROFILE === "1";

// --------------------------------------------------------------------------
// Minimal harness
// --------------------------------------------------------------------------

interface TestResult {
  name: string;
  pass: boolean;
  error?: string;
}

type TestFn = () => void | Promise<void>;

const tests: Array<{ name: string; fn: TestFn }> = [];

function test(name: string, fn: TestFn): void {
  tests.push({ name, fn });
}

function profileTest(name: string, fn: TestFn): void {
  if (!NO_PROFILE) test(name, fn);
}

function assert(condition: unknown, message: string): asserts condition {
  if (!condition) throw new Error(`assertion failed: ${message}`);
}

function waitFor(
  condition: () => boolean,
  timeoutMs: number,
): Promise<boolean> {
  return new Promise((resolve) => {
    const start = Date.now();
    const tick = () => {
      if (condition()) return resolve(true);
      if (Date.now() - start > timeoutMs) return resolve(false);
      setTimeout(tick, 100);
    };
    tick();
  });
}

// --------------------------------------------------------------------------
// Public-API helpers (the only allowed observation channel)
// --------------------------------------------------------------------------

function items(): readonly ProfileMenuItem[] {
  return api.menus.profile.getItems();
}

function byId(id: string): ProfileMenuItem | undefined {
  return items().find((item) => item.id === id);
}

function ids(): string[] {
  return items().map((item) => item.id);
}

function register(
  transform: (items: readonly ProfileMenuItem[]) => readonly ProfileMenuItem[],
): Disposable {
  const disposable = api.menus.profile.transformItems(transform);
  activeTestDisposables?.push(disposable);
  return disposable;
}

let observedThreadContext: ThreadContext | undefined;
let observedThreadListContext: ThreadContext | undefined;
let observedAssistantSelectionContext: AssistantSelectionContext | undefined;

function assistantSelectionItems(): readonly AssistantSelectionMenuItem[] {
  return api.menus.assistantSelection.getItems();
}

function assistantSelectionById(
  id: string,
): AssistantSelectionMenuItem | undefined {
  return assistantSelectionItems().find((item) => item.id === id);
}

function registerAssistantSelection(
  transform: (
    items: readonly AssistantSelectionMenuItem[],
    context: AssistantSelectionContext,
  ) => readonly AssistantSelectionMenuItem[],
): Disposable {
  const disposable = api.menus.assistantSelection.transformItems(transform);
  activeTestDisposables?.push(disposable);
  return disposable;
}

function threadItems(): readonly ThreadMenuItem[] {
  assert(observedThreadContext, "thread context is available");
  return api.menus.thread.getItems(observedThreadContext.threadId);
}

function threadById(id: string): ThreadMenuItem | undefined {
  return threadItems().find((item) => item.id === id);
}

function registerThread(
  transform: (
    items: readonly ThreadMenuItem[],
    context: ThreadContext,
  ) => readonly ThreadMenuItem[],
): Disposable {
  const disposable = api.menus.thread.transformItems(transform);
  activeTestDisposables?.push(disposable);
  return disposable;
}

// --------------------------------------------------------------------------
// Tests: assistant-selection menu API
// --------------------------------------------------------------------------

const ASSISTANT_SELECTION_BASIC_ID = `${EXT_ID}.assistant-selection-basic`;
const ASSISTANT_SELECTION_CHAIN_A_ID = `${EXT_ID}.assistant-selection-chain-a`;
const ASSISTANT_SELECTION_CHAIN_B_ID = `${EXT_ID}.assistant-selection-chain-b`;
const ASSISTANT_SELECTION_DISABLED_ID = `${EXT_ID}.assistant-selection-disabled`;
const ASSISTANT_SELECTION_PARENT_ID = `${EXT_ID}.assistant-selection-parent`;
const ASSISTANT_SELECTION_CHILD_ID = `${EXT_ID}.assistant-selection-child`;

test("assistant-selection-menu: exposes selected text and native actions", () => {
  assert(observedAssistantSelectionContext, "selection context was observed");
  assert(
    observedAssistantSelectionContext.selectedText.length > 0,
    "selected text is non-empty",
  );
  assert(
    Object.isFrozen(observedAssistantSelectionContext),
    "selection context is immutable",
  );
  assert(
    typeof observedAssistantSelectionContext.createResponseAnnotation ===
      "function",
    "selection context exposes native response annotation creation",
  );
  const builtIns = assistantSelectionItems().filter(
    (item) => item.origin === "app",
  );
  assert(
    builtIns.some((item) => item.id === "selectedTextOverlay.addToCodex"),
    "Add to chat is exposed",
  );
  assert(
    new Set(builtIns.map((item) => item.id)).size === builtIns.length,
    "native action ids are unique",
  );
  assert(
    builtIns.every((item) => Object.isFrozen(item)),
    "native action descriptors are immutable",
  );
});

profileTest(
  "assistant-selection-menu: exposes authenticated quick and side chat actions",
  () => {
    const builtIns = assistantSelectionItems().filter(
      (item) => item.origin === "app",
    );
    assert(
      builtIns.some((item) => item.id === "selectedTextOverlay.moreDetails"),
      "More details is exposed",
    );
    assert(
      builtIns.some((item) => item.id === "selectedTextOverlay.askInSideChat"),
      "Ask in side chat is exposed",
    );
  },
);

test("assistant-selection-menu: contributes an action and dispose removes it", () => {
  const registration = registerAssistantSelection((items) => [
    ...items,
    {
      kind: "action",
      id: ASSISTANT_SELECTION_BASIC_ID,
      label: "Selection Basic",
      labelScale: 2,
      verticalPadding: 4,
    },
  ]);
  assert(
    assistantSelectionById(ASSISTANT_SELECTION_BASIC_ID)?.origin === EXT_ID,
    "selection contribution is effective and attributed",
  );
  assert(
    assistantSelectionById(ASSISTANT_SELECTION_BASIC_ID)?.labelScale === 2,
    "selection contribution uses doubled label scale",
  );
  assert(
    assistantSelectionById(ASSISTANT_SELECTION_BASIC_ID)?.verticalPadding ===
      4,
    "selection contribution uses 4 px vertical padding",
  );
  const nativeScale = registerAssistantSelection((items) =>
    items.map((item) =>
      item.id === ASSISTANT_SELECTION_BASIC_ID
        ? { ...item, labelScale: 1, verticalPadding: 0 }
        : item,
    ),
  );
  assert(
    assistantSelectionById(ASSISTANT_SELECTION_BASIC_ID)?.labelScale === 1,
    "later selection transformer restores native label scale",
  );
  assert(
    assistantSelectionById(ASSISTANT_SELECTION_BASIC_ID)?.verticalPadding ===
      0,
    "later selection transformer restores native vertical padding",
  );
  nativeScale.dispose();
  assert(
    assistantSelectionById(ASSISTANT_SELECTION_BASIC_ID)?.labelScale === 2,
    "disposing later selection transformer restores doubled label scale",
  );
  assert(
    assistantSelectionById(ASSISTANT_SELECTION_BASIC_ID)?.verticalPadding ===
      4,
    "disposing later selection transformer restores 4 px vertical padding",
  );
  registration.dispose();
  assert(
    !assistantSelectionById(ASSISTANT_SELECTION_BASIC_ID),
    "selection contribution is removed",
  );
  registration.dispose();
});

test("assistant-selection-menu: transformers chain with the same selection", () => {
  const selectedTexts: string[] = [];
  registerAssistantSelection((items, context) => {
    selectedTexts.push(context.selectedText);
    return [
      ...items,
      {
        kind: "action",
        id: ASSISTANT_SELECTION_CHAIN_A_ID,
        label: "Selection Chain A",
      },
    ];
  });
  registerAssistantSelection((items, context) => {
    selectedTexts.push(context.selectedText);
    assert(
      items.some((item) => item.id === ASSISTANT_SELECTION_CHAIN_A_ID),
      "second transformer sees the first contribution",
    );
    return [
      ...items,
      {
        kind: "action",
        id: ASSISTANT_SELECTION_CHAIN_B_ID,
        label: "Selection Chain B",
      },
    ];
  });
  assert(
    assistantSelectionItems().findIndex(
      (item) => item.id === ASSISTANT_SELECTION_CHAIN_A_ID,
    ) <
      assistantSelectionItems().findIndex(
        (item) => item.id === ASSISTANT_SELECTION_CHAIN_B_ID,
      ),
    "selection transformer order is deterministic",
  );
  assert(
    selectedTexts.length >= 2 &&
      selectedTexts.every(
        (selectedText) =>
          selectedText === observedAssistantSelectionContext?.selectedText,
      ),
    "every transformer receives the active selection",
  );
});

test("assistant-selection-menu: throwing transformer is isolated", () => {
  registerAssistantSelection(() => {
    throw new Error("intentional selection transformer failure");
  });
  registerAssistantSelection((items) => [
    ...items,
    {
      kind: "action",
      id: ASSISTANT_SELECTION_BASIC_ID,
      label: "After throw",
    },
  ]);
  assert(
    assistantSelectionById(ASSISTANT_SELECTION_BASIC_ID),
    "later selection transformer still runs",
  );
  assert(
    assistantSelectionItems().some((item) => item.origin === "app"),
    "native actions remain",
  );
});

test("assistant-selection-menu: enforces namespaces and duplicate ids", () => {
  registerAssistantSelection((items) => [
    ...items,
    { kind: "action", id: "foreign.selection", label: "Foreign" },
    {
      kind: "action",
      id: ASSISTANT_SELECTION_BASIC_ID,
      label: "First",
    },
    {
      kind: "action",
      id: ASSISTANT_SELECTION_BASIC_ID,
      label: "Duplicate",
    },
  ]);
  assert(
    !assistantSelectionById("foreign.selection"),
    "foreign selection id is dropped",
  );
  assert(
    assistantSelectionItems().filter(
      (item) => item.id === ASSISTANT_SELECTION_BASIC_ID,
    ).length === 1,
    "duplicate selection id is dropped",
  );
});

test("assistant-selection-menu: built-in replacement inherits native activation", () => {
  const builtIn = assistantSelectionItems().find(
    (item) => item.origin === "app" && typeof item.onClick === "function",
  );
  assert(builtIn, "activatable native selection action exists");
  const originalHandler = builtIn.onClick;
  const originalIndex = assistantSelectionItems().findIndex(
    (item) => item.id === builtIn.id,
  );
  registerAssistantSelection((items) =>
    items.map((item) =>
      item.id === builtIn.id
        ? { kind: "action", id: builtIn.id, label: "Replaced Selection" }
        : item,
    ),
  );
  const replacement = assistantSelectionById(builtIn.id);
  assert(
    replacement?.onClick === originalHandler,
    "native selection handler is inherited",
  );
  assert(
    assistantSelectionItems().findIndex((item) => item.id === builtIn.id) ===
      originalIndex,
    "selection replacement retains its position",
  );
});

test("assistant-selection-menu: expands children and creates a response annotation", async () => {
  let clicks = 0;
  let clickedText = "";
  let clickedWithCommand = true;
  let annotationCreation: Promise<void> | undefined;
  registerAssistantSelection((items, context) => [
    ...items,
    {
      kind: "action",
      id: ASSISTANT_SELECTION_PARENT_ID,
      label: "Selection Parent",
      onClick: () => {
        clicks += 100;
      },
      items: [
        {
          kind: "action",
          id: ASSISTANT_SELECTION_DISABLED_ID,
          label: "Selection Disabled",
          disabled: true,
          onClick: () => {
            clicks += 100;
          },
        },
        {
          kind: "action",
          id: ASSISTANT_SELECTION_CHILD_ID,
          label: "👍",
          labelScale: 2,
          verticalPadding: 4,
          onClick: (activation) => {
            clicks += 1;
            clickedText = context.selectedText;
            clickedWithCommand = activation.metaKey;
            annotationCreation = context.createResponseAnnotation(
              "User reacted with 👍",
            );
          },
        },
      ],
    },
  ]);
  assert(
    api.menus.assistantSelection.activateItem(ASSISTANT_SELECTION_PARENT_ID),
    "parent selection action expands",
  );
  assert(clicks === 0, "parent expansion does not invoke onClick");
  assert(
    !assistantSelectionById(ASSISTANT_SELECTION_PARENT_ID),
    "expanded parent is replaced by its child page",
  );
  const child = assistantSelectionById(ASSISTANT_SELECTION_CHILD_ID);
  assert(child?.origin === EXT_ID, "selection child is effective and attributed");
  assert(Object.isFrozen(child), "selection child descriptor is immutable");
  assert(child?.labelScale === 2, "selection child retains 2× label scale");
  assert(
    child?.verticalPadding === 4,
    "selection child retains 4 px vertical padding",
  );
  assert(
    !api.menus.assistantSelection.activateItem(ASSISTANT_SELECTION_DISABLED_ID),
    "disabled selection child is rejected",
  );
  assert(
    !api.menus.assistantSelection.activateItem("missing.selection-action"),
    "unknown selection action is rejected",
  );
  let emptyAnnotationRejected = false;
  try {
    await observedAssistantSelectionContext!.createResponseAnnotation("  ");
  } catch {
    emptyAnnotationRejected = true;
  }
  assert(emptyAnnotationRejected, "empty response annotations are rejected");
  assert(
    api.menus.assistantSelection.activateItem(ASSISTANT_SELECTION_CHILD_ID),
    "enabled selection child activates",
  );
  assert(annotationCreation, "selection child requested annotation creation");
  await annotationCreation;
  assert(Number(clicks) === 1, "selection action runs once");
  assert(!clickedWithCommand, "programmatic activation has no Command modifier");
  assert(
    clickedText === observedAssistantSelectionContext?.selectedText,
    "selection action retains its selected-text context",
  );
});

function registerHeaderProperties(
  properties: Parameters<
    PlatformApi["appearance"]["header"]["registerProperties"]
  >[0],
): HeaderCssPropertiesRegistration {
  const registration = api.appearance.header.registerProperties(properties);
  activeTestDisposables?.push(registration);
  return registration;
}

let activeTestDisposables: Disposable[] | undefined;

// --------------------------------------------------------------------------
// Tests: profile menu API
// --------------------------------------------------------------------------

const ID_BASIC = `${EXT_ID}.basic`;
const ID_CHAIN_A = `${EXT_ID}.chain-a`;
const ID_CHAIN_B = `${EXT_ID}.chain-b`;
const ID_RICH = `${EXT_ID}.rich`;
const ID_CLICK = `${EXT_ID}.click`;
const ID_PARENT = `${EXT_ID}.parent`;
const ID_CHILD = `${EXT_ID}.child`;
const ID_DUPLICATE = `${EXT_ID}.duplicate`;
const ID_THROWING_CLICK = `${EXT_ID}.throwing-click`;
const ID_AFTER_THROW = `${EXT_ID}.after-throw`;

const VISUAL_SEPARATOR_ID = `${EXT_ID}.visual-separator`;
const VISUAL_RICH_ID = `${EXT_ID}.visual-rich`;
const VISUAL_DISABLED_ID = `${EXT_ID}.visual-disabled`;
const VISUAL_PARENT_ID = `${EXT_ID}.visual-parent`;
const VISUAL_CHILD_ID = `${EXT_ID}.visual-child`;

profileTest(
  "profile-menu: contributes an action item and dispose removes it",
  () => {
    const registration = register((items) => [
      ...items,
      { kind: "action", id: ID_BASIC, label: "Basic" },
    ]);
    assert(byId(ID_BASIC), "contributed item is in the effective list");
    registration.dispose();
    assert(!byId(ID_BASIC), "item is gone after dispose");
    registration.dispose();
    assert(!byId(ID_BASIC), "dispose is idempotent");
  },
);

profileTest("profile-menu: built-in items pass through unchanged", () => {
  const baseline = items();
  assert(baseline.length > 0, "menu has built-in items");
  const registration = register((items) => items);
  assert(
    JSON.stringify(items()) === JSON.stringify(baseline),
    "identity transform yields the identical effective list",
  );
  registration.dispose();
});

profileTest(
  "profile-menu: can remove a built-in item, dispose restores it",
  () => {
    const victim = items()[0];
    assert(victim, "found a built-in item to remove");
    const registration = register((items) =>
      items.filter((item) => item.id !== victim.id),
    );
    assert(!byId(victim.id), "built-in item was removed");
    registration.dispose();
    assert(byId(victim.id), "built-in item is restored after dispose");
  },
);

profileTest("profile-menu: transformers chain in registration order", () => {
  const seenBySecond: string[] = [];
  const first = register((items) => [
    ...items,
    { kind: "action", id: ID_CHAIN_A, label: "Chain A" },
  ]);
  const second = register((items) => {
    seenBySecond.push(...items.map((i) => i.id));
    return [...items, { kind: "action", id: ID_CHAIN_B, label: "Chain B" }];
  });
  assert(byId(ID_CHAIN_A) && byId(ID_CHAIN_B), "both items are effective");
  assert(
    seenBySecond.includes(ID_CHAIN_A),
    "second transformer received first transformer's output",
  );
  assert(
    ids().indexOf(ID_CHAIN_A) < ids().indexOf(ID_CHAIN_B),
    "chain order is preserved in the effective list",
  );
  first.dispose();
  second.dispose();
});

profileTest("profile-menu: throwing transformer is isolated", () => {
  const baseline = items();
  const bad = register(() => {
    throw new Error("intentional test failure");
  });
  const good = register((items) => [
    ...items,
    { kind: "action", id: ID_BASIC, label: "Basic" },
  ]);
  assert(byId(ID_BASIC), "other transformer still contributes");
  assert(
    baseline.every((item) => byId(item.id)),
    "built-in items are unaffected",
  );
  bad.dispose();
  good.dispose();
});

profileTest("profile-menu: accepts and preserves all item affordances", () => {
  const registration = register((items) => [
    ...items,
    {
      kind: "action",
      id: ID_RICH,
      label: "Rich",
      icon: "person",
      rightIcon: "chevron-right",
      subText: "sub",
      keyboardShortcut: "⌘T",
      disabled: true,
    },
  ]);
  const item = byId(ID_RICH);
  assert(item && item.kind === "action", "rich item is in the effective list");
  if (item && item.kind === "action") {
    assert(item.label === "Rich", "label preserved");
    assert(item.icon === "person", "icon preserved");
    assert(item.rightIcon === "chevron-right", "rightIcon preserved");
    assert(item.subText === "sub", "subText preserved");
    assert(item.keyboardShortcut === "⌘T", "keyboardShortcut preserved");
    assert(item.disabled === true, "disabled preserved");
  }
  registration.dispose();
});

profileTest(
  "profile-menu: activateItem fires onClick, disabled item does not",
  () => {
    let clicked = 0;
    const registration = register((items) => [
      ...items,
      {
        kind: "action",
        id: ID_CLICK,
        label: "Click",
        onClick: () => {
          clicked += 1;
        },
      },
      {
        kind: "action",
        id: ID_RICH,
        label: "Disabled click",
        disabled: true,
        onClick: () => {
          clicked += 100;
        },
      },
    ]);
    assert(
      api.menus.profile.activateItem(ID_CLICK) === true,
      "activateItem reports the activation",
    );
    assert(clicked === 1, "onClick fired exactly once");
    assert(
      api.menus.profile.activateItem(ID_RICH) === false,
      "disabled item is not activated",
    );
    assert(clicked === 1, "disabled onClick never fired");
    assert(
      api.menus.profile.activateItem("no-such-item") === false,
      "unknown id is not activated",
    );
    registration.dispose();
  },
);

profileTest(
  "profile-menu: separator contribution increments by exactly one",
  () => {
    const countSeparators = () =>
      items().filter((item) => item.kind === "separator").length;
    const baseline = countSeparators();
    const registration = register((items) => [
      ...items,
      { kind: "separator", id: `${EXT_ID}.sep` },
    ]);
    assert(
      countSeparators() === baseline + 1,
      `separator count went ${baseline} -> ${baseline + 1}`,
    );
    registration.dispose();
  },
);

profileTest("profile-menu: drops items with foreign-namespace ids", () => {
  const registration = register((items) => [
    ...items,
    { kind: "action", id: `someone-else.item`, label: "Foreign" },
  ]);
  assert(!byId("someone-else.item"), "foreign-id item is not effective");
  registration.dispose();
});

profileTest("profile-menu: stamps origins and drops duplicate ids", () => {
  const registration = register((items) => [
    ...items,
    { kind: "action", id: ID_DUPLICATE, label: "First" },
    { kind: "action", id: ID_DUPLICATE, label: "Second" },
  ]);
  const matches = items().filter((item) => item.id === ID_DUPLICATE);
  assert(matches.length === 1, "only the first duplicate id is effective");
  assert(matches[0]?.origin === EXT_ID, "contributed origin is stamped");
  registration.dispose();
});

profileTest("profile-menu: throwing onClick is isolated", () => {
  let afterThrow = 0;
  const registration = register((items) => [
    ...items,
    {
      kind: "action",
      id: ID_THROWING_CLICK,
      label: "Throwing click",
      onClick: () => {
        throw new Error("intentional click failure");
      },
    },
    {
      kind: "action",
      id: ID_AFTER_THROW,
      label: "After throw",
      onClick: () => {
        afterThrow += 1;
      },
    },
  ]);
  assert(
    api.menus.profile.activateItem(ID_THROWING_CLICK) === true,
    "throwing action still reports activation",
  );
  assert(
    api.menus.profile.activateItem(ID_AFTER_THROW) === true && afterThrow === 1,
    "later actions remain activatable",
  );
  registration.dispose();
});

profileTest("profile-menu: built-in items expose stable, unique ids", () => {
  const builtIns = items().filter((item) => item.origin === "app");
  assert(builtIns.length > 0, "effective list contains built-in items");
  for (const item of builtIns) {
    assert(
      typeof item.id === "string" && item.id.length > 0,
      `built-in item has a stable id (got ${JSON.stringify(item.id)})`,
    );
  }
  assert(
    new Set(builtIns.map((i) => i.id)).size === builtIns.length,
    "built-in ids are unique",
  );
});

profileTest("profile-menu: account identity exposes its native action", () => {
  const account = byId("codex.profileDropdown.account");
  assert(
    account?.kind === "action",
    "account identity row is exposed as an action",
  );
  assert(
    account?.kind === "action" && typeof account.onClick === "function",
    "account identity row exposes its native activation handler",
  );
});

profileTest("profile-menu: replaces a built-in item in place by id", () => {
  const victim = items().find(
    (item) => item.origin === "app" && item.kind === "action",
  );
  assert(victim && victim.kind === "action", "found a built-in action item");
  const victimIndex = ids().indexOf(victim.id);
  const victimLabel = victim.kind === "action" ? victim.label : "";

  const registration = register((items) =>
    items.map((item) =>
      item.id === victim.id && item.kind === "action"
        ? { ...item, label: "Replaced" }
        : item,
    ),
  );
  const replaced = byId(victim.id);
  assert(
    replaced && replaced.kind === "action" && replaced.label === "Replaced",
    "replacement label is effective under the same id",
  );
  assert(
    ids().indexOf(victim.id) === victimIndex,
    "replacement keeps the original position",
  );
  assert(
    !items().some(
      (item) => item.kind === "action" && item.label === victimLabel,
    ),
    "original label is gone",
  );
  registration.dispose();
});

profileTest(
  "profile-menu: built-in replacement inherits omitted fields",
  () => {
    const victim = items().find(
      (item) =>
        item.origin === "app" &&
        item.kind === "action" &&
        typeof item.onClick === "function",
    );
    assert(victim && victim.kind === "action", "found activatable built-in");
    const originalOnClick = victim.onClick;
    const registration = register((items) =>
      items.map((item) =>
        item.id === victim.id
          ? { kind: "action", id: victim.id, label: "Inherited" }
          : item,
      ),
    );
    const replacement = byId(victim.id);
    assert(
      replacement?.kind === "action" && replacement.origin === "app",
      "replacement remains app-owned",
    );
    assert(
      replacement?.kind === "action" && replacement.onClick === originalOnClick,
      "omitted handler is inherited",
    );
    registration.dispose();
  },
);

profileTest("profile-menu: submenu children are live, expandable items", () => {
  let parentClicks = 0;
  let childClicks = 0;
  const registration = register((items) => [
    ...items,
    {
      kind: "action",
      id: ID_PARENT,
      label: "Parent",
      onClick: () => {
        parentClicks += 1;
      },
      items: [
        {
          kind: "action",
          id: ID_CHILD,
          label: "Child",
          onClick: () => {
            childClicks += 1;
          },
        },
      ],
    },
  ]);
  const parent = byId(ID_PARENT);
  assert(parent && parent.kind === "action", "parent is in the effective list");
  assert(
    parent && parent.kind === "action" && parent.items?.length === 1,
    "parent carries its child",
  );
  const child =
    parent && parent.kind === "action" ? parent.items?.[0] : undefined;
  assert(child?.origin === EXT_ID, "child origin is stamped recursively");
  assert(
    api.menus.profile.activateItem(ID_PARENT) === true && parentClicks === 0,
    "activating a parent expands it instead of firing onClick",
  );
  assert(
    api.menus.profile.activateItem(ID_CHILD) === true && childClicks === 1,
    "child item is activatable and its onClick fired",
  );
  registration.dispose();
});

profileTest(
  "profile-menu: validates nested item namespaces and duplicates",
  () => {
    const registration = register((items) => [
      ...items,
      {
        kind: "action",
        id: ID_PARENT,
        label: "Validated parent",
        items: [
          { kind: "action", id: ID_CHILD, label: "Child" },
          { kind: "action", id: ID_CHILD, label: "Duplicate child" },
          { kind: "action", id: "someone-else.child", label: "Foreign child" },
        ],
      },
    ]);
    const parent = byId(ID_PARENT);
    const children = parent?.kind === "action" ? (parent.items ?? []) : [];
    assert(children.length === 1, "invalid nested items are dropped");
    assert(children[0]?.id === ID_CHILD, "valid nested item remains");
    registration.dispose();
  },
);

// --------------------------------------------------------------------------
// Tests: thread menu API
// --------------------------------------------------------------------------

const THREAD_BASIC_ID = `${EXT_ID}.thread-basic`;
const THREAD_CHAIN_A_ID = `${EXT_ID}.thread-chain-a`;
const THREAD_CHAIN_B_ID = `${EXT_ID}.thread-chain-b`;
const THREAD_PARENT_ID = `${EXT_ID}.thread-parent`;
const THREAD_CHILD_ID = `${EXT_ID}.thread-child`;
const THREAD_SVG_ID = `${EXT_ID}.thread-svg`;
const THREAD_INVALID_SVG_ID = `${EXT_ID}.thread-invalid-svg`;
const THREAD_DISABLED_ID = `${EXT_ID}.thread-disabled`;

test("thread-menu: exposes the owning persisted thread and native items", () => {
  assert(observedThreadContext, "thread context was observed");
  assert(observedThreadContext.threadId.length > 0, "thread id is non-empty");
  assert(typeof observedThreadContext.title === "string", "title is a string");
  assert(
    observedThreadContext.workingDirectory === undefined ||
      observedThreadContext.workingDirectory.length > 0,
    "working directory is absent or non-empty",
  );
  const builtIns = threadItems().filter((item) => item.origin === "app");
  assert(builtIns.length > 0, "thread menu contains native items");
  assert(
    new Set(builtIns.map((item) => item.id)).size === builtIns.length,
    "native thread item ids are unique",
  );
});

test("thread-menu: contributes an item and dispose removes it", () => {
  const registration = registerThread((items) => [
    ...items,
    { kind: "action", id: THREAD_BASIC_ID, label: "Thread Basic" },
  ]);
  assert(threadById(THREAD_BASIC_ID), "thread contribution is effective");
  registration.dispose();
  assert(!threadById(THREAD_BASIC_ID), "thread contribution is removed");
  registration.dispose();
});

test("thread-menu: transformers chain with the same thread context", () => {
  const contexts: ThreadContext[] = [];
  registerThread((items, context) => {
    contexts.push(context);
    return [
      ...items,
      { kind: "action", id: THREAD_CHAIN_A_ID, label: "Thread Chain A" },
    ];
  });
  registerThread((items, context) => {
    contexts.push(context);
    assert(
      items.some((item) => item.id === THREAD_CHAIN_A_ID),
      "second transformer sees the first contribution",
    );
    return [
      ...items,
      { kind: "action", id: THREAD_CHAIN_B_ID, label: "Thread Chain B" },
    ];
  });
  assert(
    threadItems().findIndex((item) => item.id === THREAD_CHAIN_A_ID) <
      threadItems().findIndex((item) => item.id === THREAD_CHAIN_B_ID),
    "thread transformer order is deterministic",
  );
  assert(
    contexts.every(
      (context) => context.threadId === observedThreadContext?.threadId,
    ),
    "every transformer receives the owning thread",
  );
});

test("thread-menu: throwing transformer is isolated", () => {
  registerThread(() => {
    throw new Error("intentional thread transformer failure");
  });
  registerThread((items) => [
    ...items,
    { kind: "action", id: THREAD_BASIC_ID, label: "After throw" },
  ]);
  assert(threadById(THREAD_BASIC_ID), "later thread transformer still runs");
  assert(
    threadItems().some((item) => item.origin === "app"),
    "native thread items remain",
  );
});

test("thread-menu: preserves flyout children and native affordances", () => {
  registerThread((items) => [
    ...items,
    {
      kind: "action",
      id: THREAD_PARENT_ID,
      label: "Thread Parent",
      icon: { kind: "native", name: "palette" },
      items: [
        {
          kind: "action",
          id: THREAD_CHILD_ID,
          label: "Thread Child",
          keyboardShortcut: "⌘T",
          icon: { kind: "color", light: "#3A83F7", dark: "#3A83F7" },
        },
        {
          kind: "action",
          id: THREAD_SVG_ID,
          label: "Thread SVG",
          icon: {
            kind: "svg",
            source:
              '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24"><path d="M5 12h14" /></svg>',
          },
        },
      ],
    },
  ]);
  const parent = threadById(THREAD_PARENT_ID);
  assert(parent?.kind === "action", "flyout parent is effective");
  if (parent?.kind !== "action") return;
  assert(
    parent.icon?.kind === "native" && parent.icon.name === "palette",
    "native icon descriptor is preserved",
  );
  assert(parent.items?.length === 2, "flyout children are preserved");
  const child = parent.items?.[0];
  assert(child?.origin === EXT_ID, "flyout child origin is stamped");
  assert(
    child?.kind === "action" && child.keyboardShortcut === "⌘T",
    "flyout child affordances are preserved",
  );
  assert(
    child?.kind === "action" &&
      child.icon?.kind === "color" &&
      child.icon.light === "#3A83F7" &&
      child.icon.dark === "#3A83F7",
    "theme-aware color icon is preserved",
  );
  assert(
    child?.kind === "action" && Object.isFrozen(child.icon),
    "thread-menu icon descriptor is immutable",
  );
  const svgChild = parent.items?.[1];
  assert(
    svgChild?.kind === "action" &&
      svgChild.icon?.kind === "svg" &&
      svgChild.icon.source ===
        '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24"><path d="M5 12h14" /></svg>',
    "extension SVG icon is preserved",
  );
});

test("thread-menu: activates leaves and requests native flyouts", () => {
  let clicks = 0;
  registerThread((items) => [
    ...items,
    {
      kind: "action",
      id: THREAD_PARENT_ID,
      label: "Thread Parent",
      onClick: () => {
        clicks += 100;
      },
      items: [
        {
          kind: "action",
          id: THREAD_CHILD_ID,
          label: "Thread Child",
          onClick: () => {
            clicks += 1;
          },
        },
      ],
    },
    {
      kind: "action",
      id: THREAD_DISABLED_ID,
      label: "Thread Disabled",
      disabled: true,
      onClick: () => {
        clicks += 1000;
      },
    },
  ]);
  const threadId = observedThreadContext?.threadId ?? "";
  assert(
    api.menus.thread.activateItem(threadId, THREAD_PARENT_ID),
    "flyout activation is accepted",
  );
  assert(clicks === 0, "flyout parent handler is ignored");
  assert(
    api.menus.thread.activateItem(threadId, THREAD_CHILD_ID),
    "flyout child activates",
  );
  assert(Number(clicks) === 1, "flyout child handler runs once");
  assert(
    !api.menus.thread.activateItem(threadId, THREAD_DISABLED_ID),
    "disabled action is rejected",
  );
  assert(
    !api.menus.thread.activateItem(threadId, "missing.thread-item"),
    "unknown action is rejected",
  );
});

test("thread-menu: rejects malformed SVG icons", () => {
  registerThread((items) => [
    ...items,
    {
      kind: "action",
      id: THREAD_INVALID_SVG_ID,
      label: "Invalid SVG",
      icon: { kind: "svg", source: "<div>not an SVG</div>" },
    },
  ]);
  assert(
    !threadById(THREAD_INVALID_SVG_ID),
    "malformed SVG contribution is rejected",
  );
  assert(
    threadItems().some((item) => item.origin === "app"),
    "malformed SVG does not affect native items",
  );
});

test("thread-menu: enforces namespaces and duplicate ids recursively", () => {
  registerThread((items) => [
    ...items,
    { kind: "action", id: "foreign.thread-item", label: "Foreign" },
    { kind: "action", id: THREAD_BASIC_ID, label: "First" },
    { kind: "action", id: THREAD_BASIC_ID, label: "Duplicate" },
    {
      kind: "action",
      id: THREAD_PARENT_ID,
      label: "Parent",
      items: [
        { kind: "action", id: THREAD_CHILD_ID, label: "Child" },
        { kind: "action", id: THREAD_CHILD_ID, label: "Duplicate Child" },
        { kind: "action", id: "foreign.child", label: "Foreign Child" },
      ],
    },
  ]);
  assert(!threadById("foreign.thread-item"), "foreign root id is dropped");
  assert(
    threadItems().filter((item) => item.id === THREAD_BASIC_ID).length === 1,
    "duplicate root id is dropped",
  );
  const parent = threadById(THREAD_PARENT_ID);
  assert(
    parent?.kind === "action" && parent.items?.length === 1,
    "invalid flyout children are dropped",
  );
});

test("thread-menu: built-in replacement inherits native fields", () => {
  const builtIn = threadItems().find(
    (item) =>
      item.origin === "app" &&
      item.kind === "action" &&
      typeof item.onClick === "function",
  );
  assert(builtIn?.kind === "action", "activatable native item exists");
  if (builtIn?.kind !== "action") return;
  const originalHandler = builtIn.onClick;
  const originalIndex = threadItems().findIndex(
    (item) => item.id === builtIn.id,
  );
  registerThread((items) =>
    items.map((item) =>
      item.id === builtIn.id
        ? { kind: "action", id: builtIn.id, label: "Replaced Thread Item" }
        : item,
    ),
  );
  const replacement = threadById(builtIn.id);
  assert(
    replacement?.kind === "action" && replacement.onClick === originalHandler,
    "native activation handler is inherited",
  );
  assert(
    threadItems().findIndex((item) => item.id === builtIn.id) === originalIndex,
    "replacement retains its position",
  );
});

// --------------------------------------------------------------------------
// Tests: current thread API
// --------------------------------------------------------------------------

test("threads: exposes the current thread and immediately subscribes", () => {
  assert(observedThreadContext, "thread readiness captured a current thread");
  const current = api.threads.getCurrent();
  assert(current, "current persisted thread is available");
  assert(
    current.threadId === observedThreadContext.threadId,
    "current thread matches the mounted native thread menu",
  );

  let delivered: ThreadContext | undefined;
  let deliveries = 0;
  const throwing = api.threads.subscribe(() => {
    throw new Error("intentional current-thread listener failure");
  });
  const subscription = api.threads.subscribe((thread) => {
    delivered = thread;
    deliveries += 1;
  });
  activeTestDisposables?.push(throwing, subscription);
  assert(deliveries === 1, "subscription immediately delivers one snapshot");
  assert(
    delivered?.threadId === current.threadId,
    "subscription snapshot matches getCurrent",
  );
  subscription.dispose();
  subscription.dispose();
});

test("thread-list: registers leading views in registration order", async () => {
  const calls: string[] = [];
  let mountedViews = 0;
  const first = api.threads.list.registerItem((context) => {
    observedThreadListContext ??= context;
    calls.push(`first:${context.threadId}`);
    return {
      view: () => {
        mountedViews += 1;
        return document.createElement("span");
      },
    };
  });
  const second = api.threads.list.registerItem((context) => {
    calls.push(`second:${context.threadId}`);
    return { view: () => document.createElement("span") };
  });
  activeTestDisposables?.push(first, second);
  assert(
    await waitFor(
      () => observedThreadListContext !== undefined && mountedViews > 0,
      5000,
    ),
    "providers and a view factory run for the native thread row",
  );
  const threadId = observedThreadListContext.threadId;
  assert(
    calls.includes(`second:${threadId}`),
    "every registration receives the observed native thread row",
  );
  assert(
    calls.indexOf(`first:${threadId}`) < calls.indexOf(`second:${threadId}`),
    "registration order is retained",
  );
});

test("thread-list: invalidation reevaluates cached providers", async () => {
  const calls = new Map<string, number>();
  let threadId: string | undefined;
  const registration = api.threads.list.registerItem((thread) => {
    threadId ??= thread.threadId;
    calls.set(thread.threadId, (calls.get(thread.threadId) ?? 0) + 1);
    return { view: () => document.createElement("span") };
  });
  activeTestDisposables?.push(registration);
  assert(
    await waitFor(() => threadId !== undefined, 5000),
    "provider runs for the native thread row",
  );
  assert(threadId, "an observed native thread row is available");
  const cachedCalls = calls.get(threadId) ?? 0;
  registration.invalidate(threadId);
  assert(
    await waitFor(() => (calls.get(threadId) ?? 0) > cachedCalls, 5000),
    "thread invalidation reevaluates the provider",
  );
  const afterThreadInvalidation = calls.get(threadId) ?? 0;
  registration.invalidate();
  assert(
    await waitFor(
      () => (calls.get(threadId) ?? 0) > afterThreadInvalidation,
      5000,
    ),
    "global invalidation reevaluates the provider",
  );
});

test("thread-list: throwing providers are isolated and disposal is final", async () => {
  let goodCalls = 0;
  let threadId: string | undefined;
  const throwing = api.threads.list.registerItem(() => {
    throw new Error("intentional thread-list provider failure");
  });
  const good = api.threads.list.registerItem((thread) => {
    threadId ??= thread.threadId;
    if (thread.threadId === threadId) goodCalls += 1;
    return { view: () => document.createElement("span") };
  });
  activeTestDisposables?.push(throwing, good);
  assert(await waitFor(() => goodCalls > 0, 5000), "later provider still runs");
  assert(threadId, "an observed native thread row is available");
  good.dispose();
  good.dispose();
  const callsAfterDispose = goodCalls;
  good.invalidate(threadId);
  await new Promise((resolve) => setTimeout(resolve, 100));
  assert(
    goodCalls === callsAfterDispose,
    "disposed registration stays inactive",
  );
});

// --------------------------------------------------------------------------
// Tests: settings API
// --------------------------------------------------------------------------

const SETTINGS_PANE_ID = `${EXT_ID}.settings`;
const SETTINGS_GROUP_ID = `${EXT_ID}.general`;
const SETTINGS_TOGGLE_ID = `${EXT_ID}.enabled`;
const SETTINGS_SELECT_ID = `${EXT_ID}.mode`;
const SETTINGS_BUTTON_ID = `${EXT_ID}.action`;
const SETTINGS_TEXT_FIELD_ID = `${EXT_ID}.text`;
const SETTINGS_INLINE_ID = `${EXT_ID}.inline`;
const SETTINGS_BUILT_IN_PANE_ID = "codex.settings.general-settings";
const SETTINGS_EXISTING_GROUP_ID = `${EXT_ID}.existing-pane-group`;
const SETTINGS_EXISTING_ITEM_ID = `${EXT_ID}.existing-pane-item`;

function settingPane(id: string) {
  return api.settings
    .getCategories()
    .flatMap((category) => category.panes)
    .find((pane) => pane.id === id);
}

test("settings: adds a native pane, group, rows, and standard controls", async () => {
  const textField = api.settings.ui.textField({
    value: "Initial text",
    placeholder: "Enter text",
    onChange() {},
  });
  let nonStringTextRejected = false;
  try {
    api.settings.ui.textField({
      value: 0 as never,
      onChange() {},
    });
  } catch {
    nonStringTextRejected = true;
  }
  assert(nonStringTextRejected, "text fields reject non-string values");
  const inline = api.settings.ui.inline([
    textField,
    api.settings.ui.button({ label: "Reset", onClick() {} }),
  ]);
  let emptyInlineRejected = false;
  try {
    api.settings.ui.inline([]);
  } catch {
    emptyInlineRejected = true;
  }
  let nestedInlineRejected = false;
  try {
    api.settings.ui.inline([inline]);
  } catch {
    nestedInlineRejected = true;
  }
  assert(
    emptyInlineRejected && nestedInlineRejected,
    "inline controls reject empty and nested control groups",
  );
  const emptyValueSelect = api.settings.ui.select({
    value: "",
    options: [
      { value: "", label: "Default/None" },
      { value: "one", label: "One" },
      { value: "two", label: "Two", disabled: true },
    ],
    onChange() {},
  });
  let nonStringValueRejected = false;
  try {
    api.settings.ui.select({
      value: 0 as never,
      options: [{ value: "", label: "Default/None" }],
      onChange() {},
    });
  } catch {
    nonStringValueRejected = true;
  }
  let nonStringOptionValueRejected = false;
  try {
    api.settings.ui.select({
      options: [{ value: 0 as never, label: "Invalid" }],
      onChange() {},
    });
  } catch {
    nonStringOptionValueRejected = true;
  }
  let invalidOptionRejected = false;
  try {
    api.settings.ui.select({
      options: [null as never],
      onChange() {},
    });
  } catch {
    invalidOptionRejected = true;
  }
  assert(
    nonStringValueRejected &&
      nonStringOptionValueRejected &&
      invalidOptionRejected,
    "select controls reject non-string values and invalid option structures",
  );

  const navigation = api.settings.transformCategories((categories) =>
    categories.map((category) =>
      category.id === "integrations"
        ? {
            ...category,
            panes: [
              ...category.panes,
              {
                id: SETTINGS_PANE_ID,
                label: "API Settings",
                title: "API Settings",
                description: "Mechanical settings API fixture.",
                keywords: ["fixture-category"],
                disabled: false,
                external: false,
              },
            ],
          }
        : category,
    ),
  );
  const groups = api.settings.transformGroups((current, pane) =>
    pane.id === SETTINGS_PANE_ID
      ? [
          ...current,
          {
            id: SETTINGS_GROUP_ID,
            title: "General",
            description: "Fixture group description.",
            footer: "Fixture group footer.",
            keywords: ["fixture-group"],
            items: [],
          },
        ]
      : current,
  );
  const items = api.settings.transformItems((current, context) =>
    context.group.id === SETTINGS_GROUP_ID
      ? [
          ...current,
          {
            id: SETTINGS_TOGGLE_ID,
            label: "Fixture toggle",
            description: "Searchable toggle description.",
            keywords: ["fixture-toggle"],
            destination: { paneId: SETTINGS_BUILT_IN_PANE_ID },
            control: api.settings.ui.toggle({
              checked: true,
              onChange() {},
            }),
          },
          {
            id: SETTINGS_SELECT_ID,
            label: "Fixture select",
            control: emptyValueSelect,
          },
          {
            id: SETTINGS_BUTTON_ID,
            label: "Fixture button",
            control: api.settings.ui.button({
              label: "Run",
              appearance: "secondary",
              onClick() {},
            }),
          },
          {
            id: SETTINGS_TEXT_FIELD_ID,
            label: "Fixture text field",
            control: textField,
          },
          {
            id: SETTINGS_INLINE_ID,
            label: "Fixture inline controls",
            control: inline,
          },
        ]
      : current,
  );
  activeTestDisposables?.push(navigation, groups, items);

  assert(
    await api.settings.open(SETTINGS_PANE_ID, {
      itemId: SETTINGS_TOGGLE_ID,
    }),
    "a contributed pane opens and resolves its item deep link",
  );
  assert(
    await waitFor(
      () => api.settings.getGroups(SETTINGS_PANE_ID).length === 1,
      5000,
    ),
    "the contributed pane renders its group",
  );
  const pane = settingPane(SETTINGS_PANE_ID);
  assert(pane?.origin === EXT_ID, "the contributed pane origin is stamped");
  assert(
    pane?.keywords?.includes("fixture-category"),
    "pane search keywords are preserved",
  );
  const [group] = api.settings.getGroups(SETTINGS_PANE_ID);
  assert(group?.origin === EXT_ID, "the contributed group origin is stamped");
  assert(
    group?.keywords?.includes("fixture-group"),
    "group search keywords are preserved",
  );
  assert(group?.items.length === 5, "every contributed row is effective");
  assert(
    group?.items.find((item) => item.id === SETTINGS_INLINE_ID)?.control ===
      inline,
    "an inline native-control group remains opaque and effective",
  );
  assert(
    group?.items.every(
      (item) => item.origin === EXT_ID && item.control !== undefined,
    ),
    "rows are stamped and retain native control descriptors",
  );
  assert(
    group?.items[0]?.description === "Searchable toggle description." &&
      group.items[0]?.keywords?.includes("fixture-toggle") &&
      group.items[0]?.destination?.paneId === SETTINGS_BUILT_IN_PANE_ID,
    "item search text and destination are preserved",
  );

  const clearPaneMetadata = api.settings.transformCategories((categories) =>
    categories.map((category) => ({
      ...category,
      panes: category.panes.map((candidate) =>
        candidate.id === SETTINGS_PANE_ID
          ? {
              ...candidate,
              title: undefined,
              description: undefined,
              keywords: undefined,
              disabled: undefined,
              external: undefined,
              origin: "forged",
            }
          : candidate,
      ),
    })),
  );
  const clearGroupMetadata = api.settings.transformGroups((current, pane) =>
    pane.id === SETTINGS_PANE_ID
      ? current.map((candidate) =>
          candidate.id === SETTINGS_GROUP_ID
            ? {
                ...candidate,
                title: undefined,
                description: undefined,
                footer: undefined,
                keywords: undefined,
                origin: "forged",
              }
            : candidate,
        )
      : current,
  );
  const clearItemMetadata = api.settings.transformItems((current, context) =>
    context.group.id === SETTINGS_GROUP_ID
      ? current.map((candidate) =>
          candidate.id === SETTINGS_TOGGLE_ID
            ? {
                ...candidate,
                description: undefined,
                keywords: undefined,
                control: undefined,
                destination: undefined,
                origin: "forged",
              }
            : candidate,
        )
      : current,
  );
  activeTestDisposables?.push(
    clearPaneMetadata,
    clearGroupMetadata,
    clearItemMetadata,
  );

  const clearedPane = settingPane(SETTINGS_PANE_ID);
  const clearedGroup = api.settings.getGroups(SETTINGS_PANE_ID)[0];
  const clearedItem = clearedGroup?.items.find(
    (candidate) => candidate.id === SETTINGS_TOGGLE_ID,
  );
  assert(
    clearedPane !== undefined &&
      clearedPane.title === undefined &&
      clearedPane.description === undefined &&
      clearedPane.keywords === undefined &&
      clearedPane.disabled === undefined &&
      clearedPane.external === undefined &&
      clearedPane.origin === EXT_ID &&
      clearedGroup !== undefined &&
      clearedGroup.title === undefined &&
      clearedGroup.description === undefined &&
      clearedGroup.footer === undefined &&
      clearedGroup.keywords === undefined &&
      clearedGroup.origin === EXT_ID &&
      clearedItem !== undefined &&
      clearedItem.description === undefined &&
      clearedItem.keywords === undefined &&
      clearedItem.control === undefined &&
      clearedItem.destination === undefined &&
      clearedItem.origin === EXT_ID,
    "explicit undefined clears optional settings fields without changing ownership",
  );

  clearItemMetadata.dispose();
  clearGroupMetadata.dispose();
  clearPaneMetadata.dispose();
  const restoredPane = settingPane(SETTINGS_PANE_ID);
  const restoredGroup = api.settings.getGroups(SETTINGS_PANE_ID)[0];
  const restoredItem = restoredGroup?.items.find(
    (candidate) => candidate.id === SETTINGS_TOGGLE_ID,
  );
  assert(
    restoredPane?.title === "API Settings" &&
      restoredPane.description === "Mechanical settings API fixture." &&
      restoredPane.keywords?.includes("fixture-category") &&
      restoredPane.disabled === false &&
      restoredPane.external === false &&
      restoredGroup?.title === "General" &&
      restoredGroup.description === "Fixture group description." &&
      restoredGroup.footer === "Fixture group footer." &&
      restoredGroup.keywords?.includes("fixture-group") &&
      restoredItem?.description === "Searchable toggle description." &&
      restoredItem.keywords?.includes("fixture-toggle") &&
      restoredItem.control !== undefined &&
      restoredItem.destination?.paneId === SETTINGS_BUILT_IN_PANE_ID,
    "disposing the clearing transforms restores optional settings fields",
  );
});

test("settings: transformers chain, isolate failures, and validate ids", async () => {
  const contextGroupId = `${EXT_ID}.context-group`;
  const contextFirstItemId = `${EXT_ID}.context-first`;
  const contextSecondItemId = `${EXT_ID}.context-second`;
  const duplicateFirstGroupId = `${EXT_ID}.duplicate-first-group`;
  const duplicateSecondGroupId = `${EXT_ID}.duplicate-second-group`;
  const duplicateOtherPaneId = `${EXT_ID}.duplicate-other-pane`;
  const duplicateOtherGroupId = `${EXT_ID}.duplicate-other-group`;
  const duplicateItemId = `${EXT_ID}.pane-duplicate-item`;
  let laterContextMatchesCurrentItems = false;
  let duplicateSecondGroupFirst = false;
  let includeDuplicateSecondGroup = true;
  const first = api.settings.transformCategories((categories) => [
    ...categories,
    {
      id: `${EXT_ID}.category`,
      label: "API Category",
      keywords: ["fixture-category-keyword"],
      panes: [
        {
          id: SETTINGS_PANE_ID,
          label: "First label",
        },
        {
          id: SETTINGS_PANE_ID,
          label: "Duplicate label",
        },
        {
          id: "foreign.settings",
          label: "Foreign pane",
        },
        {
          id: duplicateOtherPaneId,
          label: "Other duplicate pane",
        },
      ],
    },
    {
      id: "foreign.category",
      label: "Foreign category",
      panes: [],
    },
  ]);
  const throwing = api.settings.transformCategories(() => {
    throw new Error("intentional settings transformer failure");
  });
  const second = api.settings.transformCategories((categories) =>
    categories.map((category) => ({
      ...category,
      panes: category.panes.map((pane) =>
        pane.id === SETTINGS_PANE_ID
          ? { ...pane, label: "Second label" }
          : pane,
      ),
    })),
  );
  const contextGroup = api.settings.transformGroups((groups, pane) =>
    pane.id === SETTINGS_PANE_ID
      ? [
          ...groups,
          {
            id: contextGroupId,
            items: [
              {
                id: contextFirstItemId,
                label: "First context item",
              },
            ],
          },
        ]
      : groups,
  );
  const contextFirst = api.settings.transformItems((current, context) =>
    context.group.id === contextGroupId
      ? [
          ...current,
          {
            id: contextSecondItemId,
            label: "Second context item",
          },
        ]
      : current,
  );
  const contextSecond = api.settings.transformItems((current, context) => {
    if (context.group.id === contextGroupId) {
      laterContextMatchesCurrentItems =
        Object.isFrozen(context) &&
        Object.isFrozen(context.group) &&
        Object.isFrozen(current) &&
        context.group.items === current &&
        current.map((item) => item.id).join(",") ===
          `${contextFirstItemId},${contextSecondItemId}`;
    }
    return current;
  });
  const duplicateGroups = api.settings.transformGroups((groups, pane) => {
    if (pane.id === duplicateOtherPaneId) {
      return [
        ...groups,
        {
          id: duplicateOtherGroupId,
          items: [
            {
              id: duplicateItemId,
              label: "Other pane duplicate row",
            },
          ],
        },
      ];
    }
    if (pane.id !== SETTINGS_PANE_ID) return groups;
    const firstGroup = {
      id: duplicateFirstGroupId,
      items: [
        {
          id: duplicateItemId,
          label: "First duplicate row",
        },
      ],
    };
    const secondGroup = {
      id: duplicateSecondGroupId,
      items: [],
    };
    const orderedDuplicateGroups = includeDuplicateSecondGroup
      ? duplicateSecondGroupFirst
        ? [secondGroup, firstGroup]
        : [firstGroup, secondGroup]
      : [firstGroup];
    return [...groups, ...orderedDuplicateGroups];
  });
  const duplicateItems = api.settings.transformItems((current, context) =>
    context.group.id === duplicateSecondGroupId
      ? [
          ...current,
          {
            id: duplicateItemId,
            label: "Second duplicate row",
          },
        ]
      : current,
  );
  activeTestDisposables?.push(
    first,
    throwing,
    second,
    contextGroup,
    contextFirst,
    contextSecond,
    duplicateGroups,
    duplicateItems,
  );

  assert(
    await waitFor(() => settingPane(SETTINGS_PANE_ID) !== undefined, 5000),
    "the valid pane remains after a throwing transformer",
  );
  assert(
    settingPane(SETTINGS_PANE_ID)?.label === "Second label",
    "later transformers receive and change earlier output",
  );
  assert(
    api.settings
      .getCategories()
      .flatMap((category) => category.panes)
      .filter((pane) => pane.id === SETTINGS_PANE_ID).length === 1,
    "duplicate pane ids are dropped",
  );
  assert(!settingPane("foreign.settings"), "foreign pane ids are dropped");
  assert(
    !api.settings
      .getCategories()
      .some((category) => category.id === "foreign.category"),
    "foreign category ids are dropped",
  );
  assert(
    api.settings
      .getCategories()
      .find((category) => category.id === `${EXT_ID}.category`)?.origin ===
      EXT_ID,
    "contributed category origins are stamped",
  );
  const effectiveContextGroup = api.settings
    .getGroups(SETTINGS_PANE_ID)
    .find((group) => group.id === contextGroupId);
  assert(
    laterContextMatchesCurrentItems &&
      effectiveContextGroup?.items.length === 2,
    "later item transformers receive a fresh context for the current item list",
  );
  const duplicateLabels = () =>
    api.settings
      .getGroups(SETTINGS_PANE_ID)
      .flatMap((group) => group.items)
      .filter((item) => item.id === duplicateItemId)
      .map((item) => item.label);
  assert(
    duplicateLabels().join(",") === "First duplicate row",
    "the first duplicate item in final pane order wins",
  );
  duplicateSecondGroupFirst = true;
  duplicateGroups.invalidate();
  assert(
    await waitFor(
      () => duplicateLabels().join(",") === "Second duplicate row",
      5000,
    ),
    "reordering groups changes which duplicate item wins",
  );
  includeDuplicateSecondGroup = false;
  duplicateGroups.invalidate();
  assert(
    await waitFor(
      () => duplicateLabels().join(",") === "First duplicate row",
      5000,
    ),
    "removing the winning group exposes the remaining duplicate item",
  );
  assert(
    await api.settings.open(SETTINGS_PANE_ID, { itemId: duplicateItemId }),
    "a pane-wide unique item id remains a deterministic deep link",
  );
  assert(
    (await api.settings.open(duplicateOtherPaneId, {
      itemId: duplicateItemId,
    })) &&
      api.settings
        .getGroups(duplicateOtherPaneId)
        .flatMap((group) => group.items)
        .find((item) => item.id === duplicateItemId)?.label ===
        "Other pane duplicate row",
    "the same item id remains valid in a different pane",
  );
});

test("settings: inserts a searchable fixture into an existing pane", async () => {
  assert(
    settingPane(SETTINGS_BUILT_IN_PANE_ID)?.origin === "app",
    "the native General pane has a stable public id",
  );
  const groups = api.settings.transformGroups((current, pane) =>
    pane.id === SETTINGS_BUILT_IN_PANE_ID
      ? [
          ...current,
          {
            id: SETTINGS_EXISTING_GROUP_ID,
            title: "Settings API fixture",
            keywords: ["existing pane fixture"],
            items: [],
          },
        ]
      : current,
  );
  let enabled = true;
  let items: ReturnType<PlatformApi["settings"]["transformItems"]>;
  items = api.settings.transformItems((current, context) =>
    context.group.id === SETTINGS_EXISTING_GROUP_ID
      ? [
          ...current,
          {
            id: SETTINGS_EXISTING_ITEM_ID,
            label: "Existing pane fixture",
            description: "Mechanical row inserted into a built-in pane.",
            keywords: ["searchable settings fixture"],
            control: api.settings.ui.toggle({
              checked: enabled,
              onChange(value) {
                enabled = value;
                items.invalidate();
              },
            }),
          },
        ]
      : current,
  );
  activeTestDisposables?.push(groups, items);

  assert(
    await api.settings.open(SETTINGS_BUILT_IN_PANE_ID, {
      itemId: SETTINGS_EXISTING_ITEM_ID,
    }),
    "an extension fixture in an existing pane can be opened directly",
  );
  assert(
    await waitFor(
      () =>
        api.settings
          .getGroups(SETTINGS_BUILT_IN_PANE_ID)
          .some((group) => group.id === SETTINGS_EXISTING_GROUP_ID),
      5000,
    ),
    "the fixture group is present in the existing native pane",
  );
  const builtInCategory = api.settings
    .getCategories()
    .find((category) => category.id === "integrations");
  const originalBuiltInCategoryLabel = builtInCategory?.label;
  const categoryMetadata = api.settings.transformCategories((categories) =>
    categories.map((category) =>
      category.id === builtInCategory?.id
        ? { ...category, label: "Transformed built-in category" }
        : category,
    ),
  );
  const transformedBuiltInCategory = api.settings
    .getCategories()
    .find((category) => category.id === builtInCategory?.id);
  categoryMetadata.dispose();
  const restoredBuiltInCategory = api.settings
    .getCategories()
    .find((category) => category.id === builtInCategory?.id);
  assert(
    typeof originalBuiltInCategoryLabel === "string" &&
      transformedBuiltInCategory?.label === "Transformed built-in category" &&
      restoredBuiltInCategory?.label === originalBuiltInCategoryLabel,
    "built-in category labels are changed and restored through the public model",
  );
  const group = api.settings
    .getGroups(SETTINGS_BUILT_IN_PANE_ID)
    .find((candidate) => candidate.id === SETTINGS_EXISTING_GROUP_ID);
  assert(
    group?.items[0]?.label === "Existing pane fixture" &&
      group.items[0]?.description?.includes("built-in pane"),
    "the inserted row exposes searchable title and description text",
  );

  const builtInItem = api.settings
    .getGroups(SETTINGS_BUILT_IN_PANE_ID)
    .flatMap((candidate) => candidate.items)
    .find(
      (candidate) =>
        candidate.origin === "app" && typeof candidate.id === "string",
    );
  const originalBuiltInControl = builtInItem?.control;
  const replacementBuiltInControl = api.settings.ui.button({
    label: "Replacement built-in control",
    onClick() {},
  });
  const builtInControl = api.settings.transformItems((current, context) =>
    context.pane.id === SETTINGS_BUILT_IN_PANE_ID
      ? current.map((candidate) =>
          candidate.id === builtInItem?.id
            ? { ...candidate, control: replacementBuiltInControl }
            : candidate,
        )
      : current,
  );
  activeTestDisposables?.push(builtInControl);
  const transformedBuiltInItem = api.settings
    .getGroups(SETTINGS_BUILT_IN_PANE_ID)
    .flatMap((candidate) => candidate.items)
    .find((candidate) => candidate.id === builtInItem?.id);
  builtInControl.dispose();
  const restoredBuiltInItem = api.settings
    .getGroups(SETTINGS_BUILT_IN_PANE_ID)
    .flatMap((candidate) => candidate.items)
    .find((candidate) => candidate.id === builtInItem?.id);
  assert(
    builtInItem !== undefined &&
      transformedBuiltInItem?.origin === "app" &&
      transformedBuiltInItem.control === replacementBuiltInControl &&
      restoredBuiltInItem?.control === originalBuiltInControl,
    "an extension control replaces and restores a built-in row control",
  );

  const builtInGroup = api.settings
    .getGroups(SETTINGS_BUILT_IN_PANE_ID)
    .find(
      (candidate) =>
        candidate.origin === "app" && typeof candidate.id === "string",
    );
  const builtInGroupId = builtInGroup?.id ?? "missing-built-in-group";
  const originalBuiltInDescription = builtInGroup?.description;
  const originalBuiltInFooter = builtInGroup?.footer;
  const originalBuiltInKeywords = builtInGroup?.keywords;
  let clearBuiltInMetadata = false;
  const metadata = api.settings.transformGroups((current, pane) =>
    pane.id === SETTINGS_BUILT_IN_PANE_ID
      ? current.map((candidate) =>
          candidate.id === builtInGroupId
            ? clearBuiltInMetadata
              ? {
                  ...candidate,
                  title: undefined,
                  description: undefined,
                  footer: undefined,
                  keywords: undefined,
                }
              : {
                  ...candidate,
                  title: "Transformed built-in title",
                  description: "Transformed built-in description",
                  footer: "Transformed built-in footer",
                  keywords: ["transformed-built-in-keyword"],
                }
            : candidate,
        )
      : current,
  );
  const metadataPassThrough = api.settings.transformGroups(
    (current) => current,
  );
  activeTestDisposables?.push(metadata, metadataPassThrough);
  const transformedBuiltInGroup = api.settings
    .getGroups(SETTINGS_BUILT_IN_PANE_ID)
    .find((candidate) => candidate.id === builtInGroupId);
  clearBuiltInMetadata = true;
  metadata.invalidate();
  const clearedBuiltInGroup = api.settings
    .getGroups(SETTINGS_BUILT_IN_PANE_ID)
    .find((candidate) => candidate.id === builtInGroupId);
  metadataPassThrough.dispose();
  metadata.dispose();
  const restoredBuiltInGroup = api.settings
    .getGroups(SETTINGS_BUILT_IN_PANE_ID)
    .find((candidate) => candidate.id === builtInGroupId);
  assert(
    builtInGroup?.id !== undefined &&
      transformedBuiltInGroup?.title === "Transformed built-in title" &&
      transformedBuiltInGroup.description ===
        "Transformed built-in description" &&
      transformedBuiltInGroup.footer === "Transformed built-in footer" &&
      transformedBuiltInGroup.keywords?.includes(
        "transformed-built-in-keyword",
      ) &&
      clearedBuiltInGroup !== undefined &&
      clearedBuiltInGroup.title === undefined &&
      clearedBuiltInGroup.description === undefined &&
      clearedBuiltInGroup.footer === undefined &&
      clearedBuiltInGroup.keywords === undefined &&
      restoredBuiltInGroup !== undefined &&
      restoredBuiltInGroup.title === builtInGroup.title &&
      restoredBuiltInGroup.description === originalBuiltInDescription &&
      restoredBuiltInGroup.footer === originalBuiltInFooter &&
      JSON.stringify(restoredBuiltInGroup.keywords) ===
        JSON.stringify(originalBuiltInKeywords),
    "built-in group metadata is changed and removed through the public model",
  );
});

test("settings: invalidation recomputes rows and disposal removes contributions", async () => {
  let revision = 1;
  const navigation = api.settings.transformCategories((categories) => [
    ...categories,
    {
      id: `${EXT_ID}.invalidate-category`,
      label: "Invalidation",
      panes: [{ id: SETTINGS_PANE_ID, label: "Invalidation" }],
    },
  ]);
  const groups = api.settings.transformGroups((current, pane) =>
    pane.id === SETTINGS_PANE_ID
      ? [
          ...current,
          {
            id: SETTINGS_GROUP_ID,
            items: [
              {
                id: SETTINGS_TOGGLE_ID,
                label: `Revision ${revision}`,
              },
            ],
          },
        ]
      : current,
  );
  activeTestDisposables?.push(navigation, groups);
  assert(await api.settings.open(SETTINGS_PANE_ID), "fixture pane opens");
  assert(
    api.settings.getGroups(SETTINGS_PANE_ID)[0]?.items[0]?.label ===
      "Revision 1",
    "initial row state is effective",
  );
  revision = 2;
  groups.invalidate();
  assert(
    api.settings.getGroups(SETTINGS_PANE_ID)[0]?.items[0]?.label ===
      "Revision 2",
    "invalidation recomputes the affected rows",
  );
  groups.dispose();
  assert(
    api.settings.getGroups(SETTINGS_PANE_ID).length === 0,
    "disposing the group transformer removes its contribution",
  );
});

test("settings: unknown panes and rows fail closed", async () => {
  assert(
    !(await api.settings.open(`${EXT_ID}.missing`)),
    "an unknown pane does not open",
  );
  const navigation = api.settings.transformCategories((categories) => [
    ...categories,
    {
      id: `${EXT_ID}.missing-category`,
      label: "Missing item fixture",
      panes: [{ id: SETTINGS_PANE_ID, label: "Missing item fixture" }],
    },
  ]);
  activeTestDisposables?.push(navigation);
  assert(
    !(await api.settings.open(SETTINGS_PANE_ID, {
      itemId: `${EXT_ID}.missing-item`,
    })),
    "an unknown row reports failure after opening its pane",
  );
});

// --------------------------------------------------------------------------
// Tests: appearance API
// --------------------------------------------------------------------------

test("appearance: reports the effective color scheme", () => {
  const scheme = api.appearance.getColorScheme();
  assert(
    scheme === "light" || scheme === "dark",
    "effective appearance is light or dark",
  );
});

test("appearance: native color-picker sessions dismiss and settle", async () => {
  const first = api.appearance.openColorPicker({
    initialColor: "#3A83F7",
    title: "API test color",
    onChange() {},
  });
  const second = api.appearance.openColorPicker({
    initialColor: "#53B559",
    title: "Queued API test color",
    onChange() {},
  });
  activeTestDisposables?.push(first, second);

  first.dispose();
  assert(
    (await first.result) === undefined,
    "disposing the visible picker settles without a color",
  );
  second.dispose();
  assert(
    (await second.result) === undefined,
    "disposing a queued picker settles without a color",
  );
  first.dispose();
  second.dispose();
});

test("appearance: native color picker rejects invalid options", () => {
  let invalidColorRejected = false;
  try {
    api.appearance.openColorPicker({
      initialColor: "red" as `#${string}`,
      title: "Invalid color",
      onChange() {},
    });
  } catch {
    invalidColorRejected = true;
  }
  assert(invalidColorRejected, "non-hex initial colors are rejected");

  let missingCallbackRejected = false;
  try {
    api.appearance.openColorPicker({
      initialColor: "#3A83F7",
      title: "Invalid callback",
      onChange: undefined as never,
    });
  } catch {
    missingCallbackRejected = true;
  }
  assert(missingCallbackRejected, "a live-change callback is required");
});

test("appearance.header: properties update immediately and dispose restores prior values", () => {
  const baseline = api.appearance.header.getProperties();
  const registration = registerHeaderProperties({
    "--header-background-color": {
      light: "rgb(220, 252, 231)",
      dark: "rgb(0, 80, 45)",
    },
    "--header-foreground-color": {
      light: "rgb(5, 46, 22)",
      dark: "white",
    },
  });
  const firstProperties = api.appearance.header.getProperties();
  assert(
    [
      JSON.stringify({
        "--header-background-color": "rgb(220, 252, 231)",
        "--header-foreground-color": "rgb(5, 46, 22)",
      }),
      JSON.stringify({
        "--header-background-color": "rgb(0, 80, 45)",
        "--header-foreground-color": "white",
      }),
    ].includes(JSON.stringify(firstProperties)),
    "registered header properties match one complete appearance",
  );

  registration.update({
    "--header-background-color": {
      light: "rgb(219, 234, 254)",
      dark: "rgb(23, 37, 84)",
    },
  });
  const updatedProperties = api.appearance.header.getProperties();
  const expectedUpdatedProperties = {
    ...baseline,
    "--header-background-color": updatedProperties["--header-background-color"],
  };
  assert(
    ["rgb(219, 234, 254)", "rgb(23, 37, 84)"].includes(
      updatedProperties["--header-background-color"] ?? "",
    ) &&
      JSON.stringify(updatedProperties) ===
        JSON.stringify(expectedUpdatedProperties),
    "update replaces the registration and applies immediately",
  );

  registration.update({});
  assert(
    JSON.stringify(api.appearance.header.getProperties()) ===
      JSON.stringify(baseline),
    "an empty registration reveals the prior appearance",
  );

  registration.dispose();
  assert(
    JSON.stringify(api.appearance.header.getProperties()) ===
      JSON.stringify(baseline),
    "dispose restores prior header properties",
  );
  registration.dispose();
});

test("appearance.header: registrations compose per property in registration order", () => {
  const first = registerHeaderProperties({
    "--header-background-color": { light: "red", dark: "blue" },
    "--header-foreground-color": { light: "black", dark: "white" },
  });
  const second = registerHeaderProperties({
    "--header-foreground-color": { light: "orange", dark: "yellow" },
  });
  const initial = api.appearance.header.getProperties();
  assert(
    (initial["--header-background-color"] === "red" &&
      initial["--header-foreground-color"] === "orange") ||
      (initial["--header-background-color"] === "blue" &&
        initial["--header-foreground-color"] === "yellow"),
    "later registrations override only properties they supply",
  );

  first.update({
    "--header-background-color": { light: "pink", dark: "purple" },
    "--header-foreground-color": { light: "green", dark: "lime" },
  });
  const updated = api.appearance.header.getProperties();
  assert(
    (updated["--header-background-color"] === "pink" &&
      updated["--header-foreground-color"] === "orange") ||
      (updated["--header-background-color"] === "purple" &&
        updated["--header-foreground-color"] === "yellow"),
    "updates retain their registration precedence",
  );

  second.dispose();
  const revealed = api.appearance.header.getProperties();
  assert(
    (revealed["--header-background-color"] === "pink" &&
      revealed["--header-foreground-color"] === "green") ||
      (revealed["--header-background-color"] === "purple" &&
        revealed["--header-foreground-color"] === "lime"),
    "disposing the winner reveals the earlier registration",
  );
});

test("appearance.header: rejects unknown properties and invalid colors", () => {
  let unknownRejected = false;
  try {
    api.appearance.header.registerProperties({
      "--unknown-header-property": { light: "red", dark: "blue" },
    } as never);
  } catch {
    unknownRejected = true;
  }
  assert(unknownRejected, "unknown properties are rejected");

  let colorRejected = false;
  try {
    api.appearance.header.registerProperties({
      "--header-background-color": {
        light: "definitely-not-a-color",
        dark: "black",
      },
    });
  } catch {
    colorRejected = true;
  }
  assert(colorRejected, "invalid CSS colors are rejected");

  let incompletePairRejected = false;
  try {
    api.appearance.header.registerProperties({
      "--header-background-color": { light: "white" },
    } as never);
  } catch {
    incompletePairRejected = true;
  }
  assert(incompletePairRejected, "incomplete appearance pairs are rejected");
});

// --------------------------------------------------------------------------
// Tests: authentication API
// --------------------------------------------------------------------------

profileTest(
  "authentication: current credentials expose stable inspectable identity",
  async () => {
    const current = await api.authentication.getCurrent();
    assert(current, "authenticated test profile has current credentials");
    assert(current.userId.length > 0, "current credentials have a user id");
    assert(
      current.label.length > 0,
      "current credentials have a preferred account label",
    );
    assert(
      current.authJson.length > 0,
      "current credentials include opaque JSON",
    );
    const inspected = await api.authentication.inspect(current.authJson);
    assert(
      inspected.userId === current.userId,
      "inspection returns the same user id",
    );
    assert(
      inspected.label === current.label,
      "inspection returns the same preferred account label",
    );
  },
);

test("authentication: invalid serialized credentials are rejected", async () => {
  let rejected = false;
  try {
    await api.authentication.inspect("not json");
  } catch {
    rejected = true;
  }
  assert(rejected, "invalid credentials are rejected");
});

test("authentication: stored identity distinguishes ChatGPT accounts for one user", async () => {
  const credentials = (accountId: string, userId: string, tokenId: string) => {
    const claims = btoa(
      JSON.stringify({
        jti: tokenId,
        "https://api.openai.com/auth": {
          chatgpt_account_id: accountId,
          user_id: userId,
        },
        "https://api.openai.com/profile": {
          email: "shared@example.com",
        },
      }),
    )
      .replaceAll("+", "-")
      .replaceAll("/", "_")
      .replaceAll("=", "");
    return JSON.stringify({
      tokens: { access_token: `header.${claims}.signature` },
    });
  };

  const first = await api.authentication.inspect(
    credentials("account-a", "shared-user", "first-token"),
  );
  const refreshed = await api.authentication.inspect(
    credentials("account-a", "shared-user", "refreshed-token"),
  );
  const second = await api.authentication.inspect(
    credentials("account-b", "shared-user", "second-token"),
  );

  assert(
    first.userId === refreshed.userId,
    "the same account keeps its identity across token refreshes",
  );
  assert(
    first.userId !== second.userId,
    "different accounts for one user have different identities",
  );
});

profileTest(
  "authentication: native sign-in starts and credential replacement preserves the selected account",
  async () => {
    const current = await api.authentication.getCurrent();
    assert(current, "authenticated test profile has credentials to restore");
    let changes = 0;
    const registration = api.authentication.onDidChange(() => {
      changes += 1;
    });
    await api.authentication.startSignIn();
    await api.authentication.replaceCurrent(current.authJson);
    const restored = await api.authentication.getCurrent();
    assert(
      restored?.userId === current.userId,
      "replacement committed the selected account",
    );
    assert(changes === 1, "replacement emits one authentication change");
    registration.dispose();
    await api.authentication.replaceCurrent(current.authJson);
    assert(changes === 1, "disposed authentication listener is not called");
  },
);

// --------------------------------------------------------------------------
// Entry points
// --------------------------------------------------------------------------

let api: PlatformApi;
let visualFixtures: Disposable[] = [];
let threadListVisualFixture: Disposable | undefined;
let assistantSelectionReadiness: Disposable | undefined;

const ASSISTANT_SELECTION_VISUAL_ID = `${EXT_ID}.assistant-selection-visual`;
const ASSISTANT_SELECTION_VISUAL_CHILD_ID = `${ASSISTANT_SELECTION_VISUAL_ID}-child`;

function removeThreadListVisualFixture(): void {
  threadListVisualFixture?.dispose();
  visualFixtures = visualFixtures.filter(
    (fixture) => fixture !== threadListVisualFixture,
  );
  threadListVisualFixture = undefined;
}

export function activate(platformApi: PlatformApi): void {
  api = platformApi;
  void runAll();
}

export function deactivate(): void {
  assistantSelectionReadiness?.dispose();
  assistantSelectionReadiness = undefined;
  removeThreadListVisualFixture();
  for (const fixture of visualFixtures.reverse()) fixture.dispose();
  visualFixtures = [];
  delete (globalThis as Record<string, unknown>)
    .__CGPTX_REMOVE_THREAD_LIST_VISUAL_FIXTURE__;
  delete (globalThis as Record<string, unknown>)
    .__CGPTX_ASSISTANT_SELECTION_REQUESTED__;
}

function installVisualFixture(): void {
  if (!NO_PROFILE) {
    const builtInToMove = items().find(
      (item) => item.origin === "app" && item.kind === "action",
    );
    assert(builtInToMove, "visual fixture found a built-in item to move");

    visualFixtures.push(
      register((current) => [
        ...current.filter((item) => item.id !== builtInToMove.id),
        { kind: "separator", id: VISUAL_SEPARATOR_ID },
        {
          kind: "action",
          id: VISUAL_RICH_ID,
          label: "Binding Rich Item",
          icon: "person",
          rightIcon: "chevron-right",
          subText: "Binding subtext",
          keyboardShortcut: "⌘T",
          onClick: () => {
            const fixture = globalThis as Record<string, unknown>;
            fixture.__CGPTX_VISUAL_CLICK_COUNT__ =
              Number(fixture.__CGPTX_VISUAL_CLICK_COUNT__ ?? 0) + 1;
          },
        },
        {
          kind: "action",
          id: VISUAL_DISABLED_ID,
          label: "Binding Disabled Item",
          disabled: true,
        },
        {
          kind: "action",
          id: VISUAL_PARENT_ID,
          label: "Binding Submenu",
          items: [
            {
              kind: "action",
              id: VISUAL_CHILD_ID,
              label: "Binding Child Item",
              onClick: () => {
                const fixture = globalThis as Record<string, unknown>;
                fixture.__CGPTX_VISUAL_CHILD_CLICK_COUNT__ =
                  Number(fixture.__CGPTX_VISUAL_CHILD_CLICK_COUNT__ ?? 0) + 1;
              },
            },
            builtInToMove,
          ],
        },
      ]),
    );
    (globalThis as Record<string, unknown>).__CGPTX_VISUAL_MOVED_ID__ =
      builtInToMove.id;
    (globalThis as Record<string, unknown>).__CGPTX_ACTIVATE_VISUAL_PARENT__ =
      () => api.menus.profile.activateItem(VISUAL_PARENT_ID);
  }
  threadListVisualFixture = api.threads.list.registerItem((thread) => {
    if (thread.threadId !== observedThreadListContext?.threadId)
      return undefined;
    return {
      view: () => {
        const bar = document.createElement("span");
        bar.setAttribute("aria-hidden", "true");
        bar.setAttribute("data-api-test-suite-thread-list-view", "");
        bar.style.cssText =
          "display:block;width:3px;height:14px;flex:none;border-radius:9999px;background:#E11D48";
        return bar;
      },
    };
  });
  visualFixtures.push(threadListVisualFixture);
  visualFixtures.push(
    api.menus.assistantSelection.transformItems((current, context) => [
      ...current,
      {
        kind: "action",
        id: ASSISTANT_SELECTION_VISUAL_ID,
        label: "React",
        onClick: () => {
          const fixture = globalThis as Record<string, unknown>;
          fixture.__CGPTX_ASSISTANT_SELECTION_PARENT_CLICK_COUNT__ =
            Number(
              fixture.__CGPTX_ASSISTANT_SELECTION_PARENT_CLICK_COUNT__ ?? 0,
            ) + 1;
        },
        items: [
          {
            kind: "action",
            id: ASSISTANT_SELECTION_VISUAL_CHILD_ID,
            label: "👍",
            labelScale: 2,
            verticalPadding: 4,
            onClick: (activation) => {
              const fixture = globalThis as Record<string, unknown>;
              fixture.__CGPTX_ASSISTANT_SELECTION_CLICK_COUNT__ =
                Number(
                  fixture.__CGPTX_ASSISTANT_SELECTION_CLICK_COUNT__ ?? 0,
                ) + 1;
              fixture.__CGPTX_ASSISTANT_SELECTION_META_KEY__ =
                activation.metaKey;
              fixture.__CGPTX_ASSISTANT_SELECTION_ANNOTATION_PROMISE__ =
                context
                  .createResponseAnnotation("User reacted with 👍", {
                    submit: activation.metaKey,
                  })
                  .catch((error: unknown) => {
                    fixture.__CGPTX_ASSISTANT_SELECTION_ANNOTATION_ERROR__ =
                      String(error);
                  });
            },
          },
          {
            kind: "action",
            id: `${ASSISTANT_SELECTION_VISUAL_ID}-down`,
            label: "👎",
            labelScale: 2,
            verticalPadding: 4,
          },
          {
            kind: "action",
            id: `${ASSISTANT_SELECTION_VISUAL_ID}-unsure`,
            label: "🤷",
            labelScale: 2,
            verticalPadding: 4,
          },
          {
            kind: "action",
            id: `${ASSISTANT_SELECTION_VISUAL_ID}-angry`,
            label: "🤬",
            labelScale: 2,
            verticalPadding: 4,
          },
        ],
      },
    ]),
  );
  (
    globalThis as Record<string, unknown>
  ).__CGPTX_REMOVE_THREAD_LIST_VISUAL_FIXTURE__ = removeThreadListVisualFixture;
  (globalThis as Record<string, unknown>).__CGPTX_BINDING_FIXTURE_READY__ =
    true;
}

async function runAll(): Promise<void> {
  const results: TestResult[] = [];
  if (!NO_PROFILE) {
    // OAuth mode must reach the authenticated profile menu before testing.
    const ready = await waitFor(
      () => api.menus.profile.getItems().some((item) => item.origin === "app"),
      20000,
    );
    if (!ready) {
      results.push({
        name: "readiness: built-in profile menu items present",
        pass: false,
        error: "no built-in profile menu items within 20s (unauthenticated?)",
      });
      (globalThis as Record<string, unknown>)[RESULTS_KEY] = results;
      console.error(`[${EXT_ID}] readiness gate failed`);
      return;
    }
  }
  const threadReady = await waitFor(() => {
    observedThreadContext = api.threads.getCurrent();
    return (
      observedThreadContext !== undefined &&
      api.menus.thread
        .getItems(observedThreadContext.threadId)
        .some((item) => item.origin === "app")
    );
  }, 20000);
  if (!threadReady) {
    results.push({
      name: "readiness: built-in thread menu items present",
      pass: false,
      error: "no persisted thread menu within 20s",
    });
    (globalThis as Record<string, unknown>)[RESULTS_KEY] = results;
    console.error(`[${EXT_ID}] thread readiness gate failed`);
    return;
  }
  assistantSelectionReadiness = api.menus.assistantSelection.transformItems(
    (current, context) => {
      observedAssistantSelectionContext = context;
      return current;
    },
  );
  (
    globalThis as Record<string, unknown>
  ).__CGPTX_ASSISTANT_SELECTION_REQUESTED__ = true;
  const assistantSelectionReady = await waitFor(
    () =>
      observedAssistantSelectionContext !== undefined &&
      api.menus.assistantSelection
        .getItems()
        .some((item) => item.origin === "app"),
    20000,
  );
  if (!assistantSelectionReady) {
    assistantSelectionReadiness.dispose();
    assistantSelectionReadiness = undefined;
    results.push({
      name: "readiness: built-in assistant-selection actions present",
      pass: false,
      error: "no assistant-text selection toolbar within 20s",
    });
    (globalThis as Record<string, unknown>)[RESULTS_KEY] = results;
    console.error(`[${EXT_ID}] assistant-selection readiness gate failed`);
    return;
  }
  for (const { name, fn } of tests) {
    activeTestDisposables = [];
    try {
      await fn();
      results.push({ name, pass: true });
      console.log(`[${EXT_ID}] PASS ${name}`);
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      results.push({ name, pass: false, error: message });
      console.error(`[${EXT_ID}] FAIL ${name}: ${message}`);
    } finally {
      for (const disposable of activeTestDisposables.reverse()) {
        disposable.dispose();
      }
      activeTestDisposables = undefined;
    }
  }
  assistantSelectionReadiness.dispose();
  assistantSelectionReadiness = undefined;
  (globalThis as Record<string, unknown>)[RESULTS_KEY] = results;
  const failed = results.filter((r) => !r.pass).length;
  if (failed === 0) installVisualFixture();
  console.log(
    `[${EXT_ID}] done: ${results.length - failed}/${results.length} passed`,
  );
}
