# Derivation — bindings for 26.831.21537

Pinned build:

- App version: `26.831.21537`
- App build: `7579`
- app.asar SHA-256: `4df5376dd69ec8fd1d99c7e590982d8a10b762116ceb1961c0e2addcc08b07fa`
- Electron: `152.0.7977.64`
- Sparkle enclosure: `https://persistent.oaistatic.com/codex-app-prod/ChatGPT-darwin-arm64-26.831.21537.zip`
- Binding date: `2026-09-02`
- Binding version: `1.0.0`
- ChatGPT API version: `1.5.2`
- Version-watcher issue: `#65`

The workflow supplied the exact stock application and a prepared `app.asar`
research tree. The app version, build, Electron version, and app.asar hash were
checked against the values above. No app was downloaded or extracted, the
prior stock app was not fetched, and the supplied application, research tree,
opaque authentication source, and user state were not changed.

This new-mode binding started from the API-development implementation in
`26.831.20005`, selected by `src/platform/bindings/manifest.json` at the start
of the rebind. It preserves ChatGPT API `1.5.2` and starts at binding version
`1.0.0`. No generated binding was available.

## Verified module map

Every asset and export below exists in the supplied target research tree and
was checked through its current definition, importer, semantic caller, or live
stock behavior. Matching short export names alone were not treated as
evidence.

| Capability | Current asset | Verified exports |
| --- | --- | --- |
| React, JSX, and React DOM | `app-initial-b09f80199db1.js` | React accessor `Ran()`; JSX runtime accessor `Lan()`; React DOM accessor `Pan()` |
| Native menu system | `app-initial-b09f80199db1.js` | initializer `DU`; namespace `AU`; dropdown root `OU`; generic descriptor adapter `EU` |
| Assistant-selection toolbars | `app-primary-699b5b6c9679.js` | initializer `go` and positioner `ho`; initializer `mo` and action overlay `po` |
| Native color picker | `app-primary-699b5b6c9679.js` | initializer `qw`; controlled picker `Kw` |
| Settings page and title | `app-initial-b09f80199db1.js` | initializer `lS`, page `sS`; initializer `eS`, section title `$x` and select trigger `Zx` |
| Settings group, rows, and row | `app-initial-b09f80199db1.js` | initializer `Pu`, group `Nu`; initializer `wu`, rows `Cu`; initializer `Mu`, row `ku` |
| Settings controls | `app-initial-b09f80199db1.js` | initializer `FU`, toggle `PU`; initializer `NTt`, button `MTt`; initializer `sH`, input `aH` |
| Settings visibility and icons | `use-visible-settings-sections-f404b2dd3078.js` | initializer `t`; section-icon map `i` |
| Settings loading and breadcrumb | `settings-loading-row-410d807f8b06.js`, `toolbar-breadcrumb-fec340ffad70.js` | each uses initializer `n` and component `t` |
| Application scope | `app-initial-b09f80199db1.js` | scope token `PYt`; hook `iXt` |
| App-server registry | `app-initial-b09f80199db1.js` | hook `Qpt` |
| Query and account contracts | `app-initial-b09f80199db1.js` | query-client hook `tXt`; native query-key builder `rzt` |
| Host message and browser bridges | `app-initial-b09f80199db1.js` | bus `lZt`; browser dispatch `iZt`; navigation hook `GHt` |
| Internationalization | `app-initial-b09f80199db1.js` | hook `Yin` |
| ChatGPT sign-in | `chatgpt-desktop-auth-url-af877e3bdcd1.js` | initializers `i` and `r`; scoped sign-in `o`; URL decorator `t` |
| Persisted-thread overflow | `thread-overflow-menu-8529b4bdfedd.js` | initializer `n`; component `t` |
| Plus and Palette icons | `plus-BgCJgEEs-7542ebdc3d3c.js`, `palette-lzFbWMQk-db06b886b5ff.js` | Plus initializer `t`, component `n`; Palette initializer `n`, component `t` |
| Header and Settings icons | `chevron-right-COkuMB7M-80221dbead0b.js`, `user-DzSXx5EY-820599eff3d6.js`, `settings-8KXOPtTT-c34b85813569.js` | current initializer/component pairs verified from their definitions and native UI |

