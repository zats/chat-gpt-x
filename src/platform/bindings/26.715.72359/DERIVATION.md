# Derivation — bindings for 26.715.72359

Pinned build:

- App version: `26.715.72359`
- app.asar SHA-256: `6c6528eb1e8450cdc506a59586f8caffe87576e200977e2a11bdea0cecf1c718`
- Electron: `150.0.7871.124`
- Binding date: `2026-07-22`

Research used an extracted copy of this exact stock build and live CDP inspection of isolated authenticated profiles. The installed app bundle was never modified.

## Verified module map

Every path below exists in the extracted build. Live `app:` imports, the unchanged public suite, and the native UI suite verified the exports and their prop or behavior contracts.

| Capability | Current asset | Verified exports |
| --- | --- | --- |
| React and JSX runtime | `app-initial~avatarOverlayCompositionSurface~index-9fQ9wihu~index-BFCcxPM5~mapbox-gl-DVWlwqb~kppdhley-mFmI6cbL.js` | `dn()` is React 19.2.5; `zt()` supplies mutable `jsx` and `jsxs` functions |
| Native menus | `app-initial~artifact-tab-content.electron~notebook-preview-panel~app-main~appgen-settings-p~evbmo86c-BIxmPNYv.js` | `i` Item, `o` Separator, `n` in-place SubmenuItem, `r.FlyoutSubmenuItem`, `t` dropdown root |
| Chevron icon | `app-initial~avatarOverlayCompositionSurface~artifact-tab-content.electron~notebook-preview-~dg0b1kws-Cm26-F9e.js` | initializer `s`; component `o` |
| Profile icon | `app-initial~app-main~settings-command-menu-section-items~pull-request-route~new-thread-pane~fnoshreu-D5mfSDoa.js` | initializer `i`; component `r` |
| Plus icon | `plus-BgCJgEEs-Byjhdd05.js` | initializer `t`; forward-ref component `n` |
| Palette icon | `palette-lzFbWMQk-C-Co91wY.js` | initializer `n`; forward-ref component `t` |
| Native color picker | `app-initial~app-main~plugin-detail-page~settings-page~projects-index-page~appgen-library-pa~nsqr45u8-C3he6mAT.js` | initializer `i`; controlled picker `r` |
| React DOM root | `app-initial~avatarOverlayCompositionSurface~index-9fQ9wihu~index-BFCcxPM5~mapbox-gl-DVWlwqb~gsbyx6su-Cok-LK6_.js` | `t()` supplies `createRoot` |
| React DOM portal | `app-initial~avatarOverlayCompositionSurface~index-9fQ9wihu~index-BFCcxPM5~mapbox-gl-DVWlwqb~elr7dp2m-f2m0c2c7.js` | `b().createPortal` |
| Persisted-thread overflow | `thread-overflow-menu-CaSSV4dF.js` | initializer `n`; component `t` |
| Persisted sidebar row | `app-initial~app-main~onboarding-page~projects-index-page~hotkey-window-thread-page~chatgpt-~j34jmud9-DNuPQHcp.js` | initializer `o`; component `a` |
| ChatGPT sign-in | `chatgpt-desktop-auth-url-BRvvtvzu.js` | initializer `r`; `o` starts `login-with-chatgpt`; `t` decorates the URL |
| Authentication context | `app-initial~artifact-tab-content.electron~notebook-preview-panel~app-main~business-checkout~k87y25tw-31XubniU.js` | initializer `f`; `g` auth-nonce hook; `A` app-server registry hook |
| Browser/navigation bridge | `app-initial~artifact-tab-content.electron~notebook-preview-panel~app-main~business-checkout~c1u3yp5s-DJt4asyD.js` | initializer `r`; `o` open-in-browser dispatch; `mt` React Router navigation hook |
| Query and message bus | `app-initial~avatarOverlayCompositionSurface~artifact-tab-content.electron~notebook-preview-~ngwudnyz-CS1L_Amm.js` | `Bl` query-client hook; `r` query-key builder; `m` message bus |

