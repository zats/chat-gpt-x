# Derivation — bindings for 26.727.51351

Pinned build:

- App version: `26.727.51351`
- app.asar SHA-256: `a529edd72e10b08931c0d695b5e3e6a0be7f51874610dafc04f578436ab7d74d`
- Electron: `150.0.7871.182`
- Sparkle enclosure: `https://persistent.oaistatic.com/codex-app-prod/ChatGPT-darwin-arm64-26.727.51351.zip`
- Version-watcher reference: issue `#14`
- Binding date: `2026-08-01`

Research used an extracted copy of this exact stock build and live CDP
inspection of an isolated authenticated profile. The stock app bundle was
never modified.

## Verified module map

The shared implementations are consolidated in
`app-initial-iBPGfcXU.js`. Every path below exists in the extracted build.
Semantic source inspection identified each candidate, and live imports in the
stock `app:` renderer verified the current export shapes before injection.
The unchanged public assertions and the current native UI suite then verified
their behavior and prop contracts through the packaged bridge.

| Capability | Current asset | Verified exports |
| --- | --- | --- |
| React, JSX, and React DOM | `app-initial-iBPGfcXU.js` | `jSt()` is React 19.2.7; `TSt()` supplies mutable `jsx` and `jsxs`; `a_t()` supplies `createRoot` |
| Native menus | `app-initial-iBPGfcXU.js` | initializer `dV`; namespace `sV`; `cV` Item; `uV` Separator; `oV` in-place SubmenuItem; `sV.FlyoutSubmenuItem`; `aV` dropdown root |
| Native icons | `app-initial-iBPGfcXU.js` | initializer `kpt` and component `Opt` for the menu chevron; initializer `Flt` and component `Plt` for the Profile person icon |
| Native color picker | `app-initial-iBPGfcXU.js` | initializer `Qo`; controlled picker `Zo` |
| Authentication context | `app-initial-iBPGfcXU.js` | initializer `t1`; `i1` auth-nonce hook; initializer `c1` and `f1` app-server registry hook |
| Query and message contracts | `app-initial-iBPGfcXU.js` | initializer `CSt` and `wSt` query-client hook; `Umt` account-info query-key builder; initializer `Qmt` and message bus `$mt` |
| Browser and navigation bridges | `app-initial-iBPGfcXU.js` | `art` direct open-in-browser dispatch; `qet` React Router navigation hook |
| Plus icon | `plus-BgCJgEEs-BMjGh1Kk.js` | initializer `t`; component `n` |
| Palette icon | `palette-lzFbWMQk-BMVqIO8j.js` | initializer `n`; component `t` |
| Persisted-thread overflow | `thread-overflow-menu-D0xHSoQA.js` | initializer `n`; component `t` |
| ChatGPT sign-in | `chatgpt-desktop-auth-url-BtkHQc0r.js` | initializer `r`; `o` starts `login-with-chatgpt`; `t` decorates the URL |

Additional semantic anchors:

- `codex.profileDropdown.*`, `codex.profileFooter.*`, and
  `composer.mode.rateLimit.heading` locate the native profile implementation
  in `app-initial-iBPGfcXU.js`.
- `sidebarElectron.*` and `threadHeader.*` identify native thread actions and
  sections. Remote thread menus remain identifiable by the co-located
  `toggle-thread-pin`, `copy-session-id`, and `copy-deeplink` actions.
- `data-app-action-sidebar-thread-row`, its scoped thread attributes, and
  `data-thread-title-trigger` identify persisted sidebar rows.
- `codex.projectAppearance.color.option.aria_label` and
  `codex.remoteHostColorPicker.*` locate the app-owned color-circle and picker
  precedents.
- The current login route imports `i1`, `wSt`, `Umt`, and `qet`; after a
  successful stock sign-in it removes the exact `Umt("account-info")` query,
  updates the auth nonce, and navigates.
- `codex-app-server-restart`, `codex-app-server-initialized`, and
  `open-in-browser` verify the native authentication message contracts. Live
  inspection confirmed `$mt` exposes `subscribe`, `dispatchMessage`, and
  `dispatchHostMessage`.