The host imports twelve current hashed assets. All current app-initial and
app-primary references are present in the target export maps. Semantic anchors
included `threadHeader.*`, `toggle-thread-pin`, `copy-deeplink`,
`selectedTextOverlay.*`, response-annotation data attributes, Settings route
and navigation messages, the application scope, and scoped login/browser
dispatch contracts. The target thread chunk imports `EU` and passes raw
descriptors to that native adapter with `trigger: "click"`.

The short export aliases changed substantially even where old aliases remained
present. Live stock probes confirmed that `Ran()` returns React 19.2.7,
`Lan()` returns the JSX runtime, `Pan()` returns React DOM, `AU` owns the native
menu components, `OU` is the dropdown root, and `EU` is the descriptor adapter.
Current Settings chunks semantically import `PU`, `Zx`, `MTt`, and `aH` as the
native toggle, select trigger, button, and text field. The app-server hook,
query key, browser bridge, navigation, internationalization, scope, and message
bus exports were likewise followed from their callers rather than inferred
from their names.

## Native ownership and target-build behavior

The binding patches the shared JSX runtime and transforms native Profile,
persisted-thread, Settings, and assistant-selection trees without replacing
their Radix or application-scope owners. Unchanged built-ins retain their
native elements, handlers, shortcuts, submenu ancestors, and dynamic state.
Multiple extensions compose in registration order.

The current assistant-selection positioner supplies
`viewportHorizontalBounds`, a portal target, selected-text rectangle, window
zoom, and a live position callback. Native above and below toolbars,
response-annotation creation, composer-preserving activation, Command-click
direct submission, twice-native emoji sizing, and four-pixel vertical label
padding passed live.

The application header retains the semantic context surface marked
`data-testid="app-shell-header-context-menu-surface"` and start/end slots
marked `data-test-id="header-shell-slot"`. The same collapsed, expanded,
side-panel, theme-change, and hit-testing checks passed.

Settings page, group, row, toggle, select, button, input, loading, icon,
breadcrumb, search, and child-pane contracts retain native ownership. The
controlled app-primary color picker supplies two native sliders and passed
live updates, outside-click confirmation, repeated Escape cancellation, and
serialized requests.

The transformed persisted-thread instance keeps the app's Radix branch,
native action order, semantic separators, presentation, keyboard navigation,
and flyout ownership. Thread Colors adds Color at the end of the first section
and reuses the current Palette SVG and native flyout portal.

## Authentication-mode baseline

The supplied authentication is API-key mode, so the harness applied its
declared reduced path and disabled only Profile/account-dependent gates. The
stock app was observed with a throwaway profile and no injected binding; its
product shell reached readiness, while Profile affordances were deliberately
omitted from comparison without a ChatGPT account identity. Persisted-thread,
assistant-selection, appearance, color-picker, Settings, runtime, normal
shipped-extension, and composition paths remained enabled.

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
schema-3 component store. The harness also verified the normal shipped-
extension flow after disabling the test extension. API-key mode disabled only
the harness-declared profile-dependent gates.

## Failure signatures

- Native-install failure or readiness timeout: a hashed asset, initializer,
  export, or application-root reconciliation anchor moved.
- Empty or non-native assistant selection: `go`/`ho`, `mo`/`po`,
  `viewportHorizontalBounds`, or response-annotation ownership changed.
- Header controls missing or unpainted: the context-surface or header-slot
  semantic markers changed, or validation selected a measurement copy instead
  of the visible control copy.
- Thread order, keyboard, or flyout failure: `EU`, raw action descriptors,
  Radix ownership, or the target thread component moved.
- Missing Settings controls, search, loading, or child navigation: a current
  page/group/row/control export or Settings chunk split moved.
- Authentication failure: application scope, registry, native query key,
  sign-in initializer, browser dispatch, or URL decoration moved.
- Picker failure: app-primary `qw`/`Kw`, React DOM root reconciliation, or the
  native slider contract changed.
