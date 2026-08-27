# Derivation — bindings for 26.820.60940

Pinned build:

- App version: `26.820.60940`
- App build: `7119`
- app.asar SHA-256: `c964aebbf9a6a0f70799d01215c611d8ef6ee63f816b3d57beccddd47a811fd9`
- Electron: `151.0.7922.170`
- Sparkle enclosure: `https://persistent.oaistatic.com/codex-app-prod/ChatGPT-darwin-arm64-26.820.60940.zip`
- Binding date: `2026-08-27`
- Binding version: `1.1.1`
- ChatGPT API version: `1.5.0`
- Version-watcher issue: `#51`

The workflow supplied the exact stock application and a prepared `app.asar`
research tree. No generated binding was available. The app version, build,
Electron version, and app.asar hash were checked against the values above.
Only those supplied target-build inputs were used: no app was downloaded or
extracted, and the prior stock app was not fetched. The supplied application,
research tree, opaque authentication source, and user state were not changed.

The initial binding started from the API-development implementation and
research record in `26.818.61809`, which was selected by
`src/platform/bindings/manifest.json` at the start of the rebind. Binding
version `1.1.0` advanced the ChatGPTX API from `1.4.0` to `1.5.0` and added
native `above` and `below` placement to assistant-selection actions. Binding
version `1.1.1` corrects thread-list leading views without changing the
ChatGPTX API. Earlier binding directories remain unchanged.

## Verified module map

The shared implementations moved to `app-initial-CmWKLN1D.js`. Every asset and
export below exists in the supplied target research tree and was checked by
its current definition, importer, semantic caller, or live behavior.

| Capability | Current asset | Verified exports |
| --- | --- | --- |
| React, JSX, and React DOM | `app-initial-CmWKLN1D.js` | `XKt()` supplies React; `VKt()` supplies mutable `jsx` and `jsxs`; `Kzt()` supplies `createRoot` |
| Native menus | `app-initial-CmWKLN1D.js` | initializer `c4`; namespace `a4`; `a4.Item`, `a4.Separator`, `a4.SubmenuItem`, and `a4.FlyoutSubmenuItem`; `r4` dropdown root |
| Generic app menu | `app-initial-CmWKLN1D.js` | initializer `x0`; `r4` is the generic menu adapter root and `Pzt` is its current internationalization hook |
| Assistant-selection toolbars | `app-initial-CmWKLN1D.js` | initializer `zI`; `RI` is the selected-text overlay and composes the current native container and action wrapper; `jX` is the native selected-text positioner |
| Native icons | `app-initial-CmWKLN1D.js` | initializer `n4` and chevron-right `t4`; initializer `rh` and Profile icon `nh`; initializer `V8` and Settings icon `B8` |
| Native color picker | `app-initial-CmWKLN1D.js` | initializer `tc`; controlled picker `ec` |
| Settings shell and search | `settings-page-CrglwAgp.js` | native categories, sidebar rows, search results, pane selection, unsaved-navigation handling, and Suspense ownership |
| Settings section icons | `use-visible-settings-sections-B_3QD_Vk.js` | initializer `t`; section-icon map `r` |
| Settings breadcrumb | `toolbar-breadcrumb-DGLlcuIQ.js` | initializer `n`; native breadcrumb component `t` |
| Native Settings page | `app-initial-CmWKLN1D.js` | initializer `co`; component `oo` |
| Native Settings group, rows, and row | `app-initial-CmWKLN1D.js` | initializer `kn` and group `On`; initializer `IS` and rows `FS`; initializer `HS` and row `VS` |
| Native Settings controls | `app-initial-CmWKLN1D.js` | initializer `aG` and toggle `iG`; initializer `to`, section title `eo`, and select trigger `Qa`; initializer `XN` and button `qN`; initializer `$Y` and controlled input `ZY` |
| Native Settings loading row | `settings-loading-row-CxXZN8qu.js` | initializer `n`; component `t` |
| Application scope | `app-initial-CmWKLN1D.js` | initializer `UGt`; application-scope token `bzt`; scope hook `HGt` |
| Authentication context | `app-initial-CmWKLN1D.js` | initializer `zct` and auth-nonce hook `Hct`; initializer `Jct` and app-server registry hook `Zct` |
| Query and message contracts | `app-initial-CmWKLN1D.js` | query-client hook `BKt`; query-key builder `oFt`; initializer `yFt` and message bus `bFt` |
| Browser and navigation bridges | `app-initial-CmWKLN1D.js` | open-in-browser dispatch `Zpt`; navigation hook `FIt` |
| ChatGPT sign-in | `chatgpt-desktop-auth-url-Bq4vhHUL.js` | initializer `r`; `o` starts `login-with-chatgpt`; `t` decorates the URL |
| Plus icon | `plus-BgCJgEEs-N9Jn3eDF.js` | initializer `t`; component `n` |
| Palette icon | `palette-lzFbWMQk-bab7sshm.js` | initializer `n`; component `t` |
| Persisted-thread overflow | `thread-overflow-menu-HDI5h2-V.js` | initializer `n`; component `t`; shared generic adapter `b0` remains in app-initial |

