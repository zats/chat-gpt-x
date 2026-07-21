/**
 * ChatGPT Extension Platform — stable public API.
 *
 * The only surface through which extensions access ChatGPT capabilities. App
 * internals are minified and re-scrambled every build; bindings in
 * `src/platform/bindings/<version>/` bridge them to this API, so this file
 * stays stable across app updates. ChatGPTX-owned utilities live separately
 * under `src/platform/utilities/`.
 *
 * Rules for anything exported here:
 * - Declarations only: no implementations, app internals, DOM/Electron
 *   shapes, or minified identifiers.
 * - Full TSDoc required: intent, behavior, parameter semantics,
 *   multi-consumer semantics, `@example`, and exactly one `@group`:
 *   Lifecycle | Menus | Authentication | Conversation | Commands | Windows | Events.
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

  /** The ChatGPT app's authentication lifecycle. */
  readonly authentication: AuthenticationApi;
}

// ---------------------------------------------------------------------------
// Authentication
// ---------------------------------------------------------------------------

/**
 * A stable account identity derived from ChatGPT authentication data.
 *
 * @group Authentication
 */
export interface AuthenticationIdentity {
  /** Stable account identifier used to distinguish stored accounts. */
  readonly userId: string;

  /** User-facing account label, preferring email, then account name, then user id. */
  readonly label: string;
}

/**
 * The current account identity and its complete opaque `auth.json` contents.
 *
 * Extensions may persist `authJson` and later pass it unchanged to {@link AuthenticationApi.replaceCurrent}. They must not inspect or modify its private schema; use {@link AuthenticationApi.inspect} for identity metadata.
 *
 * @group Authentication
 */
export interface CurrentAuthentication extends AuthenticationIdentity {
  /** Exact serialized JSON credentials currently stored by ChatGPT. */
  readonly authJson: string;
}

/**
 * APIs for using ChatGPT's native authentication lifecycle.
 *
 * Authentication changes are process-global. Calls from concurrent extensions are serialized in invocation order. A sign-in request made while the native sign-in flow is already active focuses that flow. Credential replacement validates and writes the new credentials atomically before invoking the app's native post-authentication reload behavior.
 *
 * @group Authentication
 */
export interface AuthenticationApi {
  /**
   * Read the current account and the exact credentials stored in `~/.codex/auth.json`.
   *
   * Returns `undefined` when no valid current authentication exists. The returned object is a snapshot; changing it has no effect.
   *
   * @example
   * const current = await api.authentication.getCurrent();
   * if (current) await accountStorage.write(current.userId, current.authJson);
   */
  getCurrent(): Promise<CurrentAuthentication | undefined>;

  /**
   * Derive stable identity metadata from serialized ChatGPT credentials without activating them.
   *
   * Rejects malformed or unsupported credentials. This is the supported way to label stored accounts; extensions must treat the underlying JSON schema as opaque.
   *
   * @param authJson exact serialized contents previously returned by {@link getCurrent}
   */
  inspect(authJson: string): Promise<AuthenticationIdentity>;

  /**
   * Start the app's existing sign-in flow for adding another account.
   *
   * Resolves once the native flow has started. Successful authentication continues through the app's existing post-sign-in lifecycle. Concurrent callers share the active native flow.
   */
  startSignIn(): Promise<void>;

  /**
   * Replace `~/.codex/auth.json` with previously captured credentials and make the app adopt them through its native post-authentication reload flow.
   *
   * The JSON is validated before the current file is changed, and the replacement is atomic. Resolves after the replacement is committed and the reload is scheduled.
   *
   * @param authJson exact serialized contents previously returned by {@link getCurrent}
   */
  replaceCurrent(authJson: string): Promise<void>;

  /**
   * Observe successful native sign-in and credential replacement.
   *
   * Listeners run in registration order after ChatGPT's native authentication refresh is requested. A throwing listener is isolated. Dispose the returned handle to stop observing changes.
   *
   * @param listener callback invoked after the active authentication changes
   * @example
   * const registration = api.authentication.onDidChange(() => refreshAccounts());
   */
  onDidChange(listener: () => void): Disposable;
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
   * keep, drop, reorder, replace, or add items freely. It must be cheap and
   * side-effect-free.
   *
   * Built-in (app) items carry a **stable id** derived from the app's own
   * identifiers (e.g. `"codex.profileDropdown.profile"`), which the binding
   * guarantees across app versions. To keep an app item as-is, return the
   * same object. To modify one, return a descriptor with the same `id` —
   * it replaces the original in place, inheriting any fields you leave
   * undefined (spread the original to modify it); the original `onClick`
   * stays available on the input descriptor for wrapping. Nesting an app
   * item inside another item's `items` moves it there.
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
   *
   * @example
   * // Turn the built-in Profile item into an in-place expanding submenu
   * api.menus.profile.transformItems((items) =>
   *   items.map((item) =>
   *     item.id === "codex.profileDropdown.profile" && item.kind === "action"
   *       ? { ...item, items: [myAccountItem] }
   *       : item,
   *   ),
   * );
   */
  transformItems(
    transform: ProfileMenuTransform,
  ): Disposable;

  /**
   * The profile menu's current effective item list **as displayed in the
   * app** — built-in items first, with all registered transforms applied,
   * every built-in resolved to a descriptor with its stable id.
   *
   * This is the read side of the menu contract: it reflects what the menu
   * currently shows, immediately after transforms are registered or
   * disposed. Extensions use it to inspect the menu; the binding implements
   * it by observing the app's actual menu state, so it stays truthful even
   * when the app changes its own items (sign-in state, plan, feature
   * flags).
   *
   * Multi-consumer: returns the global effective list — every extension's
   * contributions included, in final display order.
   */
  getItems(): readonly ProfileMenuItem[];

  /**
   * Programmatically activate a menu item by id, as if the user had
   * activated its row.
   *
   * For an action item, invokes its `onClick` (isolated, like a real
   * activation). For a submenu parent, expands its children in place and
   * does not fire `onClick`. Unknown or disabled ids are not activated.
   *
   * @param id stable id of a built-in item, or an extension-namespaced id
   * @returns true when the item existed and was activated/expanded
   */
  activateItem(id: string): boolean;
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
   * Unique identifier.
   *
   * Extension-created items: must be namespaced `"<extension-id>.<name>"` —
   * items with foreign or duplicate ids are dropped and logged.
   *
   * Built-in items: a stable identifier derived from the app's own
   * identifiers (e.g. `"codex.profileDropdown.profile"`), guaranteed across
   * app versions by the binding. Use it to locate specific built-in items.
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
   *
   * On built-in items this is the app's original handler — read it to wrap
   * or delegate to the original behavior when replacing an item.
   * Ignored when {@link items} is set (the row expands instead of firing).
   */
  readonly onClick?: () => void;

  /**
   * Child items. When set, the row renders as an in-place expanding submenu
   * parent (chevron on the right) using the app's own submenu component —
   * hover/selection expands the children in place.
   *
   * One level of nesting is supported. Children may be new items or built-in
   * items moved here from elsewhere in the list.
   */
  readonly items?: readonly ProfileMenuItem[];

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
