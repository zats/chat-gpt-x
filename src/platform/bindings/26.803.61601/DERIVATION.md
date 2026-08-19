# Derivation — bindings for 26.803.61601

Pinned build:

- App version: `26.803.61601`
- app.asar SHA-256: `928129601e8b36eccba603114d6912352f2b13182f3a7d60b32166d0e81aafb5`
- Electron: `151.0.7922.76`
- Sparkle enclosure: `https://persistent.oaistatic.com/codex-app-prod/ChatGPT-darwin-arm64-26.803.61601.zip`
- Version-watcher reference: issue `#24`
- Binding date: `2026-08-10`

Research used an extracted copy of this exact stock build. Static candidates
were confirmed by live imports and behavior in an isolated API-key profile.
API-key authentication used the harness-defined reduced path, so
profile-dependent stock affordances and account switching were unavailable and
are not claimed. The stock app bundle and installed user state were never
modified.

## Verified module map

The shared implementations are consolidated in
`app-initial-BYOVlUBL.js`. Every path below exists in the extracted build.
FormatJS and protocol anchors identified the candidates, current ESM import
edges verified their ownership, and the packaged public and native suites
verified their behavior and prop contracts through the injected bridge.

| Capability | Current asset | Verified exports |
| --- | --- | --- |
| React, JSX, and React DOM | `app-initial-BYOVlUBL.js` | `Skt()` is React 19.2.7; `hkt()` supplies mutable `jsx` and `jsxs`; `OCt()` supplies `createRoot` |
| Native menus | `app-initial-BYOVlUBL.js` | initializer `XU`; namespace `qU`; `qU.Item`, `qU.Separator`, `qU.SubmenuItem`, and `qU.FlyoutSubmenuItem`; `GU` dropdown root |
| Native icons | `app-initial-BYOVlUBL.js` | initializer `Aht` and component `kht` for the menu chevron; initializer `Nm` and component `Mm` for the Profile person icon; initializer `cG` and component `sG` for the Settings gear icon |
| Native color picker | `app-initial-BYOVlUBL.js` | initializer `yc`; controlled picker `vc` |
| Settings page and search | `settings-page-o5HqiPJn.js` | semantic category headings, sidebar rows, search input/results, and native pane-selection callbacks |
| Settings section icons | `use-visible-settings-sections-999uVf40.js` | initialized section-icon map through public export `r` |
| Native settings components | `app-initial-BYOVlUBL.js` | initializers `Ka`, `_r`, `UO`, `YO`, `$S`, `za`, and `Fbt`; `Wa` page; `gr` group with `Header`, `Content`, and `Footer`; `HO` row list; `JO` row; `QS` toggle; `Ia` select trigger; `GU` dropdown; `qU.Item`; `Mbt` button |
| Authentication context | `app-initial-BYOVlUBL.js` | initializer `I0` and auth-nonce hook `z0`; initializer `U0` and app-server registry hook `q0` |
| Query and message contracts | `app-initial-BYOVlUBL.js` | initializer `pkt` and query-client hook `mkt`; initializer `dxt` and account-info query-key builder `cxt`; initializer `_xt` and message bus `vxt` |
| Browser and navigation bridges | `app-initial-BYOVlUBL.js` | initializer `ndt` and direct open-in-browser dispatch `adt`; initializer `eut` and React Router navigation hook `iut` |
| Plus icon | `plus-BgCJgEEs-7s9H-MS-.js` | initializer `t`; component `n` |
| Palette icon | `palette-lzFbWMQk-B4SU6uJL.js` | initializer `n`; component `t` |
| Persisted-thread overflow | `thread-overflow-menu-B-VGw6kp.js` | initializer `n`; component `t` |
| ChatGPT sign-in | `chatgpt-desktop-auth-url-CzuzXpan.js` | initializer `r`; `o` starts `login-with-chatgpt`; `t` decorates the URL |

The new build retained the prior semantic export aliases but changed every
referenced hashed module path. Matching aliases were not accepted by name
alone: their current definitions, callers, and live behavior were rechecked.

Additional semantic anchors:

- `codex.profileDropdown.*`, `codex.profileFooter.*`, and
  `composer.mode.rateLimit.heading` locate the current profile implementation.
  The native namespace is still `CH`, its Item is `_H`, and the Profile row
  supplies `Q4` through public export `Mm`.
