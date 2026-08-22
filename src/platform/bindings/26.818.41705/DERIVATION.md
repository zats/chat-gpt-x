# Derivation — bindings for 26.818.41705

Pinned build:

- App version: `26.818.41705`
- App build: `6971`
- app.asar SHA-256: `7ab7808f570fac3839943c0c324eb46b3ed34bee2647c75fd2155b39509b361e`
- Electron: `151.0.7922.170`
- Sparkle enclosure: `https://persistent.oaistatic.com/codex-app-prod/ChatGPT-darwin-arm64-26.818.41705.zip`
- Binding date: `2026-08-22`
- Binding version: `1.0.0`
- ChatGPT API version: `1.1.2`
- Version-watcher issue: `#44`

Research used the supplied extracted copy of this exact stock application. The
supplied stock bundle provided the exact version, build, Electron version, and
app.asar hash above. Static candidates were checked through current ESM import
edges, stock callers, and semantic anchors, then verified in the live exact
build. The stock app bundle, supplied research tree, and user state were not
changed.

This new binding starts from the API-development implementation in
`26.818.22352` and preserves its ChatGPTX API version. The public API,
extensions, extension manifests, and existing bindings are unchanged. Every
content-hashed module and every shared export used by the host was resolved
again for `26.818.41705`; unchanged short export names were accepted only when
their current function or object contract still matched.

## Verified module map

The shared implementations are in `app-initial-CZAAElKi.js`. Every asset and
export below exists in the supplied research tree and was checked through its
current stock import or caller.

| Capability | Current asset | Verified exports |
| --- | --- | --- |
| React, JSX, and React DOM | `app-initial-CZAAElKi.js` | `XHt()` supplies React; `VHt()` supplies mutable `jsx` and `jsxs`; `pIt()` supplies `createRoot` |
| Native menus | `app-initial-CZAAElKi.js` | initializer `Y0`; namespace `K0`; `K0.Item`, `K0.Separator`, `K0.SubmenuItem`, and `K0.FlyoutSubmenuItem`; `W0` dropdown root |
| Generic app menu | `app-initial-CZAAElKi.js` | initializer `A1`; `k1` is the generic menu adapter; `tIt` is its exact internationalization hook |
| Native icons | `app-initial-CZAAElKi.js` | initializer `l2` and chevron `c2`; initializer `em` and Profile icon `$p`; initializer `o6` and Settings icon `a6` |
| Native color picker | `app-initial-CZAAElKi.js` | initializer `cc`; controlled picker `sc` |
| Settings shell and search | `settings-page-lp1Q-VEE.js` | semantic category headings, sidebar rows, search input and results, pane selection, and the Suspense boundary |
| Settings section icons | `use-visible-settings-sections-D6GQiEZo.js` | initializer `i`; section-icon map `r` |
| Native Settings page | `app-initial-CZAAElKi.js` | initializer `aa`; component `ra` |
| Native Settings group, rows, and row | `app-initial-CZAAElKi.js` | initializer `Dn` and group `En`; initializer `xO` and rows `bO`; initializer `DO` and row `EO` |
| Native Settings controls | `app-initial-CZAAElKi.js` | initializer `GW` and toggle `WW`; initializer `Qi`, section title `Zi`, and select trigger `Yi`; initializer `LF` and button `IF` |
| Native Settings loading row | `app-initial-CZAAElKi.js` | initializer `na`; component `ta` |
| Application scope | `app-initial-CZAAElKi.js` | initializer `HFt`; application-scope token `VFt`; scope hook `IVt` |
| Authentication context | `app-initial-CZAAElKi.js` | initializer `xot` and auth-nonce hook `wot`; initializer `Pot` and app-server registry hook `Lot` |
| Query and message contracts | `app-initial-CZAAElKi.js` | initializer `zHt` and query-client hook `BHt`; initializer `Kjt` and query-key builder `Ujt`; initializer `tMt` and message bus `nMt` |
| Browser and navigation bridges | `app-initial-CZAAElKi.js` | initializer `udt` and open-in-browser dispatch `pdt`; initializer `sOt` and React Router navigation hook `hOt` |
| Plus icon | `plus-BgCJgEEs-CO-csf0i.js` | initializer `t`; component `n` |
| Palette icon | `palette-lzFbWMQk-1HXKbe8r.js` | initializer `n`; component `t` |
| Persisted-thread overflow | `thread-overflow-menu-UM2bgC7U.js` | initializer `n`; component `t` |
| ChatGPT sign-in | `chatgpt-desktop-auth-url-vFV3kYCn.js` | initializer `r`; `o` starts `login-with-chatgpt`; `t` decorates the URL |

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
- `bO` owns the current rounded, divided Settings rows container; `EO` owns
  the semantic label/description/control row contract; `WW` owns the native
  `role="switch"` control with `checked`, `ariaLabel`, and `onChange`.
- `login-route-DYViEgfJ.js` imports `IVt` as the scope hook and `VFt` as the
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
components, while thread transformations pass effective raw descriptors to a
real keyed `k1` element so the stock adapter retains its hooks, open state,
shortcuts, and `onBeforeOpen` behavior.

