# Derivation — bindings for 26.818.41509

Pinned build:

- App version: `26.818.41509`
- App build: `6962`
- app.asar SHA-256: `8eb91bd9efbf9a4dd04b9b0afdbfcb4e0bab5da18c1919ad74ca327c00c7e791`
- Electron: `151.0.7922.170`
- Sparkle enclosure: `https://persistent.oaistatic.com/codex-app-prod/ChatGPT-darwin-arm64-26.818.41509.zip`
- Binding date: `2026-08-22`
- Binding version: `1.0.1`
- ChatGPT API version: `1.1.2`
- Version-watcher issue: `#46`

Research used only the supplied exact stock application and its supplied
prepared `app.asar` tree. Their version, build, Electron version, signature,
and app.asar hash matched the values above before and after validation. The
stock application, prepared research tree, authentication source, and user
state were not changed.

No generated binding existed when issue `#46` was opened. The original
`1.0.0` implementation started from the API-development implementation in
`26.818.41705`. This `1.0.1` correction retains its verified module map and
fixes the current generic thread-menu adapter losing its pointer-open state
when unrelated extension surfaces changed. The public API, extensions,
extension manifests, and all other bindings are unchanged. Current ESM
imports, semantic callers, export maps, and live behavior were checked before
retaining any short export name.

## Verified module map

The shared implementations are in `app-initial-DwVrCWuo.js`. Every asset and
export below exists in the supplied research tree and was checked through its
current stock import, definition, caller, or live behavior.

| Capability | Current asset | Verified exports |
| --- | --- | --- |
| React, JSX, and React DOM | `app-initial-DwVrCWuo.js` | `XHt()` supplies React; `VHt()` supplies mutable `jsx` and `jsxs`; `pIt()` supplies `createRoot` |
| Native menus | `app-initial-DwVrCWuo.js` | initializer `Y0`; namespace `K0`; `K0.Item`, `K0.Separator`, `K0.SubmenuItem`, and `K0.FlyoutSubmenuItem`; `W0` dropdown root |
| Generic app menu | `app-initial-DwVrCWuo.js` | initializer `A1`; `k1` is the generic menu adapter; `tIt` is its exact internationalization hook |
| Native icons | `app-initial-DwVrCWuo.js` | initializer `l2` and chevron `c2`; initializer `em` and Profile icon `$p`; initializer `o6` and Settings icon `a6` |
| Native color picker | `app-initial-DwVrCWuo.js` | initializer `cc`; controlled picker `sc` |
| Settings shell and search | `settings-page-D-6MG6rZ.js` | semantic category headings, sidebar rows, search input and results, pane selection, and the Suspense boundary |
| Settings section icons | `use-visible-settings-sections-BZAGLkjZ.js` | initializer `i`; section-icon map `r` |
| Native Settings page | `app-initial-DwVrCWuo.js` | initializer `aa`; component `ra` |
| Native Settings group, rows, and row | `app-initial-DwVrCWuo.js` | initializer `Dn` and group `En`; initializer `xO` and rows `bO`; initializer `DO` and row `EO` |
| Native Settings controls | `app-initial-DwVrCWuo.js` | initializer `GW` and toggle `WW`; initializer `Qi`, section title `Zi`, and select trigger `Yi`; initializer `LF` and button `IF` |
| Native Settings loading row | `app-initial-DwVrCWuo.js` | initializer `na`; component `ta` |
| Application scope | `app-initial-DwVrCWuo.js` | initializer `HFt`; application-scope token `VFt`; scope hook `IVt` |
| Authentication context | `app-initial-DwVrCWuo.js` | initializer `xot` and auth-nonce hook `wot`; initializer `Pot` and app-server registry hook `Lot` |
| Query and message contracts | `app-initial-DwVrCWuo.js` | initializer `zHt` and query-client hook `BHt`; initializer `Kjt` and query-key builder `Ujt`; initializer `tMt` and message bus `nMt` |
| Browser and navigation bridges | `app-initial-DwVrCWuo.js` | initializer `udt` and open-in-browser dispatch `pdt`; initializer `sOt` and React Router navigation hook `hOt` |
| Plus icon | `plus-BgCJgEEs-u2HnKZWR.js` | initializer `t`; component `n` |
| Palette icon | `palette-lzFbWMQk--rLrMx1b.js` | initializer `n`; component `t` |
| Persisted-thread overflow | `thread-overflow-menu-DEU3FddQ.js` | initializer `n`; component `t` |
| ChatGPT sign-in | `chatgpt-desktop-auth-url-bqp_bDD7.js` | initializer `r`; `o` starts `login-with-chatgpt`; `t` decorates the URL |

