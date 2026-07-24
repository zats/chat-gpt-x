# Derivation — bindings for 26.721.31836

Pinned build:

- App version: `26.721.31836`
- app.asar SHA-256: `674dab67fe39f9912493f640c1dd80f222f6062ad0f50b182a6cc87eebd0d3dc`
- Electron: `150.0.7871.128`
- Sparkle enclosure: `https://persistent.oaistatic.com/codex-app-prod/ChatGPT-darwin-arm64-26.721.31836.zip`
- Version-watcher reference: issue `#3`
- Binding date: `2026-07-24`

Research used an extracted copy of this exact stock build and live CDP inspection of isolated authenticated profiles. The stock app bundle was never modified.

## Verified module map

This build continues to consolidate the shared implementations in `app-initial-C-fROkKo.js`. Every path below exists in the extracted build. Semantic source inspection identified the candidates; live `app:` imports, the unchanged public suite, and the current native UI suite verified their behavior and contracts.

| Capability | Current asset | Verified exports |
| --- | --- | --- |
| React, JSX, and React DOM | `app-initial-C-fROkKo.js` | `Lvt()` is React 19.2.5; `jvt()` supplies mutable `jsx` and `jsxs`; `ipt()` supplies `createRoot` |
| Native menus | `app-initial-C-fROkKo.js` | initializer `QB`; `YB` Item; `ZB` Separator; `qB` in-place SubmenuItem; `JB.FlyoutSubmenuItem`; `KB` dropdown root |
| Native icons | `app-initial-C-fROkKo.js` | initializer `Xlt` and component `Ylt` for the menu chevron; initializer `c_` and component `s_` for the Profile person icon; initializer `TH` for Settings |
| Native color picker | `app-initial-C-fROkKo.js` | initializer `To`; controlled picker `wo` |
| Authentication context | `app-initial-C-fROkKo.js` | initializer `LX`; `BX` auth-nonce hook; `JX` app-server registry hook |
| Query and message contracts | `app-initial-C-fROkKo.js` | `Avt` query-client hook; `Qut` account-info query-key builder; initializer `sdt` and message bus `cdt` |
| Browser and navigation bridges | `app-initial-C-fROkKo.js` | `tnt` open-in-browser dispatch; `H5` React Router navigation hook |
| Plus icon | `plus-BgCJgEEs-CggjjkHs.js` | initializer `t`; forward-ref component `n` |
| Palette icon | `palette-lzFbWMQk-D2UumFmj.js` | initializer `n`; forward-ref component `t` |
| Persisted-thread overflow | `thread-overflow-menu-jSLwXfym.js` | initializer `n`; component `t` |
| ChatGPT sign-in | `chatgpt-desktop-auth-url-fs7WVkdZ.js` | initializer `r`; `o` starts `login-with-chatgpt`; `t` decorates the URL |

Additional semantic anchors:

- `codex.profileDropdown.*`, `codex.profileFooter.*`, and `composer.mode.rateLimit.heading` locate the native profile implementation in `app-initial-C-fROkKo.js`.
- `sidebarElectron.*` and `threadHeader.*` identify native thread actions and sections.
- Remote thread menus are identified by the co-located `toggle-thread-pin`, `copy-session-id`, and `copy-deeplink` action anchors.
- `data-app-action-sidebar-thread-row`, its scoped thread attributes, and `data-thread-title-trigger` identify persisted sidebar rows.
- `codex.projectAppearance.color.option.aria_label` and `codex.remoteHostColorPicker.*` locate the app-owned color-circle and picker precedents.
- `login-route-ALPtito9.js` removes the exact `account-info` query before updating the auth nonce after successful stock sign-in.
- `codex-app-server-restart`, `codex-app-server-initialized`, and `open-in-browser` verify the native authentication message contracts.
- `app-D4iDTyKa.css` sets `--cursor-interaction: default` for Electron windows.

## menus.profile

The binding wraps the app's shared JSX runtime, identifies the profile dropdown through semantic props, captures native Item fibers, and renders transformed descriptors inside the original Radix root.

The visible Usage remaining Item owns presentation only. Its native `qB` SubmenuItem ancestor owns the wrapper state, trigger, handlers, and children. Live stock fiber inspection showed the Item boundary followed by the `data-state` wrapper and the current SubmenuItem implementation; the binding therefore retains that complete owner boundary. Extension submenu children reuse the nested native Item captured from Usage remaining.

The stock authenticated baseline contained the native account row, expandable Usage remaining with its native detail and link rows, Show pet, an account-dependent upgrade action, Settings with `⌘,`, and Log out. Usage expanded in place from six to eight visible menu items; Arrow Down moved focus to a nested native menu item while focus remained inside the Radix menu. The account identity was redacted before the baseline screenshot was inspected, and Log out was not activated.

