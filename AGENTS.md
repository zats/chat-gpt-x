# AGENTS.md

## What this project is

Source code for an **extension platform for the ChatGPT desktop app** (macOS, Electron — bundle id `com.openai.codex`).

The platform ships inside a small external launcher app. When the user runs it, the launcher starts the stock, unmodified `ChatGPT.app` and injects the platform into it at process start. Once inside, the platform establishes a **stable, documented extension API** within the running app and **dynamically loads extensions** against that API — both extensions shipped with the product and ones contributed by other users.

Properties that define the project:

- **Non-invasive.** The ChatGPT app bundle is never modified, patched, or re-signed. Injection happens through the environment at launch (`NODE_OPTIONS=--require` into the Electron main process — verified against the installed app), so the app stays stock, keeps its signature, and auto-updates normally.
- **Stable boundary.** Extensions compile only against `src/platform/types.d.ts`. The app's internals are minified and re-scrambled on every build; the public API is not. Extension authors never see or depend on app internals. "Stable" means stable *across app updates* — not backward-compatible: the API itself evolves by direct in-place change, one way, with no deprecation shims or legacy paths.
- **Native by construction.** Extensions must be indistinguishable from first-party UI — in look AND in behavior. APIs expose and reuse the app's own components (styling, keyboard navigation, focus, states, accessibility come for free); replicating an existing control is a documented last resort.
- **Versioned bindings.** `src/platform/bindings/<app-version>/` bridges one specific ChatGPT build to the stable API. The runtime selects it by app version; its manifest pins the build's `app.asar` SHA-256. When the app updates, bindings are regenerated for the new build while the public API stays unchanged.
- **Deterministic correctness.** The `api-test-suite` extension mechanically exercises every public API path inside the real app. A binding is "working" exactly when that suite passes — not before.

## Repository layout

```
src/
  platform/
    types.d.ts                  # the stable public API — the only thing extensions ever see
    bindings/
      <app-version>/            # per-build bridge to the API + manifest.json + DERIVATION.md
  extensions/
    api-test-suite/             # mechanical e2e test extension (defines "working")
    <extension-id>/             # first- and third-party extensions (TypeScript → built JS + package.json)
.agents/skills/
  manage-platform-api/          # process skill for any public-API change (required reading)
```

Extension runtime state lives outside the repo, in `~/.codex/extensions/` (enable/disable state in `settings.json`, per-extension data in `<id>/`).

## Invariants for any change

1. Product code, tests, documentation, and defaults must work for arbitrary users and machines. Never hard-code a developer identity, account data, home directory, app installation path, or authenticated state. Use synthetic fixtures, OS discovery, configurable paths, and isolated seeded test profiles.
2. Extensions — and the `api-test-suite` — depend only on `types.d.ts`, never on app internals, DOM structure, or minified identifiers. The suite observes behavior exclusively through the public API so it stays stable as bindings iterate.
3. The public API changes only on explicit request and only through the process in `.agents/skills/manage-platform-api/SKILL.md`: clarify intent → design for N concurrent extensions (transformer / registration patterns) → document → **write tests first** → research and implement the binding → record the derivation.
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

First vertical slice **landed**: the `menus.profile` API (transformers, stable built-in ids, replace-by-id, submenu model, `getItems`/`activateItem`) is implemented by `src/platform/bindings/26.715.52143/host.js`. It passes the public `api-test-suite` (17/17) and the version-specific live UI suite (16/16) against the live app with an isolated authenticated profile. `multiple-accounts` is the first real consumer. Runtime: macOS launcher + main-process bridge (injection, extension loader, result reporting).
