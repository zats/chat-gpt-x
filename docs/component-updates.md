# Component Updates

## TODO

### Milestone 1

- [x] Publish the update index and component releases
- [x] Build atomic component storage under `~/.codex/extensions`
- [x] Load platform components and extensions from a versions lock
- [x] Support local launch-scoped extensions and `--test-api`
- [x] Add manual updates, restart activation, and status notifications
- [x] Remove legacy loading and release fixtures

### Milestone 2

- [ ] Add the `activate`/`deactivate` lifecycle contract
- [ ] Support runtime load, unload, replacement, and new extensions
- [ ] Support live development reload
- [ ] Validate lifecycle behavior across renderers and rollback failures

Status: milestone 1 complete

## Scope

ChatGPTX updates these independently:

- ChatGPT API bridge and runtime
- ChatGPT-version bindings
- User extensions

Launcher binary updates require a separate mechanism.

## Milestones

Milestone 1 delivers the update index, component store, manual updater,
versions-locked injection, launch-scoped development extensions, and
disabled-injection notifications. Installed changes activate on the next
ChatGPT launch.

Milestone 2 adds runtime extension loading, unloading, replacement, and local
development reload. It ships after milestone 1.

## Update index

CI publishes `updates/latest.json` after every referenced component release is
available and verified. The app fetches:

```text
https://github.com/zats/chat-gpt-x/releases/download/updates/latest.json
```

Release publication is fully automated:

- New ChatGPT detection drives binding generation, validation, merge, component
  release, and index publication.
- A merged public-API or public-extension pull request drives validation,
  component release, and index publication.
- CI computes deterministic archive hashes on the pull request, commits the
  updated index, then builds every archive, checksum, GitHub Release, and stable
  index update. No component release has an operator step.

The index uses schema version 2:

```json
{
  "schemaVersion": 2,
  "generation": 9,
  "releaseBaseURL": "https://github.com/zats/chat-gpt-x/releases/download",
  "chatgptApis": {
    "1.0.2": {
      "release": "chatgpt-api-v1.0.2",
      "sha256": "<sha256>"
    }
  },
  "bindings": {
    "26.721.41059": {
      "version": "1.0.0",
      "chatgptApi": "1.0.2",
      "release": "binding-26.721.41059-v1.0.0",
      "sha256": "<sha256>"
    }
  },
  "extensions": {
    "multiple-accounts": {
      "version": "0.1.1",
      "compatibility": {
        "chatgpt": ">=26.715.52143 <=26.721.41059",
        "chatgptApi": "^1.0.0"
      },
      "release": "extension-multiple-accounts-v0.1.1",
      "sha256": "<sha256>"
    }
  }
}
```

Each archive URL is:

```text
<releaseBaseURL>/<release>/<release>.zip
```

The index contains user-distributed extensions only. `api-test-suite` remains
an internal validation extension. `release-test-fixture` is removed; release
script tests create synthetic fixtures in temporary directories.

Bindings are keyed by ChatGPT version so a correction can be published for any
supported ChatGPT build. API versions are keyed independently because installed
bindings may require different API versions. Downgrades have no dedicated
behavior or compatibility guarantee.

## Component store

Every installed component lives under `~/.codex/extensions`:

```text
~/.codex/extensions/
  components/
    chatgpt-api/<api-version>/
    bindings/<chatgpt-version>/<binding-version>/
    extensions/<extension-id>/<extension-version>/
  state/<extension-id>/
  versions-lock.json
  settings.json
```

`CODEX_HOME` changes the `~/.codex` root for development and CI.

Component directories are immutable. Extension state is stored separately from
extension code. `settings.json` contains user-selected IDs, enablement, and
order; it contains no executable paths. The updater reads it without mutation.
Compatible extensions absent from settings use enabled-by-default virtual
entries. Development builds remain outside the component store and enter a
launch only through an explicit `--extension` path.

## Installation transaction

An update runs as one transaction:

1. Fetch and strictly decode the index.
2. Reject an older generation.
3. Select the binding for the installed ChatGPT version.
4. Select compatible extension versions.
5. Create `downloads/` for one missing archive.
6. Verify each SHA-256 and archive layout.
7. Extract into new immutable component directories.
8. Remove `downloads/` and atomically replace `versions-lock.json` with exact
   component paths and extension order.

