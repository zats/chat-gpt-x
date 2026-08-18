# Derivation — bindings for 26.814.41407

Pinned build:

- App version: `26.814.41407`
- app.asar SHA-256: `8fba32f8baa6d984b0f0f4149d3da46221e3adb3b52836f85fe65e31e655a8c0`
- Electron: `151.0.7922.137`
- Sparkle enclosure: `https://persistent.oaistatic.com/codex-app-prod/ChatGPT-darwin-arm64-26.814.41407.zip`
- Version-watcher reference: issue `#34`
- Binding date: `2026-08-18`

Research used an extracted copy of this exact stock application. Static
candidates were confirmed through current ESM import edges, semantic anchors,
and live behavior in isolated API-key profiles. API-key authentication used
the harness-defined reduced path, so profile-dependent stock affordances,
account switching, and post-ChatGPT-authentication behavior were unavailable
and are not claimed. The stock app bundle and installed user state were never
modified.

## Prior implementation and current-build delta

The newest completed binding, `26.810.52044`, was the prior implementation.
The stable platform behavior remained applicable, while every content-hashed
renderer import was re-derived from this build.

This build enables ChatGPT's native-context-menu adapter for local thread
overflow buttons. The adapter owns the app-created button, conversation id,
and native-menu model and deliberately pins the otherwise present Radix menu
root closed. ChatGPTX must keep a DOM menu root so multiple extensions can
compose and mechanically validate one shared native item tree. The binding
therefore recognizes this exact adapter contract, passes its app-owned button
to ChatGPT's existing Radix root, stamps the thread identity on that button,
and removes only the adapter's forced controlled `open` value. Native Item,
Separator, flyout, trigger, portal, focus, and keyboard behavior remain owned
by ChatGPT.

No public API, stable test assertion, or extension source changed.

## Verified module map

The shared implementations are consolidated in
`app-initial-BCLYDefw.js`. Every path below exists in the extracted build.
FormatJS and protocol anchors identified candidates; current callers and the
packaged public and native suites verified their behavior and contracts.

| Capability | Current asset | Verified exports |
| --- | --- | --- |
| React, JSX, and React DOM | `app-initial-BCLYDefw.js` | `qzt()` supplies React; `Rzt()` supplies mutable `jsx` and `jsxs`; `mNt()` supplies `createRoot` |
| Native menus | `app-initial-BCLYDefw.js` | initializer `Q$`; namespace `Y$`; `Y$.Item`, `Y$.Separator`, `Y$.SubmenuItem`, and `Y$.FlyoutSubmenuItem`; `q$` dropdown root |
| Native icons | `app-initial-BCLYDefw.js` | initializer `f1` and component `d1` for the menu chevron; initializer `Qp` and component `Zp` for the Profile person icon |
| Native color picker | `app-initial-BCLYDefw.js` | initializer `Qs`; controlled picker `Zs` |
| Authentication context | `app-initial-BCLYDefw.js` | initializer `k7` and auth-nonce hook `M7`; initializer `I7` and app-server registry hook `z7` |
| Query and message contracts | `app-initial-BCLYDefw.js` | initializer `Izt` and query-client hook `Lzt`; initializer `QOt` and account-info query-key builder `YOt`; initializer `skt` and message bus `ckt` |
| Browser and navigation bridges | `app-initial-BCLYDefw.js` | initializer `xct` and direct open-in-browser dispatch `wct`; initializer `bTt` and React Router navigation hook `wTt` |
| Plus icon | `plus-BgCJgEEs-Cwz0arvh.js` | initializer `t`; component `n` |
| Palette icon | `palette-lzFbWMQk-6nSl4cby.js` | initializer `n`; component `t` |
| Persisted-thread overflow | `thread-overflow-menu-L1wJl1eV.js` | initializer `n`; component `t` |
| ChatGPT sign-in | `chatgpt-desktop-auth-url-BOw-tdIM.js` | initializer `r`; `o` starts `login-with-chatgpt`; `t` decorates the URL |

The aliases were resolved from current behavior rather than retained by
spelling. `app-main-B7tRVogV.js` supplies current React, React DOM, JSX,
message-bus, and application-root import edges. `login-route-BLm_FH9L.js`
uses the query, account-key, browser, navigation, auth-nonce, and sign-in
exports around stock authentication.

Additional semantic anchors:

- `codex.profileDropdown.*` locates the current profile implementation. The
  Profile row supplies component `Zp` as its exact `LeftIcon`.
- `threadHeader.*`, `toggle-thread-pin`, `copy-session-id`, and
  `copy-deeplink` identify the current local and remote thread actions.
- `thread-overflow-native-menu-CjcXXzS4.js` and the current
  `showContextMenu` call edge identify the local native-context-menu adapter.
- `data-app-action-sidebar-thread-row`, scoped thread attributes, and
  `data-thread-title-trigger` identify persisted sidebar rows.
- `codex.projectAppearance.color.option.aria_label` and
  `codex.remoteHostColorPicker.*` locate app-owned color precedents.
- `codex-app-server-restart`, `codex-app-server-initialized`, and
  `open-in-browser` verify the authentication message contracts.