All eight directly imported hashed assets exist. The host's `48` references to
the app-initial export map are present in the target bundle. Retained short
names were accepted only after their current definitions or callers matched
the semantic contract and the capability passed in the live application.

Additional semantic anchors:

- `codex.profileDropdown.*` and `codex.profileFooter.*` locate Profile content.
- `threadHeader.*`, `toggle-thread-pin`, `copy-session-id`, and
  `copy-deeplink` identify current thread actions in
  `chatgpt-conversation-page-D2IR_KcR.js`,
  `remote-conversation-page-ANuMK6Of.js`, and
  `thread-overflow-menu-HDI5h2-V.js`.
- `selectedTextOverlay.addToCodex`, `selectedTextOverlay.moreDetails`, and
  `selectedTextOverlay.askInSideChat` locate native assistant-selection
  actions. `data-response-annotation-target` and
  `data-response-annotation-conversation` locate selectable responses.
- `data-app-action-sidebar-thread-row`, scoped thread attributes, and
  `data-thread-title-trigger` locate persisted sidebar rows.
- Settings navigation still exposes `data-settings-panel-slug`; semantic
  personal, integrations, coding, and archived headings locate native groups.
- `login-route-BgANlasq.js` verifies the application-scope sign-in path.
- The application header remains
  `header[data-pip-obstacle="app-shell-header"]`, and
  `app-initial-BmgJoqMa.css` contains the current surface, border,
  focus-visible, and Electron cursor tokens.

## Native ownership and target-build changes

The prior ownership model is preserved. The binding wraps the shared JSX
runtime and transforms native Profile, persisted-thread, and assistant-
selection trees without replacing their Radix owners. Unchanged built-ins
retain their native elements, handlers, shortcuts, and stateful submenu
ancestors. Extension transformations compose in registration order and
refresh through dedicated signals so unrelated feature updates cannot remount
an open menu owner.

Thread transformations pass raw effective descriptors to the current generic
adapter and key the adapter by its owning thread only. In this build, a real
thread trigger pointer-down reports `buttons: 1`; the target-specific driver
now supplies that state. Native shortcut text also moved inside the outer
label container. The driver reads the nested native `span.truncate` label and
still compares the complete rendered action order with the public effective
model, excluding only the separately rendered, `aria-hidden` shortcut.

Persisted-thread leading views use the native `data-thread-title-trigger` as
their height boundary. That trigger is `self-stretch` and becomes a vertical
layout when activity view adds secondary content. The binding positions the
leading-view host from the trigger's top edge to its bottom edge, so a view
with `height: 100%` follows both the compact and activity layouts. A cached
mount remains valid only while its host is still a direct child of the native
trigger. If a React row update removes that host but retains the row and
trigger elements, the next mutation refresh mounts a fresh view instead of
accepting the disconnected cache record.

The assistant-selection boundary continues to capture the native toolbar
container and action wrapper. The current native positioner export `jX`
provides the selected-text rectangle, horizontal bounds, portal target, and a
live viewport-position callback. It places its native toolbar 8 px above the
selection. Its pointer-down owner keeps a selection only when the event target
is inside the positioner's wrapper. ChatGPTX therefore renders the optional
lower native toolbar as an absolute descendant of that same wrapper. It uses
the same container and action component, clamps to the positioner's horizontal
bounds, and stays 8 px below the selected-text rectangle. It does not create a
second selection owner.

Root assistant-selection actions now have normalized `above` or `below`
placement. Built-ins and omitted placements use `above`. Child actions inherit
their parent's placement. Each placement has its own active child page, so a
parent replaces only its toolbar and the other toolbar stays visible. Actions
from concurrent extensions still pass through one ordered transformer chain
and actions in the same placement share one native toolbar. Leaves dismiss the
selection and receive an immutable activation that contains only the native
event's Command-key state. `labelScale: 2`, `verticalPadding: 4`, native
response-annotation creation, composer-preserving normal creation, and the
native direct-submit path remain unchanged.

Settings loading moved out of app-initial to
`settings-loading-row-CxXZN8qu.js`. The remaining Settings page, group, rows,
row, toggle, select, button, input, title, icon, visibility, breadcrumb,
search, and route contracts retain their previous ownership. No-op transforms
preserve native descriptor identity so dynamic stock panes are not rebuilt.
Extension-owned child panes remain in the native searchable settings tree and
out of the top-level sidebar.

The target opens the Browser side panel with a selected `New tab` before its
content toolbar necessarily commits. The native test now waits for that
selected browser tab's toolbar to appear before recording its foreground
colors. It retains the original assertion that applying a header foreground
must not recolor content-toolbar controls.