- `threadHeader.*`, `sidebarElectron.*`, and `sidebar.threadProject.*` identify
  native thread actions. Remote actions retain the co-located
  `toggle-thread-pin`, `copy-session-id`, and `copy-deeplink` anchors.
- `data-app-action-sidebar-thread-row`, scoped thread attributes, and
  `data-thread-title-trigger` identify persisted sidebar rows.
- `codex.projectAppearance.color.option.aria_label` and
  `codex.remoteHostColorPicker.*` locate the app-owned color-circle and picker
  precedents.
- `login-route-CMdMLFHN.js` imports and uses `z0`, `mkt`,
  `cxt("account-info")`, `adt`, and `iut` around the stock sign-in flow.
- `codex-app-server-restart`, `codex-app-server-initialized`, and
  `open-in-browser` verify the authentication message contracts.
- The current application header is the `pJr` implementation rendered as
  `header[data-pip-obstacle="app-shell-header"]`. Its five-region topology and
  styles in `app-initial-AYgnwUwc.css` remain compatible with the appearance
  API.
- `app-DuLjgNkx.css` still sets `--cursor-interaction: default` in Electron.
- `settings.nav.heading.personal`, `.integrations`, `.coding`, and `.archived`
  locate the four native Settings navigation groups. Native pane buttons keep
  the `data-settings-panel-slug` contract.

## menus.profile

The binding wraps the shared JSX runtime, identifies the profile root by
semantic props and FormatJS messages, captures native Item fibers, and renders
transformed descriptors inside the original Radix root. Stateful native
submenu owners and their children remain intact. Extension submenus reuse the
app's own Item and SubmenuItem implementations.

The profile root continues to supply current identity and avatar data.
Transformers compose in registration order, recursively enforce extension
namespaces and unique ids, preserve moved built-ins, and isolate failures. The
Profile person component remains the exact `LeftIcon` of
`codex.profileDropdown.profile`; the native visual assertion stays fail-closed
for that artwork. API-key mode intentionally skipped the live profile menu and
post-authentication checks.

## menus.thread, threads, and threads.list

The local overflow component continues to receive `conversationId`, `title`,
and optional `cwd`. Remote menus expose the same identity through their action
tree. Both are wrapped by one boundary, and remote titles come from the
matching native sidebar row.

Native leaf rows use `qU.Item`; native flyouts use
`qU.FlyoutSubmenuItem` with the app's trigger and portal behavior. Dynamic
`sidebar.threadProject.*` items remain captured and reinserted at their source
position so the public model and rendered order agree.

The API-key stock path exposed the local persisted-thread row and its current
context-dependent actions. The native suite exercised navigation and
restoration, effective action ordering, the Palette flyout, keyboard
interaction, sidebar leading-view composition, and removal of the selected
thread color. Native rows retain their original trees, focus behavior, and
handlers.

## Renderer bootstrap

The main-world JSX hook is installed from ChatGPTX's external session preload
before page scripts run. Native imports may complete on either side of the
first React render, so the binding waits for the committed application root,
reconciles it once through the native React DOM renderer, and resolves
`__CGPTX_NATIVE_READY__` before extension activation.

## settings

Binding `1.1.1` adds ChatGPT API `1.1.1` Settings support to this existing app
build. `settings-page-o5HqiPJn.js` retains the native Settings shell and
selection contracts from the prior build. The current shared module retains
the verified Settings page, group, row, toggle, select, dropdown, button, and
gear-icon exports. The current visibility module retains the initialized
section-icon map through export `r`.

