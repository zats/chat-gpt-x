import assert from "node:assert/strict";
import test from "node:test";

import type {
  ProfileMenuActionItem,
  ProfileMenuItem,
} from "../../platform/types";
import { transformProfileMenuItems } from "./multiple-accounts.ts";

const accountId = "codex.profileDropdown.account";
const accountLabel = "Example Account";

function action(
  id: string,
  label: string,
  overrides: Partial<ProfileMenuActionItem> = {},
): ProfileMenuActionItem {
  return { kind: "action", id, label, ...overrides };
}

test("the active account is always exposed through the account submenu", () => {
  const openProfile = () => undefined;
  const account = action(accountId, accountLabel, {
    icon: "person",
    rightIcon: "external-link",
    onClick: openProfile,
    origin: "app",
  });
  const settings = action("codex.profileDropdown.settingsPage", "Settings", {
    origin: "app",
  });

  const result = transformProfileMenuItems([account, settings]);
  const parent = result[0];

  assert.equal(parent?.id, accountId);
  assert.equal(parent?.kind, "action");
  if (parent?.kind !== "action") return;
  assert.equal(parent.items?.length, 1);

  const current = parent.items?.[0];
  assert.deepEqual(current, {
    kind: "action",
    id: "multiple-accounts.current",
    label: accountLabel,
    icon: "person",
    onClick: openProfile,
  });
  assert.equal(result[1], settings);
});

test("available authentication choices move under the account row", () => {
  const account = action(accountId, accountLabel, { origin: "app" });
  const openAI = action(
    "codex.profileDropdown.switchToOpenAIAccount",
    "Use OpenAI account",
    { origin: "app" },
  );
  const settings = action("codex.profileDropdown.settingsPage", "Settings", {
    origin: "app",
  });
  const signIn = action(
    "codex.profileDropdown.signInWithOpenAI",
    "Sign in with ChatGPT",
    { origin: "app" },
  );

  const result = transformProfileMenuItems([
    account,
    openAI,
    settings,
    signIn,
  ]);
  assert.deepEqual(
    result.map((item) => item.id),
    [accountId, settings.id],
  );

  const parent = result[0];
  assert.equal(parent?.kind, "action");
  if (parent?.kind !== "action") return;
  assert.equal(parent.items?.[1], openAI);
  assert.equal(parent.items?.[2], signIn);
});

test("children contributed by earlier extensions are preserved", () => {
  const priorChild = action("prior.child", "Prior child", {
    origin: "prior",
  });
  const account = action(accountId, accountLabel, {
    items: [priorChild],
    origin: "app",
  });

  const result = transformProfileMenuItems([account]);
  const parent = result[0];
  assert.equal(parent?.kind, "action");
  if (parent?.kind !== "action") return;
  assert.equal(parent.items?.[1], priorChild);
});

test("a menu without an account identity row is unchanged", () => {
  const items: readonly ProfileMenuItem[] = [
    action("codex.profileDropdown.settingsPage", "Settings", {
      origin: "app",
    }),
  ];

  assert.equal(transformProfileMenuItems(items), items);
});
