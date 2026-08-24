import assert from "node:assert/strict";
import { test } from "node:test";

import { productShellStatus } from "./wait-for-chatgpt-product-shell.mjs";

test("accepts the native ChatGPT app shell", () => {
  assert.deepEqual(
    productShellStatus({
      hasMainSurface: true,
      hasVisibleDialog: false,
      pageText: "",
    }),
    { ready: true },
  );
});

test("identifies known optional product UI", () => {
  assert.deepEqual(
    productShellStatus({
      hasMainSurface: false,
      hasVisibleDialog: false,
      pageText: "Welcome. Which best describes your work?",
    }),
    { ready: false, blocker: "work-role onboarding" },
  );
});

test("keeps an unknown blocker distinct", () => {
  assert.deepEqual(
    productShellStatus({
      hasMainSurface: false,
      hasVisibleDialog: false,
      pageText: "Please wait",
    }),
    { ready: false },
  );
});

test("rejects a visible startup dialog over the product shell", () => {
  assert.deepEqual(
    productShellStatus({
      hasMainSurface: true,
      hasVisibleDialog: true,
      pageText: "A new optional announcement",
    }),
    { ready: false, blocker: "unexpected startup dialog" },
  );
});
