import { readFile } from "node:fs/promises";

const port = process.argv[2] ?? "9451";
const timeoutMs = Number(process.argv[3] ?? "90000");
const authenticationPath = process.argv[4];
const authenticationJson = authenticationPath
  ? await readFile(authenticationPath, "utf8")
  : undefined;
const targets = await fetch(`http://127.0.0.1:${port}/json`).then((response) =>
  response.json(),
);
const page = targets.find(
  (target) => target.type === "page" && target.url === "app://-/index.html",
);

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

const deadline = Date.now() + timeoutMs;
while (Date.now() < deadline) {
  const ready = await evaluate(`(async () => {
    if (!globalThis.__CGPTX_LOCAL_CI_API__) {
      const host = globalThis.__CGPTX_HOST__;
      if (!host) return false;
      host.registerExtension("local-ci-readiness", {
        activate(api) {
          globalThis.__CGPTX_LOCAL_CI_API__ = api;
        },
      });
    }
    const api = globalThis.__CGPTX_LOCAL_CI_API__;
    if (!api) return false;
    const current = await api.authentication.getCurrent();
    if (
      !current ||
      !api.menus.profile.getItems().some((item) => item.origin === "app")
    ) {
      return false;
    }
    const inspected = ${
      authenticationJson === undefined
        ? "undefined"
        : `await api.authentication.inspect(${JSON.stringify(authenticationJson)})`
    };
    return {
      currentUserId: current.userId,
      inspectedUserId: inspected?.userId,
    };
  })()`);
  if (ready) {
    socket.close();
    console.log(JSON.stringify(ready));
    process.exit(0);
  }
  await new Promise((resolve) => setTimeout(resolve, 100));
}

socket.close();
throw new Error(`Authenticated profile was not ready within ${timeoutMs}ms`);
