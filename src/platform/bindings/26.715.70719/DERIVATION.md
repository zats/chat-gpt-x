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

## authentication

Native ChatGPT sign-in comes from `chatgpt-desktop-auth-url-CTvO8J1r.js`: export `o` starts `login-with-chatgpt`, export `t` decorates its URL exactly as the app does, and export `r` initializes the module.

The stock successful-login branch in `login-route-BWCACVOW.js` first removes the exact `account-info` query and then invokes `useUpdateAuthNonce`. The query client hook is export `Bl` and the app query-key builder is export `r` of `app-initial~avatarOverlayCompositionSurface~artifact-tab-content.electron~notebook-preview-~ngwudnyz-DEp-3H1N.js`. The auth hook is export `g` of `app-initial~artifact-tab-content.electron~notebook-preview-panel~app-main~business-checkout~k87y25tw-DjPeV3vC.js`; export `f` initializes its context module. The binding captures both hooks inside the profile boundary, below their native providers, and runs the same query-removal/auth-nonce sequence after successful sign-in.

Native sign-in updates the running app server before that sequence. Replacing `auth.json` externally does not, so query invalidation alone leaves the previous account live. Export `m` of the query module is the app's message bus. After credential replacement, the binding dispatches the same `codex-app-server-restart` message used by native settings with `hostId: "local"`, waits for the bus's `codex-app-server-initialized` event, and then runs the stock query-removal/auth-nonce sequence. Export `A` of the auth-context module provides the native app-server registry used by the binding-specific two-account assertion.

External browser dispatch comes from `app-initial~artifact-tab-content.electron~notebook-preview-panel~app-main~business-checkout~c1u3yp5s-9RGNa6St.js`: export `o` dispatches the app's `open-in-browser` message and export `r` initializes the module.

The version-independent runtime preload exposes a narrow request bridge. The main-process bridge reads `~/.codex/auth.json`, validates and atomically replaces it with mode `0600`, and scopes reusable extension storage beneath `~/.codex/extensions/<extension-id>/`.

`getCurrent` and `inspect` derive identity from the opaque credentials without exposing their schema to extensions. The public account label prefers email, then account name, then user id. `startSignIn` starts the native login flow and processes successful completion through the stock post-login sequence. `replaceCurrent` commits credentials, waits for native app-server reinitialization, and refreshes renderer authentication state. Successful sign-in and replacement notify registered public `onDidChange` listeners in registration order with error isolation.

## appearance.header

The native full-width header is `header.app-header-tint`. Its second direct layout region owns the left header and its third owns the thread header. The right panel is `aside[data-app-shell-focus-area="right-panel"]`; its tab strip is the direct `.h-toolbar` child of `[data-app-shell-tabs="true"]`.

The full-width header retains its native isolation and stacking. When `--header-background-color` is active, the binding leaves that header transparent and paints its second and third direct regions. An eight-point shadow fills their native gap. The right-panel tab toolbar and its nested `bg-token-main-surface-primary` surfaces use the same property. This keeps the right-side header buttons and side-panel tabs above their original hit-test surfaces.

`--header-foreground-color` overrides the native foreground tokens inside the full header and directly colors the right-panel tab and action controls. The active tab background is derived with `color-mix`. Selectors stop at the tab toolbar, so the browser/content toolbar below it retains ChatGPT's own foreground colors.

The renderer binding owns the stylesheet and exposes ordered, updateable registrations. Later registrations win independently per property. Each property requires `light` and `dark` colors. An empty registration or update leaves ChatGPT's native values and property ownership unchanged.

ChatGPT's preload exposes `getSystemThemeVariant` and `subscribeToSystemThemeVariant`. The renderer's theme resolver in `app-initial~artifact-tab-content.electron~app-main~page~pull-request-code-review~new-thread~b942ryfo-B5RKHLXM.js` combines that signal with the app's `system | light | dark` preference, then toggles `electron-light` and `electron-dark` on the document root and reapplies its native color tokens. The binding observes those same root classes and selects the matching registered values, so System mode follows device appearance changes while explicit ChatGPT themes remain authoritative.

Registration, theme change, update, disposal, and direct changes to an active custom property repaint through CSS without remounting app UI.

## Validation

- Stable public API suite: 23/23.
- Version-specific native UI suite with alternate-account fixtures: 36/36.
- Computer Use: green background and white foreground were visible on both the thread header and browser side-panel tab header; all tab, add, expand, bottom-panel, and side-panel controls remained visible.
- Multiple-accounts and shared-storage unit tests: 17/17.
- Live multiple-accounts UI: the native account row rendered with one chevron; its children used the same native nested Item presentation as Usage remaining and appeared as `Profile`, saved accounts, then `Add account`.
- Native Profile icon: the workspace-account fixture rendered the extension's nested Profile row with the exact Settings → Profile icon even though ChatGPT omitted its own profile-dropdown row.
- Credential storage: the current credentials were copied byte-for-byte to `~/.codex/extensions/multiple-accounts/auth-<user-id>.json` with mode `0600`.
- Live account switching: Computer Use switched from workspace to personal and back in the packaged launcher. Each direction updated the menu email and native Profile identity, avatar rendering, handle, and account-specific activity data without restarting the desktop process. The nested Profile item opened native Profile settings in both account states, including the workspace state where ChatGPT omits its profile-menu callback.

Run the binding UI suite with `node src/platform/bindings/26.715.70719/ui-test.mjs 9451` while the isolated test app is running. With a workspace account, append `--expect-native-profile-callback-missing`. Append `--alternate-auth=/path/to/another/auth.json` to switch the live native app server to a distinct account and restore the original account.

## Rebinding failure signatures

- Native binding installation failure means a hashed module path, export, or lazy initializer changed.
- Empty `getItems()` means profile-root semantic props, Item fibers, or FormatJS ids changed.
- Missing icons means native Item props or the chevron export changed.
- A visible chevron that does not expand means SubmenuItem ownership or its `trigger`/`children` contract changed.
- Authentication startup errors mean the sign-in module initializer or URL/browser exports changed.
- Stale identity after credential replacement means the message-bus export, app-server restart/initialized message contract, account-info query key, auth-nonce hook, or provider boundary changed.
