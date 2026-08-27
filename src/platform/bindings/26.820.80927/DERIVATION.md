# Derivation — bindings for 26.820.80927

Pinned build:

- App version: `26.820.80927`
- App build: `7271`
- app.asar SHA-256: `60f9dcc03f50e7b66883c43e34e86e34d3dcf2650dcdf2b80bc79db116ee93cf`
- Electron: `151.0.7922.170`
- Sparkle enclosure: `https://persistent.oaistatic.com/codex-app-prod/ChatGPT-darwin-arm64-26.820.80927.zip`
- Binding date: `2026-08-27`
- Binding version: `1.0.0`
- ChatGPT API version: `1.5.2`
- Version-watcher issue: `#53`

The workflow supplied the exact stock application and a prepared `app.asar`
research tree. No generated binding was available. The app version, build,
Electron version, and app.asar hash were checked against the values above.
Only those supplied target-build inputs were used: no app was downloaded or
extracted, and the prior stock app was not fetched. The supplied application,
research tree, opaque authentication source, and user state were not changed.

This new-mode binding started from the API-development implementation in
`26.820.71523`, selected by `src/platform/bindings/manifest.json` at the start
of the rebind. It preserves that implementation's ChatGPT API `1.5.2` and
starts the target-build binding at version `1.0.0`.

## Verified module map

The shared implementations moved to `app-initial-CpK4W6kT.js`. Every asset
and export below exists in the supplied target research tree and was checked
by its current definition, importer, semantic caller, or live behavior.

| Capability | Current asset | Verified exports |
| --- | --- | --- |
| React, JSX, and React DOM | `app-initial-CpK4W6kT.js` | `XKt()` supplies React; `VKt()` supplies mutable `jsx` and `jsxs`; `Kzt()` supplies `createRoot` |
| Native menus | `app-initial-CpK4W6kT.js` | initializer `c4`; namespace `a4`; `a4.Item`, `a4.Separator`, `a4.SubmenuItem`, and `a4.FlyoutSubmenuItem`; `r4` dropdown root |
| Generic app menu | `app-initial-CpK4W6kT.js` | initializer `x0`; `r4` is the generic menu adapter root and `Pzt` is its current internationalization hook |
| Assistant-selection toolbars | `app-initial-CpK4W6kT.js` | initializer `zI`; `RI` is the selected-text overlay and composes the native container and action wrapper; `jX` is the native selected-text positioner |
| Native icons | `app-initial-CpK4W6kT.js` | initializer `n4` and chevron-right `t4`; initializer `rh` and Profile icon `nh`; initializer `V8` and Settings icon `B8` |
| Native color picker | `app-initial-CpK4W6kT.js` | initializer `tc`; controlled picker `ec` |
| Settings shell and search | `settings-page-BfxT3ZtB.js` | native categories, sidebar rows, search results, pane selection, unsaved-navigation handling, and Suspense ownership |
| Settings section icons | `use-visible-settings-sections-BmMdRqG0.js` | initializer `t`; section-icon map `r` |
| Settings breadcrumb | `toolbar-breadcrumb-D6g0pyfy.js` | initializer `n`; native breadcrumb component `t` |
| Native Settings page | `app-initial-CpK4W6kT.js` | initializer `co`; component `oo` |
| Native Settings group, rows, and row | `app-initial-CpK4W6kT.js` | initializer `kn` and group `On`; initializer `IS` and rows `FS`; initializer `HS` and row `VS` |
| Native Settings controls | `app-initial-CpK4W6kT.js` | initializer `aG` and toggle `iG`; initializer `to`, section title `eo`, and select trigger `Qa`; initializer `XN` and button `qN`; initializer `$Y` and controlled input `ZY` |
| Native Settings loading row | `settings-loading-row-DeWwhCfK.js` | initializer `n`; component `t` |
| Application scope | `app-initial-CpK4W6kT.js` | initializer `UGt`; application-scope token `bzt`; scope hook `HGt` |
| Authentication context | `app-initial-CpK4W6kT.js` | initializer `zct` and auth-nonce hook `Hct`; initializer `Jct` and app-server registry hook `Zct` |
| Query and message contracts | `app-initial-CpK4W6kT.js` | query-client hook `BKt`; query-key builder `oFt`; initializer `yFt` and message bus `bFt` |
| Browser and navigation bridges | `app-initial-CpK4W6kT.js` | open-in-browser dispatch `Zpt`; navigation hook `FIt` |
| ChatGPT sign-in | `chatgpt-desktop-auth-url-BcNqVSej.js` | initializer `r`; `o` starts `login-with-chatgpt`; `t` decorates the URL |
| Plus icon | `plus-BgCJgEEs-DfzxPQNa.js` | initializer `t`; component `n` |
| Palette icon | `palette-lzFbWMQk-D-MoTDe_.js` | initializer `n`; component `t` |
| Persisted-thread overflow | `thread-overflow-menu-CNwvn1sZ.js` | initializer `n`; component `t`; shared generic adapter `b0` remains in app-initial |

