/**
 * Renderer binding for ChatGPT 26.715.52143.
 *
 * The binding patches the app's shared JSX runtime and replaces only the
 * profile menu's child list. Items remain inside the app's existing Radix
 * menu root and are rendered with the app's exported Item, Separator, and
 * SubmenuItem components.
 */
(() => {
  "use strict";

  if (window.__CGPTX_HOST__) return;

  const LOG_PREFIX = "[cgptx-host]";
  const CORE_MODULE =
    "./assets/app-initial~avatarOverlayCompositionSurface~index-9fQ9wihu~index-BFCcxPM5~mapbox-gl-DVWlwqb~kppdhley-CabsBVhy.js";
  const MENU_MODULE =
    "./assets/app-initial~artifact-tab-content.electron~notebook-preview-panel~app-main~appgen-settings-p~evbmo86c-BAVWa1vf.js";
  const ICON_MODULE =
    "./assets/app-initial~avatarOverlayCompositionSurface~artifact-tab-content.electron~notebook-preview-~dg0b1kws-BsrA2AI_.js";

  function log(...args) {
    console.log(LOG_PREFIX, ...args);
  }

  function warn(...args) {
    console.warn(LOG_PREFIX, ...args);
  }

  function isElement(value) {
    return (
      value != null &&
      typeof value === "object" &&
      typeof value.$$typeof === "symbol"
    );
  }

  function childrenOf(children) {
    if (children == null || typeof children === "boolean") return [];
    return Array.isArray(children) ? children : [children];
  }

  function messageOf(value) {
    if (!isElement(value)) return null;
    const props = value.props ?? {};
    if (typeof props.id === "string") {
      return { id: props.id, defaultMessage: props.defaultMessage };
    }
    for (const child of childrenOf(props.children)) {
      const found = messageOf(child);
      if (found) return found;
    }
    return null;
  }

  function containsProfileMessage(value, depth = 0) {
    if (depth > 30 || !isElement(value)) return false;
    const props = value.props ?? {};
    if (
      typeof props.id === "string" &&
      (props.id.startsWith("codex.profileDropdown.") ||
        props.id.startsWith("codex.profileFooter."))
    ) {
      return true;
    }
    return childrenOf(props.children).some((child) =>
      containsProfileMessage(child, depth + 1),
    );
  }

  function fiberOf(node) {
    const key = Object.keys(node).find((candidate) =>
      candidate.startsWith("__reactFiber$"),
    );
    return key ? node[key] : null;
  }

  function messageBelowFiber(fiber) {
    let current = fiber;
    for (let hops = 0; current && hops < 30; hops += 1) {
      const props = current.memoizedProps ?? {};
      if (typeof props.id === "string") {
        return { id: props.id, defaultMessage: props.defaultMessage };
      }
      for (const child of childrenOf(props.children)) {
        const found = messageOf(child);
        if (found) return found;
      }
      current = current.child;
    }
    return null;
  }

  // ------------------------------------------------------------------
  // Public model and transformer engine
  // ------------------------------------------------------------------

  const transformers = [];
  const extensions = new Map();
  const safeHandlers = new WeakSet();
  const renderListeners = new Set();
  let renderVersion = 0;
  let builtInCache = Object.freeze([]);
  let builtInViews = new Map();
  let native = null;
  let pendingExpandedId = null;

  function subscribe(listener) {
    renderListeners.add(listener);
    return () => renderListeners.delete(listener);
  }

  function emitChange() {
    renderVersion += 1;
    for (const listener of [...renderListeners]) listener();
  }

  function safeHandler(handler, id) {
    if (typeof handler !== "function" || safeHandlers.has(handler)) {
      return handler;
    }
    const wrapped = () => {
      try {
        handler();
      } catch (error) {
        warn("onClick of " + id + " threw", error);
      }
    };
    safeHandlers.add(wrapped);
    return wrapped;
  }

  function deepItemsById(items, map = new Map()) {
    for (const item of items) {
      map.set(item.id, item);
      if (item.kind === "action" && Array.isArray(item.items)) {
        deepItemsById(item.items, map);
      }
    }
    return map;
  }

  function nestedIds(items, depth = 0, result = new Set()) {
    for (const item of items) {
      if (!item || typeof item !== "object") continue;
      if (depth > 0 && typeof item.id === "string") result.add(item.id);
      if (item.kind === "action" && Array.isArray(item.items)) {
        nestedIds(item.items, depth + 1, result);
      }
    }
    return result;
  }

  function mergeDescriptor(base, override) {
    const merged = { ...base };
    for (const [key, value] of Object.entries(override)) {
      if (key !== "origin" && value !== undefined) merged[key] = value;
    }
    merged.origin = base.origin;
    return merged;
  }

  function normalizeTransformOutput(previous, rawOutput, extId) {
    const previousById = deepItemsById(previous);
    const builtInsById = deepItemsById(builtInCache);
    const moved = nestedIds(rawOutput);
    const seen = new Set();

    function normalizeList(rawItems, depth) {
      const result = [];
      for (const raw of rawItems) {
        if (!raw || typeof raw !== "object") continue;
        if (raw.kind !== "action" && raw.kind !== "separator") continue;
        if (typeof raw.id !== "string" || raw.id.length === 0) continue;
        if (depth === 0 && moved.has(raw.id) && builtInsById.has(raw.id)) {
          continue;
        }
        if (seen.has(raw.id)) {
          warn("dropping duplicate id: " + raw.id);
          continue;
        }

        const existing =
          builtInsById.get(raw.id) ?? previousById.get(raw.id) ?? null;
        if (!existing && !raw.id.startsWith(extId + ".")) {
          warn("dropping item with foreign-namespace id: " + raw.id);
          continue;
        }

        seen.add(raw.id);
        let item = existing
          ? mergeDescriptor(existing, raw)
          : { ...raw, origin: extId };

        if (item.kind === "action") {
          if (depth >= 1 && Array.isArray(item.items)) {
            warn("dropping unsupported nested children from: " + item.id);
            delete item.items;
          } else if (Array.isArray(item.items)) {
            item.items = normalizeList(item.items, depth + 1);
          }

          if (
            typeof raw.onClick === "function" &&
            raw.onClick !== existing?.onClick
          ) {
            item.onClick = safeHandler(raw.onClick, raw.id);
          }
        }
        result.push(item);
      }
      return result;
    }

    return normalizeList(rawOutput, 0);
  }

  function freezeItems(items) {
    return Object.freeze(
      items.map((item) => {
        const frozen =
          item.kind === "action" && Array.isArray(item.items)
            ? { ...item, items: freezeItems(item.items) }
            : { ...item };
        return Object.freeze(frozen);
      }),
    );
  }

  function computeEffectiveItems() {
    let items = builtInCache;
    for (const { extId, transform } of transformers) {
      try {
        const output = transform(items);
        if (!Array.isArray(output)) {
          warn("transformer from " + extId + " returned a non-array; skipped");
          continue;
        }
        items = freezeItems(normalizeTransformOutput(items, output, extId));
      } catch (error) {
        warn("transformer from " + extId + " threw; skipped", error);
      }
    }
    return items;
  }

  function findItemDeep(items, id) {
    for (const item of items) {
      if (item.id === id) return item;
      if (item.kind === "action" && Array.isArray(item.items)) {
        const nested = findItemDeep(item.items, id);
        if (nested) return nested;
      }
    }
    return undefined;
  }

  // ------------------------------------------------------------------
  // Live app anchors and initial native-item capture
  // ------------------------------------------------------------------

  function profileMenuTrigger() {
    return (
      Array.from(document.querySelectorAll("button")).find((button) =>
        button.querySelector("img.rounded-full"),
      ) ?? null
    );
  }

  function isProfileMenuColumn(column) {
    if (column.querySelector("[data-cgptx-profile-menu]")) return true;
    return Array.from(column.querySelectorAll('[role="menuitem"]')).some(
      (row) => {
        const message = messageBelowFiber(fiberOf(row));
        return (
          message?.id.startsWith("codex.profileDropdown.") ||
          message?.id.startsWith("codex.profileFooter.")
        );
      },
    );
  }

  function visibleMenuColumn() {
    const columns = Array.from(
      document.querySelectorAll('[role="menu"], [data-radix-menu-content]'),
    );
    return (
      columns.find(
        (column) => column.offsetHeight > 0 && isProfileMenuColumn(column),
      ) ?? null
    );
  }

  function profileListElement(column) {
    return (
      column.querySelector("[data-cgptx-profile-menu]") ??
      column.firstElementChild
    );
  }

  function isSeparatorBlock(block) {
    return Boolean(
      block.matches?.('[role="separator"]') ||
        block.querySelector?.(
          '[role="separator"], .h-\\[1px\\][class*="bg-token-menu-border"]',
        ),
    );
  }

  function visibleRowInBlock(block) {
    if (
      block.getAttribute?.("role") === "menuitem" &&
      block.offsetHeight > 0
    ) {
      return block;
    }
    return (
      Array.from(block.querySelectorAll?.('[role="menuitem"]') ?? []).find(
        (row) => row.offsetHeight > 0 && getComputedStyle(row).display !== "none",
      ) ?? null
    );
  }

  function itemFiberOf(row) {
    let fiber = fiberOf(row);
    for (let hops = 0; fiber && hops < 40; hops += 1) {
      if (fiber.type === native?.Item) return fiber;
      fiber = fiber.return;
    }
    return null;
  }

  function labelOfRow(row, props) {
    if (props.SubText != null) {
      const label = row.querySelector(
        ".flex.flex-col > span:first-child, .flex-1 .flex.flex-col > span:first-child",
      );
      if (label?.textContent?.trim()) return label.textContent.trim();
    }
    const label = row.querySelector(
      ":scope > .flex > .flex-1, :scope > .flex > span.flex-1",
    );
    if (label?.textContent?.trim()) return label.textContent.trim();
    let text = (row.textContent ?? "").trim();
    if (
      typeof props.keyboardShortcut === "string" &&
      text.endsWith(props.keyboardShortcut)
    ) {
      text = text.slice(0, -props.keyboardShortcut.length).trim();
    }
    return text;
  }

  function stableIdForRow(row, props) {
    const injectedId = row.getAttribute("data-cgptx-id");
    if (
      injectedId &&
      row.getAttribute("data-cgptx-origin") === "app"
    ) {
      return injectedId;
    }

    const message = messageOf(props.children) ?? messageBelowFiber(fiberOf(row));
    if (
      message?.id.startsWith("codex.profileDropdown.") ||
      message?.id.startsWith("codex.profileFooter.")
    ) {
      return message.id;
    }
    if (message?.id === "composer.mode.rateLimit.heading") {
      return "codex.profileDropdown.usageSummary";
    }
    if (row.querySelector("img")) {
      return "codex.profileDropdown.account";
    }
    const label = labelOfRow(row, props);
    if (props.disabled && label.includes("@")) {
      return "codex.profileDropdown.email";
    }
    return null;
  }

  const BUILT_IN_ICON_NAMES = new Map([
    ["codex.profileDropdown.profile", "person"],
    ["codex.profileDropdown.settingsPage", "settings"],
    ["codex.profileDropdown.keyboardShortcuts", "keyboard"],
    ["codex.profileDropdown.logOut", "log-out"],
    ["codex.profileDropdown.usage", "usage"],
    ["codex.profileDropdown.usageSummary", "usage"],
  ]);

  function captureBuiltInsFromOpenMenu() {
    if (!native) return false;
    const column = visibleMenuColumn();
    const list = column ? profileListElement(column) : null;
    if (!list) return false;

    const descriptors = [];
    const views = new Map();
    let separatorIndex = 0;
    for (const block of Array.from(list.children)) {
      if (isSeparatorBlock(block)) {
        const id =
          "codex.profileDropdown.separator-" + separatorIndex.toString();
        separatorIndex += 1;
        descriptors.push({ kind: "separator", id, origin: "app" });
        views.set(id, { kind: "separator", props: {} });
        continue;
      }

      const row = visibleRowInBlock(block);
      const fiber = row ? itemFiberOf(row) : null;
      if (!row || !fiber) continue;
      const props = fiber.memoizedProps ?? {};
      const id = stableIdForRow(row, props);
      if (!id || views.has(id)) continue;
      const handler =
        typeof props.onClick === "function"
          ? props.onClick
          : typeof props.onSelect === "function"
            ? props.onSelect
            : undefined;
      const descriptor = {
        kind: "action",
        id,
        label: labelOfRow(row, props),
        icon: BUILT_IN_ICON_NAMES.get(id),
        rightIcon: undefined,
        subText:
          typeof props.SubText === "string" ? props.SubText : undefined,
        keyboardShortcut:
          typeof props.keyboardShortcut === "string"
            ? props.keyboardShortcut
            : undefined,
        disabled: props.disabled === true,
        onClick: handler,
        origin: "app",
      };
      descriptors.push(descriptor);
      views.set(id, { kind: "action", props: { ...props } });
    }

    if (descriptors.length === 0) return false;
    builtInCache = freezeItems(descriptors);
    builtInViews = views;
    for (const [id, name] of BUILT_IN_ICON_NAMES) {
      const component = views.get(id)?.props?.LeftIcon;
      if (typeof component === "function") {
        native.iconComponents.set(name, component);
      }
    }
    log("captured native profile menu", { items: descriptors.length });
    emitChange();
    return true;
  }

  function pressTrigger(trigger) {
    for (const type of ["pointerdown", "pointerup"]) {
      trigger.dispatchEvent(
        new PointerEvent(type, {
          bubbles: true,
          cancelable: true,
          isPrimary: true,
          button: 0,
          pointerType: "mouse",
        }),
      );
    }
  }

  function closeAnyMenu() {
    document.dispatchEvent(
      new KeyboardEvent("keydown", { key: "Escape", bubbles: true }),
    );
  }

  function warmModel(attempt = 0) {
    if (builtInCache.length > 0) return;
    setTimeout(() => {
      if (captureBuiltInsFromOpenMenu()) {
        requestAnimationFrame(closeAnyMenu);
        return;
      }
      const trigger = profileMenuTrigger();
      if (!trigger) {
        if (attempt < 40) warmModel(attempt + 1);
        return;
      }
      pressTrigger(trigger);
      setTimeout(() => {
        const captured = captureBuiltInsFromOpenMenu();
        if (captured) closeAnyMenu();
        else if (attempt < 40) warmModel(attempt + 1);
      }, 200);
    }, attempt === 0 ? 100 : 250);
  }

  // ------------------------------------------------------------------
  // Native React rendering
  // ------------------------------------------------------------------

  const warnedIcons = new Set();

  function resolveIcon(name) {
    if (!name) return undefined;
    const component = native.iconComponents.get(name);
    if (component) return component;
    if (!warnedIcons.has(name)) {
      warnedIcons.add(name);
      warn("unknown app icon: " + name);
    }
    return undefined;
  }

  function renderAction(item, parent = false) {
    const view = builtInViews.get(item.id);
    const builtIn = deepItemsById(builtInCache).get(item.id);
    const props =
      view?.kind === "action" ? { ...view.props } : {};

    props.children =
      builtIn && item.label === builtIn.label
        ? view.props.children
        : item.label;
    props.disabled = item.disabled === true;
    props["data-cgptx-id"] = item.id;
    props["data-cgptx-origin"] = item.origin ?? "";

    if (item.icon !== undefined) {
      props.LeftIcon = resolveIcon(item.icon);
    } else if (!view) {
      delete props.LeftIcon;
    }

    if (item.rightIcon !== undefined) {
      props.RightIcon = resolveIcon(item.rightIcon);
      delete props.rightIcon;
    } else if (!view) {
      delete props.RightIcon;
      delete props.rightIcon;
    }

    if (item.subText !== undefined) props.SubText = item.subText;
    else if (!view) delete props.SubText;

    if (item.keyboardShortcut !== undefined) {
      props.keyboardShortcut = item.keyboardShortcut;
    } else if (!view) {
      delete props.keyboardShortcut;
    }

    const preservesNativeHandler =
      view &&
      (view.props.onClick === item.onClick ||
        view.props.onSelect === item.onClick);
    if (parent) {
      delete props.onClick;
      delete props.onSelect;
      delete props.href;
    } else if (!preservesNativeHandler) {
      delete props.onClick;
      delete props.onSelect;
      if (typeof item.onClick === "function") props.onClick = item.onClick;
    }

    return native.jsx(native.Item, props, item.id);
  }

  function renderItem(item) {
    if (item.kind === "separator") {
      const view = builtInViews.get(item.id);
      const props = view?.kind === "separator" ? view.props : {};
      return native.jsx(native.Separator, props, item.id);
    }

    if (Array.isArray(item.items) && item.items.length > 0) {
      return native.jsx(
        native.SubmenuItem,
        {
          trigger: renderAction(item, true),
          children: item.items.map(renderItem),
        },
        item.id,
      );
    }
    return renderAction(item);
  }

  function refreshNativeViewsFromTree(value) {
    if (!isElement(value)) return;
    if (value.type === native.Item) {
      const message = messageOf(value.props?.children);
      const id =
        message?.id.startsWith("codex.profileDropdown.") ||
        message?.id.startsWith("codex.profileFooter.")
          ? message.id
          : null;
      if (id && builtInViews.has(id)) {
        builtInViews.set(id, {
          kind: "action",
          props: { ...value.props },
        });
      }
    }
    for (const child of childrenOf(value.props?.children)) {
      refreshNativeViewsFromTree(child);
    }
  }

  function renderProfileTree(tree, applyTransforms = true) {
    if (!isElement(tree)) return tree;
    refreshNativeViewsFromTree(tree);
    const props = {
      ...tree.props,
      "data-cgptx-profile-menu": "",
    };
    if (applyTransforms && builtInCache.length > 0) {
      props.children = computeEffectiveItems().map(renderItem);
    }
    return native.jsx(tree.type, props, tree.key ?? undefined);
  }

  function isProfileRootProps(props) {
    const child = props?.children;
    if (
      child?.props &&
      "onOpenSettings" in child.props &&
      ("accountIcon" in child.props || "identityItems" in child.props)
    ) {
      return true;
    }
    return containsProfileMessage(child);
  }

  function installJsxHook() {
    const { React, jsxRuntime, MenuRoot } = native;
    const originalJsx = jsxRuntime.jsx;
    const originalJsxs = jsxRuntime.jsxs;

    function ProfileComponentBoundary({ child }) {
      React.useSyncExternalStore(
        subscribe,
        () => renderVersion,
        () => renderVersion,
      );
      const [captured, setCaptured] = React.useState(false);
      React.useLayoutEffect(() => {
        captureBuiltInsFromOpenMenu();
        setCaptured(true);
      }, []);
      return renderProfileTree(child.type(child.props), captured);
    }

    function ProfileTreeBoundary({ child }) {
      React.useSyncExternalStore(
        subscribe,
        () => renderVersion,
        () => renderVersion,
      );
      const [captured, setCaptured] = React.useState(false);
      React.useLayoutEffect(() => {
        captureBuiltInsFromOpenMenu();
        setCaptured(true);
      }, []);
      return renderProfileTree(child, captured);
    }

    function wrap(original) {
      return function cgptxJsx(type, props, key) {
        if (
          type === MenuRoot &&
          isProfileRootProps(props) &&
          props.children?.type !== ProfileComponentBoundary &&
          props.children?.type !== ProfileTreeBoundary
        ) {
          const child = props.children;
          const Boundary =
            typeof child?.type === "function"
              ? ProfileComponentBoundary
              : ProfileTreeBoundary;
          props = {
            ...props,
            children: originalJsx(
              Boundary,
              { child },
              "cgptx-profile-boundary",
            ),
          };
        }
        return original(type, props, key);
      };
    }

    jsxRuntime.jsx = wrap(originalJsx);
    jsxRuntime.jsxs = wrap(originalJsxs);
    log("native JSX hook installed");
  }

  async function installNativeBinding() {
    const [coreModule, menuModule, iconModule] = await Promise.all([
      import(CORE_MODULE),
      import(MENU_MODULE),
      import(ICON_MODULE),
    ]);
    iconModule.s();
    const jsxRuntime = coreModule.zt();
    native = {
      React: coreModule.dn(),
      jsxRuntime,
      jsx: jsxRuntime.jsx,
      Item: menuModule.i,
      Separator: menuModule.o,
      SubmenuItem: menuModule.n,
      MenuRoot: menuModule.t,
      iconComponents: new Map([
        ["chevron-right", iconModule.o],
      ]),
    };
    installJsxHook();

    const observer = new MutationObserver(() => {
      queueMicrotask(() => {
        const column = visibleMenuColumn();
        if (!column) return;
        if (builtInCache.length === 0) captureBuiltInsFromOpenMenu();
        if (pendingExpandedId) {
          const row = column.querySelector(
            '[data-cgptx-id="' +
              CSS.escape(pendingExpandedId) +
              '"]',
          );
          if (row) {
            pendingExpandedId = null;
            row.click();
          }
        }
      });
    });
    observer.observe(document.documentElement, {
      childList: true,
      subtree: true,
    });
    warmModel();
  }

  // ------------------------------------------------------------------
  // Public API and extension registry
  // ------------------------------------------------------------------

  function makeProfileMenuApi(extId) {
    return Object.freeze({
      transformItems(transform) {
        if (typeof transform !== "function") {
          throw new TypeError("transformItems requires a function");
        }
        const entry = { extId, transform };
        transformers.push(entry);
        emitChange();
        let disposed = false;
        return Object.freeze({
          dispose() {
            if (disposed) return;
            disposed = true;
            const index = transformers.indexOf(entry);
            if (index >= 0) transformers.splice(index, 1);
            emitChange();
          },
        });
      },

      getItems() {
        return computeEffectiveItems();
      },

      activateItem(id) {
        const item = findItemDeep(computeEffectiveItems(), id);
        if (!item || item.kind !== "action" || item.disabled === true) {
          return false;
        }

        if (Array.isArray(item.items) && item.items.length > 0) {
          const row = visibleMenuColumn()?.querySelector(
            '[data-cgptx-id="' + CSS.escape(id) + '"]',
          );
          if (row) row.click();
          else {
            pendingExpandedId = id;
            const trigger = profileMenuTrigger();
            if (trigger) pressTrigger(trigger);
          }
          return true;
        }

        if (typeof item.onClick !== "function") return false;
        try {
          item.onClick();
        } catch (error) {
          warn("onClick of " + id + " threw", error);
        }
        return true;
      },
    });
  }

  function makeApi(extId) {
    return Object.freeze({
      menus: Object.freeze({
        profile: makeProfileMenuApi(extId),
      }),
    });
  }

  function registerExtension(id, moduleExports) {
    if (extensions.has(id)) return;
    extensions.set(id, { id, exports: moduleExports });
    if (typeof moduleExports?.activate !== "function") return;
    try {
      moduleExports.activate(makeApi(id));
      log("extension activated: " + id);
    } catch (error) {
      warn('extension "' + id + '" failed to activate', error);
    }
  }

  window.__CGPTX_HOST__ = Object.freeze({
    version: "26.715.52143",
    registerExtension,
    _debug: Object.freeze({
      captureBuiltInsFromOpenMenu,
      computeEffectiveItems,
      visibleMenuColumn,
      warmModel,
      getCache: () => builtInCache,
      nativeReady: () => native !== null,
    }),
  });

  log("host installed");
  void installNativeBinding().catch((error) => {
    warn("native binding installation failed", error);
  });
})();
