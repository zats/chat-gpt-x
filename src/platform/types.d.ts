/**
 * ChatGPT Extension Platform — stable public API.
 *
 * The only surface through which extensions access ChatGPT capabilities. App
 * internals are minified and re-scrambled every build; bindings in
 * `src/platform/bindings/<version>/` bridge them to this API, so this file
 * stays stable across app updates. ChatGPTX-owned utilities live separately
 * under `src/platform/utilities/`. Its semantic version is declared in
 * `src/platform/manifest.json`.
 *
 * Rules for anything exported here:
 * - Declarations only: no implementations, app internals, DOM/Electron
 *   shapes, or minified identifiers.
 * - Full TSDoc required: intent, behavior, parameter semantics,
 *   multi-consumer semantics, `@example`, and exactly one `@group`:
 *   Lifecycle | Menus | Authentication | Appearance | Conversation | Commands | Windows | Events.
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

  /** Current ChatGPT thread lifecycle. */
  readonly threads: ThreadsApi;

  /** The ChatGPT app's authentication lifecycle. */
  readonly authentication: AuthenticationApi;

  /** Native ChatGPT appearance customization. */
  readonly appearance: AppearanceApi;
}

// ---------------------------------------------------------------------------
// Threads
// ---------------------------------------------------------------------------

/**
 * The persisted local or cloud thread currently displayed by ChatGPT.
 *
 * @group Threads
 */
export interface ThreadContext {
  /** ChatGPT's stable identifier for the local or cloud thread. */
  readonly threadId: string;

  /** The thread title currently displayed by ChatGPT. */
  readonly title: string;

  /** The thread's working directory when ChatGPT supplies one. */
  readonly workingDirectory?: string;
}

/**
 * Listener for current-thread changes. `undefined` means no persisted thread
 * is currently displayed.
 *
 * @group Threads
 */
export type CurrentThreadListener = (thread: ThreadContext | undefined) => void;

/**
 * Observes the persisted thread currently displayed by ChatGPT.
 *
 * Multi-consumer: listeners run in registration order with error isolation.
 * Each subscription receives the current snapshot immediately, then every
 * subsequent change. Disposing a subscription stops future delivery.
 *
 * @group Threads
 */
export interface ThreadsApi {
  /** Contributions rendered at the leading edge of persisted thread rows. */
  readonly list: ThreadListApi;

  /** Return the current persisted thread, or `undefined` outside a thread. */
  getCurrent(): ThreadContext | undefined;

  /** Subscribe to the current snapshot and subsequent thread changes. */
  subscribe(listener: CurrentThreadListener): Disposable;
}

/**
 * Adds compact extension-owned views to the leading edge of persisted thread
 * rows in ChatGPT's sidebar.
 *
 * ChatGPT retains ownership of the row, including selection, status, hover
 * actions, keyboard behavior, and accessibility. The platform mounts every
 * contributed view three CSS pixels before the native title without changing
 * the title or action layout. The first registration is closest to the title;
 * later registrations extend outward to the left. Providers are evaluated
 * lazily and cached until their thread context changes or the registration is
 * invalidated.
 *
 * @group Threads
 */
export interface ThreadListApi {
  /**
   * Register one optional leading item for each persisted thread row.
   *
   * `provider` runs synchronously with the row's current thread snapshot.
   * Return `undefined` when the extension has nothing to show. A throwing
   * provider is isolated and contributes no item for that evaluation.
   *
   * Multi-consumer: registrations are evaluated and rendered in extension
   * load and registration order. Each registration owns only its item and
   * cannot inspect or replace another extension's contribution.
   *
   * @example
   * const registration = api.threads.list.registerItem((thread) => {
   *   const color = colors.get(thread.threadId);
   *   if (!color) return undefined;
   *   return {
   *     view: () => {
   *       const bar = document.createElement("span");
   *       bar.style.cssText = `display:block;width:3px;height:16px;border-radius:2px;background:${color}`;
   *       bar.setAttribute("aria-hidden", "true");
   *       return bar;
   *     },
   *   };
   * });
   * registration.invalidate(threadId);
   */
  registerItem(provider: ThreadListItemProvider): ThreadListItemRegistration;
}

/**
 * Produces an extension's leading item for one persisted thread.
 *
 * @group Threads
 */
export type ThreadListItemProvider = (
  thread: ThreadContext,
) => ThreadListItem | undefined;

/**
 * One extension-owned view mounted at ChatGPT's native thread-row leading
 * edge. The factory must return a fresh, non-interactive HTML element for each
 * mount because the same thread can be rendered in more than one list.
 *
 * @group Threads
 */
export interface ThreadListItem {
  readonly view: () => HTMLElement;
}

