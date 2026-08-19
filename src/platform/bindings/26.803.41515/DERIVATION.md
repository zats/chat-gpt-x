# Derivation — bindings for 26.803.41515

Pinned build:

- App version: `26.803.41515`
- app.asar SHA-256: `5f6e773aafd542d3cf09e10b5dca6cabd301d0a155f4b8ce870e3915fc3da25e`
- Electron: `151.0.7922.76`
- Sparkle enclosure: `https://persistent.oaistatic.com/codex-app-prod/ChatGPT-darwin-arm64-26.803.41515.zip`
- Version-watcher reference: issue `#21`
- Binding date: `2026-08-08`

Research used an extracted copy of this exact stock build and live CDP
inspection of isolated stock profiles. API-key authentication covered the
reduced profile-independent path. ChatGPT account authentication covered the
complete profile menu, account switch, and native UI path. The stock app bundle
and installed user state were never modified.

## Verified module map

The shared implementations are consolidated in
`app-initial-Biw83Aiz.js`. Every path below exists in the extracted build.
Semantic source inspection identified each candidate, live stock-renderer
imports verified its export shape, and the packaged public and native suites
verified the behavior and prop contracts through the injected bridge.

| Capability | Current asset | Verified exports |
| --- | --- | --- |
| React, JSX, and React DOM | `app-initial-Biw83Aiz.js` | `Skt()` is React 19.2.7; `hkt()` supplies mutable `jsx` and `jsxs`; `OCt()` supplies `createRoot` |
| Native menus | `app-initial-Biw83Aiz.js` | initializer `XU`; namespace `qU`; `qU.Item`, `qU.Separator`, `qU.SubmenuItem`, and `qU.FlyoutSubmenuItem`; `GU` dropdown root |
| Native icons | `app-initial-Biw83Aiz.js` | initializer `Aht` and component `kht` for the menu chevron; initializer `Nm` and component `Mm` for the Profile person icon; initializer `cG` and component `sG` for the Settings gear icon |
| Native color picker | `app-initial-Biw83Aiz.js` | initializer `yc`; controlled picker `vc` |
| Settings page and search | `settings-page-mM-lHCsV.js` | semantic category headings, sidebar rows, search input/results, and native pane-selection callbacks |
| Settings section icons | `use-visible-settings-sections-1Vu4SC9J.js` | initialized section-icon map `r` |
| Native settings components | `app-initial-Biw83Aiz.js` | initializers `Ka`, `_r`, `UO`, `YO`, `$S`, `za`, and `Fbt`; `Wa` page; `gr` group with `Header`, `Content`, and `Footer`; `HO` row list; `JO` row; `QS` toggle; `Ia` select trigger; `GU` dropdown; `qU.Item`; `Mbt` button |
| Authentication context | `app-initial-Biw83Aiz.js` | initializer `I0` and auth-nonce hook `z0`; initializer `U0` and app-server registry hook `q0` |
| Query and message contracts | `app-initial-Biw83Aiz.js` | initializer `pkt` and query-client hook `mkt`; initializer `dxt` and account-info query-key builder `cxt`; initializer `_xt` and message bus `vxt` |
| Browser and navigation bridges | `app-initial-Biw83Aiz.js` | initializer `ndt` and direct open-in-browser dispatch `adt`; initializer `eut` and React Router navigation hook `iut` |
| Plus icon | `plus-BgCJgEEs-DsCPCZ1Z.js` | initializer `t`; component `n` |
| Palette icon | `palette-lzFbWMQk-kn_doBgm.js` | initializer `n`; component `t` |
| Persisted-thread overflow | `thread-overflow-menu-Co1P8oAT.js` | initializer `n`; component `t` |
| ChatGPT sign-in | `chatgpt-desktop-auth-url-C-A6pkYX.js` | initializer `r`; `o` starts `login-with-chatgpt`; `t` decorates the URL |

Additional semantic anchors:

- `codex.profileDropdown.*`, `codex.profileFooter.*`, and
  `composer.mode.rateLimit.heading` locate the native profile implementation.
- `threadHeader.*`, `sidebarElectron.*`, and the new
  `sidebar.threadProject.*` project actions identify current native thread
  actions. Remote menus remain identifiable by the co-located
  `toggle-thread-pin`, `copy-session-id`, and `copy-deeplink` actions.
