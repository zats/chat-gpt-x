# Derivation — bindings for 26.810.52044

Pinned build:

- App version: `26.810.52044`
- app.asar SHA-256: `6e7e8791b8bf69a586ff994721fff518af391d9efdc66cd2e620dd2a4aedc90f`
- Electron: `151.0.7922.137`
- Sparkle enclosure: `https://persistent.oaistatic.com/codex-app-prod/ChatGPT-darwin-arm64-26.810.52044.zip`
- Version-watcher reference: issue `#32`
- Binding date: `2026-08-15`

Research used an extracted copy of this exact stock build. Static candidates
were confirmed by current import edges and live behavior in an isolated
API-key profile. API-key authentication used the harness-defined reduced path,
so profile-dependent stock affordances, account switching, and post-ChatGPT-
authentication behavior were unavailable and are not claimed. The stock app
bundle and installed user state were never modified.

## Prior implementation and current-build delta

The newest completed binding, `26.810.50856`, was the prior implementation.
The stable platform behavior and shared-module export aliases remained
applicable. The content-hashed renderer asset paths changed, so the five
version-pinned imports were re-derived from current semantic anchors and ESM
import edges.

The current Radix thread-menu trigger opens from its pointer contract. Native
validation dispatches `pointerdown` and `pointerup` without a trailing
synthetic `click`, which would toggle the newly opened menu closed in this
build. Menu-item selection continues to use each current native item's own
click contract. Cursor parity is captured from the connected native thread row
before programmatic flyout activation replaces its portal. No stable public
assertion was changed.

## Verified module map

The shared implementations remain consolidated in
`app-initial-BqZ9AFkF.js`. Every path below exists in the extracted build.
FormatJS and protocol anchors identified candidates; current ESM callers and
the packaged public and native suites verified their behavior and contracts.

| Capability | Current asset | Verified exports |
| --- | --- | --- |
| React, JSX, and React DOM | `app-initial-BqZ9AFkF.js` | `iIt()` supplies React; `ZFt()` supplies mutable `jsx` and `jsxs`; `Gkt()` supplies `createRoot` |
| Native menus | `app-initial-BqZ9AFkF.js` | initializer `hG`; namespace `fG`; `fG.Item`, `fG.Separator`, `fG.SubmenuItem`, and `fG.FlyoutSubmenuItem`; `uG` dropdown root |
| Native icons | `app-initial-BqZ9AFkF.js` | initializer `myt` and component `pyt` for the menu chevron; initializer `Qh` and component `Zh` for the Profile person icon |
| Native color picker | `app-initial-BqZ9AFkF.js` | initializer `Zc`; controlled picker `Xc` |
| Authentication context | `app-initial-BqZ9AFkF.js` | initializer `B2` and auth-nonce hook `U2`; initializer `q2` and app-server registry hook `X2` |
| Query and message contracts | `app-initial-BqZ9AFkF.js` | initializer `jTt` and query-client hook `XFt`; `OTt` account-info query-key builder; initializer `LTt` and message bus `RTt` |
| Browser and navigation bridges | `app-initial-BqZ9AFkF.js` | initializer `Jpt` and direct open-in-browser dispatch `Zpt`; initializer `Bft` and React Router navigation hook `Wft` |
| Plus icon | `plus-BgCJgEEs-BrmTB3Ae.js` | initializer `t`; component `n` |
| Palette icon | `palette-lzFbWMQk-x3Sg1y-R.js` | initializer `n`; component `t` |
| Persisted-thread overflow | `thread-overflow-menu-KDVvrOp6.js` | initializer `n`; component `t` |
| ChatGPT sign-in | `chatgpt-desktop-auth-url-Bq9N9f53.js` | initializer `r`; `o` starts `login-with-chatgpt`; `t` decorates the URL |

The aliases were resolved from current behavior rather than retained by
spelling. `app-main-CAc8ktlH.js` supplies current React, React DOM, JSX,
message-bus, and application-root import edges.
`login-route-EirP3Nwh.js` uses the query, account-key, browser, navigation,
auth-nonce, and sign-in exports around stock authentication.

Additional semantic anchors:

- `codex.profileDropdown.*`, `codex.profileFooter.*`, and
  `composer.mode.rateLimit.heading` locate the current profile implementation.
  The Profile row still supplies component `Zh` as its exact `LeftIcon`.
- `threadHeader.*`, `sidebarElectron.*`, and `sidebar.threadProject.*`
  identify native thread actions. Remote actions retain the co-located
  `toggle-thread-pin`, `copy-session-id`, and `copy-deeplink` anchors.
- `data-app-action-sidebar-thread-row`, scoped thread attributes, and
  `data-thread-title-trigger` identify persisted sidebar rows.
- `codex.projectAppearance.color.option.aria_label` and
  `codex.remoteHostColorPicker.*` locate app-owned color and picker precedents.
- `codex-app-server-restart`, `codex-app-server-initialized`, and
  `open-in-browser` verify the native authentication message contracts.
- The application header remains
  `header[data-pip-obstacle="app-shell-header"]`.
- `app-initial-JeCCd060.css` and `app-HA18C9Gp.css` retain the verified
  semantic presentation tokens and Electron cursor behavior.

## menus.profile

