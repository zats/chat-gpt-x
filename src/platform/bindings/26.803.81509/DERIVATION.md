# Derivation — bindings for 26.803.81509

Pinned build:

- App version: `26.803.81509`
- app.asar SHA-256: `01a9c7b0fb822a8bcee829849194b757ce2ea5cf40d1ea05750c504f92314d79`
- Electron: `151.0.7922.76`
- Sparkle enclosure: `https://persistent.oaistatic.com/codex-app-prod/ChatGPT-darwin-arm64-26.803.81509.zip`
- Version-watcher reference: issue `#26`
- Binding date: `2026-08-11`

Research used an extracted copy of this exact stock build. Static candidates
were confirmed by current import edges and by live behavior in an isolated
API-key profile. API-key authentication used the harness-defined reduced path,
so profile-dependent stock affordances, account switching, and post-ChatGPT-
authentication behavior were unavailable and are not claimed. The stock app
bundle and installed user state were never modified.

## Verified module map

The shared implementations are consolidated in
`app-initial-Bd3Z1bES.js`. Every path below exists in the extracted build.
FormatJS and protocol anchors identified candidates; current ESM callers and
the packaged public and native suites verified their behavior and contracts.

| Capability | Current asset | Verified exports |
| --- | --- | --- |
| React, JSX, and React DOM | `app-initial-Bd3Z1bES.js` | `Ckt()` is React 19.2.7; `gkt()` supplies mutable `jsx` and `jsxs`; `kCt()` supplies `createRoot` |
| Native menus | `app-initial-Bd3Z1bES.js` | initializer `XU`; namespace `qU`; `qU.Item`, `qU.Separator`, `qU.SubmenuItem`, and `qU.FlyoutSubmenuItem`; `GU` dropdown root |
| Native icons | `app-initial-Bd3Z1bES.js` | initializer `kht` and component `Aht` for the menu chevron; initializer `Nm` and component `Mm` for the Profile person icon |
| Native color picker | `app-initial-Bd3Z1bES.js` | initializer `yc`; controlled picker `vc` |
| Authentication context | `app-initial-Bd3Z1bES.js` | initializer `I0` and auth-nonce hook `z0`; initializer `U0` and app-server registry hook `q0` |
| Query and message contracts | `app-initial-Bd3Z1bES.js` | initializer `mkt` and query-client hook `hkt`; `lxt` account-info query-key builder; initializer `vxt` and message bus `yxt` |
| Browser and navigation bridges | `app-initial-Bd3Z1bES.js` | initializer `rdt` and direct open-in-browser dispatch `odt`; initializer `Zlt` and React Router navigation hook `aut` |
| Plus icon | `plus-BgCJgEEs-CUCwOF8J.js` | initializer `t`; component `n` |
| Palette icon | `palette-lzFbWMQk-BwPZ6FZ9.js` | initializer `n`; component `t` |
| Persisted-thread overflow | `thread-overflow-menu-BhIbhfkR.js` | initializer `n`; component `t` |
| ChatGPT sign-in | `chatgpt-desktop-auth-url-NDLLumY2.js` | initializer `r`; `o` starts `login-with-chatgpt`; `t` decorates the URL |

Several public aliases changed roles in this build. They were resolved from
current behavior rather than retained by spelling: `app-main-DMJ9tvM3.js`
imports `Ckt`, `gkt`, and `kCt` as React, JSX, and React DOM; the current login
route uses `hkt`, `lxt`, `odt`, and `aut` as the query hook, account query key,
browser dispatch, and navigation hook. The application main imports `vxt` as
the message initializer and calls `yxt.dispatchMessage`.

Additional semantic anchors:

- `codex.profileDropdown.*`, `codex.profileFooter.*`, and
  `composer.mode.rateLimit.heading` locate the current profile implementation.
  The Profile row still supplies component `Mm` as its exact `LeftIcon`.
- `threadHeader.*`, `sidebarElectron.*`, and `sidebar.threadProject.*` identify
  native thread actions. Remote actions retain the co-located
  `toggle-thread-pin`, `copy-session-id`, and `copy-deeplink` anchors.
- `data-app-action-sidebar-thread-row`, scoped thread attributes, and
  `data-thread-title-trigger` identify persisted sidebar rows.
