# Derivation — bindings for 26.715.70719

Pinned build:

- App version: 26.715.70719
- app.asar SHA-256: `954760af20a1b74275a9db50c99a09266da4f5d1e08f4b613c8a46f97adc9ce4`
- Electron: 150.0.7871.124

Research used an extracted copy of this exact build plus live CDP inspection of an isolated authenticated profile. The stock app bundle was never modified.

## menus.profile

The FormatJS `codex.profileDropdown.*` and `codex.profileFooter.*` ids locate the profile implementation in `app-initial~avatarOverlayCompositionSurface~app-main~hotkey-window-thread-page~avatar-overl~ivlwwypn-k-8tnIRx.js`.

The native menu components come from `app-initial~artifact-tab-content.electron~notebook-preview-panel~app-main~appgen-settings-p~evbmo86c-D4aWp9Ck.js`: export `i` is Item, `o` is Separator, `n` is the in-place SubmenuItem, and `t` is the dropdown root.

The singleton React and mutable JSX runtime come from `app-initial~avatarOverlayCompositionSurface~index-9fQ9wihu~index-BFCcxPM5~mapbox-gl-DVWlwqb~kppdhley-Hrn9ylUK.js` through exports `dn()` and `zt()`.

The native chevron comes from export `o` of `app-initial~avatarOverlayCompositionSurface~artifact-tab-content.electron~notebook-preview-~dg0b1kws-Cen01Onw.js`; export `s` initializes that module. The `person` icon is export `r` of `app-initial~app-main~settings-command-menu-section-items~pull-request-route~new-thread-pane~fnoshreu-CHWJP-re.js`, initialized by export `i`. ChatGPT's settings-navigation map assigns that exact component to its `profile` section, and its native profile-dropdown row uses the same export. The binding registers it directly because workspace accounts omit the native profile-dropdown row that previously supplied the component opportunistically. The `plus` icon is ChatGPT's Lucide Plus component from export `n` of `plus-BgCJgEEs-DSk_o46V.js`, initialized by export `t` and rendered at 16 points. Other icons are captured from live built-in Item props.

The binding wraps the shared JSX runtime, identifies the profile root through semantic child props, captures exact built-in descriptors from native Item fibers, and rerenders the transformed list inside the original Radix menu root. Native keyboard navigation, focus, selection, disabled state, styling, accessibility, animation, and submenu behavior remain app-owned.

The built-in Usage remaining row remains attached to its original SubmenuItem owner. Its `trigger` and `children` props are retained while its public descriptor is transformed, which preserves native in-place expansion.

The binding captures the nested native Item presentation prop from Usage remaining's own children and passes it to extension-generated submenu children. Their indentation and spacing therefore come from the same native Item component configuration as the app's submenu.

Dynamic rows without a FormatJS id use binding-owned stable ids: `codex.profileDropdown.account`, `codex.profileDropdown.email`, `codex.profileDropdown.usageSummary`, and `codex.profileDropdown.separator-N`. Export `mt` of `app-initial~artifact-tab-content.electron~notebook-preview-panel~app-main~business-checkout~c1u3yp5s-9RGNa6St.js` is the app's React Router `useNavigate` hook. The account row's public action uses it to open the app's exact `/settings/profile` route. This route action remains available for workspace accounts, where the profile root deliberately omits its conditional `onOpenProfile` prop even though Profile settings are supported. Native `onClick` remains reserved for Alt-click user-id copying in this build. Rendered built-ins retain their original native event handlers.

The profile root also supplies the current `displayName` and native `accountIcon`. The binding refreshes the captured account Item view from those props on every app render, so transformed account rows follow native identity updates.

Transformers run in registration order. Recursive normalization enforces extension-owned ids, removes duplicates and foreign ids, stamps origins, inherits omitted built-in fields, supports moving built-ins, enforces one submenu level, and isolates throwing transforms and handlers.

## menus.thread

The persisted-thread overflow is export `t` of `thread-overflow-menu-C_zMj6Vd.js`; export `n` initializes the module. Its stable input includes `conversationId`, `title`, and optional `cwd`. The binding intercepts that exact component and transforms the native menu tree it returns, so pending threads without an id never enter the public surface.

