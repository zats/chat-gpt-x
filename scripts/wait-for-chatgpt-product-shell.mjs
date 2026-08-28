#!/usr/bin/env node

import path from "node:path";
import { pathToFileURL } from "node:url";

import {
  CdpTransportError,
  closeCdpSocket,
  connectCdpPage,
  sendCdpCommand,
} from "./cdp-client.mjs";

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

export async function waitForProductShell(port, timeoutMs) {
  const deadline = Date.now() + timeoutMs;
  let nextId = 0;
  let lastTransportError;

  while (Date.now() < deadline) {
    let socket;
    try {
      socket = await connectCdpPage(port, "app://-/index.html", deadline);
      while (Date.now() < deadline) {
        const result = await sendCdpCommand(
          socket,
          ++nextId,
          "Runtime.evaluate",
          {
            expression: `({
              hasMainSurface: document.querySelector(
                "[data-app-shell-main-surface]",
              ) !== null,
              hasVisibleDialog: [...document.querySelectorAll('[role="dialog"]')]
                .some((element) => element.getClientRects().length > 0),
              pageText: document.body?.innerText ?? "",
            })`,
            returnByValue: true,
          },
          deadline,
        );
        if (result.exceptionDetails) {
          throw new Error(
            result.exceptionDetails.exception?.description ??
              result.exceptionDetails.text ??
              "Renderer evaluation failed",
          );
        }
        const status = productShellStatus(result.result.value);
        if (status.ready) return;
        if (status.blocker) {
          throw new Error(
            `ChatGPT startup UI blocked the product shell: ${status.blocker}`,
          );
        }
        await new Promise((resolve) => setTimeout(resolve, 100));
      }
    } catch (error) {
      if (!(error instanceof CdpTransportError)) throw error;
      lastTransportError = error;
    } finally {
      closeCdpSocket(socket);
    }
    await new Promise((resolve) => setTimeout(resolve, 100));
  }

  const transportDetail = lastTransportError
    ? ` Last CDP error: ${lastTransportError.message}.`
    : "";
  throw new Error(
    `ChatGPT did not expose its product shell within ${timeoutMs}ms. An unknown product interstitial or an app-shell change can cause this failure.${transportDetail}`,
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
