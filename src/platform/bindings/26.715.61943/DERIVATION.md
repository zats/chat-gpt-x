# Derivation — bindings for 26.715.61943

Pinned build:

- App version: 26.715.61943
- app.asar SHA-256:
  7501dd25c22e090bb131fe3fe6423e5c3b21b7f275c7e45b86ebe00a68052c80
- Electron: 150.0.7871.124

Research used an extracted copy of this exact build plus live CDP inspection
of an isolated authenticated profile.

## menus.profile

### Native component binding

The FormatJS `codex.profileDropdown.*` and `codex.profileFooter.*` ids locate
the profile implementation in:

app-initial~avatarOverlayCompositionSurface~app-main~hotkey-window-thread-page~avatar-overl~ivlwwypn-DXHfXA5P.js

That module's ESM imports lead to the native menu module below. The live
binding validates the component identities.

The app exports the required menu components from:

app-initial~artifact-tab-content.electron~notebook-preview-panel~app-main~appgen-settings-p~evbmo86c-DGrUMXQv.js

Exports used by host.js:

- i: the app Item component
- o: the app Separator component
- n: the app in-place SubmenuItem component
- t: the app dropdown root

The shared core module is:

app-initial~avatarOverlayCompositionSurface~index-9fQ9wihu~index-BFCcxPM5~mapbox-gl-DVWlwqb~kppdhley-cTPFNKbJ.js

It exports the singleton React and JSX-runtime objects via dn() and zt(). The
JSX runtime is mutable. The binding wraps jsx and jsxs, detects the profile
dropdown root from its semantic child props, and inserts a small boundary
around that root's children.

The boundary stays inside the app's existing dropdown root, so every effective
item renders under the original Radix providers. It renders contributed and
built-in rows with the exported components above. Keyboard navigation, focus,
selection, disabled behavior, styling, accessibility, animation, and submenu
expansion therefore remain app-owned.

For a built-in row already owned by a native SubmenuItem, the capture walks
from the Item fiber to that SubmenuItem fiber and retains its `trigger` and
`children` props. Re-rendering replaces only the trigger descriptor and keeps
the app's native children. This is required for the Usage remaining row: its
chevron is an Item prop, while its expansion state and usage-detail children
belong to the surrounding SubmenuItem.

The native chevron component is export o from:

app-initial~avatarOverlayCompositionSurface~artifact-tab-content.electron~notebook-preview-~dg0b1kws-C-xpDjxf.js

Its lazy initializer is export s and must run before reading the component.
Other icon names resolve from the actual built-in Item props captured from the
open profile menu.

### Truthful built-in model

On each profile-menu mount, the boundary first commits the app's unmodified
child tree. A layout effect reads that exact native render, captures the
built-in descriptors and Item props, then rerenders the transformed list
before paint.

Rows are identified from their React fibers by exact component identity
(fiber.type === Item). The Item props provide the app handlers, icon
components, shortcut, subtext, and disabled state. FormatJS message ids provide
stable ids:

- codex.profileDropdown.*
- codex.profileFooter.*

Dynamic rows without a profile message id use these binding-owned stable ids:

- avatar identity row: codex.profileDropdown.account
- disabled email row: codex.profileDropdown.email
- rate-limit summary: codex.profileDropdown.usageSummary
- separators: codex.profileDropdown.separator-N

The avatar identity row exposes two handlers in this build: `onClick` handles
Alt-click user-id copying, while `onSelect` performs the normal Profile
navigation. Its public `onClick` action is therefore bound to the native
`onSelect` callback.

Recapturing on every mount keeps getItems() aligned with sign-in state, plan,
feature flags, labels, and current handlers.

### Transform and activation behavior

Transformers run in registration order. Every output is normalized
recursively:

- new ids must belong to the registering extension
- duplicate and foreign ids are dropped
- origins are stamped at every level
- built-in replacements inherit omitted fields
- nesting a built-in moves it from the top level
- one submenu level is enforced
- throwing transforms and handlers are isolated

activateItem() invokes action handlers through the normalized model. For a
submenu parent it opens the profile menu when needed and selects the real
native trigger, which expands the app SubmenuItem.

### Validation

The stable extension suite exercises the public surface only:

- Result: 17/17

The version-specific live UI test verifies the rendered binding:

    node src/platform/bindings/26.715.61943/ui-test.mjs 9451

- Result: 17/17
- Verifies action order, separators, app icons, subtext, shortcuts, disabled
  state, preservation of the built-in Usage remaining submenu, native submenu
  markup, Radix keyboard navigation, user activation, moved built-ins, child
  activation, public activateItem() expansion, and the account identity
  action's native Profile navigation.

### Rebinding failure signatures

- Native binding installation failure: one of the three hashed module paths or
  export names changed.
- Empty getItems(): profile-root semantic props, row fibers, or FormatJS ids
  changed.
- Missing icons: built-in Item prop names or the chevron module exports
  changed.
- A chevron renders but clicking does not expand: the app moved submenu
  ownership away from the captured SubmenuItem ancestor or changed its
  `trigger`/`children` contract.
- UI suite order/focus/submenu failure: app menu component contracts changed;
  re-derive their exported props from the new extracted build.
