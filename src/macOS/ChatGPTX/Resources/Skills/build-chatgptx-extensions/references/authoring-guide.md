# ChatGPTX local extension authoring

## Product boundary

A local extension is a JavaScript package that ChatGPTX loads for one launch.
It does not modify or re-sign `ChatGPT.app`. It does not need a GitHub release.

Split each feature into these parts:

- Extension behavior belongs in the extension package.
- ChatGPT integration must use the stable `PlatformApi` in `chatgptx.d.ts`.
- File storage must use the bundled `sdk/extension-storage.js` utility.

If the stable API does not expose a required ChatGPT capability, stop and tell
the user. Do not reproduce a native control, inspect app internals, or use DOM
selectors as a substitute.

## Project layout

The scaffold has this layout:

```text
my-extension/
|-- package.json
|-- chatgptx.d.ts
|-- .chatgptx-api-version
|-- contents/
|   `-- main.js
`-- sdk/
    |-- extension-storage.js
    `-- extension-storage.d.ts
```

The scaffold command takes the final project directory. That directory must not
exist. The command reserves it and does not replace existing files.

An extension with a Settings provider also has `contents/settings.js` and this
manifest member:

```json
"settings": {
  "main": "contents/settings.js",
  "pane": "my-extension.settings"
}
```

The pane ID must start with the extension ID and a period.

## Manifest contract

`package.json` uses this shape:

```json
{
  "id": "my-extension",
  "name": "My Extension",
  "version": "0.1.0",
  "description": "Explains one user-visible behavior.",
  "main": "contents/main.js",
  "compatibility": {
    "chatgptApi": "^<active-api-version>"
  },
  "capabilities": ["menus.profile"]
}
```

The build script copies the exact active declarations and replaces
`compatibility.chatgptApi` with a caret range on that version. The range keeps
the extension on the compatible API major line. `capabilities` documents use
but is not a security permission boundary. Use stable API namespace names such
as `menus.profile`, `settings`, or `authentication`, and keep the list accurate.

IDs use lowercase letters, numbers, periods, underscores, and hyphens. Do not
use the reserved IDs `extensions` or `api-test-suite`.

## Module lifecycle

Entry points are CommonJS JavaScript. The build script makes each entry point a
self-contained strict-mode bundle and adds the current bundled storage runtime
before it. The generated files under `sdk/` are refreshed on every build. Do
not edit them. Do not use `require()` or packages at runtime. The main entry
point must export
`activate`:

```js
"use strict";

/** @typedef {import("../chatgptx.d.ts").PlatformApi} PlatformApi */

/** @param {PlatformApi} api */
function activate(api) {
  api.menus.profile.transformItems((items) => items);
}

module.exports = { activate };
```

ChatGPTX calls `activate` once for each app page. Store returned registration
objects when code must invalidate or replace a contribution. Transformers must
return a new complete array and must preserve items owned by ChatGPT and other
extensions. Namespace every item ID with the extension ID.

The live runtime does not use an exported `deactivate` function as a hot-reload
contract. Start a new isolated test session after a source change.

## Native Settings

A Settings provider is a separate CommonJS module that exports `activate`. Add
the pane through `api.settings.transformCategories`, add its group through
`transformGroups`, and add controls through `transformItems`. Use
`api.settings.ui` controls. Do not create replacement HTML controls.

The provider can load while the feature is disabled. Keep Settings state and
feature state in the shared storage utility when both bundles need it.
Extension test mode always enables the local feature, so it does not simulate a
disabled feature during that launch.

Register Settings transformers synchronously. Do not assert `getCategories()`
or `getGroups()` during cold activation: the stable contract returns an empty
array until native Settings or the requested pane has rendered in that app
window. Do not call `api.settings.open()` from `activate`: ChatGPTX calls that
function once for each app page, and cold activation can run before ChatGPT has
installed its native Settings route. Open the pane from a user action after the
main window is ready, wait for the promise to resolve, and then read the
categories and groups. Confirm the native control through the session-bound UI
probe. If the test login has no interactive app window, report Settings UI
verification as blocked. A successful activation marker does not cover this
post-render check.

## Extension storage

Use the bundled runtime utility directly from a feature or Settings entry
point. The build script adds its implementation to each output bundle:

```js
const storage = createExtensionStorage("my-extension");
```

Storage uses the extension ID as its directory namespace under the active Codex
home. Always pass the ID from your own manifest and use relative file names.
The runtime does not use the caller identity as a storage security boundary, so
do not read or change another extension's namespace. During isolated testing,
the utility writes only to the temporary test Codex home.

## Safe test evidence

The test script prints a session directory, process ID, source-injection result,
and synchronous-activation result.

Keep the printed session path. `status`, every UI operation, and `stop` require
that exact path. The successful start output is the authoritative
injection and synchronous-activation result; do not infer either result by
searching an unrelated log.

The script instruments a session-local package copy and requires synchronous
activation markers for the main and Settings entry points. The project build
stays unchanged. These markers do not prove the feature. Verify the requested
menu item, Settings pane, thread decoration, appearance change, or other
behavior in the isolated window.

Use the session-bound accessibility probe when the task needs native UI proof:

```sh
/bin/bash "<skill-directory>/scripts/test-extension.sh" \
  ui press-wait "<session>" AXPopUpButton "Open profile menu" \
    '*' "My menu item" 10
