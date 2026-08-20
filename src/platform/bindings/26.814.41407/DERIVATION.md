# Derivation — bindings for 26.814.41407

Pinned build:

- App version: `26.814.41407`
- app.asar SHA-256: `8fba32f8baa6d984b0f0f4149d3da46221e3adb3b52836f85fe65e31e655a8c0`
- Electron: `151.0.7922.137`
- Sparkle enclosure: `https://persistent.oaistatic.com/codex-app-prod/ChatGPT-darwin-arm64-26.814.41407.zip`
- Version-watcher reference: issue `#34`
- Binding date: `2026-08-20`
- Binding version: `1.1.3`
- ChatGPT API version: `1.1.1`

Research used an extracted copy of this exact stock application. Static
candidates were checked through current ESM import edges and semantic anchors.
Live imports and behavior were checked in an isolated authenticated profile.
The stock app bundle and installed user state were not changed.

## Correction scope

The first binding for this app build used ChatGPT API `1.0.4`. Binding `1.1.3`
promotes the exact build to the current API `1.1.1`, including the native
Settings integration. It also corrects the current ChatGPT sign-in contract.
The current sign-in helper requires the application scope object. Calling the
helper with only an abort signal does not start sign-in.

The implementation starts from the completed `26.803.61601` API `1.1.1`
binding. All content-hashed assets, initializers, public exports, stock callers,
CSS tokens, and build-specific wrappers were derived again from
`26.814.41407`. No export was accepted only because its short name matched a
prior build.

This build also enables ChatGPT's native-context-menu adapter for local thread
overflow buttons. The adapter owns the app-created button, conversation ID,
and native-menu model. It forces the nested Radix root closed. The binding
recognizes this exact wrapper, passes its app-owned button to the existing
Radix root, adds the thread identity to that button, and removes only the
adapter's forced `open` value. ChatGPT continues to own Item, Separator,
flyout, portal, focus, and keyboard behavior.

## Verified module map

The shared implementations are in `app-initial-BCLYDefw.js`. Every asset below
exists in the extracted exact build.

| Capability | Current asset | Verified exports |
| --- | --- | --- |
| React, JSX, and React DOM | `app-initial-BCLYDefw.js` | `qzt()` supplies React; `Rzt()` supplies mutable `jsx` and `jsxs`; `mNt()` supplies `createRoot` |
| Native menus | `app-initial-BCLYDefw.js` | initializer `Q$`; namespace `Y$`; `Y$.Item`, `Y$.Separator`, `Y$.SubmenuItem`, and `Y$.FlyoutSubmenuItem`; `q$` dropdown root |
| Native icons | `app-initial-BCLYDefw.js` | initializer `f1` and component `d1` for the menu chevron; initializer `Qp` and component `Zp` for Profile; initializer `u4` and component `l4` for Settings |
| Native color picker | `app-initial-BCLYDefw.js` | initializer `Qs`; controlled picker `Zs` |
| Settings shell and search | `settings-page-BZsvuxcO.js` | semantic category headings, sidebar rows, search input and results, pane selection, and the Suspense boundary |
| Settings section icons | `use-visible-settings-sections-BCdwUwp0.js` | initializer `i`; section-icon map `r` |
| Native Settings page | `app-initial-BCLYDefw.js` | initializer `oa`; component `ia` |
| Native Settings group and rows | `app-initial-BCLYDefw.js` | initializer `Dn` and group `En`; initializer `NO` and rows `MO`; initializer `zO` and row `RO` |
| Native Settings controls | `app-initial-BCLYDefw.js` | initializer `fU` and toggle `dU`; initializer `$i`, section title `Qi`, and select trigger `Xi`; initializer `PP` and button `NP` |
| Native Settings loading row | `app-initial-BCLYDefw.js` | initializer `ra`; component `na` |
| Application scope | `app-initial-BCLYDefw.js` | initializer `UMt` and scope token `HMt`; initializer `MRt` and scope hook `NRt` |
| Authentication context | `app-initial-BCLYDefw.js` | initializer `k7` and auth-nonce hook `M7`; initializer `I7` and app-server registry hook `z7` |
| Query and message contracts | `app-initial-BCLYDefw.js` | initializer `Izt` and query-client hook `Lzt`; initializer `QOt` and account-info query-key builder `YOt`; initializer `skt` and message bus `ckt` |
| Browser and navigation bridges | `app-initial-BCLYDefw.js` | initializer `xct` and open-in-browser dispatch `wct`; initializer `bTt` and React Router navigation hook `wTt` |
| Plus icon | `plus-BgCJgEEs-Cwz0arvh.js` | initializer `t`; component `n` |
| Palette icon | `palette-lzFbWMQk-6nSl4cby.js` | initializer `n`; component `t` |
| Persisted-thread overflow | `thread-overflow-menu-L1wJl1eV.js` | initializer `n`; component `t` |
| ChatGPT sign-in | `chatgpt-desktop-auth-url-BOw-tdIM.js` | initializer `r`; `o` starts `login-with-chatgpt`; `t` decorates the URL |