- `codex.projectAppearance.color.option.aria_label` and
  `codex.remoteHostColorPicker.*` locate the app-owned color and picker
  precedents.
- `login-route-CDwyNZKO.js` uses the current query, account-key, browser,
  navigation, and auth-nonce exports around stock sign-in.
- `codex-app-server-restart`, `codex-app-server-initialized`, and
  `open-in-browser` verify the native authentication message contracts.
- The application header remains
  `header[data-pip-obstacle="app-shell-header"]`; its semantic regions and
  `app-initial-AYgnwUwc.css` remain compatible with the appearance API.
- `app-DuLjgNkx.css` sets `--cursor-interaction: default` for Electron body
  content.

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

Native leaf rows use `qU.Item`; flyouts use `qU.FlyoutSubmenuItem` with the
app's trigger and portal behavior. Dynamic `sidebar.threadProject.*` items are
captured and reinserted at their source position so the public model and
rendered order agree. Native rows retain their original trees, focus behavior,
and handlers.

The API-key path exercised a seeded local persisted thread: navigation and
restoration, action ordering, the Palette flyout, keyboard interaction,
sidebar leading-view composition, and selected-color removal all passed.
The current shell may replace the semantic thread-title element while panel
topology collapses, so the native suite recaptures that element before checking
the effective header foreground instead of observing a detached node.

## Renderer bootstrap

The main-world JSX hook is installed from ChatGPTX's external session preload
before page scripts. Native imports may complete on either side of the first
React render, so the binding waits for the committed application root,
reconciles it through the current native React DOM renderer, and resolves
`__CGPTX_NATIVE_READY__` before extension activation.

## authentication

`startSignIn` uses the current `login-with-chatgpt` construction and direct
`odt` open-in-browser dispatch. Successful sign-in retains the stock sequence:
remove the exact `lxt("account-info")` query and update the auth nonce under
native providers.

Credential replacement atomically updates `auth.json` under the resolved
Codex home, dispatches `codex-app-server-restart` for host `local`, waits for
`codex-app-server-initialized`, and then applies the query and nonce refresh.
Public listeners preserve registration order and error isolation. These
profile-dependent interactions were statically re-derived but are not claimed
by the API-key live run.

## appearance

Header registrations compose independently per property. The version-pinned
selector paints the current semantic header regions, title, right-panel tab
toolbar, and remote action surfaces. Content-panel controls remain app-owned;
`electron-light` and `electron-dark` select registered values.

The controlled native color picker mounts through `kCt().createRoot` below the
semantic header. Requests serialize, previews normalize to six-digit colors,
outside click or Enter confirms, and Escape cancels. The native suite verified
header painting, theme switching, the native picker, and cursor parity with a
current built-in Item.

## Validation commands and results

Extraction and exact-build pinning:

```bash
.agents/skills/manage-platform-api/scripts/extract-app.sh \
  --app "$CHATGPT_APP_PATH" \
  --expect-version 26.803.81509
shasum -a 256 "$CHATGPT_APP_PATH/Contents/Resources/app.asar"
```

The exact stock app reported version `26.803.81509`, Electron
`151.0.7922.76`, and the pinned SHA-256 above. The hash was rechecked after the
live runs.

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
  native-ready and both public shipped extensions loaded. Profile-dependent
  multiple-account activation is unavailable under API-key authentication.
- Release build and strict signature verification: passed.
- Packaged binding and bridge files matched source.
- Profile menu, ChatGPT-account switching, and profile-dependent
  authentication assertions were disabled by the harness and are not claimed.

Only extension manifests changed for this rebind; extension test and product
source is unchanged.

## Failure signatures

- Native installation failure: a current hashed path, initializer, or export
  changed. A `client` destructuring error at query setup specifically indicates
  that a stale non-initializer alias was invoked.
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
- Authentication startup failure: sign-in initializer, URL decoration,
  browser dispatch, query key, message bus, or provider boundary changed.
- Missing or unpainted header: the `app-shell-header` locator, semantic region
  topology, remote surfaces, or theme root classes changed.
- Picker mismatch: the header anchor, React DOM root, or native picker export
  changed.
- Native readiness failure: preload bootstrap, current native imports,
  application-root discovery, or reconciliation changed.