All eight directly imported hashed assets exist. The host's `49` distinct
references to the app-initial export map are present in the target bundle.
Retained short export names were accepted only after their current definitions,
imports, or semantic callers matched the contract and the capability passed in
the live application.

Additional semantic anchors:

- `codex.profileDropdown.*` and `codex.profileFooter.*` locate Profile content.
- `threadHeader.*`, `toggle-thread-pin`, `copy-session-id`, and
  `copy-deeplink` identify current thread actions in
  `chatgpt-conversation-page-DuDAeCC5.js`,
  `remote-conversation-page-BuBjQlVV.js`, and
  `thread-overflow-menu-CNwvn1sZ.js`.
- `selectedTextOverlay.addToCodex`, `selectedTextOverlay.moreDetails`, and
  `selectedTextOverlay.askInSideChat` locate native assistant-selection
  actions. `data-response-annotation-target` and
  `data-response-annotation-conversation` locate selectable responses.
- `data-app-action-sidebar-thread-row`, scoped thread attributes, and
  `data-thread-title-trigger` locate persisted sidebar rows.
- Settings navigation still exposes `data-settings-panel-slug`; semantic
  personal, integrations, coding, and archived headings locate native groups.
- `login-route-CpRMhvKn.js` verifies the application-scope sign-in path.
- The application header remains
  `header[data-pip-obstacle="app-shell-header"]`, and
  `app-initial-BmgJoqMa.css` contains the current surface, border,
  focus-visible, and Electron cursor tokens.

## Native ownership and target-build behavior

The prior ownership model remains valid. The binding wraps the shared JSX
runtime and transforms native Profile, persisted-thread, and assistant-
selection trees without replacing their Radix owners. Unchanged built-ins
retain their native elements, handlers, shortcuts, and stateful submenu
ancestors. Extension transformations compose in registration order and
refresh through dedicated signals so unrelated feature updates cannot remount
an open menu owner.

Thread transformations pass raw effective descriptors to the current generic
adapter and key the adapter by its owning thread only. A real thread trigger
requires a primary-button pointer-down (`buttons: 1`). Native shortcut text
remains inside the outer label container, so the driver reads the nested native
`span.truncate` label and excludes only the separately rendered, `aria-hidden`
shortcut when comparing rendered order with the public effective model. The
driver waits `250` ms after color-picker cancellation before acquiring and
activating the thread trigger, then requires one native pointer-down to open
the menu.

The assistant-selection boundary captures the native toolbar container and
action wrapper. The current native positioner export `jX` supplies the
selected-text rectangle, horizontal bounds, portal target, live viewport
position callback, and selection preservation on pointer-down. The optional
lower toolbar remains an absolute descendant of the same wrapper. Root actions
normalize to `above` or `below`; child pages inherit their parent's placement
and replace only that placement's toolbar. Leaves dismiss the selection and
receive an immutable Command-key activation. `labelScale: 2`,
`verticalPadding: 4`, native response-annotation creation, composer-preserving
normal creation, and native direct submission remain unchanged.

Settings page, group, rows, row, toggle, select, button, input, title, loading,
icon, visibility, breadcrumb, search, and route contracts retain native
ownership. No-op transforms preserve native descriptor identity so dynamic
stock panes are not rebuilt. Extension child panes remain in the native
searchable settings tree and out of the top-level sidebar.

The native color picker remains `ec`. Its two native sliders, normalized live
color updates, outside-click confirmation, repeated Escape cancellation,
persistent capture listener, and serialized request queue passed live. The
external session preload installs the main-world JSX hook; the host waits for
the committed application root, reconciles it through the target React DOM
renderer, and reports native-ready only after every boundary is installed.

