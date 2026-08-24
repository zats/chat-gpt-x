# Derivation — bindings for 26.818.61809

Pinned build:

- App version: `26.818.61809`
- App build: `7019`
- app.asar SHA-256: `76bbcdc2a4a2d77cfe03904a6537d0a655f9892f27a8925e3a6c7b613801d4cf`
- Electron: `151.0.7922.170`
- Sparkle enclosure: `https://persistent.oaistatic.com/codex-app-prod/ChatGPT-darwin-arm64-26.818.61809.zip`
- Binding date: `2026-08-24`
- Binding version: `1.0.0`
- ChatGPT API version: `1.4.0`
- Version-watcher issue: `#50`

Research used only the supplied exact stock application and its supplied
prepared `app.asar` tree. Their version, build, Electron version, signature,
and app.asar hash matched the values above before and after validation. The
stock application, prepared research tree, opaque authentication source, and
user state were not changed.

The workflow supplied a generated candidate for issue `#50`. Its exact-build
asset map, dedicated thread-menu update signal, and stock behavioral
observations were retained. The final binding starts from the API-development
implementation and research record in `26.818.41509` and preserves that
binding's ChatGPTX API `1.4.0`. The candidate's exact prior validation failed
at the old `20`-second public thread-menu readiness deadline while the
version-specific runner was still restoring the native route and publishing
the prepared thread's menu model. The current base already provides the
targeted `70`-second readiness window without changing the assertion. The
final target runner restores the native route from Settings when necessary,
waits for the selected persisted thread to become current, and independently
requires at least one app-owned menu item for that exact thread. The successful
public run completed in `22` seconds, confirming the reported cutoff instead
of treating it as transient. The current implementation includes
`menus.assistantSelection`, its one-level child page and native response-
annotation creation, `labelScale: 2`, `verticalPadding: 4`, Settings row
disclosures, native controlled text fields, extension-owned child panes, and
`settings.ui.inline`. Current ESM imports, semantic callers, export maps, and
live behavior were checked before any short export name was retained. The
public API, extensions, extension manifests, and every prior binding directory
are unchanged.

## Verified module map

The shared implementations are in `app-initial-q5My48Y-.js`. Every asset and
export below exists in the supplied research tree and was checked through its
current stock import, definition, caller, or live behavior.

| Capability | Current asset | Verified exports |
| --- | --- | --- |
| React, JSX, and React DOM | `app-initial-q5My48Y-.js` | `XHt()` supplies React; `VHt()` supplies mutable `jsx` and `jsxs`; `pIt()` supplies `createRoot` |
| Native menus | `app-initial-q5My48Y-.js` | initializer `Y0`; namespace `K0`; `K0.Item`, `K0.Separator`, `K0.SubmenuItem`, and `K0.FlyoutSubmenuItem`; `W0` dropdown root |
| Generic app menu | `app-initial-q5My48Y-.js` | initializer `A1`; `k1` is the generic menu adapter; `tIt` is its exact internationalization hook |
| Assistant-selection toolbar | `app-initial-q5My48Y-.js` | export `pR` is the selected-text overlay (`Lwo`); its current definition composes native container `eKa` and native action wrapper `mU` |
| Native icons | `app-initial-q5My48Y-.js` | initializer `l2` and chevron-right `c2`; initializer `em` and Profile icon `$p`; initializer `o6` and Settings icon `a6` |
| Native color picker | `app-initial-q5My48Y-.js` | initializer `cc`; controlled picker `sc` |
| Settings shell and search | `settings-page-DTyeATGR.js` | semantic category headings, sidebar rows, search input and results, pane selection, unsaved-navigation handling, and the Suspense boundary |
| Settings section icons | `use-visible-settings-sections-Bd8lzZ2p.js` | initializer `i`; section-icon map `r` |
| Settings breadcrumb | `toolbar-breadcrumb-DHAxuM2B.js` | initializer `n`; native breadcrumb component `t` |
| Native Settings page | `app-initial-q5My48Y-.js` | initializer `aa`; component `ra` |
| Native Settings group, rows, and row | `app-initial-q5My48Y-.js` | initializer `Dn` and group `En`; initializer `xO` and rows `bO`; initializer `DO` and row `EO` |
| Native Settings controls | `app-initial-q5My48Y-.js` | initializer `GW` and toggle `WW`; initializer `Qi`, section title `Zi`, and select trigger `Yi`; initializer `LF` and button `IF`; controlled input `IY` |
| Native Settings loading row | `app-initial-q5My48Y-.js` | initializer `na`; component `ta` |
| Application scope | `app-initial-q5My48Y-.js` | initializer `HFt`; application-scope token `VFt`; scope hook `IVt` |
| Authentication context | `app-initial-q5My48Y-.js` | initializer `xot` and auth-nonce hook `wot`; initializer `Pot` and app-server registry hook `Lot` |
| Query and message contracts | `app-initial-q5My48Y-.js` | initializer `zHt` and query-client hook `BHt`; initializer `Kjt` and query-key builder `Ujt`; initializer `tMt` and message bus `nMt` |
| Browser and navigation bridges | `app-initial-q5My48Y-.js` | initializer `udt` and open-in-browser dispatch `pdt`; initializer `sOt` and React Router navigation hook `hOt` |
| Plus icon | `plus-BgCJgEEs-C_-OO9VZ.js` | initializer `t`; component `n` |
| Palette icon | `palette-lzFbWMQk-C_UntwAA.js` | initializer `n`; component `t` |
| Persisted-thread overflow | `thread-overflow-menu-1AqHdBKL.js` | initializer `n`; component `t` |
| ChatGPT sign-in | `chatgpt-desktop-auth-url-CkOQTnB7.js` | initializer `r`; `o` starts `login-with-chatgpt`; `t` decorates the URL |

