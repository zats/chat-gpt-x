# Derivation — bindings for 26.818.21641

Pinned build:

- App version: `26.818.21641`
- App build: `6849`
- app.asar SHA-256: `d66f8d3ba6ae0f75b8511ae098a1f93dc65e08c6174a64bfe576e52383256350`
- Electron: `151.0.7922.170`
- Sparkle enclosure: `https://persistent.oaistatic.com/codex-app-prod/ChatGPT-darwin-arm64-26.818.21641.zip`
- Enclosure length: `603590340` bytes
- Binding date: `2026-08-20`
- Binding version: `1.0.1`
- ChatGPT API version: `1.1.2`

Research used an extracted copy of this exact stock application. The cached
Sparkle appcast for build `6849` supplied the exact enclosure URL and length.
The installed application supplied the exact version, Electron version, and
app.asar hash. Static candidates were checked through current ESM import edges,
stock callers, and semantic anchors. Live behavior was checked with isolated
profiles. The stock app bundle and installed user state were not changed.

This binding starts from the completed `26.814.41407` API `1.1.1` behavior
and implements the account-identity correction in API `1.1.2`.
All content-hashed assets, initializers, public exports, stock callers, CSS
tokens, and build-specific wrappers were derived again from `26.818.21641`.
No short export name was accepted without a current semantic check. This was
required because some unchanged short names have different meanings in this
build.

## Verified module map

The shared implementations are in `app-initial-DOX-K1rC.js`. Every asset and
export below exists in the extracted exact build.

| Capability | Current asset | Verified exports |
| --- | --- | --- |
| React, JSX, and React DOM | `app-initial-DOX-K1rC.js` | `wHt()` supplies React; `hHt()` supplies mutable `jsx` and `jsxs`; `VFt()` supplies `createRoot` |
| Native menus | `app-initial-DOX-K1rC.js` | initializer `R0`; namespace `F0`; `F0.Item`, `F0.Separator`, `F0.SubmenuItem`, and `F0.FlyoutSubmenuItem`; `N0` dropdown root |
| Generic app menu | `app-initial-DOX-K1rC.js` | `v1` is the current `xR` generic menu adapter; `kFt` is the exact internationalization hook used by that adapter |
| Native icons | `app-initial-DOX-K1rC.js` | initializer `Q0` and component `Z0` for the menu chevron; initializer `nm` and component `tm` for Profile; initializer `U3` and component `H3` for Settings |
| Native color picker | `app-initial-DOX-K1rC.js` | initializer `uc`; controlled picker `lc` |
| Settings shell and search | `settings-page-XXqkI3qv.js` | semantic category headings, sidebar rows, search input and results, pane selection, and the Suspense boundary |
| Settings section icons | `use-visible-settings-sections-CTo7hdHM.js` | initializer `i`; section-icon map `r` |
| Native Settings page | `app-initial-DOX-K1rC.js` | initializer `aa`; component `ra` |
| Native Settings group and rows | `app-initial-DOX-K1rC.js` | initializer `Dn` and group `En`; initializer `DO` and rows `EO`; initializer `NO` and row `MO` |
| Native Settings controls | `app-initial-DOX-K1rC.js` | initializer `PW` and toggle `NW`; initializer `Qi`, section title `Zi`, and select trigger `Yi`; initializer `GF` and button `WF` |
| Native Settings loading row | `app-initial-DOX-K1rC.js` | initializer `na`; component `ta` |
| Application scope | `app-initial-DOX-K1rC.js` | initializer `gFt` and scope token `hFt`; initializer `lVt` and scope hook `uVt` |
| Authentication context | `app-initial-DOX-K1rC.js` | initializer `uot` and auth-nonce hook `pot`; initializer `_ot` and app-server registry hook `bot` |
| Query and message contracts | `app-initial-DOX-K1rC.js` | initializer `pHt` and query-client hook `mHt`; initializer `bjt` and account-info query-key builder `_jt`; initializer `kjt` and message bus `Ajt` |
| Browser and navigation bridges | `app-initial-DOX-K1rC.js` | initializer `Iut` and open-in-browser dispatch `zut`; initializer `zDt` and React Router navigation hook `UDt` |
| Plus icon | `plus-BgCJgEEs-B85Jh4D_.js` | initializer `t`; component `n` |
| Palette icon | `palette-lzFbWMQk-_AEtvi9I.js` | initializer `n`; component `t` |
| Persisted-thread overflow | `thread-overflow-menu-DLgRC99N.js` | initializer `n`; component `t` |
| ChatGPT sign-in | `chatgpt-desktop-auth-url-c5rz_oF2.js` | initializer `r`; `o` starts `login-with-chatgpt`; `t` decorates the URL |

Additional semantic anchors:

- `codex.profileDropdown.*` locates the current profile implementation. The
  Profile row supplies `tm` as its exact `LeftIcon`.
- `threadHeader.*`, `toggle-thread-pin`, `copy-session-id`, and
  `copy-deeplink` identify current local and remote thread actions.
