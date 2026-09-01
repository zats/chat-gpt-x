# Derivation — bindings for 26.831.11858

Pinned build:

- App version: `26.831.11858`
- App build: `7504`
- app.asar SHA-256: `cc51856e56211a378e21a9eed603adda3a97c7f0e186baf988e6037bd00e1630`
- Electron: `152.0.7977.64`
- Sparkle enclosure: `https://persistent.oaistatic.com/codex-app-prod/ChatGPT-darwin-arm64-26.831.11858.zip`
- Binding date: `2026-09-01`
- Binding version: `1.0.0`
- ChatGPT API version: `1.5.2`
- Version-watcher issue: `#63`

The workflow supplied the exact stock application and a prepared `app.asar`
research tree. The app version, build, Electron version, and app.asar hash were
checked against the values above. No app was downloaded or extracted, the
prior stock app was not fetched, and the supplied application, research tree,
opaque authentication source, and user state were not changed.

This new-mode binding started from the API-development implementation in
`26.825.51511`, selected by `src/platform/bindings/manifest.json` at the start
of the rebind. It preserves ChatGPT API `1.5.2` and starts at binding version
`1.0.0`. No generated binding was available.

## Verified module map

Every asset and export below exists in the supplied target research tree and
was checked through its current definition, importer, semantic caller, or live
behavior. Matching short export names alone were not treated as evidence.

| Capability | Current asset | Verified exports |
| --- | --- | --- |
| React, JSX, and React DOM | `app-initial-4c1cf5f55a04.js` | React `Can()`; JSX runtime `San()`; React DOM initializer `hw` and accessor `yan()` |
| Native menu system | `app-initial-4c1cf5f55a04.js` | initializers `TU` and `yU`; namespace `SU`; dropdown root `bU`; generic descriptor adapter `vU` |
| Assistant-selection toolbars | `app-primary-92136de0cef5.js` | initializer `go` and positioner `ho`; initializer `mo` and action overlay `po` |
| Native color picker | `app-primary-92136de0cef5.js` | initializer `qw`; controlled picker `Kw` |
| Settings page and title | `app-initial-4c1cf5f55a04.js` | initializer `iS`, page `$x`; initializer `Kx`, section title `Gx` and select trigger `Ux` |
| Settings group, rows, and row | `app-initial-4c1cf5f55a04.js` | initializer `Mu`, group `ju`; initializer `Su`, rows `xu`; initializer `Au`, row `Du` |
| Settings controls | `app-initial-4c1cf5f55a04.js` | initializer `DU`, toggle `EU`; initializer `xTt`, button `vTt`; initializer `$V`, input `ZV` |
| Settings visibility and icons | `use-visible-settings-sections-2d675a4e725c.js` | initializer `t`; section-icon map `i` |
| Settings loading and breadcrumb | `settings-loading-row-1cc143023ebb.js`, `toolbar-breadcrumb-aa4051bb20df.js` | each uses initializer `n` and component `t` |
| Application scope | `app-initial-4c1cf5f55a04.js` | initializer `bYt`; scope token `yYt`; hook `UYt` |
| App-server registry | `app-initial-4c1cf5f55a04.js` | initializer `Rpt`; hook `Vpt` |
| Query and account contracts | `app-initial-4c1cf5f55a04.js` | initializer `xYt`; query-client hook `BYt`; account query-key builder `HRt` |
| Host message and browser bridges | `app-initial-4c1cf5f55a04.js` | initializer `qXt`, bus `JXt`; initializer `VXt`, browser dispatch `UXt`; navigation hook `AHt` |
| Internationalization | `app-initial-4c1cf5f55a04.js` | initializer `Nin`; hook `Pin` |
| ChatGPT sign-in | `chatgpt-desktop-auth-url-821278bed22b.js` | initializers `i` and `r`; scoped sign-in `o`; URL decorator `t` |
| Persisted-thread overflow | `thread-overflow-menu-ebc8d2a9489a.js` | initializer `n`; component `t` |
| Plus and Palette icons | `plus-BgCJgEEs-c2c78c61c8c7.js`, `palette-lzFbWMQk-c51b140002bd.js` | Plus initializer `t`, component `n`; Palette initializer `n`, component `t` |
| Header and Settings icons | `chevron-right-COkuMB7M-dc145b8e4a41.js`, `user-DzSXx5EY-3713d8880c8b.js`, `settings-8KXOPtTT-1eb441324709.js` | current initializer/component pairs verified from their definitions and native UI |