Additional semantic anchors:

- `codex.profileDropdown.*` locates the Profile implementation. The Profile
  row supplies `$p` as its exact `LeftIcon`.
- `threadHeader.*`, `toggle-thread-pin`, `copy-session-id`, and
  `copy-deeplink` identify current local and remote thread actions in
  `chatgpt-conversation-page-B7DBYj9z.js`,
  `remote-conversation-page-BZO6n3au.js`, and
  `thread-overflow-menu-1AqHdBKL.js`.
- `selectedTextOverlay.addToCodex`, `selectedTextOverlay.moreDetails`, and
  `selectedTextOverlay.askInSideChat` identify the assistant-selection
  actions. `data-response-annotation-target` and
  `data-response-annotation-conversation` identify selectable assistant
  responses.
- `data-app-action-sidebar-thread-row`, scoped thread attributes, and
  `data-thread-title-trigger` identify persisted sidebar rows.
- `settings.nav.heading.personal`, `.integrations`, `.coding`, and `.archived`
  locate the native Settings groups. Native pane buttons retain
  `data-settings-panel-slug`.
- `bO` owns the rounded, divided Settings rows container; `EO` owns the
  semantic label, description, and control row contract; `WW` owns the native
  `role="switch"` control with `checked`, `ariaLabel`, and `onChange`.
- `login-route-CwQxAkGH.js` imports `IVt` as the scope hook and `VFt` as the
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

The assistant-selection boundary calls the current `pR` component inside the
same provider tree. It captures the native `eKa` container and `mU` action
wrapper, then applies extension transformers in registration order. Built-in
replacement items inherit omitted fields and handlers. Extension items use
the native action wrapper. A parent action retains the browser selection and
replaces the native container's children with its one-level child page. A
leaf action clears the browser selection before it calls the selected
handler. Native clicks copy only the event's `metaKey` state into the frozen
public activation value. Programmatic activation reports `metaKey: false`.
The boundary is limited to assistant responses: it requires selected text,
at least one assistant action handler, and no edit or comment handler.

The `labelScale: 2` presentation still renders the exact native `mU` action.
The binding wraps only its label child in an inline `2em` span with unit line
height. The current `composerSm` button is `28` points high in Electron, and
its normal action text is `13` points. The optional `verticalPadding: 4`
presentation passes `height: auto` and `padding-block: 4px` to that same
native action. The `26`-point emoji line makes the button `36` points high,
including its native border, and the native `eKa` container grows to `38`
points. Native separators continue to self-stretch. No replacement control
or fixed height is used.