- `data-app-action-sidebar-thread-row`, scoped thread attributes, and
  `data-thread-title-trigger` identify persisted sidebar rows.
- `settings.nav.heading.personal`, `.integrations`, `.coding`, and `.archived`
  locate the four native Settings groups. Native pane buttons keep
  `data-settings-panel-slug`.
- `codex.projectAppearance.color.option.aria_label` and
  `codex.remoteHostColorPicker.*` locate app-owned color precedents.
- `login-route-Bxq_cp6n.js` imports `uVt` as the scope hook and `hFt` as the
  application-scope token. Its stock call is `o({ scope, signal })`.
- `codex-app-server-restart`, `codex-app-server-initialized`, and
  `open-in-browser` verify the authentication message contracts.
- The application header remains
  `header[data-pip-obstacle="app-shell-header"]`.
- `app-initial-Bj2YneuG.css` contains the current surface, border, highlighted,
  focus-visible, and Electron cursor tokens.

## menus.profile

The binding wraps the current shared JSX runtime. It identifies the Profile
root through semantic props and FormatJS messages, captures native Item
fibers, and renders transformed descriptors inside the original Radix root.
Stateful native submenu owners and their children remain intact. Extension
submenus use the app's Item and SubmenuItem components.

Transformers compose in registration order. They enforce extension namespaces
and unique IDs, preserve moved built-ins, and isolate failures. The Profile
person component remains the exact `LeftIcon` of
`codex.profileDropdown.profile`.

The same Profile boundary is under the providers that own the application
scope. It calls `uVt(hFt)` at a stable hook position and stores the non-null
live scope for the public authentication API.

## menus.thread, threads, and threads.list

The current `thread-overflow-menu-DLgRC99N.js` does not render `N0` directly.
It renders the shared `v1` generic menu with `disableNative: true`, a
synchronous `getItems`, `onBeforeOpen`, `renderItem`, shortcuts, and a click
trigger. There is no separate native-context-menu adapter asset in this build.

The binding captures the raw generic descriptors before `v1` converts their
FormatJS messages to native-label strings. It uses `message.id` as the stable
public ID and uses `kFt().formatMessage(message, messageValues)` for the exact
localized label. The raw action ID remains private.

The binding computes public transformations from this semantic model and then
passes effective raw descriptors to a real, keyed `v1` React element. This
keeps `v1` as the owner of its hooks and open state. Unchanged built-ins keep
their exact raw descriptors, icons, handlers, shortcuts, tooltips, and stock
`renderItem` behavior. Changed built-ins and new extension rows use the same
native `F0` Item, Separator, and Flyout components. A scoped JSX marker adds
the stable public ID and the extension fields to the exact native nodes.

The initial item seed supplies built-ins before the first menu open. The
wrapped `getItems` refreshes both the semantic model and render map before it
returns data to `v1`. The effective shortcuts map uses raw action IDs, so a
public shortcut change or removal cannot leave a stale stock shortcut.
`onBeforeOpen` remains unchanged, so ChatGPT can refresh its own action state.

The local overflow component receives `conversationId`, `title`, and optional
`cwd`. Remote menus expose the same identity through their action tree. Both
use one boundary. Remote titles come from the matching native sidebar row.
The native UI test also proves that the generic adapter path rendered before
it accepts a bound thread menu.

## Renderer bootstrap

The main-world JSX hook is installed from ChatGPTX's external session preload
before page scripts. Native imports can complete before or after the first
React render. The binding waits for the committed application root, reconciles
it through the native React DOM renderer, and resolves
`__CGPTX_NATIVE_READY__` before extension activation.

## settings

The current Settings shell comes from `settings-page-XXqkI3qv.js`.
Contributed panes and controls use only the current app's native page, group,
row, toggle, select, dropdown, button, icon, and loading components.

The JSX boundary captures native categories, pane rows, groups, semantic row
messages, localized React content, and native controls. Category, group, and
item transformers compose in extension order. Private weak maps keep
extension handlers, native controls, ownership, and native React content out
of public descriptors. Unchanged app content renders through its original
localized React elements. Changed values render from the new public strings.
Disposal restores the exact native content.

Each native Settings page owns a sealed group-capture registry. A full commit
replaces the group model in source order. Child-only updates request a new full
capture. Custom panes use Appearance as the native content host and replace
its native page props with the contributed title and groups. Search indexes
effective category, pane, group, item, package-title, and package-description
text. A result uses the same native selection callback as the sidebar.

The Settings opener uses the initialized `Ajt` message bus directly and routes
to `/settings/general-settings`. It is available before ChatGPT mounts the lazy
Profile subtree. This keeps the direct Settings API available in API-key mode.

## authentication

The exact helper in `chatgpt-desktop-auth-url-c5rz_oF2.js` has the contract
`o({ scope, signal })`. The stock `login-route-Bxq_cp6n.js` obtains `scope`
with `uVt(hFt)` before it calls that helper. The binding uses the same pair in
the Profile boundary. `startSignIn` rejects if the scope is not ready. It
passes that exact object to `o`, decorates the returned URL through `t`, and
uses `zut` for the external-browser dispatch.