Additional semantic anchors:

- `codex.profileDropdown.*` and `codex.profileFooter.*` locate the profile implementation in `app-initial~avatarOverlayCompositionSurface~app-main~hotkey-window-thread-page~avatar-overl~ivlwwypn-DZ5hMBGt.js`.
- `sidebarElectron.*` and `threadHeader.*` identify native thread actions and sections.
- `codex.projectAppearance.color.option.aria_label` locates the app-owned circular color precedent in `app-initial~artifact-tab-content.electron~notebook-preview-panel~app-main~settings-command-~hox8u96i-DU7nfKAJ.js`.
- `codex.remoteHostColorPicker.*` locates the native picker precedent in `app-initial~notebook-preview-panel~app-main~pull-request-route~projects-index-page~cloud-en~lpx9dmpy-CP_V9_i3.js`.
- The stock successful-login sequence remains in `login-route-C4Xwa439.js` and removes the exact `account-info` query before updating the auth nonce.
- `codex-app-server-restart`, `codex-app-server-initialized`, and `open-in-browser` verify the native authentication message contracts.
- The native theme resolver remains in `app-initial~artifact-tab-content.electron~app-main~page~pull-request-code-review~new-thread~b942ryfo-CUxnPNK1.js`.

## menus.profile

The binding wraps the app's shared JSX runtime, identifies the profile dropdown through semantic props containing `codex.profileDropdown.*` or `codex.profileFooter.*`, captures native Item fibers, and renders transformed descriptors inside the original Radix root.

The visible Usage remaining Item owns presentation only. Its native SubmenuItem ancestor owns expansion state, trigger, handlers, and children. The binding retains that complete owner boundary. Extension submenu children reuse the nested native Item captured from Usage remaining.

The stock authenticated baseline contained the native account identity row, expandable Usage remaining with Weekly/reset/link children, Show pet, Settings with `⌘,`, and Log out. Usage expanded in place, and keyboard focus remained in the Radix menu. The binding preserved that behavior in the 59-check native suite.

The profile root supplies current identity, native avatar, and optional profile callback. The binding refreshes identity on each render and uses the verified `/settings/profile` navigation hook when the app omits that callback. Transformers still compose in registration order, recursively enforce extension namespaces and unique ids, preserve moved built-ins, and isolate failures.

## menus.thread, threads, and threads.list

The persisted-thread overflow component receives `conversationId`, `title`, and optional `cwd`. Intercepting that component supplies the thread-menu model and current-thread lifecycle. Pending and remote scheduled-task rows do not enter the public thread surface.

Native leaf rows use Item; native flyouts use `r.FlyoutSubmenuItem` with their original Radix trigger and portal behavior. The thread-colors extension inserts its Palette flyout immediately before the first native separator. Theme-aware color circles reuse the app's native Item icon slot and project-appearance precedent.

The persisted local sidebar component retains its native row tree and receives extension views through `createPortal` into `data-thread-title-trigger`. The absolute leading-view host grows leftward and leaves title geometry unchanged.

This build also renders remote scheduled-task rows with `data-app-action-sidebar-thread-row`. The native UI locator therefore requires `data-app-action-sidebar-thread-kind="local"` before exercising current-thread navigation; selecting the first generic row targets an unrelated remote surface.

## authentication

`startSignIn` uses the app's `login-with-chatgpt` URL creation and open-in-browser dispatch. Successful sign-in runs the stock `account-info` removal and auth-nonce refresh under native providers.

Credential replacement atomically updates the isolated `auth.json`, dispatches the app's `codex-app-server-restart` message for host `local`, waits for `codex-app-server-initialized`, then runs the same query/auth refresh sequence. Public listeners preserve registration order and error isolation.

## appearance

Header registrations still compose independently per property. The binding paints the native header regions and right-panel tab toolbar while leaving content-panel controls app-owned. The app's `electron-light` and `electron-dark` root classes select registered values.

