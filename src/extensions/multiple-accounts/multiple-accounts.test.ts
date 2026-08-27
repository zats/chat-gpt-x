import assert from "node:assert/strict";
import test from "node:test";

import type { AuthenticationApi, CurrentAuthentication, PlatformApi, ProfileMenuActionItem, ProfileMenuItem } from "../../platform/types";
import type { ExtensionStorage } from "../../platform/utilities/extension-storage.ts";
import {
  addAccount,
  activate,
  authenticationFileName,
  discoverAccounts,
  deactivate,
  saveAuthentication,
  selectAccount,
  transformProfileMenuItems,
  type StoredAccount,
} from "./multiple-accounts.ts";

const accountRowId = "codex.profileDropdown.account";
const logoutRowId = "codex.profileDropdown.logOut";

function action(id: string, label: string, overrides: Partial<ProfileMenuActionItem> = {}): ProfileMenuActionItem {
  return { kind: "action", id, label, ...overrides };
}

function storedAccount(userId: string, label: string): StoredAccount {
  return { fileName: authenticationFileName(userId), userId, label };
}

function storage(files: Record<string, string> = {}): ExtensionStorage & { writes: Array<[string, string]>; deletes: string[] } {
  const writes: Array<[string, string]> = [];
  const deletes: string[] = [];
  return {
    writes,
    deletes,
    async listFiles() {
      return Object.keys(files);
    },
    async readTextFile(path) {
      return files[path];
    },
    async writeTextFile(path, contents) {
      writes.push([path, contents]);
      files[path] = contents;
    },
    async deleteFile(path) {
      deletes.push(path);
      delete files[path];
    },
  };
}

function authentication(overrides: Partial<AuthenticationApi> = {}): AuthenticationApi {
  return {
    async getCurrent() {
      return undefined;
    },
    async inspect(authJson) {
      const value = JSON.parse(authJson) as { userId: string; label: string };
      return value;
    },
    async startSignIn() {},
    async replaceCurrent() {},
    onDidChange() {
      return { dispose() {} };
    },
    ...overrides,
  };
}

test("the account row becomes a submenu whose Profile child preserves native navigation", () => {
  const openProfile = () => undefined;
  const account = action(accountRowId, "Current Account", { onClick: openProfile, origin: "app" });
  const settings = action("codex.profileDropdown.settingsPage", "Settings", { origin: "app" });
  const result = transformProfileMenuItems([account, settings], "current-user", "current@example.com", [], { addAccount() {}, selectAccount() {} });
  const parent = result[0];

  assert.equal(parent?.id, accountRowId);
  assert.equal(parent?.kind, "action");
  if (parent?.kind !== "action") return;
  assert.equal(parent.label, "current@example.com");
  assert.equal(parent.items?.length, 2);
  assert.deepEqual(parent.items?.[0], { kind: "action", id: "multiple-accounts.profile", label: "Profile", onClick: openProfile });
  assert.equal(result[1], settings);
});

test("Add account uses the supplied action", () => {
  let additions = 0;
  const result = transformProfileMenuItems([action(accountRowId, "Current")], "current-user", "current@example.com", [], { addAccount: () => additions += 1, selectAccount() {} });
  const parent = result[0];
  assert.equal(parent?.kind, "action");
  if (parent?.kind !== "action") return;
  const add = parent.items?.[1];
  assert.equal(add?.kind, "action");
  if (add?.kind === "action") {
    assert.equal(add.icon, "plus");
    add.onClick?.();
  }
  assert.equal(additions, 1);
});

test("stored accounts exclude the current account and remain selectable", () => {
  const selected: StoredAccount[] = [];
  const current = storedAccount("current-user", "Current");
  const other = storedAccount("other-user", "Other");
  const result = transformProfileMenuItems([action(accountRowId, "Current")], current.userId, "current@example.com", [current, other], { addAccount() {}, selectAccount: (account) => selected.push(account) });
  const parent = result[0];
  assert.equal(parent?.kind, "action");
  if (parent?.kind !== "action") return;
  assert.deepEqual(parent.items?.map((item) => item.id), ["multiple-accounts.profile", "multiple-accounts.account.other-user", "multiple-accounts.add-account"]);
  assert.equal(parent.items?.[0]?.kind === "action" ? parent.items[0].icon : undefined, undefined);
  const otherItem = parent.items?.[1];
  assert.equal(otherItem?.kind === "action" ? otherItem.icon : undefined, undefined);
  if (otherItem?.kind === "action") otherItem.onClick?.();
  assert.deepEqual(selected, [other]);
});

