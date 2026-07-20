/**
 * ============================================================================
 * ChatGPT Extension Platform — Stable Public API
 * ============================================================================
 *
 * This file is the ONLY surface extensions are compiled against, and the only
 * contract the platform guarantees across ChatGPT app versions.
 *
 * The app internals (minified, re-scrambled every build) are bridged to this
 * API by version-specific bindings in `src/platform/bindings/<app-version>/`.
 * When the app updates, bindings are regenerated — this file stays stable.
 *
 * ----------------------------------------------------------------------------
 * What belongs here
 * ----------------------------------------------------------------------------
 *
 * - TypeScript declarations for the public extension API: interfaces, types,
 *   functions, events, and constants that extensions may use.
 * - NOTHING else: no implementations, no app-internal types, no DOM or
 *   Electron shapes, no minified identifiers, no re-exports from app code.
 *   If an extension could only implement it by knowing app internals, it does
 *   not belong here.
 *
 * ----------------------------------------------------------------------------
 * Documentation requirements (mandatory)
 * ----------------------------------------------------------------------------
 *
 * Every exported symbol MUST carry a TSDoc block covering:
 *
 * - Intent: what the API is for, in one sentence.
 * - Behavior: exactly when it fires / what it reads / what it mutates.
 * - Parameters and return values: semantics, not just types.
 * - Multi-consumer semantics: how N simultaneous extensions interact through
 *   this API (see "Design principle" below) — ordering guarantees, conflict
 *   resolution, isolation behavior.
 * - `@group`: exactly one category (see below).
 * - `@example`: a minimal, realistic usage.
 *
 * Example of the expected shape (illustrative, not a real API):
 *
 * ```ts
 * /**
 *  * Transform the items shown in the profile menu.
 *  *
 *  * Called with the menu's current item list each time it is rendered;
 *  * return the items to display (keep, add, remove, or reorder freely).
 *  *
 *  * Multi-consumer: transformers chain in extension load order — each
 *  * extension receives the previous extension's output.
 *  *
 *  * @group Menus
 *  * @example
 *  * api.menus.profile.transformItems((items) => [
 *  *   ...items,
 *  *   { id: "my-ext.status", label: "My status", onClick: openStatus },
 *  * ]);
 *  *\/
 * export function transformItems(fn: MenuItemTransformer): Disposable;
 * ```
 *
 * ----------------------------------------------------------------------------
 * API categorization: @group
 * ----------------------------------------------------------------------------
 *
 * Every export is tagged with exactly one `@group`. Groups are the table of
 * contents of this API — keep the set small and stable. Current groups:
 *
 * - `Lifecycle`   — extension activation, deactivation, platform info
 * - `Menus`       — contributing to and transforming app menus
 * - `Conversation`— chat turns, messages, generation lifecycle
 * - `Commands`    — registering and invoking commands
 * - `Windows`     — app windows and surfaces
 * - `Events`      — low-level platform event subscriptions
 *
 * Adding a new group is a deliberate API-design decision (proliferation makes
 * the API surface incoherent); prefer an existing group when in doubt.
 *
 * ----------------------------------------------------------------------------
 * Design principle: every API has N consumers
 * ----------------------------------------------------------------------------
 *
 * Assume multiple extensions use every API at once. Extensions can never
 * address, detect, or depend on each other; the platform defines composition:
 *
 * - State-shaping APIs use transformers: the extension receives the full
 *   current state and returns the new state; transformers chain in extension
 *   load order.
 * - Notification APIs use registration: callbacks run in extension load
 *   order, isolated so one failing extension cannot break the others.
 *
 * ----------------------------------------------------------------------------
 * Stability rules
 * ----------------------------------------------------------------------------
 *
 * - No silent breaking changes. Prefer additive evolution; deprecate with
 *   `@deprecated` (including what to use instead) instead of removing.
 * - All changes to this file follow the process in
 *   `.agents/skills/manage-platform-api/SKILL.md` (explicit request → docs →
 *   tests first → binding → derivation record).
 * ============================================================================
 */

export {};
