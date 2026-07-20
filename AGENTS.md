# AGENTS.md

## What this project is

Source code for an **extension platform for the ChatGPT desktop app** (macOS, Electron — bundle id `com.openai.codex`).

The platform ships inside a small external launcher app. When the user runs it, the launcher starts the stock, unmodified `ChatGPT.app` and injects the platform into it at process start. Once inside, the platform establishes a **stable, documented extension API** within the running app and **dynamically loads extensions** against that API — both extensions shipped with the product and ones contributed by other users.

Properties that define the project:

- **Non-invasive.** The ChatGPT app bundle is never modified, patched, or re-signed. Injection happens through the environment at launch (`NODE_OPTIONS=--require` into the Electron main process — verified against the installed app), so the app stays stock, keeps its signature, and auto-updates normally.
- **Stable boundary.** Extensions compile only against `src/platform/types.d.ts`. The app's internals are minified and re-scrambled on every build; the public API is not. Extension authors never see or depend on app internals.
- **Versioned bindings.** `src/platform/bindings/<app-version>/` bridges one specific ChatGPT build to the stable API, keyed by the SHA-256 of that build's `app.asar`. When the app updates, bindings are regenerated for the new build while the public API stays unchanged.
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

1. Extensions depend only on `types.d.ts` — never on app internals, DOM structure, or minified identifiers.
2. The public API changes only on explicit request and only through the process in `.agents/skills/manage-platform-api/SKILL.md`: clarify intent → design for N concurrent extensions (transformer / registration patterns) → document → **write tests first** → research and implement the binding → record the derivation.
3. Research is done on extracted copies of the app in temp directories (see the skill's `scripts/extract-app.sh`), cleaned up afterwards — never against `/Applications` in place, never by modifying the bundle.
4. Durable knowledge lives in the skill's `references/`; version-specific findings live in `src/platform/bindings/<version>/DERIVATION.md`. Don't mix the two.

## Current state

Scaffold: repo layout, the `manage-platform-api` skill, an empty `types.d.ts`, and a no-op `api-test-suite`. No build system, launcher, bridge, or bindings implementation yet — the first real API (and its binding) is the next milestone.
