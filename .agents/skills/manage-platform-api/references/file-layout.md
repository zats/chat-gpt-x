# Repository and runtime layout

## Repository

```
src/
  platform/
    types.d.ts                  # THE stable public API. Extensions compile against this only, documented with TSDoc.
    runtime/
      codex-paths.cjs           # canonical Codex home and runtime path resolver
    bindings/
      <app-version>/            # e.g. 26.715.31925 — bindings bridging that build's internals to types.d.ts
        DERIVATION.md           # how each binding was found: anchors, locations, failure signatures
        ...                     # binding implementation files
  extensions/
    build.sh                    # canonical extension build and installation entry point
    <extension-id>/             # one folder per extension, TypeScript source
      package.json              # manifest: id, version, name, description, capabilities (VS Code-style)
      ...
    api-test-suite/             # the mechanical e2e test extension — exercises every public API path
```

`src/extensions/build.sh [<extension-id> ...]` is the only extension build and installation entry point. With no ids it builds all extensions. Each manifest must declare `"main": "contents/main.js"`; the script compiles `<extension-id>.ts` as browser-targeted CommonJS and installs the bundle and manifest in the canonical runtime layout below. The shared `resolveCodexHome()` utility defines Codex home from `CODEX_HOME`, defaulting to `$HOME/.codex`.

The bindings directory name is the app's version (`CFBundleShortVersionString`) — that string is the version key.

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