The profile root supplies current identity and the native avatar. The binding refreshes identity on every render and uses the verified `/settings/profile` navigation hook if the app omits its profile callback. Transformers compose in registration order, recursively enforce extension namespaces and unique ids, preserve moved built-ins, and isolate failures.

The `person` icon maps to the same 20-point artwork used by ChatGPT's native Profile row.

## menus.thread, threads, and threads.list

The local persisted-thread overflow and remote thread menu components receive `conversationId`; the local component also supplies `title` and optional `cwd`. The binding wraps both through the same boundary. Remote titles come from the matching native sidebar row. This supplies one thread-menu model and current-thread lifecycle for both thread kinds.

Native leaf rows use Item. Native flyouts use `JB.FlyoutSubmenuItem` with the app's trigger and portal behavior. The thread-colors extension inserts its Palette flyout immediately before the first native separator. Theme-aware color circles reuse the app's native Item icon slot and project-appearance precedent.

Native local and remote sidebar rows retain their original trees and receive extension views at `data-thread-title-trigger`. A mutation observer covers rows rendered before and after injection. The absolute leading-view host grows leftward without changing title geometry.

The native UI suite selects local and remote fixtures through the stable public API and the native row-kind marker, then exercises the same contracts for each.

## authentication

`startSignIn` uses the app's `login-with-chatgpt` URL construction and open-in-browser dispatch. Successful sign-in follows the stock sequence: remove the exact `account-info` query and update the auth nonce under native providers.

Credential replacement atomically updates `auth.json` under the resolved Codex home, dispatches the app's `codex-app-server-restart` message for host `local`, waits for `codex-app-server-initialized`, then runs the same query/auth refresh sequence. Public listeners preserve registration order and error isolation.

## appearance

Header registrations compose independently per property. The binding paints the native header regions, title, right-panel tab toolbar, and remote header action surfaces. Remote action backgrounds use a darker mix of the registered background while text and borders derive from the registered foreground. Content-panel controls remain app-owned. The app's `electron-light` and `electron-dark` root classes select registered values.

The controlled native color picker is mounted through the app's React DOM renderer. Requests serialize, previews emit normalized six-digit colors, outside click or Enter confirms, and Escape cancels.

Stock and extension Items both compute `cursor: default` under the current Electron CSS. The native suite asserts cursor parity with a current built-in Item and preserves the same native hover, focus, and keyboard behavior.

## Validation commands and results

Extraction and exact-build pinning:

```bash
.agents/skills/manage-platform-api/scripts/extract-app.sh \
  --app "$CHATGPT_APP_PATH" \
  --expect-version 26.721.31836
shasum -a 256 "$CHATGPT_APP_PATH/Contents/Resources/app.asar"
```

The exact stock app reported version `26.721.31836`, Electron `150.0.7871.128`, and the pinned SHA-256 above.

The deterministic completion command was run with the two opaque authentication paths passed directly as positional arguments:

```bash
CHATGPT_APP_PATH="$CHATGPT_APP_PATH" \
  scripts/run-local-ci.sh "$PRIMARY_AUTH" "$SECONDARY_AUTH"
```

Results:

- Extension and shared-utility unit tests: `23/23`.
- Unchanged stable public API suite: `39/39`.
- Current native UI suite: `63/63`, covering local and authenticated remote threads.
- Shipped-extension composition with the API suite enabled: passed.
- Multiple-accounts switching and restoration: passed.
- Manifest and packaged-source validation: passed.
- Release build and strict deep signature verification: passed.

The Release artifact's binding and bridge files matched source exactly. A separate packaged-bridge run omitted the API test extension and loaded only the normal shipped extensions. The account row expanded in place to the shipped account actions with no test items present. The thread-color flyout rendered all nine choices; applying Blue through the native flyout changed the native header and sidebar marker, and restoring Default removed both changes.

A live current-module probe against the packaged bridge verified the host version, React 19.2.5, every listed component and hook export, the React DOM root, the message bus, and all four imported auxiliary asset modules.

## Failure signatures

- Native installation failure: a current hashed path, initializer, or export changed.
- Empty profile model: profile semantic props, Item fibers, or FormatJS ids changed.
- Visible profile chevron without expansion: the SubmenuItem owner boundary or trigger/children contract changed.
- Empty thread model: local overflow export, remote action anchors, menu root, or thread message ids changed.
- Native UI navigation timeout: sidebar-row kind/id attributes or current-thread synchronization changed.
- Thread flyout presentation mismatch: native Item activation or FlyoutSubmenuItem contract changed.
- Missing thread-list marker: sidebar-row or title-trigger attributes changed.
- Authentication startup failure: sign-in initializer, URL decoration, or browser dispatch changed.
- Stale identity after replacement: app-server message bus, restart/initialized messages, account query key, auth-nonce hook, or provider boundary changed.
- Header or picker mismatch: header region topology, remote action surface classes, theme root classes, React DOM root, or native picker export changed.
