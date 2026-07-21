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

The native chevron comes from export `o` of `app-initial~avatarOverlayCompositionSurface~artifact-tab-content.electron~notebook-preview-~dg0b1kws-Cen01Onw.js`; export `s` initializes that module. Other icons are captured from live built-in Item props.

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

## Validation

- Stable public API suite: 20/20.
- Version-specific native UI suite with workspace and alternate-account fixtures: 30/30.
- Multiple-accounts and shared-storage unit tests: 17/17.
- Live multiple-accounts UI: the native account row rendered with one chevron; its children used the same native nested Item presentation as Usage remaining and appeared as `Profile`, saved accounts, then `Add account`.
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
