import type {
  AuthenticationApi,
  CurrentAuthentication,
  Disposable,
  PlatformApi,
  ProfileMenuActionItem,
  ProfileMenuItem,
} from "../../platform/types";
import {
  createExtensionStorage,
  type ExtensionStorage,
} from "../../platform/utilities/extension-storage.ts";

const EXTENSION_ID = "multiple-accounts";
const ACCOUNT_ROW_ID = "codex.profileDropdown.account";
const PROFILE_ITEM_ID = `${EXTENSION_ID}.profile`;
const ADD_ACCOUNT_ITEM_ID = `${EXTENSION_ID}.add-account`;
const AUTH_FILE_PATTERN = /^auth-.+\.json$/;

export interface StoredAccount {
  readonly fileName: string;
  readonly userId: string;
  readonly label: string;
}

export interface AccountMenuActions {
  readonly addAccount: () => void;
  readonly selectAccount: (account: StoredAccount) => void;
}

export function authenticationFileName(userId: string): string {
  return `auth-${encodeURIComponent(userId)}.json`;
}

export async function saveAuthentication(storage: ExtensionStorage, authentication: CurrentAuthentication): Promise<void> {
  await storage.writeTextFile(authenticationFileName(authentication.userId), authentication.authJson);
}

export async function discoverAccounts(storage: ExtensionStorage, authentication: AuthenticationApi): Promise<readonly StoredAccount[]> {
  const accounts = new Map<string, StoredAccount>();
  for (const fileName of await storage.listFiles()) {
    if (!AUTH_FILE_PATTERN.test(fileName) || fileName.includes("/")) continue;
    const authJson = await storage.readTextFile(fileName);
    if (authJson === undefined) continue;
    try {
      const identity = await authentication.inspect(authJson);
      const canonicalFileName = authenticationFileName(identity.userId);
      const existing = accounts.get(identity.userId);
      if (!existing || fileName === canonicalFileName) {
        accounts.set(identity.userId, { fileName, ...identity });
      }
    } catch (error) {
      console.error(`[${EXTENSION_ID}] invalid stored authentication: ${fileName}`, error);
    }
  }
  return [...accounts.values()].sort((left, right) => left.label.localeCompare(right.label) || left.userId.localeCompare(right.userId));
}

export async function addAccount(storage: ExtensionStorage, authentication: AuthenticationApi): Promise<void> {
  const current = await authentication.getCurrent();
  if (current) await saveAuthentication(storage, current);
  await authentication.startSignIn();
}

export async function selectAccount(storage: ExtensionStorage, authentication: AuthenticationApi, account: StoredAccount): Promise<void> {
  const current = await authentication.getCurrent();
  if (current) await saveAuthentication(storage, current);
  await replaceWithStoredAccount(storage, authentication, account);
}

async function replaceWithStoredAccount(storage: ExtensionStorage, authentication: AuthenticationApi, account: StoredAccount): Promise<void> {
  const authJson = await storage.readTextFile(account.fileName);
  if (authJson === undefined) throw new Error(`Stored authentication is missing: ${account.fileName}`);
  await authentication.replaceCurrent(authJson);
}

export function transformProfileMenuItems(items: readonly ProfileMenuItem[], currentUserId: string, currentLabel: string, accounts: readonly StoredAccount[], actions: AccountMenuActions): readonly ProfileMenuItem[] {
  const row = items.find((item) => item.id === ACCOUNT_ROW_ID && item.kind === "action");
  if (!row) return items;
  const accountItems = row?.kind === "action"
    ? [
        { kind: "action", id: PROFILE_ITEM_ID, label: "Profile", onClick: row.onClick } satisfies ProfileMenuActionItem,
        ...accounts
          .filter((account) => account.userId !== currentUserId)
          .map((account): ProfileMenuActionItem => ({
            kind: "action",
            id: `${EXTENSION_ID}.account.${encodeURIComponent(account.userId)}`,
            label: account.label,
            onClick: () => actions.selectAccount(account),
          })),
        ...(row.items ?? []),
        { kind: "action", id: ADD_ACCOUNT_ITEM_ID, label: "Add account", icon: "plus", onClick: actions.addAccount } satisfies ProfileMenuActionItem,
      ]
    : undefined;

  return items.map((item): ProfileMenuItem =>
    item.id === ACCOUNT_ROW_ID && row.kind === "action" && accountItems
      ? { ...row, label: currentLabel, items: accountItems }
      : item,
  );
}

let registration: Disposable | undefined;
let authenticationRegistration: Disposable | undefined;
let activationGeneration = 0;

interface MenuState {
  generation: number;
  refreshGeneration: number;
  currentUserId: string;
  currentLabel: string;
  accounts: readonly StoredAccount[];
}

export function activate(api: PlatformApi): void {
  const generation = ++activationGeneration;
  const storage = createExtensionStorage(EXTENSION_ID);
  const state: MenuState = { generation, refreshGeneration: 0, currentUserId: "", currentLabel: "", accounts: [] };
  authenticationRegistration = api.authentication.onDidChange(() => {
    void refreshMenuState(api, storage, state).catch((error) => console.error(`[${EXTENSION_ID}] failed to refresh accounts`, error));
  });
  void refreshMenuState(api, storage, state).catch((error) => console.error(`[${EXTENSION_ID}] activation failed`, error));
}

async function refreshMenuState(api: PlatformApi, storage: ExtensionStorage, state: MenuState): Promise<void> {
  const refreshGeneration = ++state.refreshGeneration;
  const current = await api.authentication.getCurrent();
  if (!current || state.generation !== activationGeneration) return;
  await saveAuthentication(storage, current);
  const accounts = await discoverAccounts(storage, api.authentication);
  if (state.generation !== activationGeneration || refreshGeneration !== state.refreshGeneration) return;
  state.currentUserId = current.userId;
  state.currentLabel = current.label;
  state.accounts = accounts;

  const actions: AccountMenuActions = {
    addAccount: () => {
      void addAccount(storage, api.authentication).catch((error) => console.error(`[${EXTENSION_ID}] failed to start sign-in`, error));
    },
    selectAccount: (account) => {
      void selectAccount(storage, api.authentication, account).catch((error) => console.error(`[${EXTENSION_ID}] failed to switch account`, error));
    },
  };
  registration ??= api.menus.profile.transformItems((items) => transformProfileMenuItems(items, state.currentUserId, state.currentLabel, state.accounts, actions));
}

export function deactivate(): void {
  activationGeneration += 1;
  registration?.dispose();
  registration = undefined;
  authenticationRegistration?.dispose();
  authenticationRegistration = undefined;
}
