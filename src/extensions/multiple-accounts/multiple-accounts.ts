/**
 * multiple-accounts — groups the profile menu's account-related built-in
 * items under the account row as an in-place expanding submenu (chevron).
 *
 * Contributes no new items: it locates built-in items by their stable ids
 * (derived from the app's own i18n message ids — see
 * src/platform/bindings/<version>/DERIVATION.md) and moves them inside the
 * account row's `items`. Identity-preserved moves keep the app's original
 * icons, labels, and onClick handlers.
 *
 * No-op when the account row or no account-related items are present (the
 * set of auth items varies with sign-in state).
 */

import type { PlatformApi, ProfileMenuItem } from "../../platform/types";

/** Stable id of the profile menu's account (identity) row. */
const ACCOUNT_ROW_ID = "codex.profileDropdown.account";

/** Stable ids of built-in account-related items to group under the row. */
const ACCOUNT_ITEM_IDS = new Set([
  "codex.profileDropdown.switchToOpenAIAccount",
  "codex.profileDropdown.switchToCopilotAccount",
  "codex.profileDropdown.signInWithOpenAI",
]);

export function activate(api: PlatformApi): void {
  api.menus.profile.transformItems((items) => {
    const row = items.find(
      (item) => item.id === ACCOUNT_ROW_ID && item.kind === "action",
    );
    const accounts = items.filter((item) => ACCOUNT_ITEM_IDS.has(item.id));
    if (!row || row.kind !== "action" || accounts.length === 0) {
      return items;
    }
    return items
      .filter((item) => !ACCOUNT_ITEM_IDS.has(item.id))
      .map((item): ProfileMenuItem =>
        item.id === ACCOUNT_ROW_ID ? { ...row, items: accounts } : item,
      );
  });
}

export function deactivate(): void {
  // no-op
}