Top-level actions use the shared native Item and Separator exports documented under `menus.profile`. Native flyouts use `r.FlyoutSubmenuItem` from the same menu module. The component retains the app's Radix trigger, separate portal, positioning, focus management, keyboard navigation, hover state, animation, and accessibility. Extension leaf rows without a public handler receive an internal no-op selection prop because the native Item enables its interactive presentation from the presence of an activation prop; this preserves standard highlight and pointer behavior without changing public activation semantics.

FormatJS ids under `sidebarElectron.*` and `threadHeader.*` provide stable built-in ids. The lazily rendered Add scheduled task row is owned by an opaque conditional component, so the binding captures its semantic Item after the menu opens and restores it at the same source-tree position. Public models and the rendered native menu then remain in identical order as conditional rows appear.

The native Palette icon is export `t` of `palette-lzFbWMQk-Cg3hGH0S.js`, initialized by export `n`. Thread-menu icon descriptors select an app-owned named component, an extension-owned SVG, or a theme-aware circular color icon through the same native Item leading-icon slot. The native Item passes its `icon-xs` presentation class to the supplied component; SVG descriptors retain that class while rendering their complete extension-owned `<svg>` markup.

The app's own project-appearance picker provides the color-icon precedent in `app-initial~artifact-tab-content.electron~notebook-preview-panel~app-main~settings-command-~hox8u96i-BXuN_B5E.js`. Its `codex.projectAppearance.color.option.aria_label` choices render nested native `rounded-full` swatches. Extension color icons reuse the Item icon wrapper and that circular presentation. Their CSS custom properties select the declared light or dark color from the app's `electron-light` / `electron-dark` root classes without remounting the menu.

The `thread-colors` extension inserts a Palette flyout immediately before the first native separator. Its parent uses the extension-provided 16-point Lucide Palette SVG with a 1.75-point stroke. Its choices supply the exact requested colors through the public icon descriptor. Programmatic flyout activation targets the mounted native row or opens the owning thread menu first, then delegates to the native flyout trigger.

Thread transformers compose independently for every observed thread. Recursive normalization enforces extension namespaces and unique ids, supports one native flyout level, inherits omitted built-in fields and handlers, preserves moved built-ins, and isolates throwing transforms and actions.

The intercepted persisted-thread component is also the source for `threads.getCurrent()` and `threads.subscribe()`. A layout effect publishes its stable `conversationId`, title, and optional working directory after mount. Cleanup is deferred by one microtask and guarded by a generation counter, so a same-commit thread replacement emits the replacement directly while New Chat emits `undefined`. Subscriptions receive the current snapshot immediately and subsequent changes in registration order with error isolation.

## threads.list

Persisted sidebar rows are export `a` of `app-initial~app-main~onboarding-page~projects-index-page~hotkey-window-thread-page~chatgpt-~j34jmud9-BtWAey-a.js`; export `o` initializes the module. The row receives `conversationId`, `threadSummary`, and `displayCwd`. The binding intercepts this exact component and retains its complete native row tree, behavior, status, title layout, and hover actions.

Each registration supplies one synchronous per-thread provider. Results are cached by thread id and stable thread context, isolated on failure, and recomputed only after a context change or explicit thread/global invalidation. The binding preserves registration order and mounts each returned `HTMLElement` through the app's React renderer with deterministic cleanup.

The binding adds a stable owner attribute to the native row and portals contributed views into its native `data-thread-title-trigger` with React DOM export `b` of `app-initial~avatarOverlayCompositionSurface~index-9fQ9wihu~index-BFCcxPM5~mapbox-gl-DVWlwqb~elr7dp2m-Dzby7gOc.js`. The absolute container ends two points before the title and grows leftward in registration order. It does not participate in flex layout, so adding or removing a marker leaves the native title and trailing actions at their original positions.

## authentication

Native ChatGPT sign-in comes from `chatgpt-desktop-auth-url-CTvO8J1r.js`: export `o` starts `login-with-chatgpt`, export `t` decorates its URL exactly as the app does, and export `r` initializes the module.

The stock successful-login branch in `login-route-BWCACVOW.js` first removes the exact `account-info` query and then invokes `useUpdateAuthNonce`. The query client hook is export `Bl` and the app query-key builder is export `r` of `app-initial~avatarOverlayCompositionSurface~artifact-tab-content.electron~notebook-preview-~ngwudnyz-DEp-3H1N.js`. The auth hook is export `g` of `app-initial~artifact-tab-content.electron~notebook-preview-panel~app-main~business-checkout~k87y25tw-DjPeV3vC.js`; export `f` initializes its context module. The binding captures both hooks inside the profile boundary, below their native providers, and runs the same query-removal/auth-nonce sequence after successful sign-in.

