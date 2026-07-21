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
 * - Native by construction: APIs expose the app's OWN components and
 *   behaviors — never re-implement existing controls. If the app has a
 *   component that does the thing, the binding reuses or exposes it, so
 *   extensions are indistinguishable from first-party UI in look AND
 *   behavior. Replication is a last resort and must be justified.
 * - No backward compatibility: APIs change in place, one way. No deprecation
 *   shims, aliases, or legacy paths.
 *
 * All changes follow `.agents/skills/manage-platform-api/SKILL.md`.
 */

// ---------------------------------------------------------------------------
// Lifecycle
// ---------------------------------------------------------------------------

/**
 * Entry point an extension module must export as `activate`.
 *
 * Called exactly once when the platform loads the extension, receiving the
 * platform API object. The extension registers all of its contributions
 * (menu transformers, event listeners, …) from inside this call.
 *
 * Multi-consumer: every extension gets the same `api` object; contributions
 * are attributed to the extension by the platform.
 *
 * @group Lifecycle
 * @example
 * export function activate(api: PlatformApi) {
 *   api.menus.profile.transformItems((items) => items);
 * }
 */
export type ExtensionActivate = (api: PlatformApi) => void;

/**
 * A handle that undoes a registration.
 *
 * Calling `dispose()` removes the contribution made at registration time
 * (e.g. unregisters a menu transformer). Safe to call more than once.
 *
 * @group Lifecycle
 */
export interface Disposable {
  dispose(): void;
}

// ---------------------------------------------------------------------------
// Menus
// ---------------------------------------------------------------------------

/**
 * The root platform API object passed to {@link ExtensionActivate}.
 *
 * @group Lifecycle
 */
export interface PlatformApi {
  /** Menu contribution APIs. */
  readonly menus: MenusApi;
}

/**
 * APIs for contributing to the app's menus.
 *
 * @group Menus
 */
export interface MenusApi {
  /** The profile menu (the dropdown opened from the avatar/profile button). */
  readonly profile: ProfileMenuApi;
}

/**
 * APIs for the profile menu — the dropdown opened from the avatar/profile
 * button, which today contains the user's account items (Profile, Usage,
 * Settings, Keyboard shortcuts, Log out, …).
 *
 * @group Menus
 */
export interface ProfileMenuApi {
  /**
   * Transform the profile menu's item list.
   *
   * `transform` is called synchronously every time the profile menu is
   * rendered, with the menu's current complete item list (the app's built-in
   * items first, in their current order). Return the final list to display:
   * keep, drop, reorder, or add items freely. It must be cheap and
   * side-effect-free.
   *
   * Built-in (app) items are inspectable but immutable: to keep one, return
   * the same object; to remove it, omit it. They cannot be edited.
   *
   * New items must be one of the item kinds the profile menu supports
   * ({@link ProfileMenuActionItem}, {@link ProfileMenuSeparatorItem}) and
   * their `id` must be namespaced `"<extension-id>.<name>"` — items with
   * foreign or duplicate ids are dropped and logged.
   *
   * Multi-consumer: transformers chain in extension load order — each
   * transformer receives the previous transformer's output, so precedence is
   * deterministic (later extensions see and may rearrange earlier ones'
   * items). A transformer that throws is skipped (the previous output is
   * used) and the error is logged; other extensions are unaffected.
   *
   * @param transform mapper from the current item list to the final list
   * @returns a {@link Disposable} that unregisters this transformer; the
   *   extension's items disappear on the next menu render
   *
   * @example
   * api.menus.profile.transformItems((items) => [
   *   ...items,
   *   { kind: "separator", id: "my-ext.sep" },
   *   {
   *     kind: "action",
   *     id: "my-ext.status",
   *     label: "My status",
   *     icon: "person",
   *     subText: "Online",
   *     onClick: () => openMyStatus(),
   *   },
   * ]);
   */
  transformItems(
    transform: ProfileMenuTransform,
  ): Disposable;
}

/**
 * Mapper from the profile menu's current item list to the final list.
 * See {@link ProfileMenuApi.transformItems}.
 *
 * @group Menus
 */
export type ProfileMenuTransform = (
  items: readonly ProfileMenuItem[],
) => readonly ProfileMenuItem[];

/**
 * An item in the profile menu — either an action row or a separator.
 * These are exactly the item kinds the profile menu supports today.
 *
 * @group Menus
 */
export type ProfileMenuItem = ProfileMenuActionItem | ProfileMenuSeparatorItem;

/**
 * A clickable profile-menu row, rendered by the app's own menu-item
 * component: icon on the left, label, and any of the optional affordances
 * the app's items have (subtext, keyboard shortcut, right icon, disabled
 * state).
 *
 * @group Menus
 */
export interface ProfileMenuActionItem {
  readonly kind: "action";

  /**
   * Unique, extension-namespaced identifier: `"<extension-id>.<name>"`.
   * Items whose id does not start with the contributing extension's id are
   * dropped and logged.
   */
  readonly id: string;

  /** The item's visible label. */
  readonly label: string;

  /**
   * Name of an app icon to render on the left, resolved by the binding to
   * the app's own icon component (kebab-case icon names as used by the app's
   * design system, e.g. `"play-outline"`). Unknown names render the item
   * without an icon and log a warning.
   */
  readonly icon?: string;

  /**
   * Name of an app icon to render on the right edge of the row, resolved
   * like {@link icon}.
   */
  readonly rightIcon?: string;

  /** Secondary text rendered alongside the label, like the app's items. */
  readonly subText?: string;

  /**
   * Keyboard-shortcut hint rendered on the right, display-only (e.g. `"⌘K"`;
   * binding the actual key is not part of this API).
   */
  readonly keyboardShortcut?: string;

  /**
   * When true, the row renders disabled (greyed out, not clickable), like
   * the app's informational items.
   */
  readonly disabled?: boolean;

  /**
   * Invoked when the user activates the row. Runs isolated: a throwing
   * handler is logged and does not affect the app or other extensions.
   */
  readonly onClick?: () => void;

  /**
   * Who contributed the item: `"app"` for built-in items, otherwise the
   * contributing extension's id. Set by the platform — extensions must leave
   * it undefined when creating items.
   */
  readonly origin?: "app" | string;
}

/**
 * A visual separator between profile-menu items, rendered by the app's own
 * separator component.
 *
 * @group Menus
 */
export interface ProfileMenuSeparatorItem {
  readonly kind: "separator";

  /** Unique, extension-namespaced identifier (see {@link ProfileMenuActionItem.id}). */
  readonly id: string;

  /** Set by the platform — see {@link ProfileMenuActionItem.origin}. */
  readonly origin?: "app" | string;
}
