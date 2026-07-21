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

Dynamic rows without a FormatJS id use binding-owned stable ids: `codex.profileDropdown.account`, `codex.profileDropdown.email`, `codex.profileDropdown.usageSummary`, and `codex.profileDropdown.separator-N`. The account row's public action adapts its native event-taking `onSelect` callback to the public zero-argument `onClick` contract because native `onClick` is reserved for Alt-click user-id copying in this build. Rendered built-ins retain their original native event handlers.

Transformers run in registration order. Recursive normalization enforces extension-owned ids, removes duplicates and foreign ids, stamps origins, inherits omitted built-in fields, supports moving built-ins, enforces one submenu level, and isolates throwing transforms and handlers.

## authentication

Native ChatGPT sign-in comes from `chatgpt-desktop-auth-url-CTvO8J1r.js`: export `o` starts `login-with-chatgpt`, export `t` decorates its URL exactly as the app does, and export `r` initializes the module.

The post-authentication refresh hook comes from `app-initial~artifact-tab-content.electron~notebook-preview-panel~app-main~business-checkout~k87y25tw-DjPeV3vC.js`: export `g` is `useUpdateAuthNonce` and export `f` initializes its context module. The binding captures the hook inside the profile boundary, which is already below AuthNonceProvider.

External browser dispatch comes from `app-initial~artifact-tab-content.electron~notebook-preview-panel~app-main~business-checkout~c1u3yp5s-9RGNa6St.js`: export `o` dispatches the app's `open-in-browser` message and export `r` initializes the module.

The version-independent runtime preload exposes a narrow request bridge. The main-process bridge reads `~/.codex/auth.json`, validates and atomically replaces it with mode `0600`, and scopes reusable extension storage beneath `~/.codex/extensions/<extension-id>/`.

`getCurrent` and `inspect` derive identity from the opaque credentials without exposing their schema to extensions. The public account label prefers email, then account name, then user id. `startSignIn` starts the native login flow and lets the app process successful completion through `useUpdateAuthNonce`. `replaceCurrent` commits credentials before requesting the same native refresh. Successful sign-in and replacement notify registered public `onDidChange` listeners in registration order with error isolation.

## Validation

- Stable public API suite: 20/20.
- Version-specific native UI suite: 24/24.
- Multiple-accounts and shared-storage unit tests: 17/17.
- Live multiple-accounts UI: the native account row rendered with one chevron; its children used the same native nested Item presentation as Usage remaining and appeared as `Profile`, saved accounts, then `Add account`.
- Credential storage: the current credentials were copied byte-for-byte to `~/.codex/extensions/multiple-accounts/auth-<user-id>.json` with mode `0600`.

Run the binding UI suite with `node src/platform/bindings/26.715.70719/ui-test.mjs 9451` while the isolated test app is running.

## Rebinding failure signatures

- Native binding installation failure means a hashed module path, export, or lazy initializer changed.
- Empty `getItems()` means profile-root semantic props, Item fibers, or FormatJS ids changed.
- Missing icons means native Item props or the chevron export changed.
- A visible chevron that does not expand means SubmenuItem ownership or its `trigger`/`children` contract changed.
- Authentication startup errors mean the sign-in module initializer or URL/browser exports changed.
- Credential replacement without an app refresh means `useUpdateAuthNonce` moved or its provider boundary changed.
