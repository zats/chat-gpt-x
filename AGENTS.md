# AGENTS.md

## What this project is

Source code for an **extension platform for the ChatGPT desktop app** (macOS, Electron — bundle id `com.openai.codex`).

The platform ships inside a small external launcher app. When the user runs it, the launcher starts the stock, unmodified `ChatGPT.app` and injects the platform into it at process start. Once inside, the platform establishes a **stable, documented extension API** within the running app and **dynamically loads extensions** against that API — both extensions shipped with the product and ones contributed by other users.

Properties that define the project:

- **Non-invasive.** The ChatGPT app bundle is never modified, patched, or re-signed. Injection happens through the environment at launch (`NODE_OPTIONS=--require` into the Electron main process — verified against the installed app), so the app stays stock, keeps its signature, and auto-updates normally.
- **Stable boundary.** Extensions access capabilities exposed by ChatGPT only through `src/platform/types.d.ts`. The app's internals are minified and re-scrambled on every build; the public API is not. Version-independent functionality supplied by ChatGPTX itself lives in shared TypeScript utilities under `src/platform/utilities/`, outside the ChatGPT API and its versioned bindings. Extension authors never see or depend on app internals. "Stable" means stable *across app updates* — not backward-compatible: the API itself evolves by direct in-place change, one way, with no deprecation shims or legacy paths.
- **Native by construction.** Extensions must be indistinguishable from first-party UI — in look AND in behavior. APIs expose and reuse the app's own components (styling, keyboard navigation, focus, states, accessibility come for free); replicating an existing control is a documented last resort.
- **Versioned bindings.** `src/platform/bindings/<app-version>/` bridges one specific ChatGPT build to one exact ChatGPT API version. Its manifest declares its own `version`, `chatgpt`, `chatgptApi`, and the build's `app.asar` SHA-256. `src/platform/bindings/manifest.json` identifies the current ChatGPT version and stock download URL used by CI. A correction for the same ChatGPT build increments the binding version.
- **Deterministic correctness.** The `api-test-suite` extension mechanically exercises every public API path inside the real app. A binding is "working" exactly when that suite passes — not before.

## Repository layout

```
src/
  platform/
    manifest.json               # current ChatGPT API version
    types.d.ts                  # stable API for capabilities exposed by ChatGPT
    utilities/                  # shared version-independent TypeScript utilities for extensions
    bindings/
      manifest.json             # current app version and stock download URL used by CI
      <app-version>/            # per-build bridge to the API + manifest.json + DERIVATION.md
  extensions/
    api-test-suite/             # mechanical e2e test extension (defines "working")
    <extension-id>/             # source: <extension-id>.ts + package.json
    build.sh                    # canonical local extension build entry point
backend/
  version-watcher/              # Cloudflare Worker that detects unbound Sparkle versions
scripts/
  run-local-ci.sh               # isolated authenticated end-to-end suite
.github/workflows/ci.yml        # pinned-version checks on every main commit and PR
updates/
  latest.json                   # latest API, binding, and extension releases
.agents/skills/
  manage-platform-api/          # process skill for any public-API change (required reading)
```

`src/extensions/build.sh [<extension-id> ...]` builds every extension, or only
the listed extensions, under
`${TMPDIR}/ChatGPTX/extension-builds/<extension-id>/` for launch-scoped
development. `CHATGPTX_EXTENSION_BUILD_DIR` overrides that output root.
Manifests declare `contents/main.js`, their semantic version, and
`compatibility.chatgpt` plus `compatibility.chatgptApi` ranges.
Released code lives under
`<Codex home>/extensions/components/extensions/<extension-id>/<version>/`;
persistent state lives under
`<Codex home>/extensions/state/<extension-id>/`. The global
`<Codex home>/extensions/settings.json` contains IDs, enablement, and order
without executable paths. `resolveCodexHome()` defines Codex home from
`CODEX_HOME`, defaulting to `$HOME/.codex`.

Run the packaged launcher with `--test-api` to restart ChatGPT with only its
bundled `api-test-suite`. Pass
`--extension <absolute-package-directory-or-main.js>` to override an installed
extension or load a development extension for that launch. CI builds
`api-test-suite` locally and passes it through `--extension`. Additional
arguments are forwarded to ChatGPT in test mode for isolated profiles and CDP.