- The application header is the CSS-module component
  `header._Header_khftr_1`, defined by `app-initial-BSHZIbh1.css` and exported
  from the `jqr` header implementation in `app-initial-iBPGfcXU.js`. It keeps
  the five-section header topology used by the prior binding.
- `app-44wrUC9v.css` sets `--cursor-interaction: default` for Electron
  windows.

## menus.profile

The binding wraps the app's shared JSX runtime, identifies the profile
dropdown through semantic props, captures native Item fibers, and renders
transformed descriptors inside the original Radix root.

The visible Usage remaining Item is the presentation child `lz`. Its
`data-state` parent and stateful `Woa` ancestor own the trigger, expansion
state, handlers, and current children. Live stock fiber inspection verified
that complete ownership boundary, so the binding retains the ancestor rather
than replacing only the visible row. Extension submenu children reuse the
nested native Item captured from Usage remaining.

The stock authenticated baseline contained six top-level menuitems: the
native account row, expandable Usage remaining, Show pet, an
account-dependent upgrade action, Settings with `⌘,`, and Log out. Usage
expanded in place from six to eight menuitems by adding the monthly-status
presentation plus the Upgrade and Learn more links. Arrow Down moved focus to
the nested Upgrade action while focus remained inside the Radix menu. The
account row was hidden before the baseline screenshot, and Log out was not
activated.

The profile root supplies current identity and the native avatar. The binding
refreshes identity on every render and uses the verified `/settings/profile`
navigation hook if the app omits its profile callback. Transformers compose
in registration order, recursively enforce extension namespaces and unique
ids, preserve moved built-ins, and isolate failures.

The `person` icon maps to the same 20-point artwork used by ChatGPT's native
Profile row; the verified path begins `M16.585 10C16.585 6.3632`.

## menus.thread, threads, and threads.list

The local persisted-thread overflow component continues to receive
`conversationId`, `title`, and optional `cwd`; the remote thread menu supplies
the same conversation identity through its semantic action tree. The binding
wraps both through one boundary. Remote titles come from the matching native
sidebar row. This supplies one thread-menu model and current-thread lifecycle
for both thread kinds.

Native leaf rows use Item. Native flyouts use `sV.FlyoutSubmenuItem` with the
app's trigger and portal behavior. The thread-colors extension inserts its
Palette flyout immediately before the first native separator. Theme-aware
color circles reuse the app's native Item icon slot and project-appearance
precedent.

Native local and remote sidebar rows retain their original trees and receive
extension views at `data-thread-title-trigger`. A mutation observer covers
rows rendered before and after injection. The absolute leading-view host
grows leftward without changing title geometry.

## Renderer bootstrap

Binding `1.0.2` installs the main-world JSX hook from ChatGPTX's external
session preload before the app's page scripts run. The preload requests the
version-pinned host source from the injected main-process bridge and executes
it through Electron's privileged `webFrame` path. This keeps the stock app
bundle unchanged and uses the same `NODE_OPTIONS=--require` launch boundary.

Native module imports can finish on either side of the app's first React
render. The binding waits for the committed application root, then submits its
current root element once through the app's React DOM renderer. This makes
already-created menu elements enter the JSX boundary in both orders.
Extension activation waits for `__CGPTX_NATIVE_READY__`, including this
reconciliation, before registration. The version-specific native suite waits
for an augmented Chat actions trigger and menu rather than accepting the stock
menu as ready.

## authentication

`startSignIn` uses the app's `login-with-chatgpt` URL construction and direct
`art` open-in-browser dispatch. Successful sign-in follows the stock sequence:
remove the exact `account-info` query and update the auth nonce under native
providers.

Credential replacement atomically updates `auth.json` under the resolved
Codex home, dispatches the app's `codex-app-server-restart` message for host
`local`, waits for `codex-app-server-initialized`, then runs the same
query/auth refresh sequence. Public listeners preserve registration order and
error isolation.

## appearance

