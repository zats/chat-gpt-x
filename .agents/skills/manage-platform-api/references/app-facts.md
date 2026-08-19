# App facts: ChatGPT desktop (Codex)

## How to read this file

Sections are tagged by durability:

- **[durable]** — mechanics that change rarely (injection vector, OS/Chromium/Electron behavior, update machinery). Still sanity-check on a major Electron upgrade.
- **[snapshot: 26.715.31925]** — observed on that build, kept as an *illustrative example* of what to look for. Expect drift on the very next update; re-derive on the current build and record fresh findings in the new bindings' DERIVATION.md. Do not treat snapshot values as current truth, and do not "update" them in place without re-verifying — stale-but-confident facts are worse than none.

## Build shape [snapshot: 26.715.31925]

- Electron 150.0.7871.124 (framework renamed `Codex Framework.framework`), Node 24, arm64. Renderer and main both built with Vite/rolldown; **CJS main process**; renderer is ~189 MB / ~4650 minified ESM chunks under `webview/` inside `app.asar`.
- React 19 + **React Compiler** (`react.memo_cache_sentinel` everywhere). Fiber props are plain JSX objects and remain inspectable.
- Main entry: `.vite/build/early-bootstrap.js`. Renderer served via privileged `app:` protocol (`protocol.handle("app", …)`).
- No sourcemaps shipped. No webpack-style module registry.

## Injection [durable — re-verify fuse wire on new versions]

- Fuse wire decode: `RunAsNode=ON`, `EnableNodeOptionsEnvironmentVariable=ON`, `EnableNodeCliInspectArguments=ON`, `EnableEmbeddedAsarIntegrityValidation=OFF`, `OnlyLoadAppFromAsar=OFF`. Entitlements: no app sandbox, JIT allowed.
- Working vector: launcher runs the original binary with `NODE_OPTIONS="--require <bridge.cjs>"`. The bridge executes in the main process **before app code** and installs a `Module._load` hook to intercept the app's `require("electron")` and wrap `BrowserWindow`. Proven on the installed build.
- **ProcessSingleton gotcha**: launching while another instance runs forwards and exits *before Node boots* — the bridge never runs. For tests, launch with a throwaway `--user-data-dir=<tmp>`; this also gives an isolated profile.
- `NODE_PATH` injection does **not** work (requires inside the asar resolve absolutely). Do not attempt it.

## Renderer access [durable mechanics, snapshot settings]

- All windows: `contextIsolation:true`, `sandbox:true`, `nodeIntegration:false` *(snapshot: 26.715.31925 — re-check per version)*. Preloads are sandboxed (contextBridge/ipcRenderer/webFrame only) and run **before page scripts**.
- Page CSP is strict (`script-src 'self' 'sha256-…'`): no `<script>` injection or eval from page context. `webFrame.executeJavaScript` / `webContents.executeJavaScript` are privileged and bypass CSP — install the main-world extension host this way from our preload.
- Window hook point: all windows go through one shared factory destructuring `{ preloadPath, surfaceId, surfaceUrl, … }` into `new BrowserWindow(...)`; alternatively `ses.setPreloads([...ses.getPreloads(), ours])` (it replaces the list — preserve theirs).
- To observe React: install a `__REACT_DEVTOOLS_GLOBAL_HOOK__` interceptor before page scripts (the app's chunks reference the hook), then walk fiber roots; match components by i18n message-id props.

## UI facts (profile menu case study) [snapshot: 26.715.31925]

- The profile dropdown is **hand-written JSX, not command-registry driven**. The `codex.command.*` / `registerCommands` registry feeds the ⌘K palette only — do not try to inject menu items through it.
- Menu item component supports `LeftIcon`, `SubText`/`subTextAllowWrap`, `keyboardShortcut`, `onClick`, `disabled`; submenus exist (`SubmenuItem`, `ChevronRight`, `submenuSections`).
- DOM injection pattern: clone a real menu item node inside the Radix menu content (inherits styling, hover, keyboard nav), stamp with an extension-namespaced attribute, insert in deterministic (load) order before a stable section anchor.

## Versioning and updates [durable]

- Sparkle auto-updates swap the whole bundle. **Version key = the app version string** (`CFBundleShortVersionString`) — the bindings directory name. Version discovery requests rebinding only when the latest Sparkle version has no exact binding directory. The development pin can identify an older build that implements the current ChatGPT API.

## Testing constraints [durable]

- Deterministic tests launch the app with a throwaway `--user-data-dir`; the bridge must be loaded via `NODE_OPTIONS` the same way as production.
- Layer the suite: (a) bridge/window-hook/API-surface tests need no login and are fully deterministic; (b) UI-level tests (e.g. profile menu injection) require an authenticated session. On a dev machine, get one by **copying the local profile** (`~/Library/Application Support/Codex`, excluding `Cache`/`Code Cache`/`GPUCache`) to a temp dir and launching with `--user-data-dir` — cookie encryption is machine-local, so the copy stays authenticated; in CI, seed a test-account session. Do not weaken assertions to compensate for missing auth; report the layer honestly.