The native controlled color picker remains mounted through the app's React DOM renderer. Requests serialize, previews emit normalized six-digit colors, outside click or Enter confirms, and Escape cancels.

`app-B6aXltj2.css` now sets `--cursor-interaction: default` for Electron windows. Both stock Item rows and extension Item rows therefore compute `cursor: default` while retaining the same native hover/focus classes and keyboard behavior. The native suite asserts cursor parity with a current built-in Item rather than a fixed CSS value.

## Validation commands and results

Extraction and pinning:

```bash
.agents/skills/manage-platform-api/scripts/extract-app.sh --expect-version 26.715.72359
shasum -a 256 /Applications/ChatGPT.app/Contents/Resources/app.asar
```

Live source binding, with `$TEST_HOME` containing isolated extension state and auth and `$TEST_PROFILE` an isolated authenticated user-data copy:

```bash
env HOME="$TEST_HOME" CODEX_HOME="$TEST_HOME/.codex" src/extensions/build.sh
env HOME="$TEST_HOME" CODEX_HOME="$TEST_HOME/.codex" \
  src/macOS/scripts/launcher-script-placeholder.sh \
  --user-data-dir="$TEST_PROFILE" --remote-debugging-port=9451
node src/platform/bindings/26.715.72359/ui-test.mjs 9451
bun test src/extensions/multiple-accounts/multiple-accounts.test.ts \
  src/extensions/thread-colors/thread-colors.test.ts \
  src/platform/utilities/extension-storage.test.ts
```

Results:

- Unchanged public API suite: `39/39`.
- Version-specific native UI suite: `59/59`.
- Multiple-accounts, thread-colors, and shared-storage unit tests: `23/23`.
- With the API test extension disabled, the normal flow loaded only multiple-accounts and thread-colors. The account row expanded in place to Profile and Add account with one native chevron; Color rendered before the first thread separator and opened the native nine-choice flyout.
- Live current-module probe verified React 19.2.5, every listed component/hook export, React DOM root/portal functions, and the native message bus.

Release and packaged bridge:

```bash
env HOME="$TEST_HOME" CHATGPTX_BUILD_CONFIGURATION=Release \
  CHATGPTX_BUILD_DIR="$RELEASE_DIR" src/macOS/scripts/build.sh
codesign --verify --deep --strict --verbose=2 "$RELEASE_DIR/ChatGPTX.app"
diff -rq src/platform/bindings/26.715.72359 \
  "$RELEASE_DIR/ChatGPTX.app/Contents/Resources/bindings/26.715.72359"
diff -q src/platform/bridge/main.cjs \
  "$RELEASE_DIR/ChatGPTX.app/Contents/Resources/bridge/main.cjs"
```

The Release build succeeded, its hardened-runtime ad-hoc signature verified, and packaged bridge/binding files matched source. Launching the stock app through the packaged `bridge/main.cjs` produced a bridge log whose `bindings-found` path was inside `ChatGPTX.app`; the packaged public suite passed `39/39`, and the packaged native suite passed `59/59`.

## Failure signatures

- Native installation failure: a current hashed path, initializer, or export changed.
- Empty profile model: profile semantic props, Item fibers, or FormatJS ids changed.
- Visible profile chevron without expansion: the SubmenuItem owner boundary or trigger/children contract changed.
- Empty thread model: persisted-thread component, menu root, or thread message ids changed.
- Native UI navigation timeout on a remote task: the local-row kind locator changed.
- Thread flyout presentation mismatch: native Item activation or FlyoutSubmenuItem contract changed.
- Missing thread-list marker: sidebar-row export, title trigger, or portal export changed.
- Authentication startup failure: sign-in initializer, URL decoration, or browser dispatch changed.
- Stale identity after replacement: app-server message bus, restart/initialized messages, account query key, auth-nonce hook, or provider boundary changed.
- Header/picker mismatch: header region topology, theme root classes, React DOM root, or native picker export changed.