Header registrations compose independently per property. The version-pinned
selectors paint the five regions of the current `header._Header_khftr_1`
component, its title, right-panel tab toolbar, and remote header action
surfaces. Remote action backgrounds use a darker mix of the registered
background while text and borders derive from the registered foreground.
Content-panel controls remain app-owned. The app's `electron-light` and
`electron-dark` root classes select registered values.

The controlled native color picker is mounted through the app's React DOM
renderer and positioned below the current header. Requests serialize,
previews emit normalized six-digit colors, outside click or Enter confirms,
and Escape cancels.

Stock and extension Items both compute `cursor: default` under the current
Electron CSS. The native suite asserts cursor parity with a current built-in
Item and preserves the same native hover, focus, and keyboard behavior.

## Validation commands and results

Extraction and exact-build pinning:

```bash
.agents/skills/manage-platform-api/scripts/extract-app.sh \
  --app "$CHATGPT_APP_PATH" \
  --expect-version 26.727.51351
shasum -a 256 "$CHATGPT_APP_PATH/Contents/Resources/app.asar"
```

The exact stock app reported version `26.727.51351`, Electron
`150.0.7871.182`, and the pinned SHA-256 above.

The unchanged public assertions and current native suite were exercised
against the live app with authentication files passed by path directly to the
harness:

```bash
node src/platform/bindings/26.727.51351/ui-test.mjs "$PORT" \
  --public-api-only "--select-thread=$THREAD_ID"
node src/platform/bindings/26.727.51351/ui-test.mjs "$PORT" \
  "--alternate-auth=$SECONDARY_AUTH" "--select-thread=$THREAD_ID"
```

Results were `39/39` for the stable public API suite and `63/63` for the
current native UI suite.

Binding `1.0.1` adds an API-key validation mode without changing the bound
ChatGPT implementation. When `CHATGPTX_TEST_NO_PROFILE=1`, the native driver
omits profile-menu and ChatGPT-account assertions while preserving local
thread, thread-menu, thread-list, appearance, color-picker, runtime preload,
composition, packaging, and signing checks. OAuth validation keeps the full
`39/39` public API and `63/63` native UI gates.

Binding `1.0.2` removes the renderer-startup ordering race described above.
Repeated isolated API-key validation completed with `20/20` public API and
`35/35` native UI checks. The native suite also verifies that the thread-menu
boundary rendered before extensions became active and that the application
root is refreshed exactly once.

The deterministic completion command was:

```bash
CHATGPT_APP_PATH="$CHATGPT_APP_PATH" \
  scripts/run-local-ci.sh "$PRIMARY_AUTH" "$SECONDARY_AUTH"
```

Results:

- Extension and shared-utility unit tests: `23/23`.
- Unchanged stable public API suite: `39/39`.
- Current native UI suite: `63/63`.
- Normal shipped-extension flow and shipped-extension composition with the
  API suite enabled: passed.
- Multiple-accounts switching and restoration: passed.
- Release build and strict deep signature verification: passed.
- Packaged binding and bridge files matched source.

## Failure signatures

- Native installation failure: a current hashed path, initializer, or export
  changed.
- Empty profile model: profile semantic props, Item fibers, or FormatJS ids
  changed.
- Visible profile chevron without expansion: the SubmenuItem owner boundary
  or trigger/children contract changed.
- Empty thread model: local overflow export, remote action anchors, menu root,
  or thread message ids changed.
- Native UI navigation timeout: sidebar-row kind/id attributes or
  current-thread synchronization changed.
- Thread flyout presentation mismatch: native Item activation or
  FlyoutSubmenuItem contract changed.
- Missing thread-list marker: sidebar-row or title-trigger attributes changed.
- Authentication startup failure: sign-in initializer, URL decoration, or
  browser dispatch changed.
- Stale identity after replacement: app-server message bus,
  restart/initialized messages, account query key, auth-nonce hook, or
  provider boundary changed.
- Missing or unpainted header: `_Header_khftr_1`, its five-section topology,
  remote action surface classes, or theme root classes changed.
- Picker mismatch: header anchor, React DOM root, or native picker export
  changed.
- Native readiness failure before extension activation: preload bootstrap,
  native module imports, application-root discovery, or root reconciliation
  changed.
