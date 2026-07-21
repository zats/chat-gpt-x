/**
 * api-test-suite — mechanical end-to-end test extension.
 *
 * Exercises every public API path declared in src/platform/types.d.ts,
 * deterministically, and reports results on `globalThis.__CGPTX_TEST_RESULTS__`
 * (and console). A binding is "working" exactly when this suite passes in the
 * real app.
 *
 * DOM locators used here are deliberate anchor-class-3+ choices (library
 * invariants and our own labels — never minified names):
 *   - profile menu trigger: the button containing the avatar image
 *     (`img.rounded-full`)
 *   - menu content: `[role="menu"]` or `[data-radix-menu-content]`
 *   - our items: found by their unique test labels
 * The binding work for each app version validates these locators; if the app
 * changes them, update them HERE (tests are allowed to evolve with the app —
 * assertions are not).
 *
 * Layer note (per .agents/skills/manage-platform-api/references/app-facts.md):
 * these are UI-level tests — the profile menu only exists in an authenticated
 * session.
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

type TestFn = () => Promise<void>;

const tests: Array<{ name: string; fn: TestFn }> = [];

function test(name: string, fn: TestFn): void {
  tests.push({ name, fn });
}

function assert(condition: unknown, message: string): asserts condition {
  if (!condition) throw new Error(`assertion failed: ${message}`);
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

/** Poll `fn` until it returns a truthy value or the timeout elapses. */
async function until<T>(fn: () => T | null, timeoutMs = 3000): Promise<T> {
  const start = Date.now();
  for (;;) {
    const value = fn();
    if (value) return value;
    if (Date.now() - start > timeoutMs) {
      throw new Error("timed out waiting for condition");
    }
    await sleep(50);
  }
}

// --------------------------------------------------------------------------
// Profile-menu DOM helpers
// --------------------------------------------------------------------------

function profileMenuTrigger(): HTMLButtonElement | null {
  const buttons = Array.from(document.querySelectorAll("button"));
  return (
    (buttons.find((b) => b.querySelector("img.rounded-full")) as
      | HTMLButtonElement
      | undefined) ?? null
  );
}

function menuRoot(): HTMLElement | null {
  return (
    document.querySelector<HTMLElement>('[role="menu"]') ??
    document.querySelector<HTMLElement>("[data-radix-menu-content]")
  );
}

function menuItemTexts(): string[] {
  const root = menuRoot();
  if (!root) return [];
  return Array.from(root.querySelectorAll('[role="menuitem"]')).map(
    (el) => el.textContent ?? "",
  );
}

function findItem(label: string): HTMLElement | null {
  const root = menuRoot();
  if (!root) return null;
  const items = Array.from(root.querySelectorAll('[role="menuitem"]'));
  return (
    (items.find((el) => (el.textContent ?? "").includes(label)) as
      | HTMLElement
      | undefined) ?? null
  );
}

async function openProfileMenu(): Promise<void> {
  const trigger = await until(profileMenuTrigger);
  trigger.click();
  await until(menuRoot);
}

async function closeProfileMenu(): Promise<void> {
  document.dispatchEvent(
    new KeyboardEvent("keydown", { key: "Escape", bubbles: true }),
  );
  await until(() => (menuRoot() === null ? true : null));
}

/** Run `body` with the profile menu open; always close it afterwards. */
async function withOpenMenu(body: () => void | Promise<void>): Promise<void> {
  await openProfileMenu();
  try {
    await body();
  } finally {
    await closeProfileMenu();
  }
}

/** Register a transform and wait one tick so the next render picks it up. */
function register(
  api: PlatformApi,
  transform: (
    items: readonly ProfileMenuItem[],
  ) => readonly ProfileMenuItem[],
): Disposable {
  return api.menus.profile.transformItems(transform);
}

// --------------------------------------------------------------------------
// Tests: profile menu API
// --------------------------------------------------------------------------

const LABEL_BASIC = `${EXT_ID} basic item`;
const LABEL_CHAIN_A = `${EXT_ID} chain A`;
const LABEL_CHAIN_B = `${EXT_ID} chain B`;
const LABEL_RICH = `${EXT_ID} rich item`;
const LABEL_CLICK = `${EXT_ID} click item`;
const LABEL_FOREIGN = `${EXT_ID} foreign item`;

test("profile-menu: contributes an action item and dispose removes it", async () => {
  const registration = register(api, (items) => [
    ...items,
    { kind: "action", id: `${EXT_ID}.basic`, label: LABEL_BASIC },
  ]);
  await withOpenMenu(() => {
    assert(findItem(LABEL_BASIC), "contributed item is rendered");
  });
  registration.dispose();
  await withOpenMenu(() => {
    assert(!findItem(LABEL_BASIC), "item is gone after dispose");
  });
});

test("profile-menu: built-in items pass through unchanged", async () => {
  let baseline: string[] = [];
  await withOpenMenu(() => {
    baseline = menuItemTexts();
  });
  assert(baseline.length > 0, "menu has built-in items");
  const registration = register(api, (items) => items);
  await withOpenMenu(() => {
    assert(
      JSON.stringify(menuItemTexts()) === JSON.stringify(baseline),
      "identity transform renders the identical menu",
    );
  });
  registration.dispose();
});

