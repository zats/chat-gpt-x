# Derivation — bindings for 26.814.41957

Pinned build:

- App version: `26.814.41957`
- app.asar SHA-256: `881d21270e41ea50a6de7835a3dda3516a001354d034933bb4a97677f3e0c479`
- Electron: `151.0.7922.137`
- Sparkle enclosure: `https://persistent.oaistatic.com/codex-app-prod/ChatGPT-darwin-arm64-26.814.41957.zip`
- Version-watcher reference: issue `#36`
- Binding date: `2026-08-18`
- Binding version: `1.0.1` republishes the validated binding because the
  `1.0.0` release asset was not created by the original main-branch run.

Research used an extracted copy of this exact stock application. Static
candidates were confirmed through current ESM import edges, semantic anchors,
and live behavior in isolated API-key profiles. API-key authentication used
the harness-defined reduced path, so profile-dependent stock affordances,
account switching, and post-ChatGPT-authentication behavior were unavailable
and are not claimed. Authentication contents were never inspected or copied
into the repository. The stock app bundle and installed user state were never
modified.

## Prior implementation and current-build delta

The newest completed binding, `26.814.41407`, was used as the prior
implementation. The stable platform behavior and public API remain applicable.
Every content-hashed renderer import was re-derived from this build and its
current callers.

This build retains the native-context-menu adapter introduced for local thread
overflow buttons. The adapter owns the app-created button, conversation id,
and native-menu model and pins the otherwise present Radix root closed. The
binding continues to pass the app-owned button to ChatGPT's existing Radix
root, stamps the thread identity on that button, and removes only the adapter's
forced controlled `open` value. ChatGPT continues to own Item, Separator,
flyout, trigger, portal, focus, selection, and keyboard behavior.

The target build schedules nested-menu dismissal after the extension action's
visible state update. The version-specific native suite therefore waits for
the original portal to unmount before exercising the same trigger again. The
assertion still requires native dismissal and a successful reopen; it does not
substitute a synthetic menu or relax the behavior under test.

No public API or extension source changed.

## Verified module map

The shared implementations are consolidated in
`app-initial-BnNjcVmf.js`. Every path below exists in the extracted build.
FormatJS and protocol anchors identified candidates; current callers and the
packaged public and native suites verified their behavior and contracts.

| Capability | Current asset | Verified exports |
| --- | --- | --- |
| React, JSX, and React DOM | `app-initial-BnNjcVmf.js` | `qzt()` supplies React; `Rzt()` supplies mutable `jsx` and `jsxs`; `mNt()` supplies `createRoot` |
| Native menus | `app-initial-BnNjcVmf.js` | initializer `Q$`; namespace `Y$`; `Y$.Item`, `Y$.Separator`, `Y$.SubmenuItem`, and `Y$.FlyoutSubmenuItem`; `q$` dropdown root |
| Native icons | `app-initial-BnNjcVmf.js` | initializer `f1` and component `d1` for the menu chevron; initializer `Qp` and component `Zp` for the Profile person icon |
| Native color picker | `app-initial-BnNjcVmf.js` | initializer `Qs`; controlled picker `Zs` |
| Authentication context | `app-initial-BnNjcVmf.js` | initializer `k7` and auth-nonce hook `M7`; initializer `I7` and app-server registry hook `z7` |
| Query and message contracts | `app-initial-BnNjcVmf.js` | initializer `Izt` and query-client hook `Lzt`; initializer `QOt` and account-info query-key builder `YOt`; initializer `skt` and message bus `ckt` |
| Browser and navigation bridges | `app-initial-BnNjcVmf.js` | initializer `xct` and direct open-in-browser dispatch `wct`; initializer `bTt` and React Router navigation hook `wTt` |
| Plus icon | `plus-BgCJgEEs-CWFdPBgZ.js` | initializer `t`; component `n` |
| Palette icon | `palette-lzFbWMQk-fqCdvFav.js` | initializer `n`; component `t` |
| Persisted-thread overflow | `thread-overflow-menu-COhryqFW.js` | initializer `n`; component `t` |
| ChatGPT sign-in | `chatgpt-desktop-auth-url-OfIPxXhF.js` | initializer `r`; `o` starts `login-with-chatgpt`; `t` decorates the URL |

The aliases were resolved from current behavior rather than retained by
spelling. `app-main-CzaIyeAo.js` supplies the current React, React DOM, JSX,
message-bus, and application-root import edges. `login-route-3tZFeNXg.js`
uses the query, account-key, browser, navigation, auth-nonce, and sign-in
exports around stock authentication.

Additional semantic anchors:

- `codex.profileDropdown.*` locates the current profile implementation. The
  Profile row supplies component `Zp` as its exact `LeftIcon`.
- `threadHeader.*`, `toggle-thread-pin`, `copy-session-id`, and
  `copy-deeplink` identify the current local and remote thread actions.
- `thread-overflow-native-menu-BJjPiWhb.js` and the current
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
through semantic props and FormatJS messages, captures native Item fibers, and
renders transformed descriptors inside the original Radix root. Stateful
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
described above. The app's original button triggers the app's original Radix
root, whose children are transformed through the same public model as remote
menus. Native leaf rows use `Y$.Item`; flyouts use
`Y$.FlyoutSubmenuItem`; separators use the app's native one-pixel surface.
Dynamic project items are captured and reinserted at their source position.
Native rows retain their original trees, focus behavior, and handlers.

The API-key path exercised a seeded local persisted thread: navigation and
restoration, action ordering, the Palette flyout, keyboard interaction,
sidebar leading-view composition, cursor parity, native dismissal and reopen,
and selected-color removal all passed.

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
  --expect-version 26.814.41957
shasum -a 256 "$CHATGPT_APP_PATH/Contents/Resources/app.asar"
```

The exact stock app reported version `26.814.41957`, Electron
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

The private API-suite manifest advanced to `0.0.17` and gained the target
compatibility bound so the launcher could execute the unchanged stable tests.
It remains private and absent from the public update index. After the live
suites passed, the validated public extension manifests advanced to `0.1.11`
and expanded their ChatGPT compatibility bound. Extension test and product
source is unchanged.

## Failure signatures

- Native installation failure: a current hashed path, initializer, or export
  changed.
- Empty profile model: profile semantic props, Item fibers, or FormatJS ids
  changed.
- Visible profile chevron without expansion: the SubmenuItem owner boundary
  or trigger/children contract changed.
- Bound thread trigger with no DOM menu: the native-context-menu adapter,
  forced `open` state, current Radix trigger contract, or a portal still
  completing native dismissal changed.
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
