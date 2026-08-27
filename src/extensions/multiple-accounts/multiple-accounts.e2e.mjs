/**
 * Stable live integration check for the multiple-accounts extension.
 *
 * Usage: node multiple-accounts.e2e.mjs [port]
 *
 * The isolated fixture must start with one active auth.json and one different
 * auth-*.json in the extension's storage. The test switches through the
 * extension-contributed menu action, waits for the relaunched app to load the
 * selected account, and restores the original account through the same flow.
 */

const port = process.argv[2] ?? "9222";
const baseUrl = `http://127.0.0.1:${port}`;
const timeoutMs = 45_000;

const sleep = (duration) =>
  new Promise((resolve) => setTimeout(resolve, duration));

async function connect(previousTargetId) {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    try {
      const targets = await fetch(`${baseUrl}/json`).then((response) =>
        response.json(),
      );
      const page = targets.find(
        (target) =>
          target.type === "page" &&
          target.url === "app://-/index.html" &&
          target.id !== previousTargetId,
      );
      if (page) {
        const socket = new WebSocket(page.webSocketDebuggerUrl);
        await new Promise((resolve, reject) => {
          socket.addEventListener("open", resolve, { once: true });
          socket.addEventListener("error", reject, { once: true });
        });
        let nextId = 0;
        const send = (method, params) =>
          new Promise((resolve, reject) => {
            const id = ++nextId;
            const onMessage = (event) => {
              const message = JSON.parse(event.data);
              if (message.id !== id) return;
              socket.removeEventListener("message", onMessage);
              if (message.error) reject(new Error(JSON.stringify(message.error)));
              else resolve(message.result);
            };
            socket.addEventListener("message", onMessage);
            socket.send(JSON.stringify({ id, method, params }));
          });
        const evaluate = async (expression) => {
          const result = await send("Runtime.evaluate", {
            expression,
            awaitPromise: true,
            returnByValue: true,
          });
          if (result.exceptionDetails) {
            throw new Error(
              result.exceptionDetails.exception?.description ??
                result.exceptionDetails.text ??
                "Renderer evaluation failed",
            );
          }
          return result.result.value;
        };
        return {
          close: () => socket.close(),
          evaluate,
          targetId: page.id,
        };
      }
    } catch {
      // A process relaunch temporarily removes the CDP endpoint.
    }
    await sleep(100);
  }
  throw new Error("Timed out waiting for the relaunched ChatGPT page");
}

async function waitFor(session, label, expression) {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    if (await session.evaluate(expression)) return;
    await sleep(100);
  }
  throw new Error(`Timed out waiting for ${label}`);
}

async function installProbe(session) {
  await waitFor(
    session,
    "ChatGPTX host",
    "Boolean(globalThis.__CGPTX_HOST__)",
  );
  await session.evaluate(`(() => {
    let api;
    globalThis.__CGPTX_HOST__.registerExtension(
      "multiple-accounts-e2e-" + crypto.randomUUID(),
      { activate(value) { api = value; } },
    );
    if (!api) throw new Error("public API was not provided");
    globalThis.__CGPTX_MULTIPLE_ACCOUNTS_E2E_API__ = api;
    return true;
  })()`);
}

const accountSnapshotExpression = `(async () => {
  const api = globalThis.__CGPTX_MULTIPLE_ACCOUNTS_E2E_API__;
  if (!api) throw new Error("multiple-accounts probe is unavailable");
  const current = await api.authentication.getCurrent();
  const account = api.menus.profile
    .getItems()
    .find((item) => item.id === "codex.profileDropdown.account");
  const items = account?.kind === "action" ? account.items ?? [] : [];
  const bodyText = document.body.innerText;
  return {
    current,
    itemIds: items
      .filter((item) => item.kind === "action")
      .map((item) => item.id),
    profileHasIcon:
      items.find((item) => item.id === "multiple-accounts.profile")?.icon !==
      undefined,
    alternateHasIcon: items.some(
      (item) =>
        item.id.startsWith("multiple-accounts.account.") &&
        item.icon !== undefined,
    ),
    contentLoaded: !bodyText.includes("Loading chats"),
    errorVisible: /Try Again|Something went wrong|Oops/i.test(bodyText),
  };
})()`;

async function waitForHealthyAccount(session, expectedUserId) {
  await waitFor(
    session,
    "the selected account and its content",
    `(async () => {
      const snapshot = await (${accountSnapshotExpression});
      return snapshot.current?.userId === ${JSON.stringify(expectedUserId)} &&
        snapshot.contentLoaded &&
        !snapshot.errorVisible;
    })()`,
  );
  return session.evaluate(accountSnapshotExpression);
}

async function activateItem(session, itemId) {
  const activated = await session.evaluate(`
    globalThis.__CGPTX_MULTIPLE_ACCOUNTS_E2E_API__.menus.profile.activateItem(
      ${JSON.stringify(itemId)},
    )
  `);
  if (!activated) throw new Error(`Account menu item did not activate: ${itemId}`);
}

let session = await connect();
await installProbe(session);
await waitFor(
  session,
  "alternate account menu item",
  `(${accountSnapshotExpression}).then((snapshot) =>
    snapshot.itemIds.some((id) => id.startsWith("multiple-accounts.account.")),
  )`,
);
const initial = await session.evaluate(accountSnapshotExpression);
if (!initial.current) throw new Error("default account is missing");
if (initial.profileHasIcon || initial.alternateHasIcon) {
  throw new Error("account menu text items must not have icons");
}
const targetId = initial.itemIds.find((id) =>
  id.startsWith("multiple-accounts.account."),
);
if (!targetId) throw new Error("alternate account menu item is missing");
const targetUserId = decodeURIComponent(
  targetId.slice("multiple-accounts.account.".length),
);

let switched = false;
try {
  const previousTargetId = session.targetId;
  await activateItem(session, targetId);
  session.close();
  session = await connect(previousTargetId);
  await installProbe(session);
  await waitForHealthyAccount(session, targetUserId);
  switched = true;

  const restoreId =
    "multiple-accounts.account." + encodeURIComponent(initial.current.userId);
  await waitFor(
    session,
    "default account menu item after relaunch",
    `(${accountSnapshotExpression}).then((snapshot) =>
      snapshot.itemIds.includes(${JSON.stringify(restoreId)}),
    )`,
  );
  const selectedTargetId = session.targetId;
  await activateItem(session, restoreId);
  session.close();
  session = await connect(selectedTargetId);
  await installProbe(session);
  await waitForHealthyAccount(session, initial.current.userId);
  switched = false;
} finally {
  if (switched) {
    await session.evaluate(`
      globalThis.__CGPTX_MULTIPLE_ACCOUNTS_E2E_API__.authentication.replaceCurrent(
        ${JSON.stringify(initial.current.authJson)},
      )
    `);
  }
  session.close();
}

console.log(
  JSON.stringify({
    contentLoaded: true,
    iconsAbsent: true,
    processRelaunched: true,
    restored: true,
    switched: true,
  }),
);