Additional semantic anchors:

- `codex.profileDropdown.*` locates the Profile implementation. The Profile
  row supplies `$p` as its exact `LeftIcon`.
- `threadHeader.*`, `toggle-thread-pin`, `copy-session-id`, and
  `copy-deeplink` identify current local and remote thread actions.
- `data-app-action-sidebar-thread-row`, scoped thread attributes, and
  `data-thread-title-trigger` identify persisted sidebar rows.
- `settings.nav.heading.personal`, `.integrations`, `.coding`, and `.archived`
  locate the native Settings groups. Native pane buttons retain
  `data-settings-panel-slug`.
- `bO` owns the rounded, divided Settings rows container; `EO` owns the
  semantic label, description, and control row contract; `WW` owns the native
  `role="switch"` control with `checked`, `ariaLabel`, and `onChange`.
- `login-route-6ZfGPrIl.js` imports `IVt` as the scope hook and `VFt` as the
  application-scope token before calling the sign-in helper with
  `{ scope, signal }`.
- `codex-app-server-restart`, `codex-app-server-initialized`, and
  `open-in-browser` verify the authentication message contracts.
- The application header remains
  `header[data-pip-obstacle="app-shell-header"]`.
- `app-initial-CaQrAMKA.css` contains the current surface, border,
  focus-visible, and Electron cursor tokens.

## Native ownership boundaries

The binding wraps the shared JSX runtime and transforms native Profile and
thread menu trees without replacing their owning Radix roots. Stateful stock
submenu owners remain mounted. Extension rows use the exact current `K0`
components. Thread transformations pass effective raw descriptors to a real
`k1` element keyed only by its owning thread id. The effective model continues
to refresh through `getItems`. A dedicated thread-menu change signal updates
the boundary only for thread-transform registration, disposal, or dynamic
native-item capture; profile, Settings, color-picker, and thread-list changes
cannot remount the native Radix owner during pointer-down and discard its
pending or open state. Native hooks, shortcuts, `onBeforeOpen` behavior, and
the adapter's stock await mode remain unchanged.

The Profile boundary remains below the providers that own application scope.
It calls `IVt(VFt)` at a stable hook position and retains the live result for
authentication. The thread boundary covers local and remote overflow menus
and preserves native source identity, title, shortcut maps, and render
callbacks for unchanged built-ins.

The Settings boundary captures native categories, panes, groups, rows,
localized messages, and controls. Contributions render with the current page
(`ra`), group (`En`), rows (`bO`), row (`EO`), toggle (`WW`), select trigger
(`Yi`), button (`IF`), and loading (`ta`) components. Private weak maps retain
handlers and native React content outside public descriptors. The initialized
`nMt` message bus opens `/settings/general-settings` before the lazy Profile
subtree mounts, including in API-key mode.

The external session preload installs the main-world JSX hook. Native imports
may finish before or after the first application render. The host waits for
the committed root, reconciles it through the current native React DOM
renderer, and reports native readiness only after all public boundaries are
installed.

## Stock API-key baseline

