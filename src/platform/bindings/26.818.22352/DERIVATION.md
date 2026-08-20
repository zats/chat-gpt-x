# Derivation — bindings for 26.818.22352

Pinned build:

- App version: `26.818.22352`
- App build: `6872`
- app.asar SHA-256: `530f670f3859f2f82c3dd7e188537b369820b2ff1fe6a2207eec16abdb7d1d42`
- Electron: `151.0.7922.170`
- Sparkle enclosure: `https://persistent.oaistatic.com/codex-app-prod/ChatGPT-darwin-arm64-26.818.22352.zip`
- Enclosure length: `603601973` bytes
- Binding date: `2026-08-20`
- Binding version: `1.0.0`
- ChatGPT API version: `1.1.2`

Research used an extracted copy of this exact stock application. The Sparkle
appcast for build `6872` supplied the exact enclosure URL and length. The
installed application supplied the exact version, Electron version, and
app.asar hash. Static candidates were checked through current ESM import edges,
stock callers, and semantic anchors. Live validation is recorded only after it
runs against this exact build. The stock app bundle and installed user state
were not changed.

This binding starts from the `26.818.21641` API `1.1.2` implementation.
All content-hashed assets, initializers, public exports, and stock callers
used by the binding were derived again from `26.818.22352`. The shared CSS
asset remains unchanged.
No short export name was accepted without a current semantic check. This was
required because some unchanged short names have different meanings in this
build.

## Verified module map

The shared implementations are in `app-initial-2HRzhJVF.js`. Every asset and
export below exists in the extracted exact build and was checked through its
current import or caller.

| Capability | Current asset | Verified exports |
| --- | --- | --- |
| React, JSX, and React DOM | `app-initial-2HRzhJVF.js` | `zHt()` supplies React; `AHt()` supplies mutable `jsx` and `jsxs`; `nIt()` supplies `createRoot` |
| Native menus | `app-initial-2HRzhJVF.js` | initializer `t2`; namespace `Q0`; `Q0.Item`, `Q0.Separator`, `Q0.SubmenuItem`, and `Q0.FlyoutSubmenuItem`; `X0` dropdown root |
| Generic app menu | `app-initial-2HRzhJVF.js` | `F1` is the current generic menu adapter; `WFt` is the exact internationalization hook used by that adapter |
| Native icons | `app-initial-2HRzhJVF.js` | initializer `h2` and component `m2` for the menu chevron; initializer `em` and component `$p` for Profile; initializer `o6` and component `a6` for Settings |
| Native color picker | `app-initial-2HRzhJVF.js` | initializer `cc`; controlled picker `sc` |
| Settings shell and search | `settings-page-BxHpL4fN.js` | semantic category headings, sidebar rows, search input and results, pane selection, and the Suspense boundary |
| Settings section icons | `use-visible-settings-sections-Bh5p8z_9.js` | initializer `i`; section-icon map `r` |
| Native Settings page | `app-initial-2HRzhJVF.js` | initializer `aa`; component `ra` |
| Native Settings group and rows | `app-initial-2HRzhJVF.js` | initializer `Dn` and group `En`; initializer `DO` and rows `EO`; initializer `NO` and row `MO` |
| Native Settings controls | `app-initial-2HRzhJVF.js` | initializer `ZW` and toggle `XW`; initializer `Qi`, section title `Zi`, and select trigger `Yi`; initializer `UF` and button `HF` |
| Native Settings loading row | `app-initial-2HRzhJVF.js` | initializer `na`; component `ta` |
| Application scope | `app-initial-2HRzhJVF.js` | initializer `jFt` and scope token `AFt`; initializer `wVt` and scope hook `TVt` |
| Authentication context | `app-initial-2HRzhJVF.js` | initializer `Dot` and auth-nonce hook `Aot`; initializer `Pot` and app-server registry hook `Lot` |
| Query and message contracts | `app-initial-2HRzhJVF.js` | initializer `OHt` and query-client hook `kHt`; initializer `Fjt` and account-info query-key builder `Mjt`; initializer `Wjt` and message bus `Gjt` |
| Browser and navigation bridges | `app-initial-2HRzhJVF.js` | initializer `$ut` and open-in-browser dispatch `ndt`; initializer `eOt` and React Router navigation hook `iOt` |
| Plus icon | `plus-BgCJgEEs-CxYr_sef.js` | initializer `t`; component `n` |
| Palette icon | `palette-lzFbWMQk-9XeLyI_3.js` | initializer `n`; component `t` |
| Persisted-thread overflow | `thread-overflow-menu-Dd6K_rDC.js` | initializer `n`; component `t` |
| ChatGPT sign-in | `chatgpt-desktop-auth-url-P4mwHg2g.js` | initializer `r`; `o` starts `login-with-chatgpt`; `t` decorates the URL |

Additional semantic anchors:

- `codex.profileDropdown.*` locates the current profile implementation. The
  Profile row supplies `$p` as its exact `LeftIcon`.
- `threadHeader.*`, `toggle-thread-pin`, `copy-session-id`, and
  `copy-deeplink` identify current local and remote thread actions.
