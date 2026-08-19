# Component Updates

## Scope

ChatGPTX installs these components independently from GitHub Releases:

- ChatGPT API bridge and runtime
- Exact ChatGPT-build bindings
- Public extensions

The launcher application has a separate update mechanism. The launcher bundle
does not contain a runtime, binding, or extension.

## Selection rule

The launcher resolves one component set in this order:

```text
ChatGPT version + app.asar SHA-256
  -> exact binding
  -> exact ChatGPTX API/runtime
  -> newest version of each extension compatible with that API
```

A binding is valid only for one ChatGPT version and one `app.asar` hash. A
binding selects one exact ChatGPTX API version. Extensions declare only a
`compatibility.chatgptApi` range.

A new ChatGPT build needs a new exact binding. It does not need new extension
releases when the binding continues to provide the same API. A runtime update
continues even when one or more extensions do not support its API. The launcher
leaves those extensions inactive and keeps their settings.

Compatible API fixes and additions use patch or minor versions. Extensions can
use a range such as `^1.0.0` and continue to work. An incompatible API change,
such as removed functionality or a changed lifecycle contract, uses a new major
version. Extensions that do not support the new major version stay inactive.

## Independent fixes

Each component can change without a ChatGPT app update:

- A binding correction increments that build's binding version.
- A runtime or API fix increments the API version and updates the exact
  binding entry that selects it.
- An extension fix increments only that extension version.

The update index generation increments for each published catalog change.

## Update index

CI publishes `updates/latest.json` as the stable `updates` release asset:

```text
https://github.com/zats/chat-gpt-x/releases/download/updates/latest.json
```

Schema 3 contains exact bindings and all published public extension versions:

```json
{
  "schemaVersion": 3,
  "generation": 26,
  "minimumLauncherVersion": "1.1.0",
  "releaseBaseURL": "https://github.com/zats/chat-gpt-x/releases/download",
  "chatgptApis": {
    "1.0.4": {
      "release": "chatgpt-api-v1.0.4",
      "sha256": "<archive-sha256>"
    }
  },
  "bindings": {
    "26.814.41407": {
      "version": "1.0.0",
      "chatgptApi": "1.0.4",
      "asarSha256": "<app-asar-sha256>",
      "release": "binding-26.814.41407-v1.0.0",
      "sha256": "<archive-sha256>"
    }
  },
  "extensions": {
    "thread-colors": {
      "versions": {
        "0.1.10": {
          "compatibility": {
            "chatgptApi": "^1.0.0"
          },
          "release": "extension-thread-colors-v0.1.10",
          "sha256": "<archive-sha256>"
        }
      }
    }
  }
}
```

Each archive URL is:

```text
<releaseBaseURL>/<release>/<release>.zip
```

The catalog retains each published extension version and pins its archive
SHA-256. This lets the launcher select the newest compatible version after an
API major-version change. Private extensions, including `api-test-suite`, do
not enter the public catalog.

Schema 3 starts at ChatGPTX API `1.0.3`. Earlier runtimes expected bindings
inside the runtime archive and cannot load a separate remote binding package.
Their obsolete binding sources and catalog entries are removed.

## Component store

Installed components live under `<Codex home>/extensions`:

```text
extensions/
  components/
    chatgpt-api/<api-version>/.chatgptx-integrity.json
    bindings/<chatgpt-version>/<binding-version>/.chatgptx-integrity.json
    extensions/<extension-id>/<extension-version>/.chatgptx-integrity.json
  state/<extension-id>/
  versions-lock.json
  settings.json
```

`CODEX_HOME` changes the Codex home for development and CI. The default is
`$HOME/.codex`.

Component directories are immutable. `versions-lock.json` schema 1 selects
one exact API, binding, and compatible extension set. Schema 1 is retained
because released runtimes already read this lock contract. The launcher writes
the complete lock only after all selected packages pass validation. Each
component receipt records the verified archive SHA-256 and the SHA-256 of every
extracted file. The launcher rejects a changed, missing, or extra file.

`settings.json` maps extension IDs to extensible settings objects:

```json
{
  "schemaVersion": 1,
  "extensions": {
    "thread-colors": {
      "enabled": true
    }
  }
}
```

The store preserves unknown fields and records for extensions that are not
currently compatible. When an extension becomes compatible again, its prior
enablement returns. A required extension is always enabled. Extension state is
separate from extension code.

Obsolete flat package layouts are invalid. The launcher does not migrate or
load them.

## Check-for-updates flow