The exact stock application was launched against a retained copy of the
harness's isolated synthetic profile, with `NODE_OPTIONS`, ChatGPTX launch
configuration, and versions-lock injection absent. `window.__CGPTX_HOST__`
was absent. Profile-dependent observations were omitted as required for
API-key authentication.

The selected persisted-thread header exposed a `28` by `28` point native
trigger. Pointer-down changed it from `aria-expanded="false"` and
`data-state="closed"` to `aria-expanded="true"` and `data-state="open"`.
The project-bound fixture exposed ten direct built-in actions. The Copy owner
expanded to four native children, and Continue in expanded to two current
children; both owners changed to their native open state on pointer movement.
No action, including archive or removal, was activated.

## Authentication and appearance

The sign-in helper in `chatgpt-desktop-auth-url-bqp_bDD7.js` receives the
captured application scope. Successful sign-in removes
`Ujt("account-info")`, updates the native auth nonce through `wot`, and uses
`pdt` for external-browser dispatch. Credential replacement retains the
atomic state update and app-server restart/initialized handshake.

Header registrations compose independently per property. The current header
uses `--color-text`; right-panel toolbar surfaces use `--color-surface`;
native menu separators use `bg-border`. The controlled native color picker
mounts through `pIt().createRoot`, serializes requests, and preserves
Enter/outside-click confirmation and Escape cancellation.

## Validation commands and results

Exact-build identity and source checks:

```bash
/usr/libexec/PlistBuddy -c 'Print :CFBundleShortVersionString' \
  "$CHATGPT_APP_PATH/Contents/Info.plist"
/usr/libexec/PlistBuddy -c 'Print :CFBundleVersion' \
  "$CHATGPT_APP_PATH/Contents/Info.plist"
shasum -a 256 "$CHATGPT_APP_PATH/Contents/Resources/app.asar"
node --check src/platform/bindings/26.818.41509/host.js
node --check src/platform/bindings/26.818.41509/ui-test.mjs
```

These reported version `26.818.41509`, build `6962`, Electron
`151.0.7922.170`, and the pinned app.asar SHA-256 above. All six referenced
hashed assets exist. The target export maps contain every host import, and
each native contract was checked through its current definition or caller and
then exercised live.

The complete deterministic API-key validation command was:

```bash
CHATGPT_APP_PATH="/path/to/ChatGPT.app" \
  scripts/run-local-ci.sh /path/to/api-key-auth.json
```

The exact build passed `36` extension and utility unit checks, `26/26`
applicable public API checks with a matching fresh renderer result, and
`35/35` native UI and shipped-extension composition checks. The Release
launcher built and signed successfully and contained no bundled platform
components.

With the API test extension absent, a separate normal-flow launch loaded only
the three staged shipped extensions. The binding reached native-ready with no
error; `thread-colors` contributed its native thread-menu item; and the
required extension manager rendered its native pane, group, and three
installed-extension rows. `multiple-accounts` is profile-dependent and was
outside the API-key gate.

## Failure signatures

- Native readiness timeout or installation exception: a hashed asset,
  initializer, shared export, or application-root reconciliation anchor moved.
- Empty Profile model: Profile semantic props, Item fibers, or FormatJS ids
  moved.
- Empty or reordered thread model: the generic menu export, raw message
  descriptors, action ids, or source-position reinsertion changed.
- A connected thread trigger remains closed after pointer-down: the generic
  adapter identity or its dedicated thread-menu change signal regressed, or
  native dropdown ownership changed.
- Bound thread trigger with no menu: the `k1` owner, initial item seed, or
  native activation sequence changed.
- Native Settings loading or control failure: page, group, rows, row, or
  control ownership changed.
- Settings cannot open before Profile mounts: the bootstrap `nMt` opener was
  not installed.
- Authentication startup failure: application scope was not captured, the
  wrong scope reached sign-in, or a query, message, or browser bridge changed.
- Missing or unpainted header or picker: header topology, current CSS tokens,
  React DOM root, or the color-picker export changed.