The JSX boundary captures native categories, pane rows, groups, and semantic
row messages. Category, group, and item transformers compose in extension
load and registration order. Normalization preserves native descriptors,
enforces extension namespaces and unique IDs, isolates failures, and refreshes
an open Settings window after invalidation or disposal. Contributed panes and
items use only the current app's native Settings components. Binding-owned
weak maps keep extension handlers, native controls, and native React content
out of public descriptors. An unchanged app category heading renders its
captured localized React title; a changed category label renders its
transformed public string, and disposal restores the exact native title. An
unchanged app row renders its original localized label and description
elements. A changed row renders its transformed public strings. Native group
headers and footers use the same rule: unchanged title, description, and
footer values retain their original React content, while transformed values
render as public strings. A private item-control owner records the extension
that assigned each effective control separately from the row owner. This lets
an extension render its own control on a ChatGPT-owned row. Passing or copying
the same descriptor preserves the current control owner, and assigning a
control created by another extension drops that control. Native controls
render only with their original app authority. Select values remain exact
strings, including the empty string used by native Default or None choices.
The native `gr.Header`
contract names its secondary-text prop `subtitle`; the binding maps the public
group `description` to that prop and preserves the original localized subtitle
element when the public value is unchanged. Non-string values and
malformed option records fail validation. The version-specific suite selects
the native
empty-value row and verifies that the callback receives the empty string. The
stable and version-specific suites transform one built-in category label and
verify its effective value, native rendering, and disposal restoration. They
also transform one built-in group and verify its effective and rendered title,
description, and footer. An explicit `undefined` removes a mutable optional
Settings field; disposing the transform restores the original public metadata
and the native content available in that fixture. The confirmed General and
Import panes contain no native group with a non-empty subtitle, so the live
suite verifies transformed subtitle rendering and removal, but not restoration
of a localized subtitle element. That preservation follows the same captured
value identity path as the live-verified title restoration.

Private weak maps assign every normalized category, pane, group, and item to
ChatGPT or to the extension that contributed it. Public `origin` values are
not ownership input. ChatGPT ownership uses a private non-string sentinel, so
an extension whose exact ID is `app` remains distinct even though its public
`origin` is also `"app"`. A later extension can pass or reorder a foreign
descriptor, but a copied override resolves to the trusted original object and
an omission reinserts it at its previous index. ChatGPT-owned descriptors stay
editable and removable. Group-transform output also routes inline items
through item normalization, so it cannot bypass item ownership. A foreign pane
can move only inside its existing category; a cross-category copy is dropped
before an omitted source category is restored. The
version-specific suite uses concurrent `foo` and `foo.bar` APIs to verify
copied, omitted, cross-category moved, and distinct owned categories, panes,
groups, and items without duplicate pane IDs. It also assigns an extension
button to a ChatGPT-owned row, passes a copied descriptor through a later
extension with a forged public origin, and verifies that the button still
invokes only the assigning extension. A separate exact-ID `app` fixture proves
that another extension cannot change its descriptors or replace its rendered
native button. Each item transformer receives a newly frozen context whose
`group.items` is the same current array supplied as its first argument.
After every transformer runs, the binding applies one pane-wide item-ID pass
in final group and item order. The first identified row keeps its ID. A later
extension row with that ID is dropped, while a later ChatGPT row stays visible
without the ambiguous ID. This keeps `settings.open(paneId, { itemId })` and
the rendered DOM target deterministic. The stable suite changes group order,
removal, and pane to verify the winner and per-pane scope. The native suite
verifies one public row and one rendered DOM target for an extension collision.
It also places an extension row before a ChatGPT row with the same ID and
verifies that the native row remains visible and becomes unidentified.

Native search keeps the `searchQuery`, `onQueryChange`, `searchResults`, and
`onSelect` contracts. The binding adds one result for each matching effective
pane and indexes category, pane, group, item, package-title, and package-
description text. Selection clears the native query and uses the same native
pane-selection callback as the sidebar.

Each mounted native Settings page owns a sealed group-capture registry. A
complete post-commit capture replaces the group model in source order. A
child-only update or unmount requests a new complete capture, so it cannot drop
sibling groups or keep removed groups. A page commit uses the exact native
section-title slug, or the exact Profile back-slot message, and must match the
raw active native row. The binding rejects the native loading page and a stale
page commit during navigation. Pages without a native group anchor retain
their original content and render contributed groups in a separate stable
slot. Custom pane selection remains local Settings state. The binding selects
the native Appearance pane as the content host, then replaces its native `Wa`
page props with the contributed title and group tree. Search and sidebar
descriptors use the private ChatGPT owner sentinel plus a captured navigation
row. ID-only host routing uses the captured navigation-row set directly. An
extension-owned ID such as `codex.settings.custom` remains a custom pane.
Each generated Settings row carries a private class for its effective pane.
The stock Settings row forwards `className` and `id`, but it drops unknown
properties. `open()` waits for the initial Settings snapshot and the requested
pane commit. It then finds the requested row by its exact ID and private pane
class and scrolls it into view. Custom panes that share
an active Appearance host switch without a redundant native navigation. When
Settings is closed, the binding uses the main-process `navigate-to-route`
message to open General before it selects the requested pane.

