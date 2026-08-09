# Repository and runtime layout

## Repository

```
src/
  platform/
    manifest.json               # current ChatGPT API semantic version
    types.d.ts                  # THE stable public API. Extensions compile against this only, documented with TSDoc.
    runtime/
      codex-paths.cjs           # canonical Codex home and runtime path resolver
    bindings/
      manifest.json             # current version and stock download URL used by CI
      <app-version>/            # e.g. 26.715.31925 — bindings bridging that build's internals to types.d.ts
        manifest.json           # binding version plus exact chatgpt and chatgptApi versions
        DERIVATION.md           # how each binding was found: anchors, locations, failure signatures
        ...                     # binding implementation files
  extensions/
    build.sh                    # canonical extension build and installation entry point
    <extension-id>/             # one folder per extension, TypeScript source
      package.json              # own version, compatibility ranges, metadata, and capabilities
      ...
    api-test-suite/             # the mechanical e2e test extension — exercises every public API path
updates/
  latest.json                   # schema-v2 component catalog, release tags, compatibility, and hashes
```

`src/extensions/build.sh [<extension-id> ...]` is the local build entry point. With no ids it builds all extensions. Each manifest declares `"main": "contents/main.js"`, its semantic `version`, and `compatibility.chatgpt` plus `compatibility.chatgptApi` ranges. The script compiles `<extension-id>.ts` as browser-targeted CommonJS under `${TMPDIR}/ChatGPTX/extension-builds/`; `CHATGPTX_EXTENSION_BUILD_DIR` overrides that root. Development builds enter a launch only through an explicit `--extension` path.

The bindings directory name is the app's version (`CFBundleShortVersionString`). Its manifest owns a semantic `version` and pins exact `chatgpt` and `chatgptApi` versions. New ChatGPT versions start at binding version `1.0.0`; corrections increment it. `bindings/manifest.json` points to the newest versioned directory and its exact Sparkle enclosure URL. After validating extensions against a new ChatGPT build, expand their `compatibility.chatgpt` ranges and increment their versions.

CI classifies changes by these paths. A pull request that changes the API, a binding directory, a public extension directory, or a shared utility consumed by public extensions must update affected component versions and `updates/latest.json`. Internal extensions declare `"private": true` and stay out of the public index. After the tested commit reaches `main`, CI builds immutable archives and creates predictable GitHub Releases:

```
chatgpt-api-v<version>
binding-<chatgpt>-v<version>
extension-<id>-v<version>
```

GitHub Releases retain versioned contents. CI then verifies every release and publishes the schema-v2 index as `updates/latest.json` on the stable `updates` release. Source directories contain the latest implementation.

## Runtime state (on the user's machine)

```
<Codex home>/extensions/
  components/
    chatgpt-api/<api-version>/
    bindings/<chatgpt-version>/<binding-version>/
    extensions/<extension-id>/   # active package.json and contents
  state/<extension-id>/         # extension-owned persistent state
  versions-lock.json            # exact active API and binding paths
  settings.json                 # every installed extension id and its settings
```

`settings.json` has an object root. Its `extensions` object maps each installed
ID to an extensible record such as `{ "enabled": true }`. The runtime preserves
unknown fields in each record. It derives executable paths and package metadata
from `components/extensions/<extension-id>/package.json`; neither
`settings.json` nor `versions-lock.json` stores extension paths. Startup loads
enabled extensions in lexical ID order. Registration order within each loaded
extension remains the multi-consumer API ordering guarantee.