test("profile-menu: can remove a built-in item", async () => {
  let victimLabel: string | null = null;
  await withOpenMenu(() => {
    victimLabel = menuItemTexts()[0] ?? null;
  });
  assert(victimLabel, "found a built-in item to remove");
  const registration = register(api, (items) =>
    items.filter((item) => item.origin !== "app" || item !== items[0]),
  );
  await withOpenMenu(() => {
    assert(
      !menuItemTexts().includes(victimLabel as string),
      "first built-in item was removed",
    );
  });
  registration.dispose();
});

test("profile-menu: transformers chain in registration order", async () => {
  const seenBySecond: string[] = [];
  const first = register(api, (items) => [
    ...items,
    { kind: "action", id: `${EXT_ID}.chain-a`, label: LABEL_CHAIN_A },
  ]);
  const second = register(api, (items) => {
    seenBySecond.push(
      ...items
        .filter((i) => i.kind === "action" && i.id === `${EXT_ID}.chain-a`)
        .map((i) => i.id),
    );
    return [
      ...items,
      { kind: "action", id: `${EXT_ID}.chain-b`, label: LABEL_CHAIN_B },
    ];
  });
  await withOpenMenu(() => {
    assert(findItem(LABEL_CHAIN_A), "first transformer's item rendered");
    assert(findItem(LABEL_CHAIN_B), "second transformer's item rendered");
  });
  assert(
    seenBySecond.length > 0,
    "second transformer received first transformer's output",
  );
  first.dispose();
  second.dispose();
});

test("profile-menu: throwing transformer is isolated", async () => {
  const bad = register(api, () => {
    throw new Error("intentional test failure");
  });
  const good = register(api, (items) => [
    ...items,
    { kind: "action", id: `${EXT_ID}.basic`, label: LABEL_BASIC },
  ]);
  await withOpenMenu(() => {
    assert(menuRoot(), "menu still renders despite throwing transformer");
    assert(findItem(LABEL_BASIC), "other transformer still contributes");
  });
  bad.dispose();
  good.dispose();
});

test("profile-menu: renders disabled, subText, keyboardShortcut and icon", async () => {
  const registration = register(api, (items) => [
    ...items,
    {
      kind: "action",
      id: `${EXT_ID}.rich`,
      label: LABEL_RICH,
      icon: "settings",
      subText: "sub",
      keyboardShortcut: "⌘T",
      disabled: true,
    },
  ]);
  await withOpenMenu(() => {
    const el = findItem(LABEL_RICH);
    assert(el, "rich item rendered");
    assert(el!.querySelector("svg"), "icon rendered as svg");
    assert(
      (el!.textContent ?? "").includes("sub"),
      "subText rendered",
    );
    assert(
      (el!.textContent ?? "").includes("⌘T"),
      "keyboardShortcut rendered",
    );
    assert(
      el!.getAttribute("aria-disabled") === "true" ||
        el!.hasAttribute("data-disabled") ||
        el!.getAttribute("aria-disabled") === "",
      "item renders disabled",
    );
  });
  registration.dispose();
});

test("profile-menu: onClick fires", async () => {
  let clicked = false;
  const registration = register(api, (items) => [
    ...items,
    {
      kind: "action",
      id: `${EXT_ID}.click`,
      label: LABEL_CLICK,
      onClick: () => {
        clicked = true;
      },
    },
  ]);
  await openProfileMenu();
  const el = findItem(LABEL_CLICK);
  assert(el, "click item rendered");
  el!.click();
  await until(() => clicked || null);
  await closeProfileMenu();
  registration.dispose();
});

test("profile-menu: separator renders", async () => {
  const registration = register(api, (items) => [
    ...items,
    { kind: "separator", id: `${EXT_ID}.sep` },
  ]);
  await withOpenMenu(() => {
    const root = menuRoot();
    assert(root, "menu open");
    assert(
      root!.querySelector('[role="separator"]'),
      "separator rendered",
    );
  });
  registration.dispose();
});

test("profile-menu: drops items with foreign-namespace ids", async () => {
  const registration = register(api, (items) => [
    ...items,
    { kind: "action", id: `someone-else.item`, label: LABEL_FOREIGN },
  ]);
  await withOpenMenu(() => {
    assert(!findItem(LABEL_FOREIGN), "foreign-id item is not rendered");
  });
  registration.dispose();
});

// --------------------------------------------------------------------------
// Entry points
// --------------------------------------------------------------------------

let api: PlatformApi;

export function activate(platformApi: PlatformApi): void {
  api = platformApi;
  void runAll();
}

export function deactivate(): void {
  // no-op
}

async function runAll(): Promise<void> {
  const results: TestResult[] = [];
  for (const { name, fn } of tests) {
    try {
      await fn();
      results.push({ name, pass: true });
      console.log(`[${EXT_ID}] PASS ${name}`);
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      results.push({ name, pass: false, error: message });
      console.error(`[${EXT_ID}] FAIL ${name}: ${message}`);
    }
  }
  (globalThis as Record<string, unknown>)[RESULTS_KEY] = results;
  const failed = results.filter((r) => !r.pass).length;
  console.log(
    `[${EXT_ID}] done: ${results.length - failed}/${results.length} passed`,
  );
}
