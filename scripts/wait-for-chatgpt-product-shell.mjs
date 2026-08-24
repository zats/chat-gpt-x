#!/usr/bin/env node

import path from "node:path";
import { pathToFileURL } from "node:url";

const optionalProductUiMarkers = Object.freeze([
  Object.freeze({
    name: "work-role onboarding",
    text: "Which best describes your work?",
  }),
  Object.freeze({
    name: "migration announcement",
    text: "Codex is now the ChatGPT app",
  }),
]);

export function productShellStatus({
  hasMainSurface,
  hasVisibleDialog,
  pageText,
}) {
  const blocker = optionalProductUiMarkers.find(({ text }) =>
    pageText.includes(text),
  )?.name;
  if (blocker) return Object.freeze({ ready: false, blocker });
  if (hasVisibleDialog) {
    return Object.freeze({ ready: false, blocker: "unexpected startup dialog" });
  }
  return Object.freeze({ ready: hasMainSurface });
}

async function waitForProductShell(port, timeoutMs) {
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
  function evaluate(expression) {
    return new Promise((resolve, reject) => {
      const id = ++nextId;
      const onMessage = (event) => {
        const message = JSON.parse(event.data);
        if (message.id !== id) return;
        socket.removeEventListener("message", onMessage);
        if (message.error) {
          reject(new Error(JSON.stringify(message.error)));
          return;
        }
        if (message.result.exceptionDetails) {
          reject(
            new Error(
              message.result.exceptionDetails.exception?.description ??
                message.result.exceptionDetails.text ??
                "Renderer evaluation failed",
            ),
          );
          return;
        }
        resolve(message.result.result.value);
      };
      socket.addEventListener("message", onMessage);
      socket.send(
        JSON.stringify({
          id,
          method: "Runtime.evaluate",
          params: { expression, returnByValue: true },
        }),
      );
    });
  }

  try {
    const deadline = Date.now() + timeoutMs;
    while (Date.now() < deadline) {
      const snapshot = await evaluate(`({
        hasMainSurface: document.querySelector(
          "[data-app-shell-main-surface]",
        ) !== null,
        hasVisibleDialog: [...document.querySelectorAll('[role="dialog"]')]
          .some((element) => element.getClientRects().length > 0),
        pageText: document.body?.innerText ?? "",
      })`);
      const status = productShellStatus(snapshot);
      if (status.ready) return;
      if (status.blocker) {
        throw new Error(
          `ChatGPT startup UI blocked the product shell: ${status.blocker}`,
        );
      }
      await new Promise((resolve) => setTimeout(resolve, 100));
    }
  } finally {
    socket.close();
  }

  throw new Error(
    `ChatGPT did not expose its product shell within ${timeoutMs}ms. An unknown product interstitial or an app-shell change can cause this failure.`,
  );
}

if (
  process.argv[1] &&
  import.meta.url === pathToFileURL(path.resolve(process.argv[1])).href
) {
  if (process.argv.length > 4) {
    throw new Error(
      "usage: scripts/wait-for-chatgpt-product-shell.mjs [port] [timeout-ms]",
    );
  }
  const port = process.argv[2] ?? "9451";
  const timeoutMs = Number(process.argv[3] ?? "30000");
  if (!Number.isFinite(timeoutMs) || timeoutMs <= 0) {
    throw new Error("timeout-ms must be a positive number");
  }
  await waitForProductShell(port, timeoutMs);
}