The host imports thirteen current hashed assets. Its 41 distinct references to
the app-initial export surface and six references to app-primary are present in
the target export maps.

Semantic anchors included `threadHeader.*`, `toggle-thread-pin`,
`copy-deeplink`, `selectedTextOverlay.*`, the response-annotation data
attributes, Settings route and navigation messages, and the scoped login
session/browser-dispatch contracts. Current thread descriptors still include
semantic separators; the native separator now renders `h-px bg-border`.

## Native ownership and target-build behavior

The binding continues to patch the shared JSX runtime and transform native
Profile, persisted-thread, Settings, and assistant-selection trees without
replacing their Radix or application-scope owners. Unchanged built-ins retain
their native elements, handlers, shortcuts, submenu ancestors, and dynamic
state. Multiple extensions compose in registration order.

Assistant selection moved from app-initial to app-primary. The current
positioner supplies `viewportHorizontalBounds`, a portal target, selected-text
rectangle, window zoom, and a live position callback. The host uses those
current bounds for the below-selection surface. Native above and below
toolbars, response-annotation creation, composer-preserving activation,
Command-click direct submission, twice-native emoji sizing, and four-pixel
vertical label padding all passed live.

The current application header owns a semantic context surface marked
`data-testid="app-shell-header-context-menu-surface"` and start/end slots
marked `data-test-id="header-shell-slot"`. Each side slot contains an invisible
measurement copy before the live controls. Header appearance styles target
the semantic surfaces, and the native test selects the visible control copy.
This replaces the prior positional direct-child locators while preserving the
same collapsed, expanded, side-panel, theme-change, and hit-testing checks.

Settings page, group, row, toggle, select, button, input, loading, icon,
breadcrumb, search, and child-pane contracts retain native ownership. The
controlled app-primary color picker supplies two native sliders and passed
live updates, outside-click confirmation, repeated Escape cancellation, and
serialized requests.

The target thread overflow still passes raw descriptors through the shared
generic adapter with `trigger: "click"`. The transformed instance keeps the
app's Radix menu branch, native action order, semantic separators, native
presentation, keyboard navigation, and flyout ownership. Thread Colors adds
Color at the end of the first section and reuses the current Palette SVG and
native flyout portal.

## Authentication-mode baseline

The supplied authentication is API-key mode, so the harness applied its
declared reduced path and disabled only Profile/account-dependent gates. No
Profile affordance was inferred or tested without a ChatGPT account identity.
The persisted-thread, assistant-selection, appearance, color-picker, Settings,
runtime, and shipped-extension composition paths remained enabled.

## Validation

Identity and syntax checks verified the pinned version, build, Electron
version, app.asar hash, both binding JavaScript files, every imported target
asset, and the referenced target export surfaces.

The complete deterministic validation command was:

```bash
CHATGPT_APP_PATH="/path/to/the/supplied/ChatGPT.app" \
  scripts/run-local-ci.sh /path/to/the/opaque/api-key-auth.json
```

The final run passed:

- `44` extension and utility unit checks;
- `34/34` stable public API checks, with the fresh renderer result persisted
  and matched to the bridge PID;
- `45/45` target native UI and shipped-extension composition checks;
- Release build and strict signature verification; and
- packaged-launcher verification that no platform components were bundled.

The public-only launch used `--test-api`; the composition launch loaded the API
test suite together with the enabled shipped extensions from the isolated
schema-3 component store. API-key mode disabled only the harness-declared
profile-dependent gates.

## Failure signatures

- Native-install failure or readiness timeout: a hashed asset, initializer,
  export, application-root reconciliation anchor, or current app-primary split
  moved.
- Empty or non-native assistant selection: `go`/`ho`, `mo`/`po`,
  `viewportHorizontalBounds`, or response-annotation ownership changed.
- Header controls missing or unpainted: the context-surface or header-slot
  semantic markers changed, or validation selected a measurement copy instead
  of the visible control copy.
- Thread section assertion fails with actions still ordered: inspect the
  current native separator component before changing descriptor semantics.
- Thread order, keyboard, or flyout failure: the generic adapter, raw action
  descriptors, Radix owner, or target thread component moved.
- Missing Settings controls, search, loading, or child navigation: the current
  page/group/row/control ownership or settings chunk split changed.
- Authentication failure: application scope, registry, account query key,
  sign-in initializer, browser dispatch, or URL decoration moved.
- Picker failure: app-primary `qw`/`Kw`, React DOM root reconciliation, or the
  native slider contract changed.
