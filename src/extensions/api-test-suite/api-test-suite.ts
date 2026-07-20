/**
 * api-test-suite — mechanical end-to-end test extension.
 *
 * Role in the platform (see .agents/skills/manage-platform-api):
 * every public API declared in src/platform/types.d.ts must be exercised
 * here, deterministically, with assertions — tests are the definition of
 * whether a binding in src/platform/bindings/<version>/ is "working".
 *
 * No-op for now: the public API surface is empty, so there is nothing to
 * exercise yet. Tests are added alongside each API change, before the
 * corresponding binding is researched.
 */

export function activate(): void {
  // no-op
}

export function deactivate(): void {
  // no-op
}
