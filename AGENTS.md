# AGENTS.md

## What this project is

Source code for an **extension platform for the ChatGPT desktop app** (macOS, Electron — bundle id `com.openai.codex`).

The platform ships inside a small external launcher app. When the user runs it, the launcher starts the stock, unmodified `ChatGPT.app` and injects the platform into it at process start. Once inside, the platform establishes a **stable, documented extension API** within the running app and **dynamically loads extensions** against that API — both extensions shipped with the product and ones contributed by other users.

Properties that define the project:

- **Non-invasive.** The ChatGPT app bundle is never modified, patched, or re-signed. Injection happens through the environment at launch (`NODE_OPTIONS=--require` into the Electron main process — verified against the installed app), so the app stays stock, keeps its signature, and auto-updates normally.
- **Stable boundary.** Extensions access capabilities exposed by ChatGPT only through `src/platform/types.d.ts`. The app's internals are minified and re-scrambled on every build; the public API is not. Version-independent functionality supplied by ChatGPTX itself lives in shared TypeScript utilities under `src/platform/utilities/`, outside the ChatGPT API and its versioned bindings. Extension authors never see or depend on app internals. "Stable" means stable *across app updates* — not backward-compatible: the API itself evolves by direct in-place change, one way, with no deprecation shims or legacy paths.
- **Native by construction.** Extensions must be indistinguishable from first-party UI — in look AND in behavior. APIs expose and reuse the app's own components (styling, keyboard navigation, focus, states, accessibility come for free); replicating an existing control is a documented last resort.
- **Versioned bindings.** `src/platform/bindings/<app-version>/` bridges one specific ChatGPT build to the stable API. The runtime selects it by app version; its manifest pins the build's `app.asar` SHA-256. When the app updates, bindings are regenerated for the new build while the public API stays unchanged.
- **Deterministic correctness.** The `api-test-suite` extension mechanically exercises every public API path inside the real app. A binding is "working" exactly when that suite passes — not before.

## Repository layout

```
src/
  platform/
    types.d.ts                  # stable API for capabilities exposed by ChatGPT
    utilities/                  # shared version-independent TypeScript utilities for extensions
    bindings/
      <app-version>/            # per-build bridge to the API + manifest.json + DERIVATION.md
  extensions/
    api-test-suite/             # mechanical e2e test extension (defines "working")
    <extension-id>/             # source: <extension-id>.ts + package.json
    build.sh                    # canonical extension build and installation entry point
.agents/skills/
  manage-platform-api/          # process skill for any public-API change (required reading)
```

`src/extensions/build.sh [<extension-id> ...]` builds every extension, or only
the listed extensions, and installs each bundle at
`~/.codex/extensions/<extension-id>/contents/main.js`. Manifests must declare
that exact `main` path. The script preserves extension-owned state; persistent
extension settings belong at `~/.codex/extensions/<extension-id>/settings.json`.
The global `~/.codex/extensions/settings.json` controls enablement and load
order. Set `CHATGPTX_EXTENSIONS_DIR` only for isolated builds and tests.

## Invariants for any change

1. Product code, tests, documentation, and defaults must work for arbitrary users and machines. Never hard-code a developer identity, account data, home directory, app installation path, or authenticated state. Use synthetic fixtures, OS discovery, configurable paths, and isolated seeded test profiles.
2. Extensions — and the `api-test-suite` — access ChatGPT only through `types.d.ts`, never through app internals, DOM structure, or minified identifiers. The suite observes ChatGPT behavior exclusively through the public API so it stays stable as bindings iterate. Shared utilities may depend only on ChatGPTX-owned, version-independent runtime services.
3. Every extension feature request must first be decomposed into **extension-specific logic**, **reusable ChatGPT integration**, and **reusable ChatGPTX functionality**. Extension-specific behavior belongs in `src/extensions/<extension-id>/`. Required ChatGPT capabilities belong in the public API; if one is missing, evolve `src/platform/types.d.ts` through `.agents/skills/manage-platform-api/SKILL.md`: clarify intent → design for N concurrent extensions (transformer / registration patterns) → document → **write tests first** → implement the current-version binding → record the derivation. Reusable functionality that ChatGPTX itself can provide without ChatGPT internals belongs in `src/platform/utilities/` and must remain separate from `types.d.ts` and versioned bindings. Extensions consume ChatGPT capabilities only through the public API, while version-specific bindings maintain that integration across ChatGPT releases.
4. **APIs land only as complete vertical slices.** A public API is "added" only together with its binding for the current (pinned) app version and a passing `api-test-suite` against the live app. `types.d.ts` must never sit ahead of working, validated bindings — an API without a green binding is unfinished work, not an API.
5. Research is done on extracted copies of the app in temp directories (see the skill's `scripts/extract-app.sh`), cleaned up afterwards — never against the installed app in place, never by modifying its bundle.
6. Durable knowledge lives in the skill's `references/`; version-specific findings live in `src/platform/bindings/<version>/DERIVATION.md`. Don't mix the two.

## Live debugging (CDP)

When doing binding work, debug against the **live app over CDP**, not by guessing from the minified build:

1. Launch through the launcher with a debug port and an isolated profile: `src/macOS/scripts/launcher-script-placeholder.sh --user-data-dir=/tmp/<profile> --remote-debugging-port=9222`
2. Targets are at `http://127.0.0.1:9222/json`; evaluate in the `app://` page via `Runtime.evaluate` (a ready helper lives at `tmp/cdp.mjs`: `node tmp/cdp.mjs '<expression>'`).
3. The injected host exposes `window.__CGPTX_HOST__._debug` for live probing of the binding.

Rules: CDP is for development-time inspection and hot-probing only — production code must never depend on it; debug scaffolding stays in `tmp/` (gitignored) or `_debug` namespaces, out of shipping paths.

## Current state

The current binding is `src/platform/bindings/26.715.70719/`. It implements `menus.profile` plus the native authentication lifecycle used by `multiple-accounts`, and passes the public API suite (20/20) and version-specific native UI suite (24/24). Reusable extension storage is provided separately by `src/platform/utilities/`. Runtime: macOS launcher + main-process bridge (injection, extension loader, scoped utility services, result reporting).