The native color picker is `ec`. A static same-shaped candidate, `Mc`, was a
scoped thread-title wrapper; rendering it failed live with
`Missing scope instance`. Rebinding to `ec` restored the two native sliders,
live normalized color changes, outside-click confirmation, and three
consecutive Escape cancellations. The persistent capture listener and
serialized picker queue remain unchanged.

The external session preload still installs the main-world JSX hook. The host
waits for the committed application root, reconciles it through the target
React DOM renderer, and reports native-ready only after all boundaries are
installed. The target runner restores the prepared thread route when needed,
requires that exact thread to become current, and separately requires at least
one app-owned menu item before validation begins.

## Available stock API-key baseline

The exact target stock application was launched with isolated Electron and
Codex state, API-key authentication, and no ChatGPTX or Node injection.
`window.__CGPTX_HOST__` was absent. Profile observations were omitted as
required for API-key mode. The target stock shell did not deterministically
surface the synthetic persisted row during the reduced baseline attempt, so
no destructive or state-changing stock menu action was used and no unsupported
menu inventory was inferred. The previous binding's supplied stock research
record remained the behavioral starting point; every applicable current-build
affordance was then required by the injected target native suite.

The target composition run exposed the selected persisted thread's native
header trigger as a `28` by `28` point Radix menu button. Its app-owned rows
included Pin, Rename, Remove from project, Copy, Archive, New side chat,
Continue in, Add scheduled task, and Open in new window; native shortcuts and
submenu owners remained interactive. Thread Colors inserted Color at the end
of the first native section and opened a separate native flyout portal.

## Validation commands and results

Identity and static checks:

```bash
/usr/libexec/PlistBuddy -c 'Print :CFBundleShortVersionString' \
  "$CHATGPT_APP_PATH/Contents/Info.plist"
/usr/libexec/PlistBuddy -c 'Print :CFBundleVersion' \
  "$CHATGPT_APP_PATH/Contents/Info.plist"
shasum -a 256 "$CHATGPT_APP_PATH/Contents/Resources/app.asar"
node --check src/platform/bindings/26.820.60940/host.js
node --check src/platform/bindings/26.820.60940/ui-test.mjs
```

These reported version `26.820.60940`, build `7119`, Electron
`151.0.7922.170`, and the pinned app.asar SHA-256 above. All referenced assets
and exports passed the static existence checks.

The complete deterministic API-key validation command was:

```bash
CHATGPT_APP_PATH="/path/to/the/supplied/ChatGPT.app" \
  scripts/run-local-ci.sh /path/to/the/opaque/api-key-auth.json
```

The exact build passed `43` extension and utility unit checks, `34/34`
applicable public API checks with a fresh persisted renderer result, and
`45/45` native UI and shipped-extension composition checks. The Release
launcher built and signed successfully and contained no bundled platform
components. API-key mode disabled only the harness-declared profile-dependent
gates.

The composition run loaded the required Extensions manager plus Multiple
Accounts, Reactions, Thread Colors, and the API test suite in the normal
extension order. The installed Extensions pane, Reactions child settings,
assistant-selection transformation, thread menu contribution, header
appearance, color picker, storage utility, and all native Settings controls
coexisted. Multiple Accounts appropriately remained unavailable without a
ChatGPT account identity; that profile behavior is outside the API-key gate.

For the `1.1.1` thread-list correction, the extraction script confirmed the
same installed app version, Electron version, and app.asar hash. The Thread
Colors unit suite passed all `6` checks. A direct source-binding composition
run used a temporary profile against this exact stock app. In activity view,
the native row measured `53.5` px and its title trigger and blue indicator
both measured `39.5` px. Removing the leading-view host caused a fresh,
connected indicator to mount at the same height. Selecting the thread applied
`#3A83F7` and `#FFFFFF` to the header while its sidebar indicator remained
`rgb(58, 131, 247)`. The test app was stopped and all temporary profile,
build, and extracted-app data was removed.

## Failure signatures

- Native installation or readiness timeout: a hashed asset, initializer,
  shared export, or application-root reconciliation anchor moved.
- `Missing scope instance` from the picker host: the color-picker export was
  rebound to a scoped wrapper instead of `ec`.
- Connected thread trigger stays closed after synthetic pointer-down: the
  target event omitted `buttons: 1`, the adapter identity moved, or native
  dropdown ownership changed.
- Thread order includes shortcut glyphs in labels: the target nested shortcut
  markup is being read as the semantic row label.
- Missing or short thread-list indicator: the cached host is disconnected or
  no longer spans the native title trigger from top to bottom.
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
- Authentication startup failure: application scope, auth nonce, query key,
  message bus, browser dispatch, or app-server registry changed.
- Missing or unpainted header or picker: header topology, current CSS tokens,
  React DOM root, or the controlled picker export changed.