/**
 * Controls one thread-list item provider.
 *
 * @group Threads
 */
export interface ThreadListItemRegistration extends Disposable {
  /**
   * Clear the provider's cached result and update the affected native rows.
   * Pass a thread id to update one row; omit it to update every observed row.
   * Calling this after disposal has no effect.
   */
  invalidate(threadId?: string): void;
}

// ---------------------------------------------------------------------------
// Appearance
// ---------------------------------------------------------------------------

/**
 * CSS custom properties recognized by the ChatGPT header binding.
 *
 * @group Appearance
 */
export type HeaderCssProperty =
  | "--header-background-color"
  | "--header-foreground-color";

/**
 * Light and dark values for one native header CSS custom property.
 *
 * Both values must be valid CSS colors. ChatGPTX selects the value matching
 * ChatGPT's effective appearance and updates it when that appearance changes.
 *
 * @group Appearance
 */
export interface HeaderThemeColor {
  readonly light: string;
  readonly dark: string;
}

/**
 * A partial set of native header CSS custom-property theme values.
 *
 * An omitted property leaves that property to earlier registrations or
 * ChatGPT's native appearance. An empty set preserves the complete native
 * appearance and can later be replaced through the registration's `update`.
 *
 * @group Appearance
 */
export type HeaderCssProperties = Readonly<
  Partial<Record<HeaderCssProperty, HeaderThemeColor>>
>;

/**
 * The effective registered header colors for ChatGPT's current appearance.
 *
 * @group Appearance
 */
export type ResolvedHeaderCssProperties = Readonly<
  Partial<Record<HeaderCssProperty, string>>
>;

/**
 * A live header appearance contribution.
 *
 * `update` replaces this registration's complete property set without
 * changing its precedence. `dispose` removes it and is idempotent.
 *
 * @group Appearance
 */
export interface HeaderCssPropertiesRegistration extends Disposable {
  /** Replace this registration's properties and update the native headers immediately. */
  update(properties: HeaderCssProperties): void;
}

/**
 * APIs for native ChatGPT appearance customization.
 *
 * @group Appearance
 */
export interface AppearanceApi {
  /** The thread header and side-panel tab header. */
  readonly header: HeaderAppearanceApi;

  /**
   * Return ChatGPT's currently effective light or dark appearance.
   *
   * This reflects the resolved app appearance, including a system-following
   * preference. It is a read-only snapshot and has no cross-extension
   * ordering or conflict semantics.
   *
   * @example
   * const scheme = api.appearance.getColorScheme();
   *
   * @group Appearance
   */
  getColorScheme(): AppearanceColorScheme;

  /**
   * Open ChatGPT's native color picker.
   *
   * Calls are serialized in invocation order across all extensions so only
   * one picker is visible at a time. The picker appears directly below the
   * app header near the invoking pointer. `onChange` receives every valid
   * color produced while the user drags the picker; callback failures are
   * isolated. Clicking outside or pressing Enter confirms the current color.
   * Escape or disposal resolves the result to `undefined`.
   *
   * @example
   * const picker = api.appearance.openColorPicker({
   *   initialColor: "#3A83F7",
   *   title: "Custom color",
   *   onChange: (color) => preview(color),
   * });
   * const color = await picker.result;
   *
   * @group Appearance
   */
  openColorPicker(options: ColorPickerOptions): ColorPickerSession;
}

/**
 * ChatGPT's resolved appearance mode.
 *
 * @group Appearance
 */
export type AppearanceColorScheme = "light" | "dark";

/**
 * Options for one native ChatGPT color-picker session.
 *
 * @group Appearance
 */
export interface ColorPickerOptions {
  /** Initial opaque sRGB color in six-digit hexadecimal form. */
  readonly initialColor: `#${string}`;

  /** Accessible label for the native picker. */
  readonly title: string;

  /** Called synchronously for each valid color selected during interaction. */
  readonly onChange: (color: `#${string}`) => void;
}

/**
 * One queued or visible native color-picker interaction.
 *
 * `dispose()` cancels the session and is idempotent. Queued sessions can be
 * disposed before becoming visible. The result promise settles exactly once.
 *
 * @group Appearance
 */
export interface ColorPickerSession extends Disposable {
  /** Confirmed color, or `undefined` after dismissal or disposal. */
  readonly result: Promise<`#${string}` | undefined>;
}

/**
 * Controls the thread header and side-panel tab header through stable CSS
 * custom properties while preserving ChatGPT's native controls and layout.
 *
 * Both headers react immediately whenever an effective property changes.
 * Background styling keeps the thread header, side-panel tabs, and header
 * controls in their native stacking order. Foreground styling applies to the
 * native title, tab labels, and header buttons; content-panel controls below
 * the tab header are unaffected.
 *
 * Multi-consumer: registrations compose in registration order. For each
 * property, the last active registration that supplies it wins. Updating a
 * registration keeps its original precedence; disposing it reveals the next
 * applicable value or ChatGPT's native appearance.
 *
 * @group Appearance
 */