## Available stock API-key baseline

The exact target stock application was launched with isolated Electron and
Codex state, API-key authentication, and no ChatGPTX, `NODE_OPTIONS`, or other
renderer injection. The app-owned page settled on the `avatar-overlay` route.
Both `window.__CGPTX_HOST__` and `window.__CGPTX_RUNTIME__` were absent, with no
visible menu, menu item, or profile trigger in the reduced authentication
mode. No destructive or state-changing action was used, and no unsupported
profile affordance was inferred. Every applicable current-build affordance was
instead required by the injected target native suite.

The target composition run exposed the selected persisted thread's native
Radix menu trigger and preserved its app-owned actions, shortcuts, submenu
owners, and activation behavior. Thread Colors contributed Color through the
same native adapter and opened the native flyout portal. Reactions, Extensions
settings, the API suite, and the other enabled shipped extensions coexisted
through their public registration and transformer boundaries.

## Validation commands and results

Identity and static checks:

```bash
/usr/libexec/PlistBuddy -c 'Print :CFBundleShortVersionString' \
  "$CHATGPT_APP_PATH/Contents/Info.plist"
/usr/libexec/PlistBuddy -c 'Print :CFBundleVersion' \
  "$CHATGPT_APP_PATH/Contents/Info.plist"
/usr/libexec/PlistBuddy -c 'Print :CFBundleShortVersionString' \
  "$CHATGPT_APP_PATH/Contents/Frameworks/Codex Framework.framework/Resources/Info.plist"
shasum -a 256 "$CHATGPT_APP_PATH/Contents/Resources/app.asar"
node --check src/platform/bindings/26.820.80927/host.js
node --check src/platform/bindings/26.820.80927/ui-test.mjs
```

These reported version `26.820.80927`, build `7271`, Electron
`151.0.7922.170`, and the pinned app.asar SHA-256 above. All referenced assets
and shared exports passed static current-build checks.

The complete deterministic API-key validation command was:

```bash
CHATGPT_APP_PATH="/path/to/the/supplied/ChatGPT.app" \
  scripts/run-local-ci.sh /path/to/the/opaque/api-key-auth.json
```

The exact build passed `44` extension and utility checks, `34/34` applicable
public API checks with a fresh persisted renderer result, and `45/45` native UI
and shipped-extension composition checks. The Release launcher built and
signed successfully, contained no bundled platform components, and staged the
same target binding source. API-key mode disabled only the harness-declared
profile-dependent gates.

The composition run loaded the required Extensions manager plus Multiple
Accounts, Reactions, Thread Colors, and the API test suite in normal extension
order. The installed Extensions pane, Reactions child settings,
assistant-selection transformation, thread menu contribution, header
appearance, color picker, storage utility, and all native Settings controls
coexisted. Multiple Accounts appropriately remained unavailable without a
ChatGPT account identity; that profile behavior is outside the API-key gate.

## Failure signatures

- Native installation or readiness timeout: a hashed asset, initializer,
  shared export, or application-root reconciliation anchor moved.
- `Missing scope instance` from the picker host: the color-picker export was
  rebound to a scoped wrapper instead of `ec`.
- Connected thread trigger stays closed after synthetic pointer-down: the
  target event omitted `buttons: 1`, the adapter identity moved, or native
  dropdown ownership changed.
- Thread order includes shortcut glyphs in labels: nested shortcut markup is
  being read as the semantic row label.
- Empty browser-toolbar foreground sample: the selected Browser tab has not
  committed its content toolbar yet.
- Empty or reordered thread model: the generic adapter, raw descriptors,
  action ids, or source-position reinsertion changed.
- Empty assistant-selection model or non-native layout: the selected-text
  overlay, native container, action wrapper, or annotation callbacks moved.
- Missing Settings control, loading row, search entry, or child navigation:
  the Settings chunk split or page/group/row/control ownership changed.
- An untouched Settings pane consumes renderer resources: a no-op transform
  stopped preserving native descriptor identity.
- Authentication startup or switch failure: application scope, query key,
  browser dispatch, app-server registry, relaunch arguments, or injection
  environment changed.
- Missing or unpainted header or picker: header topology, current CSS tokens,
  React DOM root, or the controlled picker export changed.
