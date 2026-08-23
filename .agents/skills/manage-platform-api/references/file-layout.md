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
      manifest.json             # API-development version and stock download URL used by CI
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
  latest.json                   # schema-3 component catalog, release tags, compatibility, and hashes
```

`src/extensions/build.sh [<extension-id> ...]` is the local build entry point. With no ids it builds all extensions. Each manifest declares `"main": "contents/main.js"`, its semantic `version`, and a `compatibility.chatgptApi` range. The script compiles `<extension-id>.ts` as browser-targeted CommonJS under `${TMPDIR}/ChatGPTX/extension-builds/`; `CHATGPTX_EXTENSION_BUILD_DIR` overrides that root. Development builds enter a launch only through an explicit `--extension` path.

The bindings directory name is the app's version (`CFBundleShortVersionString`), not the binding version. Its manifest owns a semantic `version` and pins exact `chatgpt`, `asarSha256`, and `chatgptApi` values. One source directory holds the latest implementation for that ChatGPT build. A compatible public-API addition increments its binding minor version, a breaking API change increments its binding major version, and a binding-only correction that keeps the same API increments its binding patch version. Each increment creates a new immutable GitHub Release; it never overwrites a published binding version. New ChatGPT versions get new source directories and start at binding version `1.0.0`. `bindings/manifest.json` points to the API-development binding and its exact Sparkle enclosure URL. This binding uses the current ChatGPT API but does not have to be the numerically newest ChatGPT build. A new binding does not change extension versions.

CI classifies changes by these paths. A pull request that changes the API, a binding directory, a public extension directory, or a shared utility consumed by public extensions must update affected component versions and `updates/latest.json`. Internal extensions declare `"private": true` and stay out of the public index. After the tested commit reaches `main`, CI builds version-addressed archives and creates predictable GitHub Releases:

```
chatgpt-api-v<version>
binding-<chatgpt>-v<version>
extension-<id>-v<version>
```

GitHub Releases retain versioned contents. CI then verifies every release and publishes the schema-3 index as `updates/latest.json` on the stable `updates` release. The index keeps every published extension version so the launcher can select the newest version compatible with the binding's API. Source directories contain the latest implementation.

## Runtime state (on the user's machine)

```
<Codex home>/extensions/
  components/
    chatgpt-api/<api-version>/
    bindings/<chatgpt-version>/<binding-version>/
    extensions/<extension-id>/<extension-version>/
  state/<extension-id>/         # extension-owned persistent state
  versions-lock.json            # exact active API, binding, and extension paths
  settings.json                 # persistent extension preferences
```

`settings.json` has an object root. Its `extensions` object maps known IDs to an
extensible record such as `{ "enabled": true }`. The runtime preserves unknown
fields and records for extensions that are not compatible with the selected
API. `versions-lock.json` selects one immutable versioned package path for each
compatible extension. Startup applies current settings. The required
`extensions` manager activates first. All other enabled extensions activate in
lexical ID order. Registration order within each loaded extension remains the
multi-consumer API ordering guarantee.