- `data-app-action-sidebar-thread-row`, its scoped thread attributes, and
  `data-thread-title-trigger` identify persisted sidebar rows.
- `codex.projectAppearance.color.option.aria_label` and
  `codex.remoteHostColorPicker.*` locate the app-owned color-circle and picker
  precedents.
- The login route uses `z0`, `mkt`, `cxt("account-info")`, and `iut` after
  successful sign-in.
- `codex-app-server-restart`, `codex-app-server-initialized`, and
  `open-in-browser` verify the authentication message contracts. Live
  inspection confirmed that `vxt` exposes `subscribe`, `dispatchMessage`, and
  `dispatchHostMessage`.
- The current application header is the `sJr` implementation rendered as
  `header[data-pip-obstacle="app-shell-header"]`. Its styles are in
  `app-initial-AYgnwUwc.css`; the five-region topology remains compatible with
  the appearance API. `_FloatingHeader_1e9gb_1` belongs only to the floating
  left panel and is not the application header.
- `app-DuLjgNkx.css` sets `--cursor-interaction: default` for Electron windows.

## menus.profile

The binding wraps the app's shared JSX runtime, identifies the profile root by
semantic props and FormatJS messages, captures native Item fibers, and renders
transformed descriptors inside the original Radix root. Stateful native
submenu owners and their children remain intact, while extension submenus use
the app's own Item and SubmenuItem implementations.

The profile root continues to supply current identity and native avatar data.
Transformers compose in registration order, recursively enforce extension
namespaces and unique ids, preserve moved built-ins, and isolate failures. The
API-key run exercised the harness-defined reduced path; account-profile menu,
account switching, and ChatGPT-account authentication gates were intentionally
not claimed for this authentication mode.

The account identity action opens Profile through the settings pane navigator.
On a cold launch, the binding first opens the native General settings route and
waits for the settings model to mount. It then selects the native Profile row.
A direct Profile route sent before the settings model mounts is ignored by this
build.

Binding `1.0.1` corrects the native `"person"` icon mapping. The
`codex.profileDropdown.profile` row supplies `Mm` as its `LeftIcon`, initialized
by `Nm`. The adjacent `codex.profileDropdown.settingsPage` row proves that the
prior `sG` candidate is the Settings gear. The version-specific visual suite
renders the public `"person"` descriptor and verifies the stock Profile SVG
path, so a swapped or stale export fails closed.

## menus.thread, threads, and threads.list

The local overflow component continues to receive `conversationId`, `title`,
and optional `cwd`. Remote menus expose the same identity through their action
tree. Both are wrapped by one boundary, while remote titles come from the
matching native sidebar row.

Native leaf rows use `qU.Item`; native flyouts use
`qU.FlyoutSubmenuItem` with the app's trigger and portal behavior. The
thread-colors extension inserts its Palette flyout immediately before the
first native separator and retains native keyboard, hover, focus, and icon-slot
behavior.

This build can render `sidebar.threadProject.removeFromProject` through an
opaque top-level component. Its visible label is contextual, for example
`Remove from chat-gpt-x`. The prior binding preserved the source element but
did not include it in the effective public model because dynamic capture only
recognized `threadHeader.*` and `sidebarElectron.*`. The current binding also
recognizes `sidebar.threadProject.*`, captures the native handler and formatted
label, and reinserts the descriptor at the original source position. This
keeps `getItems()` order identical to the rendered menu while retaining the
native owner component.

Native local and remote sidebar rows retain their original trees and receive
extension views at `data-thread-title-trigger`. A mutation observer covers
rows rendered before and after injection. The absolute leading-view host grows
leftward without changing title geometry.

## Renderer bootstrap

Binding `1.0.1` installs the main-world JSX hook from ChatGPTX's external
session preload before page scripts run. The preload requests this exact
version-pinned host source from the injected main-process bridge and executes
it through Electron's privileged `webFrame` path. The stock bundle remains
unchanged.

Native imports may complete on either side of the first React render. The
binding waits for the committed application root and submits its current root
element once through the native React DOM renderer. Extension activation waits
for `__CGPTX_NATIVE_READY__`, including that reconciliation, before
registration.

