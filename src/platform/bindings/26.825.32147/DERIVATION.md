# Derivation — bindings for 26.825.32147

Pinned build:

- App version: `26.825.32147`
- App build: `7303`
- app.asar SHA-256: `0462b03e878f0e78b223b849ee14cbba0de043f2c16acebee163cb95daa622ef`
- Electron: `151.0.7922.174`
- Sparkle enclosure: `https://persistent.oaistatic.com/codex-app-prod/ChatGPT-darwin-arm64-26.825.32147.zip`
- Binding date: `2026-08-28`
- Binding version: `1.0.0`
- ChatGPT API version: `1.5.2`
- Version-watcher issue: `#55`

The workflow supplied the exact stock application and a prepared `app.asar`
research tree. No generated binding was available. The app version, build,
Electron version, and app.asar hash were checked against the values above.
Only those supplied target-build inputs were used: no app was downloaded or
extracted, and the prior stock app was not fetched. The supplied application,
research tree, opaque authentication source, and user state were not changed.

This new-mode binding started from the API-development implementation in
`26.825.31414`, selected by `src/platform/bindings/manifest.json` at the
start of the rebind. It preserves that implementation's ChatGPT API `1.5.2`
and starts the target-build binding at version `1.0.0`.

## Verified module map

The shared implementations moved to `app-initial-DJrCTPoN.js`. Every asset
and export below exists in the supplied target research tree and was checked
by its current definition, importer, semantic caller, or live behavior.

| Capability | Current asset | Verified exports |
| --- | --- | --- |
| React, JSX, and React DOM | `app-initial-DJrCTPoN.js` | `U2t()` supplies React; `H2t()` supplies mutable `jsx` and `jsxs`; `z2t()` supplies `createRoot` |
| Native menus | `app-initial-DJrCTPoN.js` | initializer `aet`; namespace `net`; `net.Item`, `net.Separator`, `net.SubmenuItem`, and `net.FlyoutSubmenuItem`; `eet` dropdown root |
| Generic app menu | `app-initial-DJrCTPoN.js` | initializer `$9`; descriptor adapter `Q9`; current internationalization hook `c2t` |
| Assistant-selection toolbars | `app-initial-DJrCTPoN.js` | initializer `dy` and overlay `uy`; initializer `_w` and native positioner `gw` |
| Native icons | `app-initial-DJrCTPoN.js` | initializer `Wet` and chevron-right `Uet`; initializer `jv` and Profile icon `Av`; initializer `xot` and Settings icon `bot` |
| Native color picker | `app-initial-DJrCTPoN.js` | initializer `ds`; controlled picker `us` |
| Settings shell and search | `settings-page-QnEYGVTy.js` | native categories, sidebar rows, search results, pane selection, unsaved-navigation handling, and Suspense ownership |
| Settings section icons | `use-visible-settings-sections-s-VlMB6g.js` | initializer `t`; section-icon map `r` |
| Settings breadcrumb | `toolbar-breadcrumb-DGLz3tdB.js` | initializer `n`; native breadcrumb component `t` |
| Native Settings page | `app-initial-DJrCTPoN.js` | initializer `Mo`; component `Ao` |
| Native Settings group, rows, and row | `app-initial-DJrCTPoN.js` | initializer `zn` and group `Rn`; initializer `QN` and rows `ZN`; initializer `oP` and row `rP` |
| Native Settings controls | `app-initial-DJrCTPoN.js` | initializer `det` and toggle `uet`; initializer `To`, section title `wo`, and select trigger `So`; initializer `stt` and button `ott`; initializer `hL` and controlled input `pL` |
| Native Settings loading row | `settings-loading-row-Cig0SJI7.js` | initializer `n`; component `t` |
| Application scope | `app-initial-DJrCTPoN.js` | initializer `Dzt`; application-scope token `Ezt`; scope hook `GUt` |
| App-server registry | `app-initial-DJrCTPoN.js` | initializer `pEt`; registry hook `gEt` |
| Query and message contracts | `app-initial-DJrCTPoN.js` | initializer `RLt` and query-client hook `zLt`; initializer `mLt` and query-key builder `dLt`; initializer `BWt` and message bus `VWt` |
| Browser and navigation bridges | `app-initial-DJrCTPoN.js` | open-in-browser dispatch `LWt`; navigation hook `vzt` |
| ChatGPT sign-in | `chatgpt-desktop-auth-url-C9T__Nvw.js` | initializer `r`; `o` starts the current ChatGPT login-session contract; `t` decorates the URL |
| Plus icon | `plus-BgCJgEEs-DVFkddeF.js` | initializer `t`; component `n` |
| Palette icon | `palette-lzFbWMQk-BQiJ2H2n.js` | initializer `n`; component `t` |
| Persisted-thread overflow | `thread-overflow-menu-DrZEc2Ru.js` | initializer `n`; component `t`; shared generic adapter `Q9` remains in app-initial |

All eight directly imported hashed assets exist. The host's `51` distinct
references to the app-initial export map are present in the target bundle.
Retained short export names were accepted only after their current definitions,
imports, or semantic callers matched the contract and the capability passed in
the live application.

Additional semantic anchors:

- `codex.profileDropdown.*` and `codex.profileFooter.*` locate Profile content.
- `threadHeader.*`, `toggle-thread-pin`, and `copy-deeplink` identify current
  thread actions in `chatgpt-conversation-page-BB7fwept.js`,
  `remote-conversation-page-DOgv33R-.js`, and
  `thread-overflow-menu-DrZEc2Ru.js`.
