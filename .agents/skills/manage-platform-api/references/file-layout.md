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
  latest.json                   # latest component versions and predictable GitHub Release tags
  chatgpt.json                  # latest observed ChatGPT version and binding support
```

`src/extensions/build.sh [<extension-id> ...]` is the local build and installation entry point. With no ids it builds all extensions. Each manifest declares `"main": "contents/main.js"`, its semantic `version`, and `compatibility.chatgpt` plus `compatibility.chatgptApi` ranges. The script compiles `<extension-id>.ts` as browser-targeted CommonJS and installs the bundle and manifest in the canonical runtime layout below. The shared `resolveCodexHome()` utility defines Codex home from `CODEX_HOME`, defaulting to `$HOME/.codex`.

The bindings directory name is the app's version (`CFBundleShortVersionString`). Its manifest owns a semantic `version` and pins exact `chatgpt` and `chatgptApi` versions. New ChatGPT versions start at binding version `1.0.0`; corrections increment it. `bindings/manifest.json` points to the newest versioned directory and its exact Sparkle enclosure URL. After validating extensions against a new ChatGPT build, expand their `compatibility.chatgpt` ranges and increment their versions.

CI classifies changes by these paths. A pull request that changes the API, a binding directory, an extension directory, or a shared utility must update affected component versions and `updates/latest.json`. After the tested commit reaches `main`, CI builds immutable archives and creates predictable GitHub Releases:

```
chatgpt-api-v<version>
binding-<chatgpt>-v<version>
extension-<id>-v<version>
```

GitHub Releases retain versioned contents. Source directories contain the latest implementation.

## Runtime state (on the user's machine)

```
<Codex home>/extensions/
  settings.json                 # global extension enablement, load order, and canonical bundle paths
  <extension-id>/
    package.json                # installed manifest
    contents/
      main.js                   # built extension entry point
    settings.json               # extension-owned persistent settings
    ...                         # other extension-owned data, scratch, and caches
```

Extension **load order** is defined by the platform (settings), and is the ordering guarantee referenced by the multi-consumer API semantics (transformer chains and callback invocation order).