`Ji` is not the loading-row component. It is the full fallback Settings page
`Wzl` and requires a `section` prop. The API host needs the loading row `na`
(`Nzl`) with initializer `ra` (`Izl`). A live import check and the stock
Settings page caller confirmed this distinction.

Additional semantic anchors:

- `codex.profileDropdown.*` locates the current profile implementation. The
  Profile row supplies `Zp` as its exact `LeftIcon`.
- `threadHeader.*`, `toggle-thread-pin`, `copy-session-id`, and
  `copy-deeplink` identify current local and remote thread actions.
- `thread-overflow-native-menu-CjcXXzS4.js` and its `showContextMenu` call edge
  identify the local native-context-menu adapter.
- `data-app-action-sidebar-thread-row`, scoped thread attributes, and
  `data-thread-title-trigger` identify persisted sidebar rows.
- `settings.nav.heading.personal`, `.integrations`, `.coding`, and `.archived`
  locate the four native Settings groups. Native pane buttons keep
  `data-settings-panel-slug`.
- `codex.projectAppearance.color.option.aria_label` and
  `codex.remoteHostColorPicker.*` locate app-owned color precedents.
- `login-route-BLm_FH9L.js` imports `NRt` as the scope hook and `HMt` as the
  application-scope token. Its stock call is `o({ scope, signal })`.
- `codex-app-server-restart`, `codex-app-server-initialized`, and
  `open-in-browser` verify the authentication message contracts.
- The application header remains
  `header[data-pip-obstacle="app-shell-header"]`.
- `app-initial-C_ulg7a-.css` contains the current surface, border, hover,
  focus, and Electron cursor tokens.

## menus.profile

The binding wraps the current shared JSX runtime. It identifies the profile
root through semantic props and FormatJS messages, captures native Item
fibers, and renders transformed descriptors inside the original Radix root.
Stateful native submenu owners and their children remain intact. Extension
submenus use the app's Item and SubmenuItem components.

Transformers compose in registration order. They enforce extension namespaces
and unique IDs, preserve moved built-ins, and isolate failures. The Profile
person component remains the exact `LeftIcon` of
`codex.profileDropdown.profile`.

The same profile boundary is under the providers that own the application
scope. It calls `NRt(HMt)` and stores the non-null live scope for the public
authentication API.

## menus.thread, threads, and threads.list

The local overflow component receives `conversationId`, `title`, and optional
`cwd`. Remote menus expose the same identity through their action tree. Both
use one boundary. Remote titles come from the matching native sidebar row.

For local threads, the binding unwraps the current native-context-menu adapter
as described above. The app's original button triggers the app's original
Radix root. Native leaves use `Y$.Item`; flyouts use
`Y$.FlyoutSubmenuItem`; separators use the current `bg-border` surface.
Dynamic project items are captured and reinserted at their source position.
Native rows keep their original trees, focus behavior, and handlers. Current
rows use `hover:bg-primary-ghost-hover` and
`focus-visible:bg-primary-ghost-hover`.

## Renderer bootstrap

The main-world JSX hook is installed from ChatGPTX's external session preload
before page scripts. Native imports can complete before or after the first
React render. The binding waits for the committed application root, reconciles
it through the native React DOM renderer, and resolves
`__CGPTX_NATIVE_READY__` before extension activation.

## settings

Binding `1.1.3` adds ChatGPT API `1.1.1` Settings support to this exact build.
`settings-page-BZsvuxcO.js` supplies the native Settings shell, search, and
selection contracts. Contributed panes and controls use only the current
app's native page, group, row, toggle, select, dropdown, button, icon, and
loading components.

The JSX boundary captures native categories, pane rows, groups, semantic row
messages, localized React content, and native controls. Category, group, and
item transformers compose in extension order. Normalization preserves native
descriptors, enforces extension namespaces and unique IDs, isolates failures,
and refreshes an open Settings window after invalidation or disposal.

Private weak maps keep extension handlers, native controls, ownership, and
native React content out of public descriptors. Unchanged app content renders
through its original localized React elements. Changed values render from the
new public strings. Disposal restores the exact native content. An extension
can render its own control on a ChatGPT-owned row, but it cannot use another
extension's control. Native controls render only with their original app
authority. Select values stay exact strings, including the empty string for a
native Default or None option.

The binding uses a private non-string sentinel for ChatGPT ownership. A real
extension with ID `app` stays separate from that sentinel. Foreign omitted
descriptors are restored, cross-owner changes are rejected, and a pane-wide
item-ID pass leaves one deterministic target for `settings.open()`.

Each native Settings page owns a sealed group-capture registry. A full commit
replaces the group model in source order. Child-only updates request a new full
capture, so they cannot remove sibling groups. A commit must match the active
native pane and cannot come from the loading page or a stale navigation.
Custom panes use Appearance as the native content host and replace its native
page props with the contributed title and groups. Search indexes effective
category, pane, group, item, package-title, and package-description text. A
result uses the same native selection callback as the sidebar.

