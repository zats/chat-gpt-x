# Derivation — bindings for 26.727.40816

Pinned build:

- App version: `26.727.40816`
- app.asar SHA-256: `0e4f824024d0838dd7548751c02d3a7d21917c4fc3edf74c9e98d88ea9e3127d`
- Electron: `150.0.7871.182`
- Sparkle enclosure: `https://persistent.oaistatic.com/codex-app-prod/ChatGPT-darwin-arm64-26.727.40816.zip`
- Version-watcher reference: issue `#12`
- Binding date: `2026-07-30`
- Prior completed binding: `26.721.81911`

Research used extracted copies of this exact stock build and the prior build,
plus live CDP inspection of isolated authenticated profiles. The stock app
bundle was never modified. Authentication files were passed directly to the
test harness and were not inspected or copied into the repository.

## Verified module map

The shared implementations remain consolidated in
`app-initial-DRyZ1Lin.js`. Every path below exists in the extracted build.
Semantic source inspection identified candidates; live `app:` imports, the
stable public suite, and the current native UI suite verified behavior and
prop contracts.

| Capability | Current asset | Verified exports |
| --- | --- | --- |
| React, JSX, and React DOM | `app-initial-DRyZ1Lin.js` | `jSt()` is React 19.2.7; `TSt()` supplies mutable `jsx` and `jsxs`; `a_t()` supplies `createRoot` |
| Native menus | `app-initial-DRyZ1Lin.js` | initializer `dV`; namespace `sV`; `cV` Item; `uV` Separator; `oV` in-place SubmenuItem; `sV.FlyoutSubmenuItem`; `aV` dropdown root |
| Native icons | `app-initial-DRyZ1Lin.js` | initializer `kpt` and component `Opt` for the menu chevron; initializer `uv` and component `lv` for the Profile person icon; initializer `OH` for Settings |
| Native color picker | `app-initial-DRyZ1Lin.js` | initializer `Qo`; controlled picker `Zo` |
| Authentication context | `app-initial-DRyZ1Lin.js` | initializer `t1`; `i1` auth-nonce hook; `f1` app-server registry hook |
| Query and message contracts | `app-initial-DRyZ1Lin.js` | `wSt` query-client hook; `Umt` account-info query-key builder; initializer `Qmt` and message bus `$mt` |
| Browser and navigation bridges | `app-initial-DRyZ1Lin.js` | `art` open-in-browser dispatch; `qet` React Router navigation hook |
| Plus icon | `plus-BgCJgEEs-BTOZTwQp.js` | initializer `t`; forward-ref component `n` |
| Palette icon | `palette-lzFbWMQk-CkXkwYIe.js` | initializer `n`; forward-ref component `t` |
| Persisted-thread overflow | `thread-overflow-menu-BiDSznNy.js` | initializer `n`; component `t` |
| ChatGPT sign-in | `chatgpt-desktop-auth-url-Db47wv9W.js` | initializer `r`; `o` starts `login-with-chatgpt`; `t` decorates the URL |

The similarly named prior color-picker exports now point to unrelated
implementations. The current `react-colorful` source, its two native slider
roles, and the exact export list establish `Qo`/`Zo`.

Additional semantic anchors:

- `codex.profileDropdown.*`, `codex.profileFooter.*`, and
  `composer.mode.rateLimit.heading` locate the native profile implementation.
- `sidebarElectron.*` and `threadHeader.*` identify native thread actions and
  sections.
- `data-app-action-sidebar-thread-row`, its scoped thread attributes, and
  `data-thread-title-trigger` identify persisted sidebar rows.
- `codex.projectAppearance.color.option.aria_label` and
  `codex.remoteHostColorPicker.*` locate the app-owned color precedents.
- `codex-app-server-restart`, `codex-app-server-initialized`, and
  `open-in-browser` verify the native authentication message contracts.
- `app-CY0PGmGR.css` sets the Electron interaction cursor default.
- The thread header is now identified by
  `header[data-app-shell-header-edge-scroll]`; the prior hashed
  `app-header-tint` class is absent.

## menus.profile

The binding wraps the app's shared JSX runtime, identifies the profile
dropdown through semantic props, captures native Item fibers, and renders
transformed descriptors inside the original Radix root.

The stock authenticated baseline contained six top-level menuitems: the
native account row, expandable Usage remaining, Show pet, an
account-dependent upgrade action, Settings with `⌘,`, and Log out. Usage
expanded in place from six to eight menuitems. The expanded content included
the current monthly-information row and native Upgrade to Plus and Learn more
actions. Arrow Down moved focus to a nested native menuitem while focus
remained inside the Radix menu. The account identity was masked in baseline
screenshots, and Log out was not activated.

The visible Usage remaining Item owns presentation only. Its native
SubmenuItem ancestor owns wrapper state, trigger, handlers, and children.
The binding retains that owner boundary, and extension submenu children reuse
the nested native Item captured from the built-in usage subtree.

The profile root supplies current identity and the native avatar. The binding
refreshes identity on every render and uses the verified `/settings/profile`
navigation hook if the app omits its profile callback. Transformers compose
in registration order, recursively enforce namespaces and unique ids,
preserve moved built-ins, and isolate failures.

## menus.thread, threads, and threads.list

