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
 */

import type {
  Disposable,
  PlatformApi,
  ProfileMenuItem,
} from "../../platform/types";

const EXT_ID = "api-test-suite";
const RESULTS_KEY = "__CGPTX_TEST_RESULTS__";

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
  transform: (
    items: readonly ProfileMenuItem[],
  ) => readonly ProfileMenuItem[],
): Disposable {
  const disposable = api.menus.profile.transformItems(transform);
  activeTestDisposables?.push(disposable);
  return disposable;
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

test("profile-menu: contributes an action item and dispose removes it", () => {
  const registration = register((items) => [
    ...items,
    { kind: "action", id: ID_BASIC, label: "Basic" },
  ]);
  assert(byId(ID_BASIC), "contributed item is in the effective list");
  registration.dispose();
  assert(!byId(ID_BASIC), "item is gone after dispose");
  registration.dispose();
  assert(!byId(ID_BASIC), "dispose is idempotent");
});

test("profile-menu: built-in items pass through unchanged", () => {
  const baseline = items();
  assert(baseline.length > 0, "menu has built-in items");
  const registration = register((items) => items);
  assert(
    JSON.stringify(items()) === JSON.stringify(baseline),
    "identity transform yields the identical effective list",
  );
  registration.dispose();
});

test("profile-menu: can remove a built-in item, dispose restores it", () => {
  const victim = items()[0];
  assert(victim, "found a built-in item to remove");
  const registration = register((items) =>
    items.filter((item) => item.id !== victim.id),
  );
  assert(!byId(victim.id), "built-in item was removed");
  registration.dispose();
  assert(byId(victim.id), "built-in item is restored after dispose");
});

test("profile-menu: transformers chain in registration order", () => {
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

test("profile-menu: throwing transformer is isolated", () => {
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

test("profile-menu: accepts and preserves all item affordances", () => {
  const registration = register((items) => [
    ...items,
    {
      kind: "action",
      id: ID_RICH,
      label: "Rich",
      icon: "settings",
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
    assert(item.icon === "settings", "icon preserved");
    assert(item.rightIcon === "chevron-right", "rightIcon preserved");
    assert(item.subText === "sub", "subText preserved");
    assert(item.keyboardShortcut === "⌘T", "keyboardShortcut preserved");
    assert(item.disabled === true, "disabled preserved");
  }
  registration.dispose();
});

test("profile-menu: activateItem fires onClick, disabled item does not", () => {
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
});

test("profile-menu: separator contribution increments by exactly one", () => {
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
});

test("profile-menu: drops items with foreign-namespace ids", () => {
  const registration = register((items) => [
    ...items,
    { kind: "action", id: `someone-else.item`, label: "Foreign" },
  ]);
  assert(!byId("someone-else.item"), "foreign-id item is not effective");
  registration.dispose();
});

test("profile-menu: stamps origins and drops duplicate ids", () => {
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

test("profile-menu: throwing onClick is isolated", () => {
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
    api.menus.profile.activateItem(ID_AFTER_THROW) === true &&
      afterThrow === 1,
    "later actions remain activatable",
  );
  registration.dispose();
});

test("profile-menu: built-in items expose stable, unique ids", () => {
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

test("profile-menu: replaces a built-in item in place by id", () => {
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

test("profile-menu: built-in replacement inherits omitted fields", () => {
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
});

test("profile-menu: submenu children are live, expandable items", () => {
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
    api.menus.profile.activateItem(ID_PARENT) === true &&
      parentClicks === 0,
    "activating a parent expands it instead of firing onClick",
  );
  assert(
    api.menus.profile.activateItem(ID_CHILD) === true && childClicks === 1,
    "child item is activatable and its onClick fired",
  );
  registration.dispose();
});

test("profile-menu: validates nested item namespaces and duplicates", () => {
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
  const children =
    parent?.kind === "action" ? (parent.items ?? []) : [];
  assert(children.length === 1, "invalid nested items are dropped");
  assert(children[0]?.id === ID_CHILD, "valid nested item remains");
  registration.dispose();
});

// --------------------------------------------------------------------------
// Entry points
// --------------------------------------------------------------------------

let api: PlatformApi;
let visualFixture: Disposable | undefined;

export function activate(platformApi: PlatformApi): void {
  api = platformApi;
  void runAll();
}

export function deactivate(): void {
  visualFixture?.dispose();
  visualFixture = undefined;
}

function installVisualFixture(): void {
  const builtInToMove = items().find(
    (item) => item.origin === "app" && item.kind === "action",
  );
  assert(builtInToMove, "visual fixture found a built-in item to move");

  visualFixture = register((current) => [
    ...current.filter((item) => item.id !== builtInToMove.id),
    { kind: "separator", id: VISUAL_SEPARATOR_ID },
    {
      kind: "action",
      id: VISUAL_RICH_ID,
      label: "Binding Rich Item",
      icon: "settings",
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
  ]);
  (globalThis as Record<string, unknown>).__CGPTX_VISUAL_MOVED_ID__ =
    builtInToMove.id;
  (
    globalThis as Record<string, unknown>
  ).__CGPTX_ACTIVATE_VISUAL_PARENT__ = () =>
    api.menus.profile.activateItem(VISUAL_PARENT_ID);
  (globalThis as Record<string, unknown>).__CGPTX_BINDING_FIXTURE_READY__ = true;
}

async function runAll(): Promise<void> {
  const results: TestResult[] = [];
  // Readiness gate: the app must reach a state where the profile menu's
  // built-in items exist (authenticated session, header mounted). Bounded
  // wait; failing the gate is a failure, not a skip.
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
  (globalThis as Record<string, unknown>)[RESULTS_KEY] = results;
  const failed = results.filter((r) => !r.pass).length;
  if (failed === 0) installVisualFixture();
  console.log(
    `[${EXT_ID}] done: ${results.length - failed}/${results.length} passed`,
  );
}
