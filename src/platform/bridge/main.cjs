/**
 * Platform bridge — main-process injection entry.
 *
 * Loaded into the ChatGPT app's main process via `NODE_OPTIONS=--require`
 * before any app code runs. Strict no-op in every non-browser process (the
 * guard runs before any require — e.g. node:fs is unavailable in sandboxed
 * renderer contexts).
 *
 * Responsibilities:
 *  - load the exact API, binding, and extension set selected by the launch
 *    versions lock
 *  - install the binding host from the external preload before app page code
 *    (webFrame.executeJavaScript is privileged and bypasses the page CSP)
 *  - activate locked extensions in order through the host
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

  const CODEX_HOME = resolveCodexHome();
  const STATE_DIR = resolveExtensionsDirectory();
  const LOG_DIR = path.join(STATE_DIR, "log");
  const LOG_FILE = path.join(LOG_DIR, `bridge-${process.pid}.log`);
  const VERSIONS_LOCK_FILE = process.env.CHATGPTX_VERSIONS_LOCK;
  const LAUNCH_CONFIGURATION_FILE =
    process.env.CHATGPTX_LAUNCH_CONFIGURATION;
  const RESULTS_DIR = path.join(LOG_DIR, "test-results", String(process.pid));
  const PRELOAD_FILE = path.join(__dirname, "preload.cjs");
  const AUTH_FILE = path.join(CODEX_HOME, "auth.json");
  const RENDERER_BOOTSTRAP_CHANNEL = "chatgptx:renderer-bootstrap";
  const RENDERER_BOOTSTRAP_ERROR_CHANNEL =
    "chatgptx:renderer-bootstrap-error";

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

  let versions;
  try {
    if (!VERSIONS_LOCK_FILE) {
      throw new Error("CHATGPTX_VERSIONS_LOCK is required");
    }
    versions = JSON.parse(fs.readFileSync(VERSIONS_LOCK_FILE, "utf8"));
    validateVersionsLock(versions);
    log("versions-lock-loaded", {
      generation: versions.generation,
      file: VERSIONS_LOCK_FILE,
    });
  } catch (error) {
    log("versions-lock-invalid", { error: String(error) });
    return;
  }

  function componentPath(relativePath) {
    if (
      typeof relativePath !== "string" ||
      path.isAbsolute(relativePath) ||
      relativePath.split(/[\\/]/).includes("..")
    ) {
      throw new Error(`Invalid component path: ${String(relativePath)}`);
    }
    const resolved = path.resolve(STATE_DIR, relativePath);
    if (!resolved.startsWith(path.resolve(STATE_DIR) + path.sep)) {
      throw new Error(`Component path escapes the store: ${relativePath}`);
    }
    return resolved;
  }

  function validateVersionsLock(value) {
    if (
      !value ||
      value.schemaVersion !== 1 ||
      !Number.isSafeInteger(value.generation) ||
      value.generation < 1 ||
      typeof value.chatgptApi?.version !== "string" ||
      typeof value.chatgptApi?.path !== "string" ||
      typeof value.binding?.chatgpt !== "string" ||
      typeof value.binding?.version !== "string" ||
      value.binding?.chatgptApi !== value.chatgptApi.version ||
      typeof value.binding?.path !== "string" ||
      !Array.isArray(value.extensions)
    ) {
      throw new Error("Invalid component versions lock");
    }
    componentPath(value.chatgptApi.path);
    componentPath(value.binding.path);
    const ids = new Set();
    for (const extension of value.extensions) {
      if (
        typeof extension?.id !== "string" ||
        !/^[a-z0-9][a-z0-9._-]*$/i.test(extension.id) ||
        ids.has(extension.id) ||
        typeof extension?.path !== "string" ||
        typeof extension?.enabled !== "boolean"
      ) {
        throw new Error("Invalid locked extension");
      }
      ids.add(extension.id);
      componentPath(extension.path);
    }
  }

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

  async function injectIntoContents(contents, hostSource, extensions) {
    const url = contents.getURL();
    if (!url.startsWith("app:")) return;
    try {
      await contents.executeJavaScript(hostSource);
      const hostReady = await contents.executeJavaScript(
        "Boolean(window.__CGPTX_HOST__)",
      );
      if (!hostReady) throw new Error("ChatGPTX host did not initialize");
      const nativeReady = await contents.executeJavaScript(
        "Promise.resolve(window.__CGPTX_NATIVE_READY__).then((value) => value === true)",
      );
      if (!nativeReady) {
        throw new Error("ChatGPTX native binding did not initialize");
      }
    } catch (error) {
      log("host-injection-failed", { error: String(error) });
      return;
    }
    for (const extension of extensions) {
      try {
        const activated = await contents.executeJavaScript(extension.wrapped);
        if (activated !== true) {
          throw new Error("Extension did not activate");
        }
      } catch (error) {
        log("extension-injection-failed", {
          id: extension.id,
          error: String(error),
        });
        return;
      }
    }
    log("injected", { url, extensions: extensions.map((e) => e.id) });
  }

  function patchElectron(electron) {
    log("electron-intercepted");
    const { app, BrowserWindow, ipcMain, session } = electron;
    if (!app || !BrowserWindow) return undefined;

    const version = app.getVersion();
    const hostFile = path.join(componentPath(versions.binding.path), "host.js");
    let hostSource = null;
    if (version !== versions.binding.chatgpt) {
      log("bindings-missing", { version, hostFile });
    } else {
      try {
        hostSource = fs.readFileSync(hostFile, "utf8");
        log("bindings-found", { version, hostFile });
      } catch {
        log("bindings-missing", { version, hostFile });
      }
    }

    const extensionEntries = readExtensionEntries({
      configurationFile: LAUNCH_CONFIGURATION_FILE,
      versions,
      extensionsDirectory: STATE_DIR,
    });
    const extensions = extensionEntries
      .filter((entry) => entry && entry.enabled && entry.id && entry.path)
      .map((entry) => {
        try {
          const code = fs.readFileSync(entry.path, "utf8");
          log("extension-loaded", { id: entry.id, path: entry.path });
          return {
            id: entry.id,
            wrapped:
              ";(() => { const module = { exports: {} }; const exports = module.exports; try {\n" +
              code +
              `\nwindow.__CGPTX_HOST__?.registerExtension(${JSON.stringify(entry.id)}, module.exports);` +
              `\nreturn true; } catch (e) { console.error("[cgptx-bridge] extension ${entry.id} failed to load", e); return false; } })();`,
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
      return path.join(STATE_DIR, "state", extensionId);
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

    ipcMain.on(RENDERER_BOOTSTRAP_CHANNEL, (event) => {
      const url = event.senderFrame?.url ?? event.sender.getURL();
      event.returnValue = url.startsWith("app:") ? hostSource : null;
    });
    ipcMain.on(RENDERER_BOOTSTRAP_ERROR_CHANNEL, (event, error) => {
      const url = event.senderFrame?.url ?? event.sender.getURL();
      if (!url.startsWith("app:")) return;
      log("renderer-bootstrap-error", { url, error: String(error) });
    });

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
        contents.on("dom-ready", () => {
          void injectIntoContents(contents, hostSource, extensions);
        });
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