- `data-app-action-sidebar-thread-row`, scoped thread attributes, and
  `data-thread-title-trigger` identify persisted sidebar rows.
- `settings.nav.heading.personal`, `.integrations`, `.coding`, and `.archived`
  locate the four native Settings groups. Native pane buttons keep
  `data-settings-panel-slug`.
- `codex.projectAppearance.color.option.aria_label` and
  `codex.remoteHostColorPicker.*` locate app-owned color precedents.
- `login-route-BHg7lJXr.js` imports `TVt` as the scope hook and `AFt` as the
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
scope. It calls `TVt(AFt)` at a stable hook position and stores the non-null
live scope for the public authentication API.

## menus.thread, threads, and threads.list

The current `thread-overflow-menu-Dd6K_rDC.js` does not render `X0` directly.
It renders the shared `F1` generic menu with `disableNative: true`, a
synchronous `getItems`, `onBeforeOpen`, `renderItem`, shortcuts, and a click
trigger. There is no separate native-context-menu adapter asset in this build.

The binding captures the raw generic descriptors before `F1` converts their
FormatJS messages to native-label strings. It uses `message.id` as the stable
public ID and uses `WFt().formatMessage(message, messageValues)` for the exact
localized label. The raw action ID remains private.

The binding computes public transformations from this semantic model and then
passes effective raw descriptors to a real, keyed `F1` React element. This
keeps `F1` as the owner of its hooks and open state. Unchanged built-ins keep
their exact raw descriptors, icons, handlers, shortcuts, tooltips, and stock
`renderItem` behavior. Changed built-ins and new extension rows use the same
native `Q0` Item, Separator, and Flyout components. A scoped JSX marker adds
the stable public ID and the extension fields to the exact native nodes.

The initial item seed supplies built-ins before the first menu open. The
wrapped `getItems` refreshes both the semantic model and render map before it
returns data to `F1`. The effective shortcuts map uses raw action IDs, so a
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

The current Settings shell comes from `settings-page-BxHpL4fN.js`.
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

The Settings opener uses the initialized `Gjt` message bus directly and routes
to `/settings/general-settings`. It is available before ChatGPT mounts the lazy
Profile subtree. This keeps the direct Settings API available in API-key mode.

## authentication

The exact helper in `chatgpt-desktop-auth-url-P4mwHg2g.js` has the contract
`o({ scope, signal })`. The stock `login-route-BHg7lJXr.js` obtains `scope`
with `TVt(AFt)` before it calls that helper. The binding uses the same pair in
the Profile boundary. `startSignIn` rejects if the scope is not ready. It
passes that exact object to `o`, decorates the returned URL through `t`, and
uses `ndt` for the external-browser dispatch.

Identity inspection uses the access token's ChatGPT account ID and auth user
ID as one opaque storage identity. This keeps two account memberships for the
same user distinct and keeps one membership stable across token refreshes.

Successful sign-in removes the exact `Mjt("account-info")` query and updates
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

The controlled native color picker mounts through `nIt().createRoot` below
the semantic header. Requests serialize. Previews normalize to six-digit
colors. Outside click or Enter confirms; Escape cancels.

## Validation commands and results

Extraction and exact-build pinning:

```bash
.agents/skills/manage-platform-api/scripts/extract-app.sh \
  --app "$CHATGPT_APP_PATH" \
  --expect-version 26.818.22352
shasum -a 256 "$CHATGPT_APP_PATH/Contents/Resources/app.asar"
```

The exact stock app reported version `26.818.22352`, build `6872`, Electron
`151.0.7922.170`, and the pinned SHA-256 above. The exact asset paths and all
mapped exports were checked in the extracted build. The previous JavaScript
content hashes are absent from `host.js`; the shared CSS asset is unchanged.
`node --check` passes for `host.js` and `ui-test.mjs`.

The complete deterministic API-key command is:

```bash
CHATGPT_APP_PATH="$CHATGPT_APP_PATH" \
  scripts/run-local-ci.sh /path/to/api-key-auth.json
```

The exact stock build passed the canonical API-key validation with Bun
`1.3.14`: `36` extension and utility unit checks, `26/26` applicable public
API checks with matching persisted renderer results, and `35/35` native UI
and shipped-extension composition checks. The Release launcher built and
signed successfully and contained no bundled platform components.

## Failures found during derivation

- The previous JavaScript content-hashed paths do not exist in this build.
  The CSS path remains `app-initial-Bj2YneuG.css`.
- The public behavior and native component topology remain the same, but the
  shared exports moved. The binding uses only the current export map above.
- The stock login-route consumer identifies `TVt(AFt)` as the current
  application-scope hook call.

## Failure signatures

- Native installation failure: a hashed path, initializer, or export changed.
- Empty Profile model: Profile semantic props, Item fibers, or FormatJS IDs
  changed.
- Empty or reordered thread model: the generic menu export, raw message
  descriptors, action IDs, or source-position reinsertion changed.
- Bound thread trigger with no menu: the `F1` contract, real-element hook
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