Native sign-in updates the running app server before that sequence. Replacing `auth.json` externally does not, so query invalidation alone leaves the previous account live. Export `m` of the query module is the app's message bus. After credential replacement, the binding dispatches the same `codex-app-server-restart` message used by native settings with `hostId: "local"`, waits for the bus's `codex-app-server-initialized` event, and then runs the stock query-removal/auth-nonce sequence. Export `A` of the auth-context module provides the native app-server registry used by the binding-specific two-account assertion.

External browser dispatch comes from `app-initial~artifact-tab-content.electron~notebook-preview-panel~app-main~business-checkout~c1u3yp5s-9RGNa6St.js`: export `o` dispatches the app's `open-in-browser` message and export `r` initializes the module.

The version-independent runtime preload exposes a narrow request bridge. The main-process bridge reads `~/.codex/auth.json`, validates and atomically replaces it with mode `0600`, and scopes reusable extension storage beneath `~/.codex/extensions/<extension-id>/`.

`getCurrent` and `inspect` derive identity from the opaque credentials without exposing their schema to extensions. The public account label prefers email, then account name, then user id. `startSignIn` starts the native login flow and processes successful completion through the stock post-login sequence. `replaceCurrent` commits credentials, waits for native app-server reinitialization, and refreshes renderer authentication state. Successful sign-in and replacement notify registered public `onDidChange` listeners in registration order with error isolation.

## appearance.header

The native full-width header is `header.app-header-tint`. Its second direct layout region owns the left header, its third owns the thread header, and its fifth owns the persistent bottom- and side-panel controls. The right panel is `aside[data-app-shell-focus-area="right-panel"]`; its tab strip is the direct `.h-toolbar` child of `[data-app-shell-tabs="true"]`.

The full-width header retains its native isolation and stacking. When `--header-background-color` is active, the binding leaves that header transparent and paints its second, third, and fifth direct regions. An eight-point shadow fills the native gap between the second and third regions. ChatGPT keeps the right-panel `aside` mounted at `opacity: 0; width: 0px` while closed; the fifth region remains painted in that state. Once the native inline state reaches `opacity: 1`, the fifth region becomes transparent because it spans the open tab strip and would otherwise cover its controls.

The right-panel tab toolbar and its nested `bg-token-main-surface-primary` surfaces use the selected background. The binding also scopes ChatGPT's `--color-token-main-surface-primary` to that value inside the toolbar, so both native overflow pseudo-element gradients fade into the selected header color at narrow widths. This keeps the right-side header buttons and side-panel tabs above their original hit-test surfaces.

`--header-foreground-color` overrides the native foreground tokens inside the full header and directly colors the right-panel tab and action controls. The active tab background is derived with `color-mix`. Selectors stop at the tab toolbar, so the browser/content toolbar below it retains ChatGPT's own foreground colors.

The renderer binding owns the stylesheet and exposes ordered, updateable registrations. Later registrations win independently per property. Each property requires `light` and `dark` colors. An empty registration or update leaves ChatGPT's native values and property ownership unchanged.

ChatGPT's preload exposes `getSystemThemeVariant` and `subscribeToSystemThemeVariant`. The renderer's theme resolver in `app-initial~artifact-tab-content.electron~app-main~page~pull-request-code-review~new-thread~b942ryfo-B5RKHLXM.js` combines that signal with the app's `system | light | dark` preference, then toggles `electron-light` and `electron-dark` on the document root and reapplies its native color tokens. The binding observes those same root classes and selects the matching registered values, so System mode follows device appearance changes while explicit ChatGPT themes remain authoritative.

Registration, theme change, update, disposal, and direct changes to an active custom property repaint through CSS without remounting app UI.

## appearance color picker

The `codex.remoteHostColorPicker.*` FormatJS ids locate ChatGPT's native color picker in `app-initial~notebook-preview-panel~app-main~pull-request-route~projects-index-page~cloud-en~lpx9dmpy-CmvXvPMG.js`. Its controlled picker is export `r` of `app-initial~app-main~plugin-detail-page~settings-page~projects-index-page~appgen-library-pa~nsqr45u8-w2kLKHJV.js`; export `i` initializes the bundled `react-colorful` implementation.