```mermaid
flowchart TD
    A["Read installed ChatGPT version and app.asar hash"] --> B["Fetch and strictly validate schema-3 index"]
    B --> C{"Exact binding identity exists?"}
    C -- "No" --> U["Show unsupported build; do not inject"]
    C -- "Yes" --> D["Select binding and its API/runtime"]
    D --> E["For each extension, select newest API-compatible version"]
    E --> F["Omit incompatible extensions; preserve their settings"]
    F --> G["Download missing or invalid versioned archives"]
    G --> H["Verify SHA-256, manifest identity, and archive layout"]
    H --> I["Reconcile saved enablement"]
    I --> J["Atomically replace versions-lock.json"]
    J --> K["Use the new set on next ChatGPT launch"]
```

The exact binding check happens before the index-generation rollback check.
Thus a ChatGPT build change cannot be hidden by a newer cached generation. A
same-generation catalog can select another exact binding during an app update.

## ChatGPT app update flow

```mermaid
flowchart TD
    A["ChatGPT auto-updates"] --> B["Launcher reads new version and app.asar hash"]
    B --> C{"Exact new-build binding is published?"}
    C -- "No" --> D["Open stock ChatGPT; show unsupported state"]
    C -- "Yes" --> E["Install new binding even if some extensions are incompatible"]
    E --> F{"Binding selects cached API/runtime?"}
    F -- "Yes" --> G["Reuse cached API/runtime"]
    F -- "No" --> H["Download selected API/runtime"]
    G --> I["Select newest extension versions by API range"]
    H --> I
    I --> J["Disable only incompatible extensions"]
    J --> K["Atomically activate the new component lock"]
```

## Startup and offline behavior

On startup, the launcher first checks for an exact cached lock. If it exists,
the launcher can inject it without network access. The launcher then checks for
updates in the background.

On a clean installation, the launcher downloads the exact remote set. If the
network is unavailable or the ChatGPT build has no exact binding, the launcher
keeps its UI available and can open stock ChatGPT without injection. It never
uses another build's binding.

The updater accepts `CHATGPTX_UPDATE_INDEX_URL` for isolated development and
end-to-end tests.

## Installation and launch safety

The updater:

1. Strictly decodes the index.
2. Checks the minimum launcher version.
3. Matches the exact ChatGPT version and `app.asar` hash.
4. Selects the API and the newest compatible extension versions.
5. Downloads missing or invalid versioned archives.
6. Verifies each archive SHA-256 and expected package manifest.
7. Records the complete extracted file set against that archive SHA-256.
8. Rechecks the receipt before package reuse and active-lock selection.
9. Rejects symbolic links, changed file sets, and path escapes.
10. Preserves extension settings.
11. Writes one atomic active lock last.

At every injected launch, the launcher reads the current lock and settings. It
writes a mode-`0600` launch configuration with the exact enabled extension
entry points. This keeps enablement current and lets already-published runtimes
load the new versioned store.

Component changes take effect on the next ChatGPT launch. If ChatGPT is
running, the launcher offers a restart.

## Local development and API tests

The launcher accepts repeatable development overrides:

```text
--extension <absolute-package-directory-or-main.js>
```

A local extension must be compatible with the selected ChatGPTX API. It
overrides an installed extension with the same ID for that launch only.
An explicit local `extensions` override keeps manager permission and activates
before all other extensions.

API test mode requires an explicit suite and an isolated profile:

```text
ChatGPTX --test-api \
  --extension <absolute-api-test-suite-package> \
  --user-data-dir=<absolute-temporary-profile>
```

There is no bundled `api-test-suite` fallback.

The isolated local CI run builds the current source components and stages them
in its temporary versioned store before it starts the launcher. This tests
unpublished changes without putting components in the launcher bundle or
requiring their releases to exist before CI can approve them.

## Publication

CI derives release changes from component paths, builds deterministic archives,
writes their SHA-256 values, and publishes version-addressed releases:

```text
chatgpt-api-v<version>
binding-<chatgpt>-v<version>
extension-<id>-v<version>
```

CI downloads each ZIP and checksum sidecar referenced by the schema-3 catalog.
It verifies the actual ZIP and the sidecar against the catalog SHA-256 before
it replaces the stable index asset. GitHub release assets can be changed when
repository release immutability is not enabled. A later asset change does not
silently install: the launcher rejects the ZIP because its SHA-256 is different.
A new binding does not change extension manifests.

This version fetches the index through HTTPS but does not verify a detached
index signature. Archive SHA-256 checks protect against accidental or later
asset changes, but they do not protect against an attacker who can replace the
index and the matching archives. A built-in signing key and CI-held index
signature are a separate security-hardening change.