test("children contributed by earlier extensions are preserved", () => {
  const priorChild = action("prior.child", "Prior child", { origin: "prior" });
  const result = transformProfileMenuItems([action(accountRowId, "Current", { items: [priorChild], origin: "app" })], "current-user", "current@example.com", [], { addAccount() {}, selectAccount() {} });
  const parent = result[0];
  assert.equal(parent?.kind, "action");
  if (parent?.kind !== "action") return;
  assert.equal(parent.items?.[1], priorChild);
  assert.equal(parent.items?.at(-1)?.id, "multiple-accounts.add-account");
});

test("a menu without an account identity row is unchanged", () => {
  const items: readonly ProfileMenuItem[] = [action("codex.profileDropdown.settingsPage", "Settings", { origin: "app" })];
  assert.equal(transformProfileMenuItems(items, "current-user", "current@example.com", [], { addAccount() {}, selectAccount() {} }), items);
});

test("the native Log out row remains unchanged so ChatGPT owns confirmation", () => {
  const logout = action(logoutRowId, "Log out", { icon: "log-out", origin: "app", onClick() {} });
  const result = transformProfileMenuItems([action(accountRowId, "Current"), logout], "current-user", "current@example.com", [], {
    addAccount() {},
    selectAccount() {},
  });
  assert.equal(result[1], logout);
});

test("current credentials are saved under auth-<user-id>.json", async () => {
  const store = storage();
  const current: CurrentAuthentication = { userId: "user/id", label: "Current", authJson: "{\"tokens\":{}}" };
  await saveAuthentication(store, current);
  assert.deepEqual(store.writes, [["auth-user%2Fid.json", current.authJson]]);
});

test("two account-specific identities are saved without overwriting each other", async () => {
  const store = storage();
  const first: CurrentAuthentication = { userId: '["account-a","shared-user"]', label: "Shared", authJson: "{\"account\":\"a\"}" };
  const second: CurrentAuthentication = { userId: '["account-b","shared-user"]', label: "Shared", authJson: "{\"account\":\"b\"}" };
  await saveAuthentication(store, first);
  await saveAuthentication(store, second);
  assert.deepEqual(store.writes, [
    [authenticationFileName(first.userId), first.authJson],
    [authenticationFileName(second.userId), second.authJson],
  ]);
  assert.notEqual(authenticationFileName(first.userId), authenticationFileName(second.userId));
});

test("account discovery inspects only top-level auth JSON files and sorts labels", async () => {
  const store = storage({ "auth-b.json": JSON.stringify({ userId: "b", label: "Zulu" }), "auth-a.json": JSON.stringify({ userId: "a", label: "Alpha" }), "notes.json": "ignored", "nested/auth-c.json": JSON.stringify({ userId: "c", label: "Nested" }) });
  const accounts = await discoverAccounts(store, authentication());
  assert.deepEqual(accounts, [storedAccount("a", "Alpha"), storedAccount("b", "Zulu")]);
});

test("account discovery prefers a canonical identity file without deleting an older copy", async () => {
  const identity = { userId: '["account-a","shared-user"]', label: "Shared" };
  const canonicalFileName = authenticationFileName(identity.userId);
  const store = storage({
    "auth-shared-user.json": JSON.stringify(identity),
    [canonicalFileName]: JSON.stringify(identity),
  });
  const accounts = await discoverAccounts(store, authentication());
  assert.deepEqual(accounts, [{ fileName: canonicalFileName, ...identity }]);
  assert.deepEqual(store.deletes, []);
});

test("account discovery retains an account that exists only under its older filename", async () => {
  const identity = { userId: '["account-a","shared-user"]', label: "Shared" };
  const store = storage({
    "auth-shared-user.json": JSON.stringify(identity),
  });
  const accounts = await discoverAccounts(store, authentication());
  assert.deepEqual(accounts, [
    { fileName: "auth-shared-user.json", ...identity },
  ]);
  assert.deepEqual(store.deletes, []);
});

test("adding an account persists the current credentials before native sign-in starts", async () => {
  const order: string[] = [];
  const store = storage();
  const originalWrite = store.writeTextFile;
  store.writeTextFile = async (path, contents) => {
    order.push("write");
    await originalWrite(path, contents);
  };
  const current: CurrentAuthentication = { userId: "current-user", label: "Current", authJson: "{\"current\":true}" };
  await addAccount(store, authentication({ async getCurrent() { return current; }, async startSignIn() { order.push("sign-in"); } }));
  assert.deepEqual(order, ["write", "sign-in"]);
});

