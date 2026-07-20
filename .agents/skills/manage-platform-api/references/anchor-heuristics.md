# Cascading anchor heuristics

How to locate a behavior in a minified, content-hashed Electron build where **every symbol name, chunk filename, and module id changes between builds**. Apply the classes in order; stop at the first that uniquely identifies the target. Never anchor on what this file's "anti-anchors" section lists.

The heuristic classes are durable. The concrete examples are a **snapshot from app version 26.715.31925, kept for illustration** — specific ids, keys, and values will drift with updates. A stale example still teaches what the *pattern* looks like; always re-derive the current value on the build you are binding.

## 1. i18n message IDs (primary)

The app is FormatJS-instrumented: user-facing text is `<FormattedMessage id defaultMessage description>` with stable, semantic string ids:

```
id: "codex.profileDropdown.logOut"
defaultMessage: "Log out"
description: "Menu item to log out of ChatGPT"
```

- Locale-independent: translations live in per-locale chunks (`te-IN-*.js`, …); app code references only the id.
- Self-documenting: `description` fields explain the behavior — use them when mapping API docs to app behavior.
- Renaming an id breaks 40+ locale files, so ids move at redesign cadence, not build cadence.

Search pattern: `grep -rhoE 'id:`[a-z][a-zA-Z0-9_.]+`' webview/assets` or search for a namespace (e.g. `codex.profileDropdown.`) and enumerate.

## 2. Protocol / contract strings

Hard contracts between main, renderer, and outside world. Invisible to users, changed rarely and deliberately:

- contextBridge keys: `electronBridge`, `codexWindowType` (in `.vite/build/preload.js`)
- IPC channels and message markers: `codex_desktop:*`, `codex-host-chunked-message-v1`
- Custom protocol scheme: `app:` (`protocol.handle("app", …)` in the main bundle)
- Server API paths, storage keys, event source names (e.g. `profile_dropdown_rate_limit_summary`)

## 3. Library behavioral invariants

The design system (Radix UI) emits stable DOM semantics regardless of app code changes:

- Roles: `role="menu"`, `role="menuitem"`, `role="menuitemcheckbox"`, `role="separator"`
- Attributes: `data-radix-menu-content`, `data-radix-popper-content-wrapper`, `data-state`, `data-highlighted`
- Behavior: focus trapping, roving-tabindex keyboard navigation, portal mounting

Identify a UI surface by *what it does* (the menu that appears from the avatar button and contains items carrying profileDropdown message ids), not by what it is named.

## 4. data-testid

~180 `data-testid` values ship in production (e.g. `popcorn-sheet-tabs-more`). Useful where present, but sparse around menus — treat as a bonus signal, not a foundation.

## 5. User-visible display strings (last resort)

Localized and copy-edited — weakest anchor. If unavoidable, resolve the string at runtime from the app's own i18n (message id → current locale) instead of hardcoding English text.

## Anti-anchors (never use)

- Minified symbol names (`G`, `bl`, `qn`) — renamed every build
- Chunk filenames (`main-DvTOqeoA.js`) — content-hashed
- Module ids / a module registry — rolldown emits plain ESM chunks, there is no webpack-style runtime registry to look modules up in
- Sourcemaps — none are shipped
- CSS-module class hashes — Tailwind utility classes are fine (content-derived), hashes are not

## Deriving a locator

A good binding locator is a **conjunction of weak signals**, e.g.: "the Radix `role="menu"` content that appears after activating the avatar icon-button and whose items include elements resolved from `codex.profileDropdown.*` ids." Record the chosen conjunction in DERIVATION.md with enough detail for a future agent to re-derive it on a new build.