```

Before `press` or `press-wait`, use `ui wait` for the exact action role and
label. This separates app readiness from the action result. If the readiness
wait fails, do not treat a later selector error as an extension failure.

Use `ui wait <session> <role> <label> [timeout]` to observe a passive element.
Use `ui press <session> <role> <label>` only when its result is not a transient
menu. A role of `*` accepts any role, but the exact label must still resolve to
one element. The probe rejects zero matches and multiple matches.

`press-wait` requires one exact role-and-label match for the action and then
observes one exact label without starting a second process that can close a
transient menu. The observed role can be `*` when it is not part of the
extension contract. The probe resolves only the current `app.pid` from a
validated test session, rechecks its isolated Electron profile, and inspects
only its active window. The watchdog refreshes `app.pid` after an isolated
relaunch.
Each operation prints redacted JSON. Record its process ID, operation, result,
and matched labels in the task result. Do not use diagnostics or copied
authentication as evidence. The probe does not request
Accessibility permission. If access is unavailable, use a stable read API
that explicitly reports effective displayed state, such as
`menus.profile.getItems()`, `settings.getCategories()`, or
`appearance.header.getProperties()`. Code inspection or a claim written in
source is not evidence. A successful live read in the isolated process is
evidence. When activation throws on a read mismatch, the harness reports the
successful activation only after that live check passes.
Computer Use cannot reliably select between two running copies of ChatGPT that
have the same application identity. Do not accept a reconnect to the primary
window as test evidence. Do not enable remote debugging for the signed-in test
profile.

The isolated test session uses a new Electron profile. It copies the exact
active component set and `auth.json` into a new Codex home instead of sharing
the source Codex home. The extension-test launcher uses that fixed component
set and does not run the updater. The session also points to the already
running Computer Use service. Starting a second service in the same macOS login
can stop pointer input and can cause a helper retry loop.

Only test extension code that you created or fully reviewed. An extension can
read the current account credentials through `api.authentication.getCurrent`.
The package capability list does not restrict runtime access.

Always run `stop` after evidence collection. It tracks the exact executable
and start identity for each isolated process group, stops those groups, and
removes the complete marked test session, including its Electron profile,
component copy, extension state, and copied authentication. A same-login,
30-minute safety lease does the same for an abandoned test. The lease follows
the isolated Electron profile across a ChatGPT relaunch, including a relaunch
caused by `api.authentication.replaceCurrent`. Run `stop` before logout or
restart because the lease belongs to the current login session. If a process
does not stop after a hard kill, the command removes the Electron profile,
copied Codex home, local package, and all extension state at once. Its watchdog
keeps trying to stop the process and removes the remaining marked session when
the process exits. Do not report completion until `stop` succeeds.

If `stop` reports a live process, run `status` with the same session path and
retry `stop`. Keep the result at “blocked” while the marked session remains.
The separate build directory contains no authentication and is not part of the
session that `stop` removes.

## Common failures

- **Active API is unavailable:** Open ChatGPTX, check for component updates,
  and open ChatGPT once. Then run the build again.
- **Authentication is unavailable:** Sign in in the primary ChatGPT app. The
  test script requires `<Codex home>/auth.json` and copies only that file.
- **Binding is unavailable:** Check for ChatGPTX component updates. The test
  mode requires an exact binding for the installed ChatGPT build.
- **Reserved ID:** Choose a new extension ID. Do not override the Extensions
  manager or internal API test suite.
- **Injection failure:** Correct the reported error for the extension ID before
  checking UI behavior. A failed start prints the newest bridge diagnostics,
  then removes its temporary session. If the process cannot stop, it removes
  private test data and leaves the watchdog active.
- **Activation failure:** Correct the reported main or Settings activation
  error. JavaScript syntax validation does not prove that an API member exists.
- **No visible behavior:** Confirm that the API context exists, the transformer
  preserves existing items, item IDs are unique, and the test opened the UI
  surface that owns the contribution. If a stable read reports the contribution
  but the exact isolated UI does not show it, report a binding or API regression.
  Do not treat the model read as proof of visible behavior.
- **Computer Use retry loop:** Stop the session. Start the primary
  ChatGPT app once so its Computer Use service is available, then retry.
- **Computer Use cannot select ChatGPT:** Do not change the global forbidden-
  target setting automatically. Use the session-bound UI probe or a stable API
  read method. If both are unavailable, report that functional verification is
  blocked.