The binding wraps the current shared JSX runtime, identifies the profile root
through semantic props and FormatJS messages, captures native Item fibers, and
renders transformed descriptors inside the original Radix root. Stateful
native submenu owners and their children remain intact. Extension submenus use
the app's own Item and SubmenuItem implementations.

The profile root continues to supply current identity and avatar data.
Transformers compose in registration order, recursively enforce extension
namespaces and unique ids, preserve moved built-ins, and isolate failures. The
Profile person component remains the exact `LeftIcon` of
`codex.profileDropdown.profile`. API-key mode intentionally skipped the live
profile menu and post-authentication checks.

## menus.thread, threads, and threads.list

The local overflow component continues to receive `conversationId`, `title`,
and optional `cwd`. Remote menus expose the same identity through their action
tree. Both are wrapped by one boundary, and remote titles come from the
matching native sidebar row.

Native leaf rows use `fG.Item`; flyouts use `fG.FlyoutSubmenuItem` with the
app's trigger and portal behavior. Dynamic `sidebar.threadProject.*` items are
captured and reinserted at their source position so the public model and
rendered order agree. Native rows retain their original trees, focus behavior,
and handlers. Current separators use the native one-pixel `bg-border`
surface. Item interaction retains the app's `primary-ghost-hover` utilities.

The API-key path exercised a seeded local persisted thread: navigation and
restoration, action ordering, the Palette flyout, keyboard interaction,
sidebar leading-view composition, and selected-color removal all passed.

## Renderer bootstrap

The main-world JSX hook is installed from ChatGPTX's external session preload
before page scripts. Native imports may complete on either side of the first
React render, so the binding waits for the committed application root,
reconciles it through the current native React DOM renderer, and resolves
`__CGPTX_NATIVE_READY__` before extension activation.

## authentication

`startSignIn` uses the current `login-with-chatgpt` construction and direct
`Zpt` open-in-browser dispatch. Successful sign-in retains the stock sequence:
remove the exact `OTt("account-info")` query and update the auth nonce under
native providers.

Credential replacement atomically updates `auth.json` under the resolved
Codex home, dispatches `codex-app-server-restart` for host `local`, waits for
`codex-app-server-initialized`, and then applies the query and nonce refresh.
Public listeners preserve registration order and error isolation. These
profile-dependent interactions were statically re-derived but are not claimed
by the API-key live run.

## appearance

Header registrations compose independently per property. The current header
title is painted through `--color-text`, while the right-panel tab toolbar
and its overflow gradients inherit the registered color through
`--color-surface`. The binding scopes those variables to the semantic header
and right-panel toolbar. `electron-light` and `electron-dark` select
registered values.

The controlled native color picker mounts through `Gkt().createRoot` below
the semantic header. Requests serialize, previews normalize to six-digit
colors, outside click or Enter confirms, and Escape cancels. The native suite
verified header painting, theme switching, both native tab fades, the native
picker, and cursor parity with a current built-in Item.

## Validation commands and results

Extraction and exact-build pinning:

```bash
.agents/skills/manage-platform-api/scripts/extract-app.sh \
  --app "$CHATGPT_APP_PATH" \
  --expect-version 26.810.52044
shasum -a 256 "$CHATGPT_APP_PATH/Contents/Resources/app.asar"
```

The exact stock app reported version `26.810.52044`, Electron
`151.0.7922.137`, and the pinned SHA-256 above. The hash was rechecked after
the live runs.

The deterministic completion command passed one opaque API-key authentication
path directly to the harness:

```bash
CHATGPT_APP_PATH="$CHATGPT_APP_PATH" \
  scripts/run-local-ci.sh "$PRIMARY_AUTH"
```

The harness ran the unchanged stable public suite with `--public-api-only` and
the target native suite against its dynamically seeded local thread. Results
in API-key mode:

- Extension and shared-utility unit tests: `23/23`.
- Unchanged stable public API assertions applicable to this mode: `20/20`.
- Current native UI assertions applicable to this mode: `35/35`.
- Shipped-extension composition with the API suite enabled: passed.
- A separate normal launch omitted the API test extension; the binding became
  native-ready and both public shipped extensions loaded.
- Release build and strict signature verification: passed.
- Packaged binding and bridge files matched source.
- Profile menu, ChatGPT-account switching, and profile-dependent
  authentication assertions were disabled by the harness and are not claimed.

Only extension manifests changed for this rebind; extension test and product
source is unchanged.

## Failure signatures

- Native installation failure: a current hashed path, initializer, or export
  changed. A query setup destructuring error specifically indicates that a
  stale non-initializer alias was invoked.
- Empty profile model: profile semantic props, Item fibers, or FormatJS ids
  changed.
- Visible profile chevron without expansion: the SubmenuItem owner boundary or
  trigger/children contract changed.
- Empty or reordered thread model: the local overflow export, remote action
  anchors, menu root, or source-position reinsertion changed.
- Thread-menu timeout after a trigger event: the current Radix pointer
  activation contract changed or a trailing synthetic click closed the menu.
- Authentication startup failure: sign-in initializer, URL decoration,
  browser dispatch, query key, message bus, or provider boundary changed.
- Missing or unpainted header: the `app-shell-header` locator, semantic region
  topology, `text`/`surface` token names, or theme root classes changed.
- Picker mismatch: the header anchor, React DOM root, or native picker export
  changed.
- Native readiness failure: preload bootstrap, current native imports,
  application-root discovery, or reconciliation changed.