export interface HeaderAppearanceApi {
  /**
   * Register an updateable header appearance contribution.
   *
   * @param properties light and dark CSS color values keyed by the stable
   * custom properties `--header-background-color` and
   * `--header-foreground-color`; pass an empty object to preserve ChatGPT's
   * native appearance until a later `update`
   * @returns a live registration that can be updated or disposed
   *
   * @example
   * const header = api.appearance.header.registerProperties({
   *   "--header-background-color": {
   *     light: "#dcfce7",
   *     dark: "#064e3b",
   *   },
   *   "--header-foreground-color": {
   *     light: "#052e16",
   *     dark: "white",
   *   },
   * });
   * header.update({}); // Restore ChatGPT's native appearance.
   */
  registerProperties(
    properties: HeaderCssProperties,
  ): HeaderCssPropertiesRegistration;

  /**
   * Return the current effective registered properties.
   *
   * The returned snapshot excludes ChatGPT's native fallback colors and is
   * empty when no registration contributes either property.
   */
  getProperties(): ResolvedHeaderCssProperties;
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
 * Authentication changes are process-global. Calls from concurrent extensions are serialized in invocation order. A sign-in request made while the native sign-in flow is already active focuses that flow. Credential replacement validates and writes the new credentials atomically before completing the app's native post-authentication reload behavior.
 *
 * @group Authentication
 */
export interface AuthenticationApi {
  /**
   * Read the current account and the exact credentials stored in `auth.json` under the resolved Codex home.
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
   * Replace `auth.json` under the resolved Codex home with previously captured credentials and make the app adopt them through its native post-authentication reload flow.
   *
   * The JSON is validated before the current file is changed, and the replacement is atomic. Resolves after ChatGPT's native app server has reinitialized with the replacement and its authentication refresh has been requested.
   *
   * @param authJson exact serialized contents previously returned by {@link getCurrent}
   */
  replaceCurrent(authJson: string): Promise<void>;

  /**
   * Observe successful native sign-in and credential replacement.
   *
   * Listeners run in registration order after ChatGPT's native authentication refresh is requested. For credential replacement, the native app server has already reinitialized with the selected account. A throwing listener is isolated. Dispose the returned handle to stop observing changes.
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

  /** The overflow menu opened from a persisted thread's header. */
  readonly thread: ThreadMenuApi;
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
   * the app's own icon component. `"person"` reuses ChatGPT's Settings →
   * Profile icon. `"plus"` renders ChatGPT's 16-point Lucide Plus icon.
   * Unknown names render the item without an icon and log a warning.
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

/**
 * APIs for the overflow menu opened from the ellipsis button in a persisted
 * local or cloud thread's header. Pending threads without a ChatGPT thread id
 * are outside this surface.
 *
 * @group Menus
 */
export interface ThreadMenuApi {
  /**
   * Transform every persisted local or cloud thread overflow menu.
   *
   * `transform` runs synchronously whenever ChatGPT renders a thread menu.
   * It receives that menu's complete current item list and a snapshot of the
   * owning thread. Return the final list to keep, drop, reorder, replace, or
   * add items. The transformer must be cheap and side-effect-free.
   *
   * Built-in items carry stable ids derived from ChatGPT's semantic
   * identifiers. Returning a descriptor with a built-in id replaces that
   * item and inherits omitted fields, including its native `onClick`.
   * Extension-created ids must be namespaced `"<extension-id>.<name>"`;
   * foreign and duplicate ids are dropped and logged.
   *
   * Multi-consumer: transformers chain in extension load order for each
   * thread. Every transformer receives the previous transformer's output. A
   * throwing transformer is skipped and logged without affecting ChatGPT or
   * other extensions.
   *
   * @param transform mapper from one thread's current items to its final items
   * @returns an idempotent handle that unregisters the transformer
   *
   * @example
   * api.menus.thread.transformItems((items, thread) => {
   *   const firstSeparator = items.findIndex(
   *     (item) => item.kind === "separator",
   *   );
   *   const insertionIndex = firstSeparator < 0 ? items.length : firstSeparator;
   *   const colorItem: ThreadMenuActionItem = {
   *     kind: "action",
   *     id: "thread-colors.color",
   *     label: `Color for ${thread.title}`,
   *     icon: { kind: "native", name: "palette" },
   *     items: [
   *       { kind: "action", id: "thread-colors.default", label: "Default" },
   *       { kind: "action", id: "thread-colors.blue", label: "Blue" },
   *     ],
   *   };
   *   return [
   *     ...items.slice(0, insertionIndex),
   *     colorItem,
   *     ...items.slice(insertionIndex),
   *   ];
   * });
   */
  transformItems(transform: ThreadMenuTransform): Disposable;

