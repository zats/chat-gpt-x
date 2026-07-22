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
const LOGOUT_ROW_ID = "codex.profileDropdown.logOut";
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
  readonly logOut: (nativeLogout: () => void) => void;
}

export function authenticationFileName(userId: string): string {
  return `auth-${encodeURIComponent(userId)}.json`;
}

export async function saveAuthentication(storage: ExtensionStorage, authentication: CurrentAuthentication): Promise<void> {
  await storage.writeTextFile(authenticationFileName(authentication.userId), authentication.authJson);
}

export async function discoverAccounts(storage: ExtensionStorage, authentication: AuthenticationApi): Promise<readonly StoredAccount[]> {
  const accounts: StoredAccount[] = [];
  for (const fileName of await storage.listFiles()) {
    if (!AUTH_FILE_PATTERN.test(fileName) || fileName.includes("/")) continue;
    const authJson = await storage.readTextFile(fileName);
    if (authJson === undefined) continue;
    try {
      const identity = await authentication.inspect(authJson);
      accounts.push({ fileName, ...identity });
    } catch (error) {
      console.error(`[${EXTENSION_ID}] invalid stored authentication: ${fileName}`, error);
    }
  }
  return accounts.sort((left, right) => left.label.localeCompare(right.label) || left.userId.localeCompare(right.userId));
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

export async function logOutCurrent(storage: ExtensionStorage, authentication: AuthenticationApi, accounts: readonly StoredAccount[], nativeLogout: () => void): Promise<void> {
  const current = await authentication.getCurrent();
  if (current) await storage.deleteFile(authenticationFileName(current.userId));
  const nextAccount = accounts.find((account) => account.userId !== current?.userId);
  if (nextAccount) {
    await replaceWithStoredAccount(storage, authentication, nextAccount);
    return;
  }
  nativeLogout();
}

export function transformProfileMenuItems(items: readonly ProfileMenuItem[], currentUserId: string, currentLabel: string, accounts: readonly StoredAccount[], actions: AccountMenuActions): readonly ProfileMenuItem[] {
  const row = items.find((item) => item.id === ACCOUNT_ROW_ID && item.kind === "action");
  const logout = items.find((item) => item.id === LOGOUT_ROW_ID && item.kind === "action" && typeof item.onClick === "function");
  if (!row && !logout) return items;
  const accountItems = row?.kind === "action"
    ? [
        { kind: "action", id: PROFILE_ITEM_ID, label: "Profile", icon: "person", onClick: row.onClick } satisfies ProfileMenuActionItem,
        ...accounts
          .filter((account) => account.userId !== currentUserId)
          .map((account): ProfileMenuActionItem => ({
            kind: "action",
            id: `${EXTENSION_ID}.account.${encodeURIComponent(account.userId)}`,
            label: account.label,
            icon: "person",
            onClick: () => actions.selectAccount(account),
          })),
        ...(row.items ?? []),
        { kind: "action", id: ADD_ACCOUNT_ITEM_ID, label: "Add account", icon: "plus", onClick: actions.addAccount } satisfies ProfileMenuActionItem,
      ]
    : undefined;

  return items.map((item): ProfileMenuItem => {
    if (item.id === ACCOUNT_ROW_ID && row?.kind === "action" && accountItems) return { ...row, label: currentLabel, items: accountItems };
    if (item.id === LOGOUT_ROW_ID && item.kind === "action" && typeof item.onClick === "function") {
      const nativeLogout = item.onClick;
      return { ...item, onClick: () => actions.logOut(nativeLogout) };
    }
    return item;
  });
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
    logOut: (nativeLogout) => {
      void logOutCurrent(storage, api.authentication, state.accounts, nativeLogout).catch((error) => console.error(`[${EXTENSION_ID}] failed to log out`, error));
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