Identity inspection uses the access token's ChatGPT account ID and auth user
ID as one opaque storage identity. This keeps two account memberships for the
same user distinct and keeps one membership stable across token refreshes.

Successful sign-in removes the exact `_jt("account-info")` query and updates
the auth nonce under native providers. Credential replacement atomically
updates `auth.json` under the resolved Codex home, dispatches
`codex-app-server-restart` for host `local`, waits for
`codex-app-server-initialized`, and then applies the query and nonce refresh.
Public listeners keep registration order and error isolation.

## appearance

Header registrations compose independently per property. The current header
title uses `--color-text`. The right-panel tab toolbar and its overflow fades
use `--color-surface`. Current menu separators use `bg-border`. The
`electron-light` and `electron-dark` root classes select registered values.

The controlled native color picker mounts through `VFt().createRoot` below
the semantic header. Requests serialize. Previews normalize to six-digit
colors. Outside click or Enter confirms; Escape cancels.

## Validation commands and results

Extraction and exact-build pinning:

```bash
.agents/skills/manage-platform-api/scripts/extract-app.sh \
  --app "$CHATGPT_APP_PATH" \
  --expect-version 26.818.21641
shasum -a 256 "$CHATGPT_APP_PATH/Contents/Resources/app.asar"
```

The exact stock app reported version `26.818.21641`, build `6849`, Electron
`151.0.7922.170`, and the pinned SHA-256 above. The exact asset paths and all
mapped exports were checked in the extracted build. Test-first stale-path
checks failed for every prior content hash before the new paths were mapped.
`node --check` passes for `host.js` and `ui-test.mjs`. The pinned-manifest
validator passes.

The complete deterministic API-key command is:

```bash
CHATGPT_APP_PATH="$CHATGPT_APP_PATH" \
  scripts/run-local-ci.sh /path/to/api-key-auth.json
```

The original `1.0.0` binding passed `25/25` applicable public checks,
`35/35` native composition checks, and `35` extension and utility unit checks
under Bun `1.3.14`. The `1.0.1` identity correction passed the focused
Multiple Accounts suite `15/15` and the authenticated public API suite
`45/45`, with matching persisted renderer results. The Release launcher built
and signed successfully and contained no bundled platform components.

A separate focused authenticated probe used an isolated component store, a
copied authentication file, a separate copied Electron profile, and the exact
installed stock app. It registered a probe through the public extension API
inside the live renderer. The result was:

- `authenticationScopeReady()`: `true` before the call.
- Public `authentication.startSignIn()`: resolved.
- Exact native sign-in helper start count: `0` before and `1` after.
- `nativeSignInUsedApplicationScope()`: `true`.
- External-browser dispatch: returned without error.

The probe did not read, print, or complete the sign-in URL. The app process was
stopped immediately after the result. `startSignIn()` can resolve only after
the binding's `openInBrowser` dispatch returns success, so the resolved result
also proves that the external-browser path was reached.

## Failures found during derivation

- The prior content-hashed paths did not exist. Exact stale-path checks failed
  before the current assets were selected.
- Some prior short exports still existed but had different meanings. In
  particular, the old scope aliases now identify browser-use routes. The stock
  login-route consumer led to `uVt(hFt)`.
- The original account identity ignored `chatgpt_account_id`, so two account
  memberships for one user could overwrite one saved authentication file.
  The opaque account-and-user pair removes that collision.
- The thread overflow topology changed from a direct Radix root or special
  native-context wrapper to the shared `v1` generic adapter. A direct wrapper
  expansion did not retain semantic IDs because `v1` converts messages to
  native-label strings. Raw descriptor capture fixed the public model while
  the real `v1` element kept exact native behavior.
- Manual FormatJS placeholder replacement left
  `Remove from {projectName}` in a live row. The stock `kFt` formatter fixed
  the message-values contract.
- One copied native test required old `hover:` and `focus:` class tokens. This
  build uses `data-[highlighted]:` and `focus-visible:`. The exact-build check
  now requires byte-equal class presentation with the stock native flyout.

## Failure signatures

- Native installation failure: a hashed path, initializer, or export changed.
- Empty Profile model: Profile semantic props, Item fibers, or FormatJS IDs
  changed.
- Empty or reordered thread model: the generic menu export, raw message
  descriptors, action IDs, or source-position reinsertion changed.
- Bound thread trigger with no menu: the `v1` contract, real-element hook
  ownership, initial item seed, or click trigger changed.
- A stock shortcut remains after a public change: the effective raw-ID
  shortcut map was not refreshed.
- Native Settings loading crash: the loading initializer or row changed.
- Settings cannot open before the Profile menu mounts: the bootstrap message
  bus opener was not installed.
- Authentication startup failure: the application scope was not captured, the
  wrong scope reached `o`, or the URL and browser bridges changed.
- Missing or unpainted header: the header locator, topology, surface tokens,
  or theme root classes changed.
- Picker mismatch: the header anchor, React DOM root, or picker export changed.
- Native readiness failure: preload bootstrap, imports, application-root
  discovery, or reconciliation changed.