## authentication

`startSignIn` uses the native `login-with-chatgpt` URL construction and direct
`adt` open-in-browser dispatch. Successful sign-in retains the stock sequence:
remove the exact `account-info` query and update the auth nonce under native
providers.

Credential replacement atomically updates `auth.json` under the resolved
Codex home, dispatches `codex-app-server-restart` for host `local`, waits for
`codex-app-server-initialized`, and then applies the query and nonce refresh.
Public listeners preserve registration order and error isolation. These
profile-dependent interactions were statically re-derived but not claimed by
the API-key live run.

## appearance

Header registrations compose independently per property. The version-pinned
selector paints the five semantic header regions, title, right-panel toolbar,
and remote action surfaces. Content-panel controls remain app-owned, and the
`electron-light` and `electron-dark` root classes select registered values.

The controlled native color picker mounts through the app's React DOM renderer
below the semantic header. Requests serialize, previews normalize to six-digit
colors, outside click or Enter confirms, and Escape cancels. The API-key native
suite verified header painting, theme switching, the native picker, and cursor
parity with a current built-in Item.

## Validation commands and results

Extraction and exact-build pinning:

```bash
.agents/skills/manage-platform-api/scripts/extract-app.sh \
  --app "$CHATGPT_APP_PATH" \
  --expect-version 26.803.61601
shasum -a 256 "$CHATGPT_APP_PATH/Contents/Resources/app.asar"
```

The exact stock app reported version `26.803.61601`, Electron
`151.0.7922.76`, and the pinned SHA-256 above. The hash was rechecked after the
live run.

The current completion command passed isolated primary and alternate ChatGPT
authentication files directly to the harness:

```bash
CHATGPT_APP_PATH="$CHATGPT_APP_PATH" \
  scripts/run-local-ci.sh "$PRIMARY_AUTH" "$ALTERNATE_AUTH"
```

Results:

- Launcher unit tests: `67/67`.
- Extension and shared-utility unit tests: `35/35`.
- Stable public API assertions: `44/44`.
- Current native UI assertions: `96/96`.
- The Multiple Accounts extension switched to another account and restored the
  original account.
- Shipped-extension composition with the API suite enabled: passed.
- Release build and strict signature verification: passed.
- The packaged launcher contained no component seed, runtime, or binding.
- Packaged binding and bridge files matched source.

The deterministic native UI rerun used the isolated primary account without
the optional alternate-account adoption step. The separate Multiple Accounts
flow verified the account switch and restoration.

## Failure signatures

- Native installation failure: a current hashed path, initializer, or export
  changed.
- Empty profile model: profile semantic props, Item fibers, or FormatJS ids
  changed.
- Incorrect Profile artwork: the Profile row's `LeftIcon` initializer or
  exported component changed.
- Visible profile chevron without expansion: the SubmenuItem owner boundary or
  trigger/children contract changed.
- Empty or reordered thread model: the local overflow export, remote action
  anchors, menu root, thread message namespaces, or source-position
  reinsertion changed.
- Native UI navigation timeout: sidebar-row kind/id attributes or current
  thread synchronization changed.
- Missing thread-list marker: sidebar-row or title-trigger attributes changed.
- Native Settings text rendered as a string: the private app-row content map or
  unchanged-descriptor retention failed.
- A transformed Settings category keeps its native heading: the private
  category-title metadata was not propagated to the effective descriptor.
- A removed or reordered Settings group stays in place: the per-render group
  snapshot was not replaced.
- A deep link into an unvisited native pane returns false: `open()` tested its
  groups before native selection and content rendering completed.
- Authentication startup failure: sign-in initializer, URL decoration, browser
  dispatch, query key, message bus, or provider boundary changed.
- Missing or unpainted header: the `app-shell-header` locator, its five-region
  topology, remote surfaces, or theme root classes changed.
- Picker mismatch: the header anchor, React DOM root, or native picker export
  changed.
- Native readiness failure: preload bootstrap, current native imports,
  application-root discovery, or reconciliation changed.
