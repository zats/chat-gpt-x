# Derivation — bindings for 26.715.52143

Pinned build:

- App version: 26.715.52143
- app.asar SHA-256:
  4dc2ca0aac6e4f6f858c504223bcdedf0b2d768fbc948d9f449f2da656f1b98f
- Electron: 150.0.7871.124

Research used an extracted copy of this exact build plus live CDP inspection
of an isolated authenticated profile.

## menus.profile

### Native component binding

The app exports the required menu components from:

app-initial~artifact-tab-content.electron~notebook-preview-panel~app-main~appgen-settings-p~evbmo86c-BAVWa1vf.js

Exports used by host.js:

- i: the app Item component
- o: the app Separator component
- n: the app in-place SubmenuItem component
- t: the app dropdown root

The shared core module is:

app-initial~avatarOverlayCompositionSurface~index-9fQ9wihu~index-BFCcxPM5~mapbox-gl-DVWlwqb~kppdhley-CabsBVhy.js

It exports the singleton React and JSX-runtime objects via dn() and zt(). The
JSX runtime is mutable. The binding wraps jsx and jsxs, detects the profile
dropdown root from its semantic child props, and inserts a small boundary
around that root's children.

The boundary stays inside the app's existing dropdown root, so every effective
item renders under the original Radix providers. It renders contributed and
built-in rows with the exported components above. Keyboard navigation, focus,
selection, disabled behavior, styling, accessibility, animation, and submenu
expansion therefore remain app-owned.

The native chevron component is export o from:

app-initial~avatarOverlayCompositionSurface~artifact-tab-content.electron~notebook-preview-~dg0b1kws-BsrA2AI_.js

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

    node src/platform/bindings/26.715.52143/ui-test.mjs 9222

- Result: 16/16
- Verifies action order, separators, app icons, subtext, shortcuts, disabled
  state, native submenu markup, Radix keyboard navigation, user activation,
  moved built-ins, child activation, public activateItem() expansion, and the
  account identity action's native Profile navigation.

### Rebinding failure signatures

- Native binding installation failure: one of the three hashed module paths or
  export names changed.
- Empty getItems(): profile-root semantic props, row fibers, or FormatJS ids
  changed.
- Missing icons: built-in Item prop names or the chevron module exports
  changed.
- UI suite order/focus/submenu failure: app menu component contracts changed;
  re-derive their exported props from the new extracted build.