Failures before step 8 preserve the active versions lock. A generation-only
index change updates the lock without requesting a ChatGPT restart.

## Startup and injection

The launcher resolves `versions-lock.json`, selects the installed ChatGPT binding,
and launches ChatGPT with:

- `NODE_OPTIONS` requiring the selected API bridge
- `CHATGPTX_VERSIONS_LOCK` pointing to the versions lock

The bridge resolves its runtime, binding, and extensions exclusively through
that lock. A running ChatGPT process retains the locked versions it launched
with. Milestone 1 activates updates on the next ChatGPT launch.

The application imports bundled seed components into the store when no versions
lock exists. This supports first launch without network access.

## Manual update UI

The status row includes an `arrow.clockwise.circle.fill` button with the
tooltip `Check for Updates`.

The button is disabled while checking. Completion uses a standard sheet for:

- Up to date
- Components installed
- Update failed

## Activation rules

| Downloaded change | Milestone 1 | Milestone 2 |
| --- | --- | --- |
| Compatible extension versions only | Restart ChatGPT | Live reload |
| Incompatible extension | Next compatible launch | Next compatible launch |
| Binding | Restart ChatGPT | Restart ChatGPT |
| ChatGPT API, bridge, or runtime | Restart ChatGPT | Restart ChatGPT |
| Launcher application | Separate updater | Separate updater |

## Milestone 2: runtime extension lifecycle

The current bridge loads extension sources once during startup. The renderer
host ignores duplicate IDs and has no unload operation. Milestone 2 introduces
this module contract:

```ts
interface ExtensionModule {
  activate(api: PlatformApi): void;
  deactivate(): void;
}
```

Both functions are synchronous and must support repeated activation cycles.
Each extension owns its cleanup. `deactivate()` disposes its registrations,
timers, listeners, UI sessions, and guards any unfinished asynchronous work.
Shared lifecycle helpers move into platform infrastructure only after at least
two extensions need the same implementation.

The main-process bridge owns the desired extension set, configured order, source
hashes, and active storage authorization. It observes `versions-lock.json` and
explicit development extension paths. When the active API and binding remain
unchanged, it
reconciles the complete enabled extension set:

1. Evaluate candidate modules without activation.
2. Stage the same candidates in every renderer.
3. Wait for every renderer to acknowledge staging.
4. Deactivate previous modules in reverse order.
5. Activate candidates in configured order.
6. Commit after every renderer reports success.

An activation failure deactivates the candidates and restores the previous
sources in every renderer. New windows receive the last committed set.

This lifecycle is a one-way ChatGPT API `2.0.0` change. It updates
`types.d.ts`, the current binding, every extension, and the mechanical suite.
The suite covers load, unload, replacement, ordering, cleanup, new-window
injection, and cross-renderer rollback.

## Local development extensions

The launcher accepts repeatable launch-scoped arguments:

```text
--extension <absolute-package-directory-or-main.js>
```

It writes resolved IDs and paths to a mode-`0600` ephemeral launch
configuration. These entries:

- Override an installed extension with the same ID for that launch
- Leave `versions-lock.json` and persistent settings unchanged
- Participate in the same compatibility checks
- Reload after restart in milestone 1
- Reload when their compiled entry point changes in milestone 2

`--test-api` selects the locally built `api-test-suite` through this mechanism
and disables every other extension for that launch. The packaged copy is used
when no explicit `api-test-suite` path is provided. CI builds the suite locally
and passes its path through `--extension`.

## Disabled-extension detection

The macOS app observes ChatGPT process launches and waits for an injection
handshake. Runtime state is tracked per PID:

- `starting`
- `enabled`
- `bridgeMissing`
- `bindingMissing`
- `injectionFailed`

After a short startup grace period, a missing bridge handshake triggers one
notification per PID with a `Restart ChatGPT` action. A missing binding triggers
a `Check for Updates` action. Restart actions invoked from a notification proceed
immediately because the action is explicit.