## Invariants for any change

1. Product code, tests, documentation, and defaults must work for arbitrary users and machines. Never hard-code a developer identity, account data, home directory, app installation path, or authenticated state. Use synthetic fixtures, OS discovery, configurable paths, and isolated seeded test profiles.
2. Extensions — and the `api-test-suite` — access ChatGPT only through `types.d.ts`, never through app internals, DOM structure, or minified identifiers. The suite observes ChatGPT behavior exclusively through the public API so it stays stable as bindings iterate. Shared utilities may depend only on ChatGPTX-owned, version-independent runtime services.
3. Every extension feature request must first be decomposed into **extension-specific logic**, **reusable ChatGPT integration**, and **reusable ChatGPTX functionality**. Extension-specific behavior belongs in `src/extensions/<extension-id>/`. Required ChatGPT capabilities belong in the public API; if one is missing, evolve `src/platform/types.d.ts` through `.agents/skills/manage-platform-api/SKILL.md`: clarify intent → design for N concurrent extensions (transformer / registration patterns) → document → **write tests first** → implement the current-version binding → record the derivation. Reusable functionality that ChatGPTX itself can provide without ChatGPT internals belongs in `src/platform/utilities/` and must remain separate from `types.d.ts` and versioned bindings. A utility change increments every consuming extension version.
4. **APIs land only as complete vertical slices.** A public API change increments `src/platform/manifest.json`, updates its current binding and mechanical test extension, and passes `api-test-suite` against the live app. `types.d.ts` must never sit ahead of working, validated bindings.
5. Research is done on extracted copies of the app in temp directories (see the skill's `scripts/extract-app.sh`), cleaned up afterwards — never against the installed app in place, never by modifying its bundle.
6. Durable knowledge lives in the skill's `references/`; version-specific findings live in `src/platform/bindings/<version>/DERIVATION.md`. Don't mix the two.
7. Component releases are derived from predictable paths. Changes under the API, a versioned binding directory, or a public extension directory increment that component's semantic version and the schema-v2 `updates/latest.json` generation in the same pull request. Internal extensions declare `"private": true` and stay out of the public index. A new binding also increments each public extension version whose `compatibility.chatgpt` range is expanded after validation. CI runs `scripts/refresh-update-index-hashes.sh <base-sha>` and commits deterministic archive hashes to same-repository pull requests before validation. After CI passes on `main`, GitHub Releases publishes immutable `chatgpt-api-v<version>`, `binding-<chatgpt>-v<version>`, and `extension-<id>-v<version>` archives, verifies every referenced checksum, and publishes the index on the stable `updates` release.

## Live debugging (CDP)

When doing binding work, debug against the **live app over CDP**, not by guessing from the minified build:

1. Build `api-test-suite`, then launch through the packaged launcher:
   `src/extensions/build.sh api-test-suite && .builds/ChatGPTX.app/Contents/MacOS/ChatGPTX --test-api --extension "${TMPDIR:-/tmp}/ChatGPTX/extension-builds/api-test-suite" --user-data-dir=/tmp/<profile> --remote-debugging-port=9222`
2. Targets are at `http://127.0.0.1:9222/json`; evaluate in the `app://` page via `Runtime.evaluate` (a ready helper lives at `tmp/cdp.mjs`: `node tmp/cdp.mjs '<expression>'`).
3. The injected host exposes `window.__CGPTX_HOST__._debug` for live probing of the binding.

Rules: CDP is for development-time inspection and hot-probing only — production code must never depend on it; debug scaffolding stays in `tmp/` (gitignored) or `_debug` namespaces, out of shipping paths.

## Current state

The current binding is `src/platform/bindings/26.721.41059/`. It passes the public API suite (39/39) and version-specific native UI suite (63/63) for local and cloud threads. The isolated CI harness also verifies burner-account switching, restoration, and the Release launcher artifact. Reusable extension storage is provided separately by `src/platform/utilities/`. Runtime: macOS launcher + main-process bridge (injection, extension loader, scoped utility services, result reporting).