## settings

`settings-page-mM-lHCsV.js` defines the complete native settings shell. The
four navigation groups use the semantic messages
`settings.nav.heading.personal`, `.integrations`, `.coding`, and `.archived`.
Their native rows expose `data-settings-panel-slug`, which maps to public pane
IDs in the `codex.settings.<slug>` namespace. The mechanical existing-pane
fixture uses `codex.settings.general-settings`, a core pane listed in the
Personal group for every supported account mode. The binding does not import
or depend on the optional Voice settings module.

The JSX boundary captures native categories, pane rows, groups, and semantic
row messages. Category, group, and item transformers compose in extension load
and registration order. Normalization preserves native descriptors, enforces
extension namespaces and unique IDs, stamps origins, isolates failures, and
re-renders an open settings window after invalidation or disposal. New panes
reuse `Wa`; new groups and rows reuse `gr`, `HO`, and `JO`. Each mounted `Wa`
owns a sealed group-capture registry. A complete post-commit capture replaces
the native group model in source order. A child-only update or unmount requests
a new complete capture, so it cannot drop sibling groups or keep removed
groups. Pages without a native group anchor retain their original content and
render contributed groups in a separate stable slot.

The public control factories render the stock `QS` controlled toggle, the
`GU`/`Ia`/`qU.Item` dropdown composition, and `Mbt`. Source inspection of the
stock General and Voice settings implementations confirmed the `QS`
`checked`/`onChange` contract. Binding-owned weak maps keep extension handlers,
native controls, and native React content out of public descriptors. An
unchanged app row renders its original localized label and description
elements. A changed row renders its transformed public strings. A control
renders only for its owning extension row, or for its original app row.
Select values remain exact strings, including the empty string used by native
Default or None choices. Non-string values and malformed option records fail
validation. Callback failures remain isolated.

Native search input props are `searchQuery` and `onQueryChange`; result props
are `searchResults`, `onSelect`, `intl`, and `listRef`. The binding adds one
section result per matching effective pane. It indexes category, pane, group,
and item labels, descriptions, and keywords. Selecting a result clears the
native query and invokes the same pane-selection path as a sidebar row.

Settings pane selection is local app state. It does not change
`window.location`. The binding stores the effective pane ID and invokes the
app's captured native sidebar callback. Custom panes use Appearance as their
native host selection. `SettingsContentBoundary` wraps each rendered `Wa`
page, subscribes to binding invalidation, and replaces the Appearance page
props with the custom title and native group tree. A pending native pane ID
prevents the previous active row from winning during the app's asynchronous
selection render. A page commit uses the exact native section-title slug, or
the exact Profile back-slot message, and must match the raw active native row.
The binding rejects the app's native loading page and an old-page commit during
navigation. `open()` waits for the initial Settings snapshot and the requested
pane commit before it tests a requested row, then scrolls that row into view.
Custom panes that share an active Appearance host switch without a redundant
native navigation. When Settings is closed, `open()` uses the main-process
`navigate-to-route` host message to open General, waits for the native model,
and then selects the requested pane. Entering or leaving a custom pane also
invalidates the native host page when Appearance is already selected.

The lazy `SettingsPage` route element is created before the mutable JSX hook
is installed, so wrapping that exported route does not intercept its render.
The `Wa` page element is created inside the route after installation and is
the stable content boundary for this build.

The stable API suite covers new panes and groups, insertion into General,
standard control descriptors, empty-string select values, malformed select
input rejection, transformer ordering and isolation, namespace enforcement,
invalidation, disposal, and deep-link failure behavior. The version-specific
UI suite covers native rendering, exact empty-string select callbacks,
General-pane insertion, exact native-group snapshot replacement, child-only
recapture, loading and stale-page rejection, deep links into an unvisited
native pane and the titleless Profile pane, sidebar navigation from Appearance,
all four search text levels, package title/description search for the Extensions
manager, and search-result navigation.

Failure signatures include missing category captures, a missing
`data-settings-panel-slug`, an empty `#settings-search` result for contributed
text, a custom pane that stays on the previous native content after selection,
a row whose native `id` does not match its public item ID, an unchanged app row
whose label is no longer a React element, or a control that does not use the
stock component exports above.

## authentication