- `selectedTextOverlay.addToCodex`, `selectedTextOverlay.moreDetails`, and
  `selectedTextOverlay.askInSideChat` locate native assistant-selection
  actions. `data-response-annotation-target` and
  `data-response-annotation-conversation` locate selectable responses.
- `data-app-action-sidebar-thread-row`, scoped thread attributes, and
  `data-thread-title-trigger` locate persisted sidebar rows.
- Settings navigation still exposes `data-settings-panel-slug`; semantic
  personal, integrations, coding, and archived headings locate native groups.
- `login-route-B2AXbLWf.js` and
  `chatgpt-desktop-auth-url-C9T__Nvw.js` verify the current application-scope
  sign-in and login-session paths, URL decoration keys, and browser dispatch.
- The application header remains
  `header[data-pip-obstacle="app-shell-header"]`, and
  `app-initial-NNCUNt29.css` contains the current surface, border,
  focus-visible, and Electron cursor tokens.

## Native ownership and target-build behavior

The prior ownership model remains valid. The binding wraps the shared JSX
runtime and transforms native Profile, persisted-thread, and assistant-
selection trees without replacing their Radix owners. Unchanged built-ins
retain their native elements, handlers, shortcuts, and stateful submenu
ancestors. Extension transformations compose in registration order and refresh
through dedicated signals so unrelated feature updates cannot remount an open
menu owner.

The target thread overflow still passes raw descriptors to the generic `Q9`
adapter with `trigger: "click"`. The transformed thread instance sets the
adapter's public `disableNative` prop so ChatGPT's Radix menu branch remains
the owner when `electronBridge.showContextMenu` is available. Raw effective
descriptors stay keyed by their owning thread, and the native pointer-down
check opens the menu. Native shortcut text remains inside the outer label
container, so the driver reads the nested native `span.truncate` label and
excludes only the separately rendered, `aria-hidden` shortcut.

The assistant-selection boundary captures the native toolbar container and
action wrapper. Initializers `dy` and `_w` expose overlay `uy` and
positioner `gw`. The positioner supplies the selected-text rectangle,
horizontal bounds, portal target, live viewport position callback, and
selection preservation on pointer-down. Root actions normalize to `above` or
`below`; child pages inherit their parent's placement and replace only that
placement's toolbar. Leaves dismiss the selection and receive an immutable
Command-key activation. Native response-annotation creation, composer-
preserving normal creation, and native direct submission passed unchanged.

Settings page, group, rows, row, toggle, select, button, input, title, loading,
icon, visibility, breadcrumb, search, and route contracts retain native
ownership. No-op transforms preserve native descriptor identity so dynamic
stock panes are not rebuilt. Extension child panes remain in the native
searchable settings tree and out of the top-level sidebar.

The native color picker remains the controlled `us` component. Its two native
sliders, normalized live color updates, outside-click confirmation, repeated
Escape cancellation, persistent capture listener, and serialized request
queue passed live. The external session preload installs the main-world JSX
hook; the host waits for the committed application root, reconciles it through
the target React DOM renderer, and reports native-ready only after every
boundary is installed.

## Available stock API-key baseline

The exact target stock application was launched with isolated Electron and
Codex state, API-key authentication, and no ChatGPTX, `NODE_OPTIONS`, or
renderer injection. The app-owned page settled on
`app://-/index.html?initialRoute=%2Favatar-overlay`. Both
`window.__CGPTX_HOST__` and `window.__CGPTX_RUNTIME__` were absent, with no
visible menu or menu item in the reduced authentication mode. No destructive
or state-changing action was used, and no unsupported Profile affordance was
inferred.

The injected composition run exposed the selected persisted thread's native
Radix menu trigger and preserved its app-owned actions, shortcuts, submenu
owners, and activation behavior. Thread Colors contributed Color through the
same native adapter and opened the native flyout portal. Reactions, Extensions
settings, the API suite, and the other enabled shipped extensions coexisted
through their public registration and transformer boundaries.

A separate normal version-locked launch omitted the API test extension.
Extensions, Multiple Accounts, Reactions, and Thread Colors loaded in normal
order; the target host reported native-ready with no binding error and Settings
navigation installed. Multiple Accounts remained unavailable without a
ChatGPT account identity, which is the expected API-key-mode behavior.

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
node --check src/platform/bindings/26.825.32147/host.js
node --check src/platform/bindings/26.825.32147/ui-test.mjs
```

These reported version `26.825.32147`, build `7303`, Electron
`151.0.7922.174`, and the pinned app.asar SHA-256 above. All referenced assets
and all `51` shared exports passed static current-build checks.

The complete deterministic API-key validation command was:

```bash
CHATGPT_APP_PATH="/path/to/the/supplied/ChatGPT.app" \
  scripts/run-local-ci.sh /path/to/the/opaque/api-key-auth.json
```

The exact build passed `44` extension and utility checks, `34/34` applicable
public API checks with a fresh persisted renderer result, and `45/45` native
UI and shipped-extension composition checks. The Release launcher built and
signed successfully, contained no bundled platform components, and staged the
same target binding source. API-key mode disabled only the harness-declared
profile-dependent gates.

## Failure signatures

- Native installation or readiness timeout: a hashed asset, initializer,
  shared export, or application-root reconciliation anchor moved.
- Connected thread trigger lacks a DOM-owned menu: the transformed `Q9`
  adapter stopped receiving `disableNative`, its export moved, or its Radix
  branch changed.
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