  /**
   * Return the latest effective item list observed for `threadId`, including
   * every registered transform in final display order. Returns an empty list
   * until that thread's header has rendered in this app window.
   *
   * @param threadId ChatGPT's stable thread identifier
   */
  getItems(threadId: string): readonly ThreadMenuItem[];

  /**
   * Programmatically activate an effective item for a thread.
   *
   * Leaf actions invoke their isolated `onClick`. Submenu parents open their
   * native flyout when the thread header is mounted. Unknown, disabled, and
   * non-activatable items return `false`.
   *
   * @param threadId ChatGPT's stable thread identifier
   * @param id stable built-in id or extension-namespaced item id
   * @returns whether the item was activated or its flyout was requested
   */
  activateItem(threadId: string, id: string): boolean;
}

/**
 * Mapper from a thread's current overflow-menu items to its final items.
 *
 * @group Menus
 */
export type ThreadMenuTransform = (
  items: readonly ThreadMenuItem[],
  context: ThreadContext,
) => readonly ThreadMenuItem[];

/**
 * An action row or separator in a thread overflow menu.
 *
 * @group Menus
 */
export type ThreadMenuItem = ThreadMenuActionItem | ThreadMenuSeparatorItem;

/**
 * A native ChatGPT thread-menu action row.
 *
 * Leaf rows use ChatGPT's own menu Item component. Rows with `items` use its
 * flyout-submenu component and retain native focus, keyboard navigation,
 * accessibility, hover state, animation, and portal behavior.
 *
 * @group Menus
 */
export interface ThreadMenuActionItem {
  readonly kind: "action";

  /**
   * Unique stable identifier. New items must use
   * `"<extension-id>.<name>"`; built-ins use binding-stable semantic ids.
   */
  readonly id: string;

  /** Visible row label. */
  readonly label: string;

  /** Leading native app icon or theme-aware circular color icon. */
  readonly icon?: ThreadMenuIcon;

  /** Native app icon rendered on the right side of a leaf row. */
  readonly rightIcon?: string;

  /** Secondary text rendered by ChatGPT on a leaf row. */
  readonly subText?: string;

  /** Display-only keyboard shortcut hint on a leaf row. */
  readonly keyboardShortcut?: string;

  /** Disable activation while retaining ChatGPT's native disabled state. */
  readonly disabled?: boolean;

  /**
   * Handler invoked for leaf activation. Built-ins expose their native
   * handler for wrapping. Throwing handlers are isolated and logged. Ignored
   * when `items` contains submenu children.
   */
  readonly onClick?: () => void;

  /**
   * Native flyout children. One nesting level is supported; children may be
   * extension items or built-ins moved from the root list.
   */
  readonly items?: readonly ThreadMenuItem[];

  /** Contributor id, assigned by the platform; `"app"` denotes ChatGPT. */
  readonly origin?: "app" | string;
}

/** Leading visual rendered through ChatGPT's native menu icon slot. */
export type ThreadMenuIcon =
  | ThreadMenuNativeIcon
  | ThreadMenuColorIcon
  | ThreadMenuSvgIcon;

/** A named icon component supplied by ChatGPT. */
export interface ThreadMenuNativeIcon {
  readonly kind: "native";

  /** `"palette"` uses ChatGPT's Lucide Palette icon. */
  readonly name: string;
}

/** A circular color icon that follows ChatGPT's active appearance. */
export interface ThreadMenuColorIcon {
  readonly kind: "color";

  /** CSS color used with ChatGPT's light appearance. */
  readonly light: string;

  /** CSS color used with ChatGPT's dark appearance. */
  readonly dark: string;
}

/** An extension-owned SVG rendered through ChatGPT's native icon slot. */
export interface ThreadMenuSvgIcon {
  readonly kind: "svg";

  /**
   * One complete namespaced `<svg xmlns="http://www.w3.org/2000/svg">`
   * element. It inherits the native menu foreground through `currentColor`;
   * sizing and other SVG presentation remain owned by the supplied markup.
   */
  readonly source: string;
}

/**
 * A native visual separator in a thread overflow menu.
 *
 * @group Menus
 */
export interface ThreadMenuSeparatorItem {
  readonly kind: "separator";

  /** Unique stable or extension-namespaced identifier. */
  readonly id: string;

  /** Contributor id, assigned by the platform; `"app"` denotes ChatGPT. */
  readonly origin?: "app" | string;
}