`startSignIn` uses the native `login-with-chatgpt` URL construction and direct
`adt` open-in-browser dispatch. Successful sign-in follows the current stock
sequence: remove the exact `account-info` query and update the auth nonce under
the native providers.

Credential replacement atomically updates `auth.json` under the resolved
Codex home, dispatches `codex-app-server-restart` for host `local`, waits for
`codex-app-server-initialized`, then uses the same query and nonce refresh
sequence. Public listeners preserve registration order and error isolation.

## appearance

Header registrations compose independently per property. The version-pinned
selector paints the five regions of
`header[data-pip-obstacle="app-shell-header"]`, its title, the right-panel tab
toolbar, and remote action surfaces. Remote action backgrounds use a darker
mix of the registered background while text and borders derive from the
registered foreground. Content-panel controls remain app-owned. The app's
`electron-light` and `electron-dark` classes select registered values.

The controlled native color picker is mounted through the app's React DOM
renderer and positioned below the current semantic header. Requests serialize,
previews emit normalized six-digit colors, outside click or Enter confirms,
and Escape cancels. Stock and extension Items both compute `cursor: default`
under the current Electron CSS.

## Validation commands and results

Extraction and exact-build pinning:

```bash
.agents/skills/manage-platform-api/scripts/extract-app.sh \
  --app "$CHATGPT_APP_PATH" \
  --expect-version 26.803.41515
shasum -a 256 "$CHATGPT_APP_PATH/Contents/Resources/app.asar"
```

The exact stock app reported version `26.803.41515`, Electron
`151.0.7922.76`, and the pinned SHA-256 above.

The complete ChatGPT-account command used isolated copies of current and saved
credentials through the harness:

```bash
CHATGPT_APP_PATH="$CHATGPT_APP_PATH" \
  scripts/run-local-ci.sh --use-current-accounts
```

Results:

- Launcher unit tests: `60/60`.
- Extension and shared-utility unit tests: `35/35`.
- Stable public API assertions: `44/44`.
- Current native UI suite: `84/84`.
- The Multiple Accounts extension switched to another account and restored the
  original account.
- Shipped-extension composition with the API suite enabled: passed.
- Normal shipped-extension flow: passed.
- Release build and strict signature verification: passed.
- The packaged launcher contained no component seed, runtime, or binding.
- Packaged binding and bridge files matched source.

The deterministic native UI rerun used the isolated primary account without
the optional alternate-account adoption step. The separate Multiple Accounts
flow verified the account switch and restoration.

The native run specifically covered Profile artwork reuse, native Profile
navigation, thread navigation/restoration, thread-list composition, effective
native menu ordering, project-action capture, the Palette flyout and keyboard
interaction, header painting, theme switching, the native color picker,
settings controls, cold pane navigation, contributed search results, runtime
preload, and activation ordering.

## Failure signatures

- Native installation failure: a current hashed path, initializer, or export
  changed.
- Empty profile model: profile semantic props, Item fibers, or FormatJS ids
  changed.
- Incorrect Profile artwork: the `codex.profileDropdown.profile` `LeftIcon`
  initializer or exported component changed.
- Visible profile chevron without expansion: the SubmenuItem owner boundary or
  trigger/children contract changed.
- Empty thread model: local overflow export, remote action anchors, menu root,
  or thread message ids changed.
- Effective thread order differs from rendered order: a newly opaque native
  action namespace is not captured or the source-position reinsertion changed.
- Native UI navigation timeout: sidebar-row kind/id attributes or
  current-thread synchronization changed.
- Thread flyout presentation mismatch: native Item activation or
  FlyoutSubmenuItem contract changed.
- Missing thread-list marker: sidebar-row or title-trigger attributes changed.
- Authentication startup failure: sign-in initializer, URL decoration, or
  browser dispatch changed.
- Stale identity after replacement: app-server message bus,
  restart/initialized messages, account query key, auth-nonce hook, or provider
  boundary changed.
- Missing or unpainted header: the `app-shell-header` semantic locator, its
  five-region topology, remote surfaces, or theme root classes changed.
- Picker mismatch: header anchor, React DOM root, or native picker export
  changed.
- Native readiness failure before extension activation: preload bootstrap,
  native module imports, application-root discovery, or reconciliation changed.
