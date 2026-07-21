/**
 * Platform bridge — main-process injection entry.
 *
 * Loaded into the ChatGPT app's main process via `NODE_OPTIONS=--require`
 * before any app code runs (see AGENTS.md and
 * .agents/skills/manage-platform-api/references/app-facts.md).
 *
 * NODE_OPTIONS propagates to every child process the app spawns (renderer
 * preload Node environments, utility processes, spawned Node tools). This
 * file must therefore be a strict no-op everywhere except the Electron
 * browser (main) process — the guard below runs BEFORE any require, because
 * e.g. node:fs is unavailable in sandboxed renderer contexts.
 *
 * Current scope (placeholder phase): verify the injection surface — intercept
 * the app's `require("electron")`, observe app readiness and BrowserWindow
 * creation — and log it. No behavior is modified.
 *
 * Logs JSON lines to ~/.codex/extensions/log/bridge-<pid>.log
 */
"use strict";

if (process.type === "browser") {
  try {
    init();
  } catch {
    // the bridge must never break the app
  }
}

function init() {
  const fs = require("node:fs");
  const os = require("node:os");
  const path = require("node:path");

  const LOG_DIR = path.join(os.homedir(), ".codex", "extensions", "log");
  const LOG_FILE = path.join(LOG_DIR, `bridge-${process.pid}.log`);

  function log(event, data) {
    try {
      fs.mkdirSync(LOG_DIR, { recursive: true });
      fs.appendFileSync(
        LOG_FILE,
        JSON.stringify({ t: new Date().toISOString(), event, ...data }) + "\n",
      );
    } catch {
      // logging must never break the app
    }
  }

  log("bridge-loaded", {
    pid: process.pid,
    electron: process.versions.electron,
    node: process.version,
  });

  const Module = require("node:module");
  const originalLoad = Module._load;

  /** Memoized patched electron module (when in-place patching is impossible). */
  let electronWrapper;

  Module._load = function (request, parent, isMain) {
    const loaded = originalLoad.call(this, request, parent, isMain);
    if (request !== "electron") return loaded;
    if (electronWrapper) return electronWrapper;
    try {
      electronWrapper = patchElectron(loaded, log) ?? undefined;
    } catch (error) {
      log("patch-error", { error: String(error) });
    }
    return electronWrapper ?? loaded;
  };
}

function patchElectron(electron, log) {
  log("electron-intercepted");

  const { app, BrowserWindow } = electron;

  if (app && typeof app.whenReady === "function") {
    app.whenReady().then(() => log("app-ready"));
  }

  if (!BrowserWindow) return undefined;

  const OriginalBrowserWindow = BrowserWindow;
  const PatchedBrowserWindow = class extends OriginalBrowserWindow {
    constructor(options) {
      super(options);
      log("window-created", {
        preload: options?.webPreferences?.preload ?? null,
        contextIsolation: options?.webPreferences?.contextIsolation ?? null,
        sandbox: options?.webPreferences?.sandbox ?? null,
      });
    }
  };
  // Keep the prototype chain and statics intact; the app must not notice.
  Object.setPrototypeOf(PatchedBrowserWindow, OriginalBrowserWindow);

  // The electron module's exports are getter-only; plain assignment fails.
  // Redefine the property in place if the descriptor is configurable,
  // otherwise fall back to a memoized wrapper object returned from the
  // Module._load hook.
  const descriptor = Object.getOwnPropertyDescriptor(electron, "BrowserWindow");
  if (descriptor?.configurable) {
    Object.defineProperty(electron, "BrowserWindow", {
      ...descriptor,
      get: () => PatchedBrowserWindow,
    });
    log("browserwindow-wrapped", { how: "defineProperty" });
    return undefined;
  }

  const wrapper = Object.create(Object.getPrototypeOf(electron));
  for (const key of Reflect.ownKeys(electron)) {
    const d = Object.getOwnPropertyDescriptor(electron, key);
    if (!d) continue;
    Object.defineProperty(
      wrapper,
      key,
      key === "BrowserWindow" ? { ...d, get: () => PatchedBrowserWindow } : d,
    );
  }
  log("browserwindow-wrapped", { how: "wrapper-object" });
  return wrapper;
}
