# Repository and runtime layout

## Repository

```
src/
  platform/
    types.d.ts                  # THE stable public API. Extensions compile against this only, documented with TSDoc.
    bindings/
      <app-version>/            # e.g. 26.715.31925 — bindings bridging that build's internals to types.d.ts
        DERIVATION.md           # how each binding was found: anchors, locations, failure signatures
        ...                     # binding implementation files
  extensions/
    <extension-id>/             # one folder per extension, TypeScript source
      package.json              # manifest: id, version, name, description, capabilities (VS Code-style)
      ...
    api-test-suite/             # the mechanical e2e test extension — exercises every public API path
```

Built extensions are plain JS: the build emits a runnable `.js` bundle plus the `package.json` manifest so the loader knows what it is loading.

The bindings directory name is the app's version (`CFBundleShortVersionString`) — that string is the version key.

## Runtime state (on the user's machine)

```
~/.codex/extensions/
  settings.json                 # discovered extensions + enabled/disabled flag; only enabled ones load
  <extension-id>/               # per-extension data, scratch, caches
```

Extension **load order** is defined by the platform (settings), and is the ordering guarantee referenced by the multi-consumer API semantics (transformer chains and callback invocation order).
