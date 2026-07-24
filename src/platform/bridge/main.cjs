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
 *  - load enabled extensions from the resolved Codex home
 *    (in settings order = load order) and activate them through the host
 *  - report api-test-suite results in separate files per launch and renderer
 *
 * Logs JSON lines beneath the resolved Codex home.
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
  const path = require("node:path");
  const {
    resolveCodexHome,
    resolveExtensionsDirectory,
  } = require("../runtime/codex-paths.cjs");
  const {
    readExtensionEntries,
  } = require("../runtime/extension-launch-config.cjs");

  const PLATFORM_ROOT = path.join(__dirname, "..");
  const CODEX_HOME = resolveCodexHome();
  const STATE_DIR = resolveExtensionsDirectory();
  const LOG_DIR = path.join(STATE_DIR, "log");
  const LOG_FILE = path.join(LOG_DIR, `bridge-${process.pid}.log`);
  const SETTINGS_FILE = path.join(STATE_DIR, "settings.json");
  const LAUNCH_CONFIGURATION_FILE =
    process.env.CHATGPTX_LAUNCH_CONFIGURATION;
  const RESULTS_DIR = path.join(LOG_DIR, "test-results", String(process.pid));
  const PRELOAD_FILE = path.join(__dirname, "preload.cjs");
  const AUTH_FILE = path.join(CODEX_HOME, "auth.json");

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
    const { app, BrowserWindow, ipcMain, session } = electron;
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

    const extensions = readExtensionEntries({
      configurationFile: LAUNCH_CONFIGURATION_FILE,
      settingsFile: SETTINGS_FILE,
      extensionsDirectory: STATE_DIR,
    })
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
    const enabledExtensionIds = new Set(extensions.map((extension) => extension.id));

    function assertAppSender(event) {
      if (!event.sender.getURL().startsWith("app:")) {
        throw new Error("ChatGPTX runtime requests are limited to app pages");
      }
    }

    function extensionRoot(extensionId) {
      if (
        typeof extensionId !== "string" ||
        !/^[a-z0-9][a-z0-9._-]*$/i.test(extensionId) ||
        !enabledExtensionIds.has(extensionId)
      ) {
        throw new Error("Unknown extension storage scope");
      }
      return path.join(STATE_DIR, extensionId);
    }

    function scopedPath(extensionId, relativePath) {
      if (typeof relativePath !== "string" || relativePath.length === 0) {
        throw new TypeError("A relative storage path is required");
      }
      const root = extensionRoot(extensionId);
      const normalized = path.posix.normalize(relativePath.replaceAll("\\", "/"));
      if (
        normalized === "." ||
        normalized === ".." ||
        normalized.startsWith("../") ||
        path.posix.isAbsolute(normalized)
      ) {
        throw new Error("Storage path escapes the extension scope");
      }
      const resolved = path.resolve(root, ...normalized.split("/"));
      if (!resolved.startsWith(root + path.sep)) {
        throw new Error("Storage path escapes the extension scope");
      }
      return { root, resolved };
    }

    function atomicWrite(file, contents) {
      fs.mkdirSync(path.dirname(file), { recursive: true });
      const temporary = path.join(
        path.dirname(file),
        `.${path.basename(file)}.${process.pid}.${Date.now()}.tmp`,
      );
      try {
        fs.writeFileSync(temporary, contents, { encoding: "utf8", mode: 0o600 });
        fs.renameSync(temporary, file);
      } finally {
        try {
          fs.unlinkSync(temporary);
        } catch {}
      }
    }

    function listFiles(root, directory = root) {
      let entries;
      try {
        entries = fs.readdirSync(directory, { withFileTypes: true });
      } catch (error) {
        if (error?.code === "ENOENT") return [];
        throw error;
      }
      return entries.flatMap((entry) => {
        const absolute = path.join(directory, entry.name);
        if (entry.isDirectory()) return listFiles(root, absolute);
        if (!entry.isFile()) return [];
        return [path.relative(root, absolute).split(path.sep).join("/")];
      });
    }

    ipcMain.handle("chatgptx:runtime", async (event, request) => {
      assertAppSender(event);
      const method = request?.method;
      const parameters = request?.parameters ?? {};
      switch (method) {
        case "authentication.read-current": {
          try {
            return fs.readFileSync(AUTH_FILE, "utf8");
          } catch (error) {
            if (error?.code === "ENOENT") return null;
            throw error;
          }
        }
        case "authentication.replace-current": {
          const authJson = parameters.authJson;
          if (typeof authJson !== "string") {
            throw new TypeError("authJson must be a string");
          }
          const parsed = JSON.parse(authJson);
          if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) {
            throw new TypeError("authJson must contain a JSON object");
          }
          atomicWrite(AUTH_FILE, authJson);
          return null;
        }
        case "extension-storage.list": {
          const root = extensionRoot(parameters.extensionId);
          return listFiles(root).sort((left, right) => left.localeCompare(right));
        }
        case "extension-storage.read-text": {
          const { resolved } = scopedPath(parameters.extensionId, parameters.path);
          try {
            return fs.readFileSync(resolved, "utf8");
          } catch (error) {
            if (error?.code === "ENOENT") return null;
            throw error;
          }
        }
        case "extension-storage.write-text": {
          if (typeof parameters.contents !== "string") {
            throw new TypeError("Storage contents must be a string");
          }
          const { resolved } = scopedPath(parameters.extensionId, parameters.path);
          atomicWrite(resolved, parameters.contents);
          return null;
        }
        case "extension-storage.delete": {
          const { resolved } = scopedPath(parameters.extensionId, parameters.path);
          try {
            fs.unlinkSync(resolved);
          } catch (error) {
            if (error?.code !== "ENOENT") throw error;
          }
          return null;
        }
        default:
          throw new Error(`Unknown ChatGPTX runtime method: ${String(method)}`);
      }
    });

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

    const seenResults = new Set();
    setInterval(() => {
      try {
        for (const contents of electron.webContents?.getAllWebContents() ??
          []) {
          const url = contents.getURL();
          if (!url.startsWith("app:")) continue;
          if (seenResults.has(contents.id)) continue;
          contents
            .executeJavaScript(
              "JSON.stringify(window.__CGPTX_TEST_RESULTS__ ?? null)",
            )
            .then((json) => {
              if (!json || json === "null") return;
              seenResults.add(contents.id);
              fs.mkdirSync(RESULTS_DIR, { recursive: true });
              const resultsFile = path.join(
                RESULTS_DIR,
                `${contents.id}.json`,
              );
              fs.writeFileSync(resultsFile, json);
              log("test-results", {
                webContentsId: contents.id,
                url,
                file: path.relative(CODEX_HOME, resultsFile),
                json,
              });
            })
            .catch(() => {});
        }
      } catch {
        // result reporting must never break the app
      }
    }, 1000);

    const OriginalBrowserWindow = BrowserWindow;
    const PatchedBrowserWindow = class extends OriginalBrowserWindow {
      constructor(options) {
        const webPreferences = options?.webPreferences ?? {};
        const targetSession =
          webPreferences.session ??
          (webPreferences.partition
            ? session.fromPartition(webPreferences.partition)
            : session.defaultSession);
        const preloads = targetSession.getPreloads();
        if (!preloads.includes(PRELOAD_FILE)) {
          targetSession.setPreloads([...preloads, PRELOAD_FILE]);
        }
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