- The application header remains
  `header[data-pip-obstacle="app-shell-header"]`.
- `app-initial-C_ulg7a-.css` retains the verified presentation tokens and
  Electron cursor behavior.

## menus.profile

The binding wraps the current shared JSX runtime, identifies the profile root
through semantic props and FormatJS messages, captures native Item fibers,
and renders transformed descriptors inside the original Radix root. Stateful
native submenu owners and their children remain intact. Extension submenus use
the app's own Item and SubmenuItem implementations.

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

For local threads, the current native-context-menu adapter is unwrapped as
described above. The app's original button then triggers the app's original
Radix root, whose children are transformed through the same public model as
remote menus. Native leaf rows use `Y$.Item`; flyouts use
`Y$.FlyoutSubmenuItem`; separators use the app's native one-pixel surface.
Dynamic project items are captured and reinserted at their source position.
Native rows retain their original trees, focus behavior, and handlers.

The API-key path exercised a seeded local persisted thread: navigation and
restoration, action ordering, the Palette flyout, keyboard interaction,
sidebar leading-view composition, cursor parity, and selected-color removal
all passed.

## Renderer bootstrap

The main-world JSX hook is installed from ChatGPTX's external session preload
before page scripts. Native imports may complete on either side of the first
React render, so the binding waits for the committed application root,
reconciles it through the current native React DOM renderer, and resolves
`__CGPTX_NATIVE_READY__` before extension activation.

## authentication

`startSignIn` uses the current `login-with-chatgpt` construction and direct
`wct` open-in-browser dispatch. Successful sign-in removes the exact
`YOt("account-info")` query and updates the auth nonce under native providers.

Credential replacement atomically updates `auth.json` under the resolved
Codex home, dispatches `codex-app-server-restart` for host `local`, waits for
`codex-app-server-initialized`, and then applies the query and nonce refresh.
Public listeners preserve registration order and error isolation. These
profile-dependent interactions were statically re-derived but are not claimed
by the API-key live run.

## appearance

Header registrations compose independently per property. The current header
title is painted through `--color-text`, while the right-panel tab toolbar and
its overflow gradients inherit through `--color-surface`. `electron-light`
and `electron-dark` select registered values.

The controlled native color picker mounts through `mNt().createRoot` below
the semantic header. Requests serialize, previews normalize to six-digit
colors, outside click or Enter confirms, and Escape cancels. The native suite
verified header painting, theme switching, both native tab fades, the native
picker, and cursor parity with a current built-in Item.

## Validation commands and results

Extraction and exact-build pinning:

```bash
.agents/skills/manage-platform-api/scripts/extract-app.sh \
  --app "$CHATGPT_APP_PATH" \
  --expect-version 26.814.41407
shasum -a 256 "$CHATGPT_APP_PATH/Contents/Resources/app.asar"
```

The exact stock app reported version `26.814.41407`, Electron
`151.0.7922.137`, and the pinned SHA-256 above. The deterministic completion
command passed one opaque API-key authentication path directly to the harness:

```bash
CHATGPT_APP_PATH="$CHATGPT_APP_PATH" \
  scripts/run-local-ci.sh "$PRIMARY_AUTH"
```

Results in API-key mode:

- Extension and shared-utility unit tests: `23/23`.
- Unchanged stable public API assertions applicable to this mode: `20/20`.
- Current native UI assertions applicable to this mode: `35/35`.
- Shipped-extension composition with the API suite enabled: passed.
- A separate normal launch omitted the API test extension; the binding became
  native-ready, only the two public shipped extensions loaded, and the seeded
  persisted-thread menu opened with the `Color` contribution.
- Release build and strict signature verification: passed.
- Packaged binding and bridge files matched source.
- Profile menu, ChatGPT-account switching, and profile-dependent
  authentication assertions were disabled by the harness and are not claimed.

The private API-suite manifest advanced to `0.0.16` and gained the target
compatibility bound so the launcher could execute the unchanged tests. It
remains private and absent from the public update index. After the public suite
passed, the validated public extension manifests advanced to `0.1.10` and
expanded their ChatGPT compatibility bound. Extension test and product source
is unchanged.

## Failure signatures

- Native installation failure: a current hashed path, initializer, or export
  changed.
- Empty profile model: profile semantic props, Item fibers, or FormatJS ids
  changed.
- Visible profile chevron without expansion: the SubmenuItem owner boundary
  or trigger/children contract changed.
- Bound thread trigger with no DOM menu: the native-context-menu adapter,
  forced `open` state, or current Radix trigger contract changed.
- Empty or reordered thread model: the local overflow export, remote action
  anchors, menu root, or source-position reinsertion changed.
- Authentication startup failure: sign-in initializer, URL decoration,
  browser dispatch, query key, message bus, or provider boundary changed.
- Missing or unpainted header: the semantic header locator, region topology,
  token names, or theme root classes changed.
- Picker mismatch: the header anchor, React DOM root, or native picker export
  changed.
- Native readiness failure: preload bootstrap, current native imports,
  application-root discovery, or reconciliation changed.