The annotation path starts from the captured native
`selectedTextOverlay.addToCodex` handler. That handler retains the exact DOM
range and produces the app's `{id, text, anchor}` response annotation through
the same callback as **Add to chat**. The JSX hook then identifies the native
annotation layer by its complete create-mode callback contract. Standard
creation first closes the native editor state, then invokes
`onUpdateAnnotation(id, annotation)`. The completed response annotation stays
in the composer. Direct creation invokes `onDirectSubmit(id, annotation)`;
the app updates the annotation and calls its normal composer submit function.
ChatGPT continues to own anchor construction, annotation storage, prompt
serialization, composer validation, and message submission.

The Settings boundary captures native categories, panes, groups, rows,
localized messages, and controls. Contributions render with the current page
(`ra`), group (`En`), rows (`bO`), row (`EO`), toggle (`WW`), select trigger
(`Yi`), button (`IF`), controlled input (`IY`), chevron-right (`c2`), and
loading (`ta`) components. Rows without a destination render the same native
icon button and chevron at zero opacity, outside pointer and keyboard input,
so all trailing controls use the exact native disclosure width. A destination
opens from its label, description, or chevron. The label and description use
`cursor-interaction`, which follows the application-wide interactive-pointer
preference, while the trailing control stays independent. An inline control
group uses a small flex container around ordered native controls. It
rejects empty groups, nested groups, and controls owned by another extension.
Private weak maps retain handlers and native React content
outside public descriptors. If every group and item transformer returns a
native pane unchanged, the boundary preserves each original native group
element instead of rebuilding the page. This is required for dynamic panes
such as Personalization: rebuilding an unchanged group causes its native state
update to recapture the page continuously, consumes the renderer heap, and
stops UI input. Effective category, pane, group, and item text enters the
native search index. The initialized `nMt` message bus opens
`/settings/general-settings` before the lazy Profile subtree mounts, including
in API-key mode.

The extension package manifest declares its dedicated settings pane through
`settings.pane`. The launcher carries that exact pane ID to the renderer when
it loads the settings provider. If the Extensions manager pane is effective,
the binding omits the dedicated pane from the top-level sidebar, marks
Extensions as active while the dedicated pane is open, and passes the native
toolbar breadcrumb (`t`) as the page title. The breadcrumb ancestor opens
`extensions.installed`. The dedicated pane stays in the effective settings
tree, so native search, direct settings links, and group transforms continue
to use it.

The native color-picker host installs one persistent keyboard capture listener
when the binding mounts, before later native menus and overlays can suppress a
picker event. It consumes Escape or Enter only while a picker request is
active. Each visible surface installs only its outside-click listener in a
layout effect. The live test waits for both result settlement and dialog
removal before it starts another picker, so it cannot mistake a settled
session's stale DOM for the new session. It sends Escape from the focused
native slider instead of dispatching an artificial event at `document`.

The external session preload installs the main-world JSX hook. Native imports
may finish before or after the first application render. The host waits for
the committed root, reconciles it through the current native React DOM
renderer, and reports native readiness only after all public boundaries are
installed. Before the public readiness gate, the target UI runner follows the
native Settings back path if the prepared thread row is not present, activates
that row through its current React handler, and waits until `threads.getCurrent()`
reports its exact id and `menus.thread.getItems()` exposes an app-owned action.
It follows the same native back path after the Settings checks before the later
thread-menu checks. Native Radix menu leaves in this build are exercised with
their complete pointer-down, pointer-up, and click activation sequence; a
click-only synthetic event did not activate the Thread Colors preset.

## Stock API-key baseline

The exact stock application was launched with isolated Electron and Codex
state, the opaque API-key authentication source, a synthetic persisted local
thread, and no ChatGPTX or Node injection. `window.__CGPTX_HOST__` was absent.
Profile-dependent observations were omitted as required for API-key
authentication.

The selected persisted-thread header exposed a `28` by `28` point native
trigger. Pointer-down changed it from `aria-expanded="false"` and
`data-state="closed"` to `aria-expanded="true"` and `data-state="open"`.
The selected project thread exposed eight direct actions and three separators:
Pin, Rename, Remove from project, Archive, Copy, New side chat, Continue in,
and Open in new window. Copy and Continue in were native submenu owners. Copy
opened its native child column containing Copy working directory, Copy session
ID, Copy deeplink, and Copy as Markdown. Escape closed the menu. No action,
including Archive or Remove from project, was activated.

## Authentication and appearance