The binding mounts one persistent picker host through ChatGPT's React DOM renderer. Export `t()` of `app-initial~avatarOverlayCompositionSurface~index-9fQ9wihu~index-BFCcxPM5~mapbox-gl-DVWlwqb~gsbyx6su-BgGJHe-c.js` supplies the exact renderer used by the app root. This keeps the native picker available independently of profile and thread menu mount state.

Picker requests are serialized globally in invocation order. The chrome-free native control is positioned eight points below `header.app-header-tint`, centered near the pointer that invoked it, and the originating menu is free to dismiss. Native drag and keyboard interaction emit normalized six-digit colors immediately. Clicking outside or pressing Enter confirms; Escape and disposal cancel. Throwing preview callbacks are isolated.

## Validation

- Stable public API suite: 39/39.
- Version-specific native UI suite: 59/59.
- Live CDP with both panels collapsed: the registered background covered the persistent bottom- and side-panel control region; both controls remained hit-testable with 5.83:1 contrast.
- Live CDP with the side panel open: the covering fifth header region was transparent; visible native tab/header controls remained painted, interactive, and at or above 5.48:1 contrast. Both overflow gradients resolved to the selected background rather than the native white/black surface.
- Multiple-accounts, thread-colors, and shared-storage unit tests: 23/23.
- Live multiple-accounts UI: the native account row rendered with one chevron; its children used the same native nested Item presentation as Usage remaining and appeared as `Profile`, saved accounts, then `Add account`.
- Native Profile icon: the workspace-account fixture rendered the extension's nested Profile row with the exact Settings → Profile icon even though ChatGPT omitted its own profile-dropdown row.
- Credential storage: the current credentials were copied byte-for-byte to `~/.codex/extensions/multiple-accounts/auth-<user-id>.json` with mode `0600`.
- Live account switching: Computer Use switched from workspace to personal and back in the packaged launcher. Each direction updated the menu email and native Profile identity, avatar rendering, handle, and account-specific activity data without restarting the desktop process. The nested Profile item opened native Profile settings in both account states, including the workspace state where ChatGPT omits its profile-menu callback.
- Live thread menu: `Color` rendered immediately before the first native separator with ChatGPT's Palette icon. Its nine choices opened in a separate native flyout with exact light/dark color icons and retained stock hover, pointer, focus, and keyboard behavior. Selecting Blue applied the registered background and computed foreground CSS; selecting Default removed the thread entry and restored ChatGPT's appearance.
- Live custom color: selecting `Custom` dismissed both menus and opened only the native picker at the top, centered under the invoking row. Dragging changed background and APCA-selected foreground immediately. A light-mode `#30BF56` selection generated dark-mode `#003610`; clicking outside committed and dismissed the picker.
- Thread-color persistence: `~/.codex/extensions/thread-colors/settings.json` stores tagged selections under one `colors` map: presets as `{"type":"preset","id":"<preset-id>"}` and custom pairs as `{"type":"custom","light":"#RRGGBB","dark":"#RRGGBB"}`. Default removes the thread entry.
- Live thread-list view: the extension marker was portaled three points before the native title, retained stock navigation and hover actions, grew leftward for multiple registrations, and left the title at the same horizontal position when shown or hidden.

Run the binding UI suite with `node src/platform/bindings/26.715.70719/ui-test.mjs 9451` while the isolated test app is running. With a workspace account, append `--expect-native-profile-callback-missing`. Append `--alternate-auth=/path/to/another/auth.json` to switch the live native app server to a distinct account and restore the original account.

## Rebinding failure signatures

- Native binding installation failure means a hashed module path, export, or lazy initializer changed.
- Empty profile `getItems()` means profile-root semantic props, Item fibers, or FormatJS ids changed.
- Empty thread `getItems(threadId)` means the thread component export, Menu root export, or thread FormatJS ids changed.
- Missing icons means native Item props or the chevron export changed.
- A visible chevron that does not expand means SubmenuItem ownership or its `trigger`/`children` contract changed.
- A thread flyout without interaction styling means the native Item activation-derived class contract changed.
- Authentication startup errors mean the sign-in module initializer or URL/browser exports changed.
- Stale identity after credential replacement means the message-bus export, app-server restart/initialized message contract, account-info query key, auth-nonce hook, or provider boundary changed.