test("selecting an account reads its saved credentials and asks ChatGPT to adopt them", async () => {
  const account = storedAccount("other-user", "Other");
  const authJson = "{\"other\":true}";
  const replacements: string[] = [];
  await selectAccount(storage({ [account.fileName]: authJson }), authentication({ async replaceCurrent(value) { replacements.push(value); } }), account);
  assert.deepEqual(replacements, [authJson]);
});

test("selecting an account preserves the account being left before replacement", async () => {
  const account = storedAccount("other-user", "Other");
  const current: CurrentAuthentication = { userId: "current-user", label: "Current", authJson: "{\"current\":true}" };
  const targetAuthJson = "{\"other\":true}";
  const order: string[] = [];
  const store = storage({ [account.fileName]: targetAuthJson });
  const originalWrite = store.writeTextFile;
  store.writeTextFile = async (path, contents) => {
    order.push("save-current");
    await originalWrite(path, contents);
  };
  await selectAccount(store, authentication({ async getCurrent() { return current; }, async replaceCurrent(value) { order.push(`replace:${value}`); } }), account);
  assert.deepEqual(order, ["save-current", `replace:${targetAuthJson}`]);
  assert.deepEqual(store.writes, [[authenticationFileName(current.userId), current.authJson]]);
});

test("a failed account switch restores the account being left", async () => {
  const account = storedAccount("other-user", "Other");
  const current: CurrentAuthentication = {
    userId: "current-user",
    label: "Current",
    authJson: "{\"current\":true}",
  };
  const targetAuthJson = "{\"other\":true}";
  const replacements: string[] = [];
  const switchError = new Error("saved authentication is no longer accepted");

  await assert.rejects(
    selectAccount(
      storage({ [account.fileName]: targetAuthJson }),
      authentication({
        async getCurrent() {
          return current;
        },
        async replaceCurrent(value) {
          replacements.push(value);
          if (value === targetAuthJson) throw switchError;
        },
      }),
      account,
    ),
    switchError,
  );

  assert.deepEqual(replacements, [targetAuthJson, current.authJson]);
});

test("a successful authentication change refreshes the current and stored account menu state", async () => {
  deactivate();
  const alphaJson = JSON.stringify({ userId: "alpha", label: "alpha@example.com" });
  const betaJson = JSON.stringify({ userId: "beta", label: "beta@example.com" });
  let current: CurrentAuthentication = { userId: "alpha", label: "alpha@example.com", authJson: alphaJson };
  const files: Record<string, string> = {};
  let onChange: (() => void) | undefined;
  let transform: ((items: readonly ProfileMenuItem[]) => readonly ProfileMenuItem[]) | undefined;
  globalThis.__CGPTX_RUNTIME__ = {
    async request(method, parameters) {
      const path = parameters.path as string | undefined;
      if (method === "extension-storage.list") return Object.keys(files);
      if (method === "extension-storage.read-text") return path ? files[path] ?? null : null;
      if (method === "extension-storage.write-text") {
        files[path as string] = parameters.contents as string;
        return null;
      }
      throw new Error(`Unexpected runtime method: ${method}`);
    },
  };
  const api = {
    authentication: authentication({
      async getCurrent() { return current; },
      onDidChange(listener) {
        onChange = listener;
        return { dispose() { onChange = undefined; } };
      },
    }),
    menus: {
      profile: {
        transformItems(value) {
          transform = value;
          return { dispose() { transform = undefined; } };
        },
        getItems() { return []; },
        activateItem() { return false; },
      },
      thread: {
        transformItems() { return { dispose() {} }; },
        getItems() { return []; },
        activateItem() { return false; },
      },
    },
  } satisfies PlatformApi;

  try {
    activate(api);
    for (let attempt = 0; attempt < 20 && !transform; attempt += 1) await new Promise((resolve) => setImmediate(resolve));
    assert(transform, "initial account state loaded");
    current = { userId: "beta", label: "beta@example.com", authJson: betaJson };
    onChange?.();
    for (let attempt = 0; attempt < 20 && !files[authenticationFileName("beta")]; attempt += 1) await new Promise((resolve) => setImmediate(resolve));
    const result = transform([action(accountRowId, "Beta")]);
    const parent = result[0];
    assert.equal(parent?.kind, "action");
    if (parent?.kind !== "action") return;
    assert.equal(parent.label, "beta@example.com");
    assert.deepEqual(parent.items?.map((item) => item.label), ["Profile", "alpha@example.com", "Add account"]);
  } finally {
    deactivate();
    globalThis.__CGPTX_RUNTIME__ = undefined;
  }
});