The sign-in helper in `chatgpt-desktop-auth-url-CkOQTnB7.js` receives the
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
node --check src/platform/bindings/26.818.61809/host.js
node --check src/platform/bindings/26.818.61809/ui-test.mjs
```

These reported version `26.818.61809`, build `7019`, Electron
`151.0.7922.170`, and the pinned app.asar SHA-256 above. All seven directly
referenced hashed JavaScript assets exist. The target export maps contain all
`53` app-initial exports used by the host. Each native contract was checked
through its current definition or caller and then exercised live.

The complete deterministic API-key validation command was:

```bash
CHATGPT_APP_PATH="/path/to/the/supplied/ChatGPT.app" \
  scripts/run-local-ci.sh /path/to/the/opaque/api-key-auth.json
```

The exact build passed `43` extension and utility unit checks, `33/33`
applicable public API checks with a matching fresh renderer result, and
`45/45` native UI and shipped-extension composition checks. The Release
launcher built and signed successfully and contained no bundled platform
components.

With the API test extension absent, a separate normal-flow launch loaded all
four staged shipped extension packages. The binding reached native-ready with
no error, exposed native Settings navigation, and had no API-test globals. The
bridge injected Extensions, Multiple Accounts, Reactions, and Thread Colors
without a bridge or host failure. In API-key mode, the Multiple Accounts
feature appropriately could not activate without a ChatGPT account identity;
that profile-dependent behavior remains outside the API-key gate. In the
composition run,
the installed Extensions pane rendered the Multiple Accounts, Reactions, and
Thread Colors rows while keeping Reactions' child controls off the parent
pane. The `reactions` feature registered its assistant-selection transformer
and its settings provider added a searchable Reactions pane with a native
controlled emoji field and reset action. `thread-colors` contributed its
native thread-menu item. The required extension manager rendered its native
pane, group, and three user-manageable installed-extension rows with aligned
disclosure slots. The required Extensions manager omitted its own package.

## Failure signatures

- Native readiness timeout or installation exception: a hashed asset,
  initializer, shared export, or application-root reconciliation anchor moved.
- Empty Profile model: Profile semantic props, Item fibers, or FormatJS ids
  moved.
- Empty or reordered thread model: the generic menu export, raw message
  descriptors, action ids, or source-position reinsertion changed.
- `readiness: built-in thread menu items present` reports no persisted thread
  menu while the prepared row exists: native route recovery, exact-current
  thread publication, or the generic adapter's app-owned menu model did not
  complete within the readiness window.
- The Thread Colors flyout renders but a preset does not update the header or
  sidebar indicator: the version-specific driver omitted part of the current
  native pointer activation sequence, or thread-list invalidation regressed.
- Empty assistant-selection model: the `pR` export, selected-text message ids,
  native `eKa` container, or `mU` action wrapper changed.
- Assistant-selection action with non-native layout or no activation: the
  native container or action ownership changed, or browser-selection dismissal
  regressed.
- Assistant-selection scaled label is not twice the native font size: the
  native action's child inheritance or its `composerSm` size token changed.
- Assistant-selection padded action does not add `4` points above and below
  or does not grow by `8` points: the native action stopped forwarding style,
  its fixed-height token changed, or the container stopped growing with it.
- Assistant-selection child page closes immediately: parent activation entered
  the leaf dismissal path or the dedicated selection-boundary refresh signal
  no longer preserves the boundary model.
- Response-annotation creation times out: the Add to chat handler no longer
  creates a native annotation editor, or the create-mode annotation-layer
  update/direct-submit callback contract changed.
- A Settings text field does not edit or retain focus: the `IY` controlled
  input contract or its compact variant changed.
- Settings inline controls are absent or reordered: the composite renderer no
  longer retains its child descriptors or renders them in array order.
- A visible color picker ignores Escape: dismissal listeners were moved after
  the layout commit or a replacement picker retained stale session handlers.
- A Settings disclosure is absent, misaligned, or its row does not navigate:
  the `IF` icon-button contract, `c2` icon, invisible sibling disclosure,
  `cursor-interaction` token, or native settings route changed.
- Extension settings are absent from search: effective category, pane, group,
  or item metadata no longer enters the native Settings search index.
- An untouched native Settings pane consumes CPU or renderer memory: no-op
  group or item transforms lost native descriptor identity, or the boundary
  rebuilt native groups instead of preserving their original elements.
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
