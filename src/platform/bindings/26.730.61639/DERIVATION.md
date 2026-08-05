# Derivation — bindings for 26.730.61639

Pinned build:

- App version: `26.730.61639`
- app.asar SHA-256: `3fea92820c0fb7a69473e7a8308a8e5b8e91524289a84181a33533ec6cb51d45`
- Electron: `151.0.7922.71`
- Sparkle enclosure: `https://persistent.oaistatic.com/codex-app-prod/ChatGPT-darwin-arm64-26.730.61639.zip`
- Version-watcher reference: issue `#17`
- Binding date: `2026-08-05`
- Prior implementation: `26.727.51351` binding `1.0.0`

Research used an extracted copy of this exact stock build and CDP inspection
of an isolated stock renderer. The installed app bundle was not modified.

## Verified module map

The shared implementations are consolidated in
`app-initial-CKNQDTeE.js`. Semantic source inspection identified the
implementations below. Direct imports in the stock `app:` renderer verified
the export shapes, including React `19.2.7`, mutable JSX functions, React DOM
`createRoot`, native menu functions, hook functions, the account query key,
and message-bus methods.

| Capability | Current asset | Derived exports |
| --- | --- | --- |
| React, JSX, and React DOM | `app-initial-CKNQDTeE.js` | initializers/getters `TCt`, `yCt`, and `Z_t` |
| Native menus | `app-initial-CKNQDTeE.js` | initializer `hH`; namespace `fH`; Item `pH`; Separator `mH`; in-place SubmenuItem `dH`; `fH.FlyoutSubmenuItem`; dropdown root `uH` |
| Native icons | `app-initial-CKNQDTeE.js` | initializer `Fut` and chevron `Put`; initializer `Tv` and Profile person icon `wv` |
| Native color picker | `app-initial-CKNQDTeE.js` | initializer `wf`; controlled picker `Cf` |
| Authentication context | `app-initial-CKNQDTeE.js` | initializer `XQ`; auth-nonce hook `$Q`; initializer `r$`; app-server registry hook `s$` |
| Query and message contracts | `app-initial-CKNQDTeE.js` | initializer `_Ct` and query-client hook `vCt`; initializer `Iht` and account-info query-key builder `Nht`; initializer `Hht` and message bus `Uht` |
| Browser and navigation bridges | `app-initial-CKNQDTeE.js` | initializer `Bit` and open-in-browser dispatch `Uit`; initializer `Wrt` and navigation hook `Jrt` |
| Plus icon | `plus-BgCJgEEs-DPgL_3TD.js` | initializer `t`; component `n` |
| Palette icon | `palette-lzFbWMQk-DPnbv15j.js` | initializer `n`; component `t` |
| Persisted-thread overflow | `thread-overflow-menu-BnGXLm0k.js` | initializer `n`; component `t` |
| ChatGPT sign-in | `chatgpt-desktop-auth-url-Cfg4S9AH.js` | initializer `r`; `o` starts `login-with-chatgpt`; `t` decorates the URL |

Additional semantic anchors:

- `codex.profileDropdown.*` and `codex.profileFooter.*` locate the current
  native profile implementation. Its visible Items use local `AR` (`pH`),
  separators use `FR.Separator` (`fH.Separator`), and its root uses local
  `jR` (`uH`).
- The in-place submenu owner is local `Bia` (`dH`). It owns its open state,
  cloned trigger, handlers, and child content. The native flyout implementation
  remains `FR.FlyoutSubmenuItem`.
- The profile person icon is local `vQ` (`wv`), initialized by `D7s` (`Tv`),
  with the same path beginning `M16.585 10C16.585` used by the native Profile
  Item.
- `codex.projectAppearance.color.option.aria_label` and the remote-host color
  picker locate the controlled `react-colorful` implementation `zBc` (`Cf`),
  initialized by `BBc` (`wf`).
- The current login route imports `$Q`, `vCt`, `Nht`, `Jrt`, and `Uit`. The
  derived `Nht("account-info")` value was renderer-probed as
  `["vscode", "account-info"]`.
- The message singleton is local `dp` (`Uht`), initialized by `fp` (`Hht`).
  Renderer inspection confirmed `subscribe` and `dispatchMessage`.
- The application header is now emitted by local `c3r` as
  `header[data-app-shell-application-menu-bar]`. It no longer has the prior
  `_Header_khftr_1` CSS-module class. The app-owned header exposes semantic
  `data-app-shell-*` attributes and app-shell slot attributes.
- `app-DyZ-fh3k.css` defines the current Electron interaction cursor.

## Binding changes

`host.js` retains the prior stable API behavior and transformer architecture,
but uses the current hashed assets and exports above. Header appearance is
anchored to `header[data-app-shell-application-menu-bar]`; the matching
version-specific native assertions use that same app-owned semantic anchor.

The profile, thread, authentication, and appearance implementations otherwise
remain structurally equivalent to the prior binding:

- profile and thread descriptors are transformed inside the app's native menu
  roots and native Items;
- credential replacement writes through the launcher-owned runtime service,
  restarts the local app server, waits for its initialized message, and then
  invalidates the account query and updates the auth nonce;
- header registrations compose by property and effective Electron theme;
- the native controlled color picker is rendered through the app's React DOM
  renderer.

## Validation status

Exact-build extraction and pinning passed:

```bash
.agents/skills/manage-platform-api/scripts/extract-app.sh \
  --app "/Users/runner/work/_temp/chatgpt-app/ChatGPT.app" \
  --expect-version 26.730.61639
shasum -a 256 \
  "/Users/runner/work/_temp/chatgpt-app/ChatGPT.app/Contents/Resources/app.asar"
```

JavaScript syntax, binding-manifest parsing, immutable-file checks, asset
existence, and the stock-renderer export-shape probe passed. The release
launcher and private API test extension also built successfully.

The authenticated completion gate is currently blocked before either live
suite starts. With each supplied authentication file passed only by path into
an isolated profile, the exact stock app remains on its first-party
`Sign in to ChatGPT` screen. The current native app-server registry reports no
account, no native profile menu is rendered, and the mechanical readiness
check fails after 90 seconds:

```text
Error: Authenticated profile was not ready within 90000ms
```

The bridge result preceding that timeout is:

```text
readiness: built-in profile menu items present — failed
no built-in profile menu items within 20s (unauthenticated?)
```

Because readiness did not pass, the stable public API suite, current native
UI suite, shipped-extension composition, account switching, packaged-source
comparison, and final signing checks have not been claimed for this binding.
Public extension compatibility and versions remain unchanged until those live
gates pass.

## Failure signatures

- Native installation failure: a current hashed path, initializer, or export
  changed.
- Empty profile model after authenticated readiness: profile semantic props,
  Item fibers, FormatJS ids, or the submenu ownership boundary changed.
- Empty thread model: the local overflow export, remote action anchors, menu
  root, or thread message ids changed.
- Authentication readiness timeout on the first-party sign-in screen: the
  isolated stock app did not accept the supplied account state, so native
  profile behavior cannot be validated.
- Missing or unpainted header after authenticated readiness: the semantic
  `data-app-shell-application-menu-bar` anchor, app-shell slots, side-panel
  toolbar, or Electron theme root classes changed.
- Picker mismatch: the app-shell header anchor, React DOM root, or controlled
  picker export changed.