The Settings opener uses the initialized native message bus directly. It is
available before ChatGPT mounts the lazy profile-menu subtree. This is required
in API-key mode, where the profile boundary can remain unmounted while the
direct Settings button and public Settings API are available.

## authentication

The exact helper in `chatgpt-desktop-auth-url-BOw-tdIM.js` has the contract
`o({ scope, signal })`. The stock `login-route-BLm_FH9L.js` obtains `scope`
with `NRt(HMt)` before it calls that helper. The binding now does the same in
the profile boundary. `startSignIn` rejects if the scope is not ready. It
passes that exact object to `o`, decorates the returned URL through `t`, and
uses `wct` for the external-browser dispatch.

The binding-native regression checks two facts after the stable suite invokes
the public API: the profile boundary captured a non-null application scope,
and the object passed to the exact sign-in helper is the same object. The
Multiple Accounts unit test separately verifies that its Add account action
saves current credentials and then calls this public `startSignIn` path.

Successful sign-in removes the exact `YOt("account-info")` query and updates
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

The controlled native color picker mounts through `mNt().createRoot` below
the semantic header. Requests serialize. Previews normalize to six-digit
colors. Outside click or Enter confirms; Escape cancels.

## Validation commands and results

Extraction and exact-build pinning:

```bash
.agents/skills/manage-platform-api/scripts/extract-app.sh \
  --app "$CHATGPT_APP_PATH" \
  --expect-version 26.814.41407
shasum -a 256 "$CHATGPT_APP_PATH/Contents/Resources/app.asar"
```

The exact stock app reported version `26.814.41407`, Electron
`151.0.7922.137`, and the pinned SHA-256 above. The exact asset paths and all
mapped exports were checked in the extracted build. `node --check` passes for
`host.js` and `ui-test.mjs`. The pinned-manifest validator passes.

A focused authenticated test used an isolated component store, a copied
authentication file, a separate Electron profile, and the exact installed
stock app. It loaded the corrected source binding without changing the app
bundle. Results:

- Host version: `26.814.41407`.
- Native ready: `true`.
- Native binding error: empty.
- `authenticationScopeReady()`: `true` before and after sign-in.
- Public `authentication.startSignIn()`: resolved.
- Exact native sign-in helper start count: `1`.
- External-browser dispatch: returned without error.
- `nativeSignInUsedApplicationScope()`: `true`.

A focused API-key run then verified the pre-profile Settings path. The main
renderer completed all `25/25` applicable public checks with no failures,
including all four Settings checks. The test driver now waits for completed
semantic results as well as the visual-fixture signal, so a public failure is
reported directly instead of as a later fixture-readiness timeout.

The Settings checks finish on the native Settings route, where the main app
sidebar is not mounted. The binding test driver validates those semantic
results before it changes routes. A public-only run exits at that point. The
native-UI run finds the current `role="link"` Back control through its
`settings.nav.back` React message descriptor, activates it, waits for the exact
seeded thread row to return, and only then restores the selected thread. It
does not depend on localized Back text or CDP target order. A missing row now
reports the Settings Back state and every available scoped thread row.

The complete deterministic API-key command is:

```bash
CHATGPT_APP_PATH="$CHATGPT_APP_PATH" \
  scripts/run-local-ci.sh /path/to/api-key-auth.json
```

The exact stock build passed `25/25` public checks and persisted the same main
renderer result, passed `35/35` native composition checks, and passed `35`
extension and utility unit checks under Bun `1.3.14`. The Release launcher was
signed and contained no bundled platform components. The focused authenticated
sign-in result above is independent of this API-key matrix.

## Failure signatures

- Native installation failure: a hashed path, initializer, or export changed.
- Empty profile model: profile semantic props, Item fibers, or FormatJS IDs
  changed.
- Visible profile chevron without expansion: the SubmenuItem owner boundary
  or trigger and children contract changed.
- Bound thread trigger with no DOM menu: the native-context-menu adapter,
  forced `open` state, or Radix trigger contract changed.
- Empty or reordered thread model: overflow exports, remote action anchors,
  menu root, or source-position reinsertion changed.
- Native Settings loading crash: `na` and `ra` were confused with the full
  fallback page `Ji` and `Yi`.
- Native Settings text rendered as a string: private app-content retention
  failed.
- Settings cannot open before the profile menu mounts: the bootstrap message
  bus opener was not installed.
- A removed or reordered Settings group stays visible: the committed group
  snapshot was not replaced.
- Authentication startup failure: the application scope was not captured, the
  wrong scope reached `o`, or the URL and browser bridges changed.
- Missing or unpainted header: the header locator, topology, surface tokens,
  or theme root classes changed.
- Picker mismatch: the header anchor, React DOM root, or picker export changed.
- Native readiness failure: preload bootstrap, imports, application-root
  discovery, or reconciliation changed.
