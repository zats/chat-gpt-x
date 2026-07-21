/**
 * Platform bridge — main-process injection entry.
 *
 * Loaded into the ChatGPT app's main process via `NODE_OPTIONS=--require`
 * before any app code runs. Strict no-op in every non-browser process (the
 * guard runs before any require — e.g. node:fs is unavailable in sandboxed
 * renderer contexts).
 *
 * Responsibilities:
 *  - pick the bindings directory matching the app's own version
 *    (src/platform/bindings/<app.getVersion()>/); if none exists, log and
 *    stay inert (bindings are stale)
 *  - inject the binding host into app windows (webContents.executeJavaScript
 *    is privileged and bypasses the page CSP)
 *  - load enabled extensions from ~/.codex/extensions/settings.json
 *    (in settings order = load order) and activate them through the host
 *  - report api-test-suite results to ~/.codex/extensions/log/test-results.json
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

  const PLATFORM_ROOT = path.join(__dirname, "..");
  const STATE_DIR = path.join(os.homedir(), ".codex", "extensions");
  const LOG_DIR = path.join(STATE_DIR, "log");
  const LOG_FILE = path.join(LOG_DIR, `bridge-${process.pid}.log`);
  const SETTINGS_FILE = path.join(STATE_DIR, "settings.json");
  const RESULTS_FILE = path.join(LOG_DIR, "test-results.json");

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
  let electronWrapper;

  Module._load = function (request, parent, isMain) {
    const loaded = originalLoad.call(this, request, parent, isMain);
    if (request !== "electron") return loaded;
    if (electronWrapper) return electronWrapper;
    try {
      electronWrapper = patchElectron(loaded) ?? undefined;
    } catch (error) {
      log("patch-error", { error: String(error) });
    }
    return electronWrapper ?? loaded;
  };

  function readSettings() {
    try {
      const parsed = JSON.parse(fs.readFileSync(SETTINGS_FILE, "utf8"));
      return Array.isArray(parsed.extensions) ? parsed.extensions : [];
    } catch {
      return [];
    }
  }

  function injectIntoContents(contents, hostSource, extensions) {
    const url = contents.getURL();
    if (!url.startsWith("app:")) return;
    contents.executeJavaScript(hostSource).catch((error) => {
      log("host-injection-failed", { error: String(error) });
    });
    for (const extension of extensions) {
      contents.executeJavaScript(extension.wrapped).catch((error) => {
        log("extension-injection-failed", {
          id: extension.id,
          error: String(error),
        });
      });
    }
    log("injected", { url, extensions: extensions.map((e) => e.id) });
  }

  function patchElectron(electron) {
    log("electron-intercepted");
    const { app, BrowserWindow } = electron;
    if (!app || !BrowserWindow) return undefined;

    const version = app.getVersion();
    const hostFile = path.join(
      PLATFORM_ROOT,
      "bindings",
      version,
      "host.js",
    );
    let hostSource = null;
    try {
      hostSource = fs.readFileSync(hostFile, "utf8");
      log("bindings-found", { version, hostFile });
    } catch {
      log("bindings-missing", { version, hostFile });
    }

    const extensions = readSettings()
      .filter((entry) => entry && entry.enabled && entry.id && entry.path)
      .map((entry) => {
        try {
          const code = fs.readFileSync(entry.path, "utf8");
          return {
            id: entry.id,
            wrapped:
              ";(() => { const module = { exports: {} }; const exports = module.exports; try {\n" +
              code +
              `\nwindow.__CGPTX_HOST__?.registerExtension(${JSON.stringify(entry.id)}, module.exports);` +
              `\n} catch (e) { console.error("[cgptx-bridge] extension ${entry.id} failed to load", e); } })();`,
          };
        } catch (error) {
          log("extension-unreadable", { id: entry.id, error: String(error) });
          return null;
        }
      })
      .filter(Boolean);

    app.whenReady().then(() => {
      log("app-ready", { version });
      if (!hostSource) return;
      const { webContents } = electron;
      const attach = (contents) => {
        if (contents.__cgptxAttached) return;
        contents.__cgptxAttached = true;
        contents.on("dom-ready", () =>
          injectIntoContents(contents, hostSource, extensions),
        );
      };
      webContents.getAllWebContents().forEach(attach);
      app.on("web-contents-created", (_event, contents) => attach(contents));
    });

    // Result reporting: poll app windows for the api-test-suite results.
    const seenResults = new Set();
    setInterval(() => {
      try {
        for (const contents of electron.webContents?.getAllWebContents() ??
          []) {
          if (!contents.getURL().startsWith("app:")) continue;
          if (seenResults.has(contents.id)) continue;
          contents
            .executeJavaScript(
              "JSON.stringify(window.__CGPTX_TEST_RESULTS__ ?? null)",
            )
            .then((json) => {
              if (!json || json === "null") return;
              seenResults.add(contents.id);
              fs.mkdirSync(LOG_DIR, { recursive: true });
              fs.writeFileSync(RESULTS_FILE, json);
              log("test-results", { json });
            })
            .catch(() => {});
        }
      } catch {
        // polling must never break the app
      }
    }, 1000);

    const OriginalBrowserWindow = BrowserWindow;
    const PatchedBrowserWindow = class extends OriginalBrowserWindow {
      constructor(options) {
        super(options);
        log("window-created", {
          preload: options?.webPreferences?.preload ?? null,
        });
      }
    };
    Object.setPrototypeOf(PatchedBrowserWindow, OriginalBrowserWindow);

    const descriptor = Object.getOwnPropertyDescriptor(electron, "BrowserWindow");
    if (descriptor?.configurable) {
      Object.defineProperty(electron, "BrowserWindow", {
        ...descriptor,
        get: () => PatchedBrowserWindow,
      });
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
    return wrapper;
  }
}
