/**
 * multiple-accounts — turns the profile menu's account identity row into an
 * in-place expanding submenu (chevron).
 *
 * The active identity is always the first child. Any authentication choices
 * ChatGPT currently exposes are moved below it. App labels, icons, and
 * handlers are preserved.
 */

import type {
  Disposable,
  PlatformApi,
  ProfileMenuActionItem,
  ProfileMenuItem,
} from "../../platform/types";

/** Stable id of the profile menu's account (identity) row. */
const ACCOUNT_ROW_ID = "codex.profileDropdown.account";

const CURRENT_ACCOUNT_ITEM_ID = "multiple-accounts.current";

/** Stable ids of built-in authentication choices to group under the row. */
const ACCOUNT_ACTION_IDS = new Set([
  "codex.profileDropdown.switchToOpenAIAccount",
  "codex.profileDropdown.switchToCopilotAccount",
  "codex.profileDropdown.signInWithOpenAI",
]);

export function transformProfileMenuItems(
  items: readonly ProfileMenuItem[],
): readonly ProfileMenuItem[] {
  const row = items.find(
    (item) => item.id === ACCOUNT_ROW_ID && item.kind === "action",
  );
  if (!row || row.kind !== "action") return items;

  const accountActions = items.filter((item) =>
    ACCOUNT_ACTION_IDS.has(item.id),
  );
  const {
    id: _id,
    items: _items,
    origin: _origin,
    rightIcon: _rightIcon,
    ...activeAccountFields
  } = row;
  const activeAccount: ProfileMenuActionItem = {
    ...activeAccountFields,
    id: CURRENT_ACCOUNT_ITEM_ID,
  };

  return items
    .filter((item) => !ACCOUNT_ACTION_IDS.has(item.id))
    .map((item): ProfileMenuItem =>
      item.id === ACCOUNT_ROW_ID
        ? {
            ...row,
            items: [activeAccount, ...accountActions, ...(row.items ?? [])],
          }
        : item,
    );
}

let registration: Disposable | undefined;

export function activate(api: PlatformApi): void {
  registration = api.menus.profile.transformItems(transformProfileMenuItems);
}

export function deactivate(): void {
  registration?.dispose();
  registration = undefined;
}
