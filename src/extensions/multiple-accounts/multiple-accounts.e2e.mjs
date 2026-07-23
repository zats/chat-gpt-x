/**
 * Stable live integration check for the multiple-accounts extension.
 *
 * Usage: node multiple-accounts.e2e.mjs [port]
 *
 * The isolated fixture must start with one active auth.json and one different
 * auth-*.json in the extension's storage. The test switches through the
 * extension-contributed menu action and restores the original account.
 */

const port = process.argv[2] ?? "9222";
const targets = await fetch(`http://127.0.0.1:${port}/json`).then((response) =>
  response.json(),
);
const page =
  targets.find(
    (target) => target.type === "page" && target.url.startsWith("app:"),
  ) ?? targets.find((target) => target.type === "page");

if (!page) throw new Error(`No ChatGPT page target on CDP port ${port}`);

const socket = new WebSocket(page.webSocketDebuggerUrl);
await new Promise((resolve, reject) => {
  socket.addEventListener("open", resolve, { once: true });
  socket.addEventListener("error", reject, { once: true });
});

let nextId = 0;
function send(method, params) {
  return new Promise((resolve, reject) => {
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
}

async function evaluate(expression) {
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
}

async function waitFor(expression, timeoutMs = 30_000) {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    if (await evaluate(expression)) return;
    await new Promise((resolve) => setTimeout(resolve, 100));
  }
  throw new Error(`Timed out waiting for: ${expression}`);
}

await waitFor("Boolean(globalThis.__CGPTX_HOST__)");
const result = await evaluate(`(async () => {
  let api;
  globalThis.__CGPTX_HOST__.registerExtension("multiple-accounts-e2e", {
    activate(value) {
      api = value;
    },
  });
  if (!api) throw new Error("public API was not provided");

  const waitUntil = async (label, condition, timeoutMs = 30_000) => {
    const deadline = Date.now() + timeoutMs;
    while (Date.now() < deadline) {
      if (await condition()) return;
      await new Promise((resolve) => setTimeout(resolve, 100));
    }
    throw new Error("timed out waiting for " + label);
  };
  const accountChildren = () => {
    const account = api.menus.profile
      .getItems()
      .find((item) => item.id === "codex.profileDropdown.account");
    return account?.kind === "action" ? account.items ?? [] : [];
  };

  const original = await api.authentication.getCurrent();
  if (!original) throw new Error("default account is missing");
  await waitUntil("alternate account menu item", () =>
    accountChildren().some(
      (item) =>
        item.kind === "action" &&
        item.id.startsWith("multiple-accounts.account."),
    ),
  );
  const target = accountChildren().find(
    (item) =>
      item.kind === "action" &&
      item.id.startsWith("multiple-accounts.account."),
  );
  if (!target) throw new Error("alternate account menu item is missing");

  let switched = false;
  try {
    if (!api.menus.profile.activateItem(target.id)) {
      throw new Error("alternate account menu item did not activate");
    }
    await waitUntil("alternate account activation", async () => {
      const current = await api.authentication.getCurrent();
      return current?.userId !== original.userId;
    });
    switched = true;

    await waitUntil("default account menu item", () =>
      accountChildren().some(
        (item) =>
          item.kind === "action" &&
          item.id ===
            "multiple-accounts.account." +
              encodeURIComponent(original.userId),
      ),
    );
    const restoreId =
      "multiple-accounts.account." + encodeURIComponent(original.userId);
    if (!api.menus.profile.activateItem(restoreId)) {
      throw new Error("default account menu item did not activate");
    }
    await waitUntil("default account restoration", async () => {
      const current = await api.authentication.getCurrent();
      return current?.userId === original.userId;
    });
    switched = false;
  } finally {
    if (switched) await api.authentication.replaceCurrent(original.authJson);
  }

  const restored = await api.authentication.getCurrent();
  return {
    switched: true,
    restored: restored?.userId === original.userId,
  };
})()`);
socket.close();

if (!result?.switched || !result?.restored) {
  throw new Error(
    `multiple-accounts integration failed: ${JSON.stringify(result)}`,
  );
}
console.log(JSON.stringify(result));
process.exit(0);