The local persisted-thread overflow component continues to receive
`conversationId`, `title`, and optional `cwd`; the remote thread menu supplies
the same identity through its semantic action tree. The binding wraps both
through one boundary. Remote titles come from the matching native sidebar
row.

Native leaf rows use Item. Native flyouts use
`sV.FlyoutSubmenuItem` with the app's trigger and portal behavior. The
thread-colors extension inserts its Palette flyout before the first native
separator. Theme-aware color circles reuse the app's native Item icon slot
and project-appearance precedent.

Native local and remote sidebar rows retain their original trees and receive
extension views at `data-thread-title-trigger`. A mutation observer covers
rows rendered before and after injection. The absolute leading-view host
grows leftward without changing title geometry.

## authentication

`startSignIn` uses the app's `login-with-chatgpt` URL construction and
open-in-browser dispatch. Successful sign-in follows the stock sequence:
remove the exact `account-info` query and update the auth nonce under native
providers.

Credential replacement atomically updates `auth.json` under the resolved
Codex home, dispatches the app's `codex-app-server-restart` message for host
`local`, waits for `codex-app-server-initialized`, then runs the same
query/auth refresh sequence. Public listeners preserve registration order
and error isolation. The native suite switched to the alternate account and
restored the primary account.

## appearance

Header registrations compose independently per property. The binding paints
the native semantic header regions, title, right-panel tab toolbar, and
remote header action surfaces. Remote action backgrounds use a darker mix of
the registered background while text and borders derive from the registered
foreground. Content-panel controls remain app-owned.

This build remounts the semantic header while its right panel changes. The
color-picker request therefore snapshots the current native header bottom
when the session opens; the asynchronously rendered native picker retains
the exact eight-point offset without dereferencing a removed header node.
The controlled picker continues to serialize requests, emit normalized
six-digit previews, confirm on outside click or Enter, and cancel on Escape.

Stock and extension Items both compute `cursor: default` under the current
Electron CSS. The native suite asserts cursor parity with a current built-in
Item and preserves the same native hover, focus, and keyboard behavior.

## Validation commands and results

Extraction and exact-build pinning:

```bash
.agents/skills/manage-platform-api/scripts/extract-app.sh \
  --app "$CHATGPT_APP_PATH" \
  --expect-version 26.727.40816
shasum -a 256 "$CHATGPT_APP_PATH/Contents/Resources/app.asar"
```

The exact stock app reported version `26.727.40816`, Electron
`150.0.7871.182`, and the pinned SHA-256 above.

The stable public suite and current native suite were exercised against the
live app with authentication paths passed directly to the harness:

```bash
node src/platform/bindings/26.727.40816/ui-test.mjs "$PORT" \
  --public-api-only "--select-thread=$THREAD_ID"
node src/platform/bindings/26.727.40816/ui-test.mjs "$PORT" \
  "--alternate-auth=$SECONDARY_AUTH" "--select-thread=$THREAD_ID"
```

Results were `39/39` for the stable public API suite and `63/63` for the
current native UI suite. The latter used the required composition of
`multiple-accounts`, `thread-colors`, and `api-test-suite`.

The requested deterministic completion command was:

```bash
CHATGPT_APP_PATH="$CHATGPT_APP_PATH" \
  scripts/run-local-ci.sh "$PRIMARY_AUTH" "$SECONDARY_AUTH"
```

It completed the Release build and local API-test build, then stopped before
launching a test process because the immutable private test-extension
manifest still declares
`compatibility.chatgpt: >=26.715.52143 <=26.721.81911`:

```text
api-test-suite is incompatible with ChatGPT 26.727.40816 and API 1.0.3.
ChatGPTX launcher failed during initialize
```

Changing `src/extensions/api-test-suite/`, weakening the resolver, or changing
the deterministic harness is outside this rebind's immutable scope.
Independent completed gates were:

- Extension and shared-utility unit tests: `23/23`.
- Stable public API suite: `39/39`.
- Current native UI suite: `63/63`.
- Shipped-extension composition with the API suite enabled: passed.
- Multiple-accounts switching and restoration within the native suite:
  passed.
- A final Release build and strict deep signature verification: passed.
- Packaged binding and bridge files matched source.

## Failure signatures

- Native installation failure: a current hashed path, initializer, or export
  changed.
- Empty profile model: profile semantic props, Item fibers, or FormatJS ids
  changed.
- Visible profile chevron without expansion: the SubmenuItem owner boundary
  or trigger/children contract changed.
- Empty thread model: local overflow export, remote action anchors, menu root,
  or thread message ids changed.
- Native UI navigation timeout: sidebar-row kind/id attributes or
  current-thread synchronization changed.
- Thread flyout mismatch: Item activation or FlyoutSubmenuItem changed.
- Missing thread-list marker: sidebar-row or title-trigger attributes changed.
- Authentication startup failure: sign-in initializer, URL decoration, or
  browser dispatch changed.
- Stale identity after replacement: app-server message bus,
  restart/initialized messages, account query key, auth-nonce hook, or
  provider boundary changed.
- Header mismatch: semantic header topology or right-panel surfaces changed.
- Color-picker mount failure: React DOM root, header snapshot, or the
  `Qo`/`Zo` native picker binding changed.
