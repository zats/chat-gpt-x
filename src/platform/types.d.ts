/**
 * ChatGPT Extension Platform — stable public API.
 *
 * The ONLY surface extensions compile against. App internals are minified and
 * re-scrambled every build; bindings in `src/platform/bindings/<version>/`
 * bridge them to this API, so this file stays stable across app updates.
 *
 * Rules for anything exported here:
 * - Declarations only: no implementations, app internals, DOM/Electron
 *   shapes, or minified identifiers.
 * - Full TSDoc required: intent, behavior, parameter semantics,
 *   multi-consumer semantics, `@example`, and exactly one `@group`:
 *   Lifecycle | Menus | Conversation | Commands | Windows | Events.
 * - Designed for N concurrent extensions: transformers for state-shaping
 *   APIs (full state in, new state out, chained in load order), registration
 *   for notifications (invoked in load order, isolated). Extensions never
 *   detect or depend on each other.
 * - No backward compatibility: APIs change in place, one way. No deprecation
 *   shims, aliases, or legacy paths.
 *
 * All changes follow `.agents/skills/manage-platform-api/SKILL.md`.
 */

export {};