The Profile boundary remains below the providers that own application scope.
It calls `IVt(VFt)` at a stable hook position and retains the resulting live
scope for authentication. The thread boundary still covers both local and
remote overflow menus and preserves the native source identity, title,
shortcut map, and render callbacks for unchanged built-ins.

The Settings boundary captures native categories, panes, groups, rows,
localized messages, and native controls. Contributions render with the
current page (`ra`), group (`En`), rows (`bO`), row (`EO`), toggle (`WW`),
select trigger (`Yi`), button (`IF`), and loading (`ta`) components. Private
weak maps keep handlers and native React content outside public descriptors.
The initialized `nMt` message bus opens `/settings/general-settings` before
the lazy Profile subtree mounts, including in API-key mode.

The main-world JSX hook is installed from the external session preload. Native
imports may complete before or after the first application render. The host
waits for the committed root, reconciles it through the current native React
DOM renderer, and resolves native readiness only after the public boundaries
are installed.

## Reported validation failure and correction

The first generated binding passed all `26/26` applicable public API checks,
then its native UI run failed at the first thread-menu open. The selected
trigger was still connected and correctly bound to the fixture thread at
`x=490.484375`, `y=9`, with a `28` by `28` point rectangle, but no menu became
visible after the validator synchronously dispatched pointer-down, pointer-up,
and click events in one renderer task.

Static inspection of `thread-overflow-menu-UM2bgC7U.js` and the current `k1`
generic menu adapter showed that the visible button remains owned by the
native dropdown trigger. Live stock and injected probes against this exact
build then established its event contract: click alone does not open it,
pointer-up alone does not open it, and pointer-down changes the button from
`aria-expanded="false"` / `data-state="closed"` to
`aria-expanded="true"` / `data-state="open"` and mounts the native menu.

The target `ui-test.mjs` therefore dispatches the exact pointer-down event at
the trigger center and waits for both the native expanded state and a menu
whose direct rows carry the bound thread identity. It no longer batches later
gesture events into the same renderer task. This preserves the behavioral
assertion while removing the scheduler-dependent synthetic-event race. The
binding host did not require a change.

The API-key stock baseline used the isolated fixture without injection. It
showed the same `28` by `28` header trigger and pointer-down transition, then a
bottom-aligned native menu with nine built-in actions and three separators.
The Copy and Continue in rows retained their native submenu ownership. Profile
observations were omitted because API-key mode has no profile surface.

## Authentication and appearance

The exact sign-in helper in `chatgpt-desktop-auth-url-vFV3kYCn.js` receives
the captured application scope. Successful sign-in removes
`Ujt("account-info")`, updates the native auth nonce through `wot`, and uses
`pdt` for the external-browser dispatch. Credential replacement retains the
existing atomic state update and app-server restart/initialized handshake.

Header registrations continue to compose independently per property. The
current header uses `--color-text`; right-panel toolbar surfaces use
`--color-surface`; native menu separators use `bg-border`. The controlled
native color picker mounts through `pIt().createRoot`, serializes requests,
and preserves Enter/outside-click confirmation and Escape cancellation.

## Validation commands and results

Exact-build checks against the supplied stock app:

```bash
/usr/libexec/PlistBuddy -c 'Print :CFBundleShortVersionString' \
  "$CHATGPT_APP_PATH/Contents/Info.plist"
/usr/libexec/PlistBuddy -c 'Print :CFBundleVersion' \
  "$CHATGPT_APP_PATH/Contents/Info.plist"
shasum -a 256 "$CHATGPT_APP_PATH/Contents/Resources/app.asar"
node --check src/platform/bindings/26.818.41705/host.js
node --check src/platform/bindings/26.818.41705/ui-test.mjs
```

These reported version `26.818.41705`, build `6971`, Electron
`151.0.7922.170`, and the pinned app.asar SHA-256 above. All referenced hashed
assets exist, and every `appInitialModule` export used by `host.js` is present
in the target module export map.

The complete deterministic API-key validation command is:

```bash
CHATGPT_APP_PATH="/path/to/ChatGPT.app" \
  scripts/run-local-ci.sh /path/to/api-key-auth.json
```

After the target validator correction, the supplied exact stock build passed:
`36` extension and utility unit checks, `26/26` applicable public API checks
with matching persisted renderer results, and `35/35` native UI and
shipped-extension composition checks. The Release launcher built and signed
successfully and contained no bundled platform components.

## Failure signatures

- Native readiness timeout or installation exception: a hashed asset,
  initializer, shared export, or application-root reconciliation anchor moved.
- Empty Profile model: Profile semantic props, Item fibers, or FormatJS IDs
  moved.
- Empty or reordered thread model: the generic menu export, raw message
  descriptors, action IDs, or source-position reinsertion changed.
- A connected thread trigger remains closed after pointer-down: the native
  dropdown trigger ownership or its activation contract changed.
- Bound thread trigger with no menu: the `k1` ownership boundary, initial item
  seed, or native activation sequence changed.
- Native Settings loading or control failure: page/group/rows/row ownership or
  a control initializer/export changed.
- Settings cannot open before Profile mounts: the bootstrap `nMt` opener was
  not installed.
- Authentication startup failure: the application scope was not captured, the
  wrong scope reached the sign-in helper, or a query/message/browser bridge
  changed.
- Missing or unpainted header/picker: the header topology, current CSS tokens,
  React DOM root, or color-picker export changed.
