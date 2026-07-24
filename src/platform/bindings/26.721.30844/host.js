/**
 * Renderer binding for ChatGPT 26.721.30844.
 *
 * The binding patches the app's shared JSX runtime and transforms native
 * profile and thread menu item trees. Items remain inside the app's existing
 * Radix roots and use the app's exported menu components.
 */
(() => {
  "use strict";

  if (window.__CGPTX_HOST__) return;

  const LOG_PREFIX = "[cgptx-host]";
  const APP_INITIAL_MODULE = "./assets/app-initial-BTphDPeq.js";
  const PLUS_ICON_MODULE = "./assets/plus-BgCJgEEs-B8v2ftv6.js";
  const PALETTE_ICON_MODULE = "./assets/palette-lzFbWMQk-D_k6JB4L.js";
  const THREAD_MENU_MODULE = "./assets/thread-overflow-menu-PbzvXmQm.js";
  const AUTH_MODULE = "./assets/chatgpt-desktop-auth-url-nZpLpcWG.js";
  const AUTHENTICATION_RESTART_TIMEOUT_MS = 20_000;
  const HEADER_BACKGROUND_PROPERTY = "--header-background-color";
  const HEADER_FOREGROUND_PROPERTY = "--header-foreground-color";
  const HEADER_PROPERTIES = Object.freeze([
    HEADER_BACKGROUND_PROPERTY,
    HEADER_FOREGROUND_PROPERTY,
  ]);
  const BINDING_STYLE_ID = "cgptx-binding-style";
  const BINDING_STYLE_SOURCE = `
html[data-cgptx-header-background-color] header.app-header-tint {
  background-color: transparent !important;
}
html[data-cgptx-header-background-color] header.app-header-tint > div:nth-of-type(2),
html[data-cgptx-header-background-color] header.app-header-tint > div:nth-of-type(3),
html[data-cgptx-header-background-color] header.app-header-tint > div:nth-of-type(5) {
  background-color: var(--header-background-color) !important;
}
html[data-cgptx-header-background-color]:has(
    aside[data-app-shell-focus-area="right-panel"][style*="opacity: 1"]
  )
  header.app-header-tint > div:nth-of-type(5) {
  background-color: transparent !important;
}
html[data-cgptx-header-background-color] header.app-header-tint > div:nth-of-type(3) {
  box-shadow: -8px 0 var(--header-background-color);
}
html[data-cgptx-header-background-color] aside[data-app-shell-focus-area="right-panel"]
  [data-app-shell-tabs="true"] > .h-toolbar {
  --color-token-main-surface-primary: var(--header-background-color);
}
html[data-cgptx-header-background-color] aside[data-app-shell-focus-area="right-panel"]
  [data-app-shell-tabs="true"] > .h-toolbar,
html[data-cgptx-header-background-color] aside[data-app-shell-focus-area="right-panel"]
  [data-app-shell-tabs="true"] > .h-toolbar [class~="bg-token-main-surface-primary"] {
  background-color: var(--header-background-color) !important;
}
html[data-cgptx-header-background-color] aside[data-app-shell-focus-area="right-panel"]
  [data-app-shell-tab-controller="right"] > [role="button"] {
  --app-shell-tab-background: color-mix(
    in srgb,
    var(--header-foreground-color, var(--color-token-foreground)) 12%,
    var(--header-background-color)
  ) !important;
}
html[data-cgptx-header-foreground-color] header.app-header-tint {
  --color-token-foreground: var(--header-foreground-color);
  --color-token-text-primary: var(--header-foreground-color);
  color: var(--header-foreground-color);
  --color-token-text-secondary: color-mix(
    in srgb,
    var(--header-foreground-color) 76%,
    transparent
  );
  --color-token-text-tertiary: color-mix(
    in srgb,
    var(--header-foreground-color) 72%,
    transparent
  );
}
html[data-cgptx-header-background-color][data-cgptx-header-foreground-color]
  header.app-header-tint button[class~="bg-token-bg-fog"] {
  background-color: color-mix(
    in srgb,
    var(--header-background-color) 75%,
    black
  ) !important;
  border-color: color-mix(
    in srgb,
    var(--header-foreground-color) 28%,
    transparent
  ) !important;
  color: var(--header-foreground-color) !important;
}
html[data-cgptx-header-foreground-color] aside[data-app-shell-focus-area="right-panel"]
  [data-app-shell-tabs="true"] > .h-toolbar [role="tab"] {
  color: var(--header-foreground-color) !important;
}
html[data-cgptx-header-foreground-color] aside[data-app-shell-focus-area="right-panel"]
  [data-app-shell-tabs="true"] > .h-toolbar [role="tab"][aria-selected="false"] {
  color: color-mix(
    in srgb,
    var(--header-foreground-color) 76%,
    transparent
  ) !important;
}
html[data-cgptx-header-foreground-color] aside[data-app-shell-focus-area="right-panel"]
  [data-app-shell-tabs="true"] > .h-toolbar button:not([role="tab"]) {
  color: color-mix(
    in srgb,
    var(--header-foreground-color) 70%,
    transparent
  ) !important;
}
[data-app-action-sidebar-thread-row]
  [data-thread-title-trigger]:has(> [data-cgptx-thread-list-leading-views]) {
  position: relative;
}
html.electron-light [data-cgptx-thread-menu-color-icon] {
  background-color: var(--cgptx-thread-menu-color-light);
}
html.electron-dark [data-cgptx-thread-menu-color-icon] {
  background-color: var(--cgptx-thread-menu-color-dark);
}
`;

  function log(...args) {
    console.log(LOG_PREFIX, ...args);
  }

  function warn(...args) {
    console.warn(LOG_PREFIX, ...args);
  }

  function runtimeRequest(method, parameters = {}) {
    if (!window.__CGPTX_RUNTIME__) {
      throw new Error("ChatGPTX runtime is unavailable");
    }
    return window.__CGPTX_RUNTIME__.request(method, parameters);
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

  function isThreadMessageId(id) {
    return (
      typeof id === "string" &&
      (id.startsWith("threadHeader.") || id.startsWith("sidebarElectron."))
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
  const threadTransformers = [];
  const threadListRegistrations = [];
  const currentThreadListeners = [];
  const authenticationListeners = [];
  const headerPropertyRegistrations = [];
  const colorPickerQueue = [];
  const extensions = new Map();
  const safeHandlers = new WeakSet();
  const renderListeners = new Set();
  const mountedThreadListRows = new WeakMap();
  let renderVersion = 0;
  let builtInCache = Object.freeze([]);
  let builtInViews = new Map();
  const threadModels = new Map();
  let currentThread = undefined;
  let currentThreadClearGeneration = 0;
  let native = null;
  let pendingExpandedId = null;
  let pendingThreadExpanded = null;
  let nestedItemClassName = null;
  let refreshAuthentication = null;
  let openNativeProfile = null;
  let profileMenuHasNativeProfileCallback = null;
  let nativeAppServerRegistry = null;
  let activeSignIn = null;
  let authenticationOperations = Promise.resolve();
  let nativeSignInStartCount = 0;
  let authenticationRefreshCount = 0;
  let authenticationAccountInfoResetCount = 0;
  let authenticationAppServerRestartCount = 0;
  let headerThemeObserver = null;
  let observedHeaderTheme = null;
  let activeColorPicker = null;
  let nextColorPickerId = 1;
  let colorPickerRenderError = null;
  let lastPointerX = innerWidth / 2;

  addEventListener(
    "pointerdown",
    (event) => {
      lastPointerX = event.clientX;
    },
    true,
  );

  function subscribe(listener) {
    renderListeners.add(listener);
    return () => renderListeners.delete(listener);
  }

  function emitChange() {
    renderVersion += 1;
    for (const listener of [...renderListeners]) listener();
    if (native) queueMicrotask(refreshThreadListRows);
  }

  function emitAuthenticationChange() {
    for (const record of [...authenticationListeners]) {
      try {
        record.listener();
      } catch (error) {
        warn(`authentication listener of ${record.extId} threw`, error);
      }
    }
  }

  function sameThreadContext(left, right) {
    return (
      left?.threadId === right?.threadId &&
      left?.title === right?.title &&
      left?.workingDirectory === right?.workingDirectory
    );
  }

  function emitCurrentThreadChange() {
    for (const record of [...currentThreadListeners]) {
      try {
        record.listener(currentThread);
      } catch (error) {
        warn(`current-thread listener of ${record.extId} threw`, error);
      }
    }
  }

  function setCurrentThread(context) {
    currentThreadClearGeneration += 1;
    if (sameThreadContext(currentThread, context)) return;
    currentThread = context;
    emitCurrentThreadChange();
  }

  function clearCurrentThreadAfterUnmount(threadId) {
    const generation = ++currentThreadClearGeneration;
    queueMicrotask(() => {
      if (
        generation !== currentThreadClearGeneration ||
        currentThread?.threadId !== threadId
      ) {
        return;
      }
      currentThread = undefined;
      emitCurrentThreadChange();
    });
  }

  function normalizeHeaderProperties(properties) {
    if (
      !properties ||
      typeof properties !== "object" ||
      Array.isArray(properties)
    ) {
      throw new TypeError("header properties must be an object");
    }
    const normalized = {};
    for (const [property, value] of Object.entries(properties)) {
      if (!HEADER_PROPERTIES.includes(property)) {
        throw new TypeError("unknown header property: " + property);
      }
      if (!value || typeof value !== "object" || Array.isArray(value)) {
        throw new TypeError(property + " must provide light and dark colors");
      }
      const keys = Object.keys(value);
      if (
        keys.length !== 2 ||
        !Object.hasOwn(value, "light") ||
        !Object.hasOwn(value, "dark")
      ) {
        throw new TypeError(property + " must provide only light and dark colors");
      }
      for (const theme of ["light", "dark"]) {
        if (
          typeof value[theme] !== "string" ||
          !CSS.supports("color", value[theme])
        ) {
          throw new TypeError(
            property + "." + theme + " must be a valid CSS color",
          );
        }
      }
      normalized[property] = Object.freeze({
        light: value.light,
        dark: value.dark,
      });
    }
    return Object.freeze(normalized);
  }

  function computeHeaderThemeProperties() {
    const values = new Map();
    for (const registration of headerPropertyRegistrations) {
      for (const property of HEADER_PROPERTIES) {
        if (Object.hasOwn(registration.properties, property)) {
          values.set(property, registration.properties[property]);
        }
      }
    }
    const themed = {};
    for (const property of HEADER_PROPERTIES) {
      if (values.has(property)) themed[property] = values.get(property);
    }
    return Object.freeze(themed);
  }

  function getHeaderTheme() {
    const root = document.documentElement;
    if (root.classList.contains("electron-dark")) return "dark";
    if (root.classList.contains("electron-light")) return "light";
    throw new Error("ChatGPT header theme is unavailable");
  }

  function normalizePickerColor(color) {
    if (typeof color !== "string" || !/^#[0-9a-f]{6}$/i.test(color)) {
      throw new TypeError(
        "color picker colors must be six-digit hexadecimal colors",
      );
    }
    return color.toUpperCase();
  }

  function activateNextColorPicker() {
    if (activeColorPicker || colorPickerQueue.length === 0) return;
    activeColorPicker = colorPickerQueue.shift();
    activeColorPicker.status = "active";
    emitChange();
  }

  function settleColorPicker(request, color) {
    if (request.status === "settled") return;
    if (request === activeColorPicker) activeColorPicker = null;
    else {
      const index = colorPickerQueue.indexOf(request);
      if (index >= 0) colorPickerQueue.splice(index, 1);
    }
    request.status = "settled";
    request.resolve(color);
    emitChange();
    activateNextColorPicker();
  }

  function previewColorPicker(request, color) {
    if (request !== activeColorPicker || request.status !== "active") return;
    const normalized = normalizePickerColor(color);
    request.color = normalized;
    try {
      request.onChange(normalized);
    } catch (error) {
      warn(`color-picker listener of ${request.extId} threw`, error);
    }
  }

  function openColorPicker(extId, options) {
    if (!options || typeof options !== "object" || Array.isArray(options)) {
      throw new TypeError("openColorPicker requires options");
    }
    const initialColor = normalizePickerColor(options.initialColor);
    if (typeof options.title !== "string" || options.title.trim().length === 0) {
      throw new TypeError("color picker title must be a non-empty string");
    }
    if (typeof options.onChange !== "function") {
      throw new TypeError("color picker onChange must be a function");
    }

    let resolve;
    const result = new Promise((settle) => {
      resolve = settle;
    });
    const request = {
      id: nextColorPickerId,
      extId,
      title: options.title,
      initialColor,
      color: initialColor,
      onChange: options.onChange,
      result,
      resolve,
      status: "queued",
      left: Math.min(Math.max(lastPointerX - 100, 8), innerWidth - 208),
    };
    nextColorPickerId += 1;
    colorPickerQueue.push(request);
    activateNextColorPicker();

    let disposed = false;
    return Object.freeze({
      result,
      dispose() {
        if (disposed) return;
        disposed = true;
        settleColorPicker(request, undefined);
      },
    });
  }

  function computeHeaderProperties() {
    const themed = computeHeaderThemeProperties();
    if (Object.keys(themed).length === 0) return Object.freeze({});
    const theme = getHeaderTheme();
    const effective = {};
    for (const property of HEADER_PROPERTIES) {
      if (Object.hasOwn(themed, property)) {
        effective[property] = themed[property][theme];
      }
    }
    return Object.freeze(effective);
  }

  function synchronizeHeaderThemeObserver() {
    const hasProperties = headerPropertyRegistrations.some(
      (registration) => Object.keys(registration.properties).length > 0,
    );
    if (!hasProperties) {
      headerThemeObserver?.disconnect();
      headerThemeObserver = null;
      observedHeaderTheme = null;
      return;
    }
    if (headerThemeObserver) return;
    observedHeaderTheme = getHeaderTheme();
    headerThemeObserver = new MutationObserver(() => {
      const theme = getHeaderTheme();
      if (theme === observedHeaderTheme) return;
      observedHeaderTheme = theme;
      applyHeaderProperties();
    });
    headerThemeObserver.observe(document.documentElement, {
      attributes: true,
      attributeFilter: ["class"],
    });
  }

  function installBindingStyle() {
    if (document.getElementById(BINDING_STYLE_ID)) return;
    const style = document.createElement("style");
    style.id = BINDING_STYLE_ID;
    style.textContent = BINDING_STYLE_SOURCE;
    document.head.append(style);
  }

  function applyHeaderProperties() {
    installBindingStyle();
    synchronizeHeaderThemeObserver();
    const effective = computeHeaderProperties();
    const root = document.documentElement;
    for (const property of HEADER_PROPERTIES) {
      const value = effective[property];
      const attribute =
        property === HEADER_BACKGROUND_PROPERTY
          ? "data-cgptx-header-background-color"
          : "data-cgptx-header-foreground-color";
      if (value === undefined) {
        root.style.removeProperty(property);
        root.removeAttribute(attribute);
      } else {
        root.style.setProperty(property, value);
        root.setAttribute(attribute, "");
      }
    }
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

  function normalizeThreadTransformOutput(model, previous, rawOutput, extId) {
    const previousById = deepItemsById(previous);
    const builtInsById = deepItemsById(model.builtInCache);
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
          warn("dropping duplicate thread-menu id: " + raw.id);
          continue;
        }

        const existing =
          builtInsById.get(raw.id) ?? previousById.get(raw.id) ?? null;
        if (!existing && !raw.id.startsWith(extId + ".")) {
          warn("dropping thread-menu item with foreign-namespace id: " + raw.id);
          continue;
        }

        seen.add(raw.id);
        let item = existing
          ? mergeDescriptor(existing, raw)
          : { ...raw, origin: extId };
        if (item.kind === "action") {
          if (item.icon !== undefined) {
            if (
              !item.icon ||
              typeof item.icon !== "object" ||
              Array.isArray(item.icon)
            ) {
              throw new TypeError("thread-menu icon must be an object");
            }
            if (
              item.icon.kind === "native" &&
              typeof item.icon.name === "string" &&
              item.icon.name.length > 0
            ) {
              item.icon = Object.freeze({
                kind: "native",
                name: item.icon.name,
              });
            } else if (
              item.icon.kind === "color" &&
              typeof item.icon.light === "string" &&
              CSS.supports("color", item.icon.light) &&
              typeof item.icon.dark === "string" &&
              CSS.supports("color", item.icon.dark)
            ) {
              item.icon = Object.freeze({
                kind: "color",
                light: item.icon.light,
                dark: item.icon.dark,
              });
            } else if (
              item.icon.kind === "svg" &&
              typeof item.icon.source === "string"
            ) {
              const document = new DOMParser().parseFromString(
                item.icon.source,
                "image/svg+xml",
              );
              const root = document.documentElement;
              if (
                root.localName !== "svg" ||
                root.namespaceURI !== "http://www.w3.org/2000/svg" ||
                document.querySelector("parsererror")
              ) {
                throw new TypeError(
                  "thread-menu SVG icon must contain one complete SVG element",
                );
              }
              item.icon = Object.freeze({
                kind: "svg",
                source: item.icon.source,
              });
            } else {
              throw new TypeError(
                "thread-menu icon must be native, color, or SVG",
              );
            }
          }
          if (depth >= 1 && Array.isArray(item.items)) {
            warn("dropping unsupported thread-menu nesting from: " + item.id);
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

  function computeEffectiveThreadItems(model) {
    let items = model.builtInCache;
    for (const { extId, transform } of threadTransformers) {
      try {
        const output = transform(items, model.context);
        if (!Array.isArray(output)) {
          warn(
            "thread-menu transformer from " +
              extId +
              " returned a non-array; skipped",
          );
          continue;
        }
        items = freezeItems(
          normalizeThreadTransformOutput(model, items, output, extId),
        );
      } catch (error) {
        warn("thread-menu transformer from " + extId + " threw; skipped", error);
      }
    }
    return items;
  }

  function normalizeThreadListItem(item) {
    if (item === undefined) return undefined;
    if (!item || typeof item !== "object" || Array.isArray(item)) {
      throw new TypeError("thread-list provider must return an item or undefined");
    }
    if (typeof item.view !== "function") {
      throw new TypeError("thread-list item view must be a function");
    }
    return Object.freeze({ view: item.view });
  }

  function computeThreadListItems(context) {
    const items = [];
    for (const registration of threadListRegistrations) {
      let cached = registration.cache.get(context.threadId);
      if (!cached || !sameThreadContext(cached.context, context)) {
        let item;
        try {
          item = normalizeThreadListItem(registration.provider(context));
        } catch (error) {
          warn(
            `thread-list provider of ${registration.extId} threw; skipped`,
            error,
          );
          item = undefined;
        }
        cached = { context, item };
        registration.cache.set(context.threadId, cached);
      }
      if (cached.item) items.push(cached.item);
    }
    return Object.freeze(items);
  }

  function sameThreadListItems(left, right) {
    return (
      left.length === right.length &&
      left.every((item, index) => item === right[index])
    );
  }

  function threadListContextFromRow(row) {
    const scopedId = row.getAttribute("data-app-action-sidebar-thread-id");
    const separator = scopedId?.lastIndexOf(":") ?? -1;
    if (separator < 1 || separator === scopedId.length - 1) return null;
    return Object.freeze({
      threadId: scopedId.slice(separator + 1),
      title: row.getAttribute("data-app-action-sidebar-thread-title") ?? "",
    });
  }

  function removeMountedThreadListRow(row) {
    const record = mountedThreadListRows.get(row);
    if (!record) return;
    record.host.remove();
    mountedThreadListRows.delete(row);
  }

  function renderThreadListRow(row) {
    const context = threadListContextFromRow(row);
    const target = row.querySelector("[data-thread-title-trigger]");
    if (!context || !target) {
      removeMountedThreadListRow(row);
      return;
    }
    const items = computeThreadListItems(context);
    const current = mountedThreadListRows.get(row);
    if (
      current &&
      current.target === target &&
      sameThreadContext(current.context, context) &&
      sameThreadListItems(current.items, items)
    ) {
      return;
    }
    removeMountedThreadListRow(row);
    if (items.length === 0) return;

    const host = document.createElement("span");
    host.className =
      "flex h-4 items-center gap-0.5 overflow-visible";
    host.setAttribute("data-cgptx-thread-list-leading-views", "");
    host.style.cssText =
      "position:absolute;right:calc(100% + 3px);top:50%;" +
      "transform:translateY(-50%);flex-direction:row-reverse;" +
      "pointer-events:none;z-index:1";
    for (const item of items) {
      let element;
      try {
        element = item.view();
      } catch (error) {
        warn("thread-list item view threw; skipped", error);
        continue;
      }
      if (!(element instanceof HTMLElement)) {
        warn("thread-list item view did not return an HTMLElement; skipped");
        continue;
      }
      const itemHost = document.createElement("span");
      itemHost.className = "contents";
      itemHost.setAttribute("data-cgptx-thread-list-item-view", "");
      itemHost.append(element);
      host.append(itemHost);
    }
    if (host.childElementCount === 0) return;
    target.append(host);
    mountedThreadListRows.set(row, { context, host, items, target });
  }

  function refreshThreadListRows() {
    for (const row of document.querySelectorAll(
      "[data-app-action-sidebar-thread-row]",
    )) {
      renderThreadListRow(row);
    }
  }

  function sameThreadDescriptor(left, right) {
    if (!left || !right || left.kind !== right.kind || left.id !== right.id) {
      return false;
    }
    if (left.kind === "separator") return true;
    const fields = [
      "label",
      "rightIcon",
      "subText",
      "keyboardShortcut",
      "disabled",
      "onClick",
      "origin",
    ];
    if (fields.some((field) => left[field] !== right[field])) return false;
    if (left.icon !== right.icon) {
      if (
        !left.icon ||
        !right.icon ||
        left.icon.kind !== right.icon.kind ||
        (left.icon.kind === "native" && left.icon.name !== right.icon.name) ||
        (left.icon.kind === "color" &&
          (left.icon.light !== right.icon.light ||
            left.icon.dark !== right.icon.dark)) ||
        (left.icon.kind === "svg" && left.icon.source !== right.icon.source)
      ) {
        return false;
      }
    }
    const leftItems = Array.isArray(left.items) ? left.items : [];
    const rightItems = Array.isArray(right.items) ? right.items : [];
    return (
      leftItems.length === rightItems.length &&
      leftItems.every((item, index) =>
        sameThreadDescriptor(item, rightItems[index]),
      )
    );
  }

  // ------------------------------------------------------------------
  // Authentication model and native lifecycle
  // ------------------------------------------------------------------

  function decodeTokenClaims(token) {
    if (typeof token !== "string") return null;
    const parts = token.split(".");
    if (parts.length < 2) return null;
    const base64 = parts[1].replaceAll("-", "+").replaceAll("_", "/");
    const padded = base64.padEnd(Math.ceil(base64.length / 4) * 4, "=");
    try {
      const bytes = Uint8Array.from(atob(padded), (character) =>
        character.charCodeAt(0),
      );
      const claims = JSON.parse(new TextDecoder().decode(bytes));
      return claims && typeof claims === "object" ? claims : null;
    } catch {
      return null;
    }
  }

  function nonEmptyString(...values) {
    return values.find(
      (value) => typeof value === "string" && value.trim().length > 0,
    );
  }

  function inspectAuthentication(authJson) {
    if (typeof authJson !== "string") {
      throw new TypeError("authJson must be a string");
    }
    let authentication;
    try {
      authentication = JSON.parse(authJson);
    } catch {
      throw new TypeError("authJson is not valid JSON");
    }
    if (
      !authentication ||
      typeof authentication !== "object" ||
      Array.isArray(authentication)
    ) {
      throw new TypeError("authJson must contain a JSON object");
    }

    const tokens = authentication.tokens;
    const idClaims = decodeTokenClaims(tokens?.id_token);
    const accessClaims = decodeTokenClaims(tokens?.access_token);
    const idAuthentication = idClaims?.["https://api.openai.com/auth"];
    const accessAuthentication =
      accessClaims?.["https://api.openai.com/auth"];
    const accessProfile = accessClaims?.["https://api.openai.com/profile"];
    const userId = nonEmptyString(
      idAuthentication?.chatgpt_user_id,
      idAuthentication?.user_id,
      accessAuthentication?.chatgpt_user_id,
      accessAuthentication?.chatgpt_account_user_id,
      accessAuthentication?.user_id,
      idClaims?.sub,
      accessClaims?.sub,
    );
    if (!userId) {
      throw new TypeError("authJson does not contain a ChatGPT user id");
    }
    const label = nonEmptyString(
      idClaims?.email,
      accessProfile?.email,
      idClaims?.name,
      accessProfile?.name,
      userId,
    );
    return Object.freeze({ userId, label });
  }

  function enqueueAuthenticationOperation(operation) {
    const queued = authenticationOperations.then(operation, operation);
    authenticationOperations = queued.then(
      () => undefined,
      () => undefined,
    );
    return queued;
  }

  function openSignInUrl(authUrl) {
    const href = native.decorateAuthUrl({
      authUrl,
      useDesktopAuth: false,
      useStreamlinedLoginUx: false,
    });
    const opened = native.openInBrowser({
      href,
      initiator: "open_in_browser_bridge",
      openTarget: "external-browser",
    });
    if (!opened) throw new Error("ChatGPT declined to open its sign-in URL");
  }

  async function startNativeSignIn() {
    if (!native?.startChatGptSignIn || !native?.openInBrowser) {
      throw new Error("ChatGPT authentication binding is unavailable");
    }
    if (activeSignIn) {
      openSignInUrl(activeSignIn.authUrl);
      return;
    }

    const abortController = new AbortController();
    const attempt = await native.startChatGptSignIn({
      signal: abortController.signal,
    });
    if (typeof attempt?.authUrl !== "string" || !attempt.authUrl) {
      abortController.abort();
      throw new Error("ChatGPT sign-in did not provide an authorization URL");
    }
    activeSignIn = {
      abortController,
      authUrl: attempt.authUrl,
    };
    nativeSignInStartCount += 1;
    openSignInUrl(attempt.authUrl);
    void attempt.completion
      .then((result) => {
        if (!result?.success) {
          warn("native ChatGPT sign-in failed", result?.error);
          return;
        }
        if (typeof refreshAuthentication === "function") {
          refreshAuthentication();
          emitAuthenticationChange();
        } else {
          warn("native post-authentication refresh is unavailable");
        }
      })
      .catch((error) => warn("native ChatGPT sign-in failed", error))
      .finally(() => {
        activeSignIn = null;
      });
  }

  async function replaceCurrentAuthentication(authJson) {
    inspectAuthentication(authJson);
    if (!native?.messageBus || typeof refreshAuthentication !== "function") {
      throw new Error("ChatGPT post-authentication refresh is unavailable");
    }
    await runtimeRequest("authentication.replace-current", { authJson });
    await new Promise((resolve, reject) => {
      let unsubscribe;
      const timeout = setTimeout(() => {
        unsubscribe?.();
        reject(
          new Error(
            "ChatGPT app server did not restart after authentication changed",
          ),
        );
      }, AUTHENTICATION_RESTART_TIMEOUT_MS);
      unsubscribe = native.messageBus.subscribe(
        "codex-app-server-initialized",
        (message) => {
          if (message?.hostId !== "local") return;
          clearTimeout(timeout);
          unsubscribe();
          authenticationAppServerRestartCount += 1;
          try {
            refreshAuthentication();
            emitAuthenticationChange();
            resolve();
          } catch (error) {
            reject(error);
          }
        },
      );
      try {
        native.messageBus.dispatchMessage("codex-app-server-restart", {
          hostId: "local",
        });
      } catch (error) {
        clearTimeout(timeout);
        unsubscribe();
        reject(error);
      }
    });
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

  function submenuFiberAbove(fiber) {
    let current = fiber?.return;
    for (let hops = 0; current && hops < 20; hops += 1) {
      if (current.type === native?.SubmenuItem) return current;
      current = current.return;
    }
    return null;
  }

  function nativeItemPropsInTree(value) {
    if (Array.isArray(value)) {
      for (const child of value) {
        const found = nativeItemPropsInTree(child);
        if (found) return found;
      }
      return null;
    }
    if (!isElement(value)) return null;
    if (value.type === native?.Item) return value.props ?? null;
    return nativeItemPropsInTree(value.props?.children);
  }

  function publicSelectAction(handler) {
    return () => handler(new Event("select", { cancelable: true }));
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
      const submenuFiber = submenuFiberAbove(fiber);
      const id = stableIdForRow(row, props);
      if (!id || views.has(id)) continue;
      const submenuProps = submenuFiber
        ? { ...submenuFiber.memoizedProps }
        : undefined;
      if (id === "codex.profileDropdown.usageSummary" && submenuProps) {
        const nestedProps = nativeItemPropsInTree(submenuProps.children);
        if (typeof nestedProps?.className === "string") {
          nestedItemClassName = nestedProps.className;
        }
      }
      const nativeHandler =
        id === "codex.profileDropdown.account" &&
        typeof openNativeProfile === "function"
          ? () => openNativeProfile()
          : submenuFiber
          ? undefined
          : id === "codex.profileDropdown.account" &&
              typeof props.onSelect === "function"
            ? props.onSelect
            : typeof props.onClick === "function"
              ? props.onClick
              : typeof props.onSelect === "function"
                ? props.onSelect
                : undefined;
      const handler =
        nativeHandler === props.onSelect
          ? publicSelectAction(nativeHandler)
          : nativeHandler;
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
      views.set(id, {
        kind: "action",
        props: { ...props },
        submenuProps,
      });
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

  function fiberPropAbove(node, property) {
    let fiber = fiberOf(node);
    for (let hops = 0; fiber && hops < 40; hops += 1) {
      if (fiber.memoizedProps?.[property] !== undefined) {
        return fiber.memoizedProps[property];
      }
      fiber = fiber.return;
    }
    return undefined;
  }

  function threadIdForTrigger(trigger) {
    return (
      trigger?.getAttribute?.("data-cgptx-thread-id") ??
      fiberPropAbove(trigger, "data-cgptx-thread-id") ??
      null
    );
  }

  function threadMenuTrigger(threadId) {
    return (
      Array.from(document.querySelectorAll("button")).find(
        (button) => threadIdForTrigger(button) === threadId,
      ) ?? null
    );
  }

  function visibleThreadMenuColumn(threadId) {
    const columns = Array.from(document.querySelectorAll('[role="menu"]'));
    return (
      columns.find((column) => {
        if (column.offsetHeight === 0) return false;
        const labelledBy = column.getAttribute("aria-labelledby");
        const trigger = labelledBy ? document.getElementById(labelledBy) : null;
        if (threadIdForTrigger(trigger) === threadId) return true;
        return Array.from(column.querySelectorAll('[role="menuitem"]')).some(
          (row) =>
            row.getAttribute("data-cgptx-thread-id") === threadId ||
            fiberPropAbove(row, "data-cgptx-thread-id") === threadId,
        );
      }) ?? null
    );
  }

  function threadRowById(column, id) {
    return (
      Array.from(column?.querySelectorAll?.('[role="menuitem"]') ?? []).find(
        (row) =>
          row.getAttribute("data-cgptx-id") === id ||
          fiberPropAbove(row, "data-cgptx-id") === id,
      ) ?? null
    );
  }

  function requestThreadFlyout(row) {
    for (const type of ["pointermove", "pointerenter"]) {
      row.dispatchEvent(
        new PointerEvent(type, {
          bubbles: true,
          cancelable: true,
          isPrimary: true,
          pointerType: "mouse",
        }),
      );
    }
    row.click();
  }

  function dynamicThreadCacheSignature(cache) {
    return JSON.stringify(
      Array.from(cache.entries()).map(([index, entry]) => ({
        index,
        id: entry.descriptor.id,
        label: entry.descriptor.label,
        disabled: entry.descriptor.disabled,
        keyboardShortcut: entry.descriptor.keyboardShortcut,
      })),
    );
  }

  function captureDynamicThreadItemsFromOpenMenus() {
    if (!native) return false;
    let changed = false;
    for (const model of threadModels.values()) {
      const column = visibleThreadMenuColumn(model.context.threadId);
      if (!column || model.opaqueCount === 0) continue;
      const known = deepItemsById(model.builtInCache);
      const dynamic = [];
      for (const row of Array.from(column.querySelectorAll('[role="menuitem"]'))) {
        if (row.closest('[role="menu"]') !== column) continue;
        const fiber = itemFiberOf(row);
        if (!fiber) continue;
        const props = fiber.memoizedProps ?? {};
        const message = messageOf(props.children) ?? messageBelowFiber(fiberOf(row));
        if (
          !isThreadMessageId(message?.id) ||
          (known.has(message.id) && !model.opaqueIds.has(message.id))
        ) {
          continue;
        }
        const nativeHandler =
          typeof props.onClick === "function"
            ? props.onClick
            : typeof props.onSelect === "function"
              ? props.onSelect
              : undefined;
        dynamic.push({
          descriptor: {
            kind: "action",
            id: message.id,
            label: labelOfRow(row, props),
            subText:
              typeof props.SubText === "string" ? props.SubText : undefined,
            keyboardShortcut:
              typeof props.keyboardShortcut === "string"
                ? props.keyboardShortcut
                : undefined,
            disabled: props.disabled === true,
            onClick:
              nativeHandler === props.onSelect
                ? publicSelectAction(nativeHandler)
                : nativeHandler,
            origin: "app",
          },
          props: { ...props },
        });
      }

      const nextCache = new Map();
      for (
        let index = 0;
        index < model.opaqueCount && index < dynamic.length;
        index += 1
      ) {
        nextCache.set(index, dynamic[index]);
      }
      if (
        dynamicThreadCacheSignature(nextCache) !==
        dynamicThreadCacheSignature(model.opaqueCache)
      ) {
        changed = true;
      }
      model.opaqueCache = nextCache;
    }
    if (changed) emitChange();
    return changed;
  }

  // ------------------------------------------------------------------
  // Native React rendering
  // ------------------------------------------------------------------

  const warnedIcons = new Set();
  const nativeMenuNoop = () => {};

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

  function resolveThreadIcon(icon) {
    if (icon.kind === "native") return resolveIcon(icon.name);
    if (icon.kind === "svg") {
      return function ThreadMenuSvgIcon({ className }) {
        return native.jsx("span", {
          "aria-hidden": true,
          "data-cgptx-thread-menu-svg-icon": "",
          className: `${className ?? ""} inline-flex items-center justify-center`,
          dangerouslySetInnerHTML: { __html: icon.source },
        });
      };
    }
    installBindingStyle();
    return function ThreadMenuColorIcon() {
      return native.jsx("span", {
        "aria-hidden": true,
        "data-cgptx-thread-menu-color-icon": "",
        className: "block size-3 rounded-full",
        style: {
          "--cgptx-thread-menu-color-light": icon.light,
          "--cgptx-thread-menu-color-dark": icon.dark,
        },
      });
    };
  }

  function renderAction(item, parent = false, nested = false) {
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
    if (nested && nestedItemClassName) props.className = nestedItemClassName;

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
      view && builtIn?.onClick === item.onClick;
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

  function renderItem(item, nested = false) {
    if (item.kind === "separator") {
      const view = builtInViews.get(item.id);
      const props = view?.kind === "separator" ? view.props : {};
      return native.jsx(native.Separator, props, item.id);
    }

    const view = builtInViews.get(item.id);
    const hasExplicitItems = Object.prototype.hasOwnProperty.call(
      item,
      "items",
    );
    const explicitItems = Array.isArray(item.items) ? item.items : [];
    const submenuProps =
      !hasExplicitItems && view?.kind === "action"
        ? view.submenuProps
        : undefined;
    if (explicitItems.length > 0 || submenuProps) {
      return native.jsx(
        native.SubmenuItem,
        {
          ...submenuProps,
          trigger: renderAction(item, true),
          children:
            explicitItems.length > 0
              ? explicitItems.map((child) => renderItem(child, true))
              : submenuProps.children,
        },
        item.id,
      );
    }
    return renderAction(item, false, nested);
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
        const previous = builtInViews.get(id);
        builtInViews.set(id, {
          kind: "action",
          props: { ...value.props },
          submenuProps: previous?.submenuProps,
        });
      }
    }
    for (const child of childrenOf(value.props?.children)) {
      refreshNativeViewsFromTree(child);
    }
  }

  function refreshNativeAccountView(profileProps) {
    const view = builtInViews.get("codex.profileDropdown.account");
    if (view?.kind !== "action") return;
    const accountIcon = profileProps?.accountIcon;
    const displayName = profileProps?.displayName;
    builtInViews.set("codex.profileDropdown.account", {
      ...view,
      props: {
        ...view.props,
        ...(accountIcon ? { LeftIcon: () => accountIcon } : {}),
        ...(typeof displayName === "string" ? { children: displayName } : {}),
      },
    });
  }

  function renderProfileTree(tree, applyTransforms = true, profileProps) {
    if (!isElement(tree)) return tree;
    refreshNativeViewsFromTree(tree);
    refreshNativeAccountView(profileProps);
    const props = {
      ...tree.props,
      "data-cgptx-profile-menu": "",
    };
    if (applyTransforms && builtInCache.length > 0) {
      props.children = computeEffectiveItems().map((item) => renderItem(item));
    }
    return native.jsx(tree.type, props, tree.key ?? undefined);
  }

  function threadActionDescriptor(element, id, items) {
    const props = element.props ?? {};
    const nativeHandler =
      typeof props.onClick === "function"
        ? props.onClick
        : typeof props.onSelect === "function"
          ? props.onSelect
          : undefined;
    return {
      kind: "action",
      id,
      label:
        messageOf(props.children)?.defaultMessage ??
        messageOf(props.label)?.defaultMessage ??
        (typeof props.children === "string"
          ? props.children
          : typeof props.label === "string"
            ? props.label
            : id),
      subText: typeof props.SubText === "string" ? props.SubText : undefined,
      keyboardShortcut:
        typeof props.keyboardShortcut === "string"
          ? props.keyboardShortcut
          : undefined,
      disabled: props.disabled === true,
      onClick:
        nativeHandler === props.onSelect
          ? publicSelectAction(nativeHandler)
          : nativeHandler,
      ...(items ? { items } : {}),
      origin: "app",
    };
  }

  function collectThreadSourceEntries(
    value,
    model,
    entries,
    views,
    state,
    depth = 0,
  ) {
    if (Array.isArray(value)) {
      for (const child of value) {
        collectThreadSourceEntries(
          child,
          model,
          entries,
          views,
          state,
          depth,
        );
      }
      return;
    }
    if (!isElement(value)) return;
    const props = value.props ?? {};

    if (value.type === native.Item) {
      const message = messageOf(props.children);
      if (!isThreadMessageId(message?.id)) return;
      const descriptor = threadActionDescriptor(value, message.id);
      entries.push({ kind: "item", descriptor });
      views.set(message.id, { kind: "action", props: { ...props } });
      return;
    }

    if (value.type === native.Separator) {
      const id = "threadHeader.separator-" + state.separatorIndex.toString();
      state.separatorIndex += 1;
      const descriptor = { kind: "separator", id, origin: "app" };
      entries.push({ kind: "item", descriptor });
      views.set(id, { kind: "separator", props: { ...props } });
      return;
    }

    if (value.type === native.FlyoutSubmenuItem) {
      const message = messageOf(props.label);
      if (!isThreadMessageId(message?.id)) return;
      const childEntries = [];
      collectThreadSourceEntries(
        props.children,
        model,
        childEntries,
        views,
        state,
        depth + 1,
      );
      const descriptor = threadActionDescriptor(
        value,
        message.id,
        childEntries
          .filter((entry) => entry.kind === "item")
          .map((entry) => entry.descriptor),
      );
      entries.push({ kind: "item", descriptor });
      views.set(message.id, { kind: "flyout", props: { ...props } });
      return;
    }

    if (value.type === native.React.Fragment) {
      collectThreadSourceEntries(
        props.children,
        model,
        entries,
        views,
        state,
        depth,
      );
      return;
    }

    if (depth === 0) {
      const opaqueIndex = state.opaqueCount;
      state.opaqueCount += 1;
      const cached = model.opaqueCache.get(opaqueIndex);
      if (cached) {
        entries.push({ kind: "item", descriptor: cached.descriptor });
        views.set(cached.descriptor.id, {
          kind: "action",
          props: cached.props,
          sourceElement: value,
          opaque: true,
        });
        state.opaqueIds.add(cached.descriptor.id);
      } else {
        entries.push({ kind: "opaque", element: value });
      }
    }
  }

  function updateThreadModel(context, children) {
    let model = threadModels.get(context.threadId);
    if (!model) {
      model = {
        context,
        builtInCache: Object.freeze([]),
        builtInViews: new Map(),
        opaqueCache: new Map(),
        opaqueCount: 0,
        opaqueIds: new Set(),
        unboundOpaque: [],
      };
      threadModels.set(context.threadId, model);
    }
    model.context = context;
    const entries = [];
    const views = new Map();
    const state = {
      separatorIndex: 0,
      opaqueCount: 0,
      opaqueIds: new Set(),
    };
    collectThreadSourceEntries(children, model, entries, views, state);
    model.builtInCache = freezeItems(
      entries
        .filter((entry) => entry.kind === "item")
        .map((entry) => entry.descriptor),
    );
    model.builtInViews = views;
    model.opaqueCount = state.opaqueCount;
    model.opaqueIds = state.opaqueIds;
    model.unboundOpaque = entries.flatMap((entry, index) => {
      if (entry.kind !== "opaque") return [];
      const next = entries.slice(index + 1).find((candidate) =>
        candidate.kind === "item",
      );
      return [{ element: entry.element, beforeId: next?.descriptor.id }];
    });
    return model;
  }

  function renderThreadLeaf(model, item) {
    const view = model.builtInViews.get(item.id);
    const builtIn = deepItemsById(model.builtInCache).get(item.id);
    if (
      view?.opaque &&
      view.sourceElement &&
      sameThreadDescriptor(item, builtIn)
    ) {
      return view.sourceElement;
    }

    const props = view?.kind === "action" ? { ...view.props } : {};
    props.children =
      builtIn && item.label === builtIn.label
        ? view.props.children
        : item.label;
    props.disabled = item.disabled === true;
    props["data-cgptx-id"] = item.id;
    props["data-cgptx-origin"] = item.origin ?? "";
    props["data-cgptx-thread-id"] = model.context.threadId;

    if (item.icon !== undefined) props.LeftIcon = resolveThreadIcon(item.icon);
    else if (!view) delete props.LeftIcon;
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

    const preservesNativeHandler = view && builtIn?.onClick === item.onClick;
    if (!preservesNativeHandler) {
      delete props.onClick;
      delete props.onSelect;
      if (typeof item.onClick === "function") props.onClick = item.onClick;
      else if (!view && item.disabled !== true) props.onSelect = nativeMenuNoop;
    }
    return native.jsx(native.Item, props, item.id);
  }

  function renderThreadItem(model, item) {
    if (item.kind === "separator") {
      const view = model.builtInViews.get(item.id);
      return native.jsx(
        native.Separator,
        view?.kind === "separator" ? view.props : {},
        item.id,
      );
    }

    const explicitItems = Array.isArray(item.items) ? item.items : [];
    if (explicitItems.length > 0) {
      const view = model.builtInViews.get(item.id);
      const builtIn = deepItemsById(model.builtInCache).get(item.id);
      const props = view?.kind === "flyout" ? { ...view.props } : {};
      props.label =
        builtIn && item.label === builtIn.label ? view.props.label : item.label;
      props.disabled = item.disabled === true;
      props["data-cgptx-id"] = item.id;
      props["data-cgptx-origin"] = item.origin ?? "";
      props["data-cgptx-thread-id"] = model.context.threadId;
      if (item.icon !== undefined) props.LeftIcon = resolveThreadIcon(item.icon);
      else if (!view) delete props.LeftIcon;
      delete props.onSelect;
      props.children = explicitItems.map((child) =>
        renderThreadItem(model, child),
      );
      return native.jsx(native.FlyoutSubmenuItem, props, item.id);
    }
    return renderThreadLeaf(model, item);
  }

  function renderThreadMenuRoot(tree, context) {
    const model = updateThreadModel(context, tree.props.children);
    const effective = computeEffectiveThreadItems(model);
    const rendered = effective.map((item) => ({
      id: item.id,
      element: renderThreadItem(model, item),
    }));
    for (const opaque of model.unboundOpaque) {
      const index = rendered.findIndex((entry) => entry.id === opaque.beforeId);
      rendered.splice(index < 0 ? rendered.length : index, 0, {
        id: null,
        element: opaque.element,
      });
    }
    const trigger = tree.props.triggerButton;
    const triggerButton = isElement(trigger)
      ? native.jsx(
          trigger.type,
          {
            ...trigger.props,
            "data-cgptx-thread-id": context.threadId,
          },
          trigger.key ?? undefined,
        )
      : trigger;
    return native.jsx(
      tree.type,
      {
        ...tree.props,
        triggerButton,
        children: rendered.map((entry) => entry.element),
      },
      tree.key ?? undefined,
    );
  }

  function renderThreadTree(value, context) {
    if (Array.isArray(value)) {
      return value.map((child) => renderThreadTree(child, context));
    }
    if (!isElement(value)) return value;
    if (value.type === native.MenuRoot) {
      return renderThreadMenuRoot(value, context);
    }
    if (value.props?.children === undefined) return value;
    const children = renderThreadTree(value.props.children, context);
    if (children === value.props.children) return value;
    return native.jsx(
      value.type,
      { ...value.props, children },
      value.key ?? undefined,
    );
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

  function ColorPickerSurface({ request }) {
    const { React } = native;
    const [color, setColor] = React.useState(request.initialColor);
    const surface = React.useRef(null);
    const changeColor = (nextColor) => {
      const normalized = normalizePickerColor(nextColor);
      setColor(normalized);
      previewColorPicker(request, normalized);
    };
    React.useEffect(() => {
      const finishOutside = (event) => {
        if (!surface.current.contains(event.target)) {
          settleColorPicker(request, request.color);
        }
      };
      const finishFromKeyboard = (event) => {
        if (event.key !== "Escape" && event.key !== "Enter") return;
        event.preventDefault();
        event.stopPropagation();
        settleColorPicker(
          request,
          event.key === "Escape" ? undefined : request.color,
        );
      };
      addEventListener("pointerdown", finishOutside, true);
      addEventListener("keydown", finishFromKeyboard, true);
      return () => {
        removeEventListener("pointerdown", finishOutside, true);
        removeEventListener("keydown", finishFromKeyboard, true);
      };
    }, [request]);
    React.useLayoutEffect(() => {
      surface.current.querySelector('[role="slider"]').focus();
    }, []);
    const headerBottom = document
      .querySelector("header.app-header-tint")
      .getBoundingClientRect().bottom;
    return native.jsx("div", {
      ref: surface,
      role: "dialog",
      "aria-label": request.title,
      "data-cgptx-native-color-picker": "",
      style: {
        position: "fixed",
        zIndex: 10000,
        top: `${headerBottom + 8}px`,
        left: `${request.left}px`,
        width: "200px",
        height: "200px",
      },
      children: native.jsx(native.ColorPicker, {
        className: "h-full w-full",
        color,
        onChange: changeColor,
      }),
    });
  }

  function ColorPickerHost() {
    native.React.useSyncExternalStore(
      subscribe,
      () => renderVersion,
      () => renderVersion,
    );
    const request = activeColorPicker;
    return request
      ? native.jsx(ColorPickerSurface, { request }, request.id)
      : null;
  }

  function mountColorPickerHost() {
    const container = document.createElement("div");
    container.setAttribute("data-cgptx-color-picker-host", "");
    document.body.append(container);
    native.ReactDOM.createRoot(container, {
      onUncaughtError(error) {
        colorPickerRenderError = String(error?.stack ?? error);
        warn("native color-picker host failed", error);
      },
    }).render(
      native.jsx(ColorPickerHost, {}),
    );
  }

  function installJsxHook() {
    const { React, jsxRuntime, MenuRoot } = native;
    const originalJsx = jsxRuntime.jsx;
    const originalJsxs = jsxRuntime.jsxs;

    function useNativePostAuthenticationRefresh() {
      const updateAuthNonce = native.useUpdateAuthNonce();
      const queryClient = native.useQueryClient();
      const appServerRegistry = native.useAppServerRegistry();
      nativeAppServerRegistry = appServerRegistry;
      refreshAuthentication = () => {
        authenticationRefreshCount += 1;
        queryClient.removeQueries({
          queryKey: native.accountInfoQueryKey("account-info"),
          exact: true,
        });
        authenticationAccountInfoResetCount += 1;
        updateAuthNonce();
      };
    }

    function useNativeProfileNavigation() {
      const navigate = native.useNavigate();
      openNativeProfile = () => navigate("/settings/profile");
    }

    function threadContextForMenuProps(props) {
      const threadId = props.conversationId;
      const row = Array.from(
        document.querySelectorAll("[data-app-action-sidebar-thread-row]"),
      ).find((candidate) =>
        candidate
          .getAttribute("data-app-action-sidebar-thread-id")
          ?.endsWith(`:${threadId}`),
      );
      const title =
        typeof props.title === "string"
          ? props.title
          : row?.getAttribute("data-app-action-sidebar-thread-title") ?? "";
      return Object.freeze({
        threadId,
        title,
        ...(typeof props.cwd === "string" && props.cwd.length > 0
          ? { workingDirectory: props.cwd }
          : {}),
      });
    }

    function isRemoteThreadMenu(type, props) {
      if (
        type === native.ThreadMenu ||
        typeof type !== "function" ||
        typeof props?.conversationId !== "string" ||
        props.conversationId.length === 0
      ) {
        return false;
      }
      const source = Function.prototype.toString.call(type);
      return (
        source.includes("toggle-thread-pin") &&
        source.includes("copy-session-id") &&
        source.includes("copy-deeplink")
      );
    }

    function ThreadMenuBoundary({ child }) {
      React.useSyncExternalStore(
        subscribe,
        () => renderVersion,
        () => renderVersion,
      );
      const context = threadContextForMenuProps(child.props);
      React.useLayoutEffect(() => {
        setCurrentThread(context);
        return () => clearCurrentThreadAfterUnmount(context.threadId);
      }, [context.threadId, context.title, context.workingDirectory]);
      return renderThreadTree(child.type(child.props), context);
    }

    function ProfileComponentBoundary({ child }) {
      useNativePostAuthenticationRefresh();
      useNativeProfileNavigation();
      profileMenuHasNativeProfileCallback =
        typeof child.props?.onOpenProfile === "function";
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
      return renderProfileTree(child.type(child.props), captured, child.props);
    }

    function ProfileTreeBoundary({ child }) {
      useNativePostAuthenticationRefresh();
      useNativeProfileNavigation();
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
          (type === native.ThreadMenu || isRemoteThreadMenu(type, props)) &&
          typeof props?.conversationId === "string" &&
          props.conversationId.length > 0
        ) {
          return originalJsx(
            ThreadMenuBoundary,
            { child: original(type, props, key) },
            key,
          );
        }
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
    const [
      appInitialModule,
      plusIconModule,
      paletteIconModule,
      threadMenuModule,
      authModule,
    ] = await Promise.all([
      import(APP_INITIAL_MODULE),
      import(PLUS_ICON_MODULE),
      import(PALETTE_ICON_MODULE),
      import(THREAD_MENU_MODULE),
      import(AUTH_MODULE),
    ]);
    authModule.r();
    appInitialModule.QB();
    appInitialModule.c_();
    appInitialModule.Xlt();
    appInitialModule.TH();
    appInitialModule.To();
    appInitialModule.LX();
    appInitialModule.sdt();
    plusIconModule.t();
    paletteIconModule.n();
    threadMenuModule.n();
    const jsxRuntime = appInitialModule.jvt();
    const PlusIcon = ({ className = "", ...props }) =>
      jsxRuntime.jsx(plusIconModule.n, {
        ...props,
        className: `${className} lucide-plus-icon`.trim(),
        size: 16,
      });
    native = {
      React: appInitialModule.Lvt(),
      ReactDOM: appInitialModule.ipt(),
      jsxRuntime,
      jsx: jsxRuntime.jsx,
      Item: appInitialModule.YB,
      Separator: appInitialModule.ZB,
      SubmenuItem: appInitialModule.qB,
      FlyoutSubmenuItem: appInitialModule.JB.FlyoutSubmenuItem,
      MenuRoot: appInitialModule.KB,
      ThreadMenu: threadMenuModule.t,
      ColorPicker: appInitialModule.wo,
      startChatGptSignIn: authModule.o,
      decorateAuthUrl: authModule.t,
      useUpdateAuthNonce: appInitialModule.BX,
      useAppServerRegistry: appInitialModule.JX,
      useQueryClient: appInitialModule.Avt,
      accountInfoQueryKey: appInitialModule.Qut,
      messageBus: appInitialModule.cdt,
      openInBrowser: appInitialModule.tnt,
      useNavigate: appInitialModule.H5,
      iconComponents: new Map([
        ["chevron-right", appInitialModule.Ylt],
        ["person", appInitialModule.s_],
        ["plus", PlusIcon],
        ["palette", paletteIconModule.t],
      ]),
    };
    installJsxHook();
    mountColorPickerHost();

    const observer = new MutationObserver(() => {
      queueMicrotask(() => {
        const column = visibleMenuColumn();
        if (column && builtInCache.length === 0) {
          captureBuiltInsFromOpenMenu();
        }
        if (column && pendingExpandedId) {
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
        captureDynamicThreadItemsFromOpenMenus();
        if (pendingThreadExpanded) {
          const threadColumn = visibleThreadMenuColumn(
            pendingThreadExpanded.threadId,
          );
          const row = threadRowById(
            threadColumn,
            pendingThreadExpanded.id,
          );
          if (row) {
            pendingThreadExpanded = null;
            requestThreadFlyout(row);
          }
        }
        refreshThreadListRows();
      });
    });
    observer.observe(document.documentElement, {
      childList: true,
      subtree: true,
    });
    refreshThreadListRows();
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

        const hasExplicitItems = Object.prototype.hasOwnProperty.call(
          item,
          "items",
        );
        const hasSubmenu =
          (Array.isArray(item.items) && item.items.length > 0) ||
          (!hasExplicitItems && builtInViews.get(id)?.submenuProps);
        if (hasSubmenu) {
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

  function makeThreadMenuApi(extId) {
    return Object.freeze({
      transformItems(transform) {
        if (typeof transform !== "function") {
          throw new TypeError("thread transformItems requires a function");
        }
        const entry = { extId, transform };
        threadTransformers.push(entry);
        emitChange();
        let disposed = false;
        return Object.freeze({
          dispose() {
            if (disposed) return;
            disposed = true;
            const index = threadTransformers.indexOf(entry);
            if (index >= 0) threadTransformers.splice(index, 1);
            emitChange();
          },
        });
      },

      getItems(threadId) {
        const model = threadModels.get(threadId);
        return model ? computeEffectiveThreadItems(model) : Object.freeze([]);
      },

      activateItem(threadId, id) {
        const model = threadModels.get(threadId);
        if (!model) return false;
        const item = findItemDeep(computeEffectiveThreadItems(model), id);
        if (!item || item.kind !== "action" || item.disabled === true) {
          return false;
        }
        if (Array.isArray(item.items) && item.items.length > 0) {
          const column = visibleThreadMenuColumn(threadId);
          const row = threadRowById(column, id);
          if (row) {
            requestThreadFlyout(row);
            return true;
          }
          const trigger = threadMenuTrigger(threadId);
          if (!trigger) return false;
          pendingThreadExpanded = { threadId, id };
          pressTrigger(trigger);
          return true;
        }
        if (typeof item.onClick !== "function") return false;
        try {
          item.onClick();
        } catch (error) {
          warn("thread-menu onClick of " + id + " threw", error);
        }
        return true;
      },
    });
  }

  function makeAuthenticationApi(extId) {
    return Object.freeze({
      async getCurrent() {
        const authJson = await runtimeRequest("authentication.read-current");
        if (authJson === null) return undefined;
        if (typeof authJson !== "string") {
          throw new TypeError("ChatGPT returned invalid authentication data");
        }
        return Object.freeze({
          ...inspectAuthentication(authJson),
          authJson,
        });
      },

      async inspect(authJson) {
        return inspectAuthentication(authJson);
      },

      startSignIn() {
        return enqueueAuthenticationOperation(startNativeSignIn);
      },

      replaceCurrent(authJson) {
        return enqueueAuthenticationOperation(() =>
          replaceCurrentAuthentication(authJson),
        );
      },

      onDidChange(listener) {
        if (typeof listener !== "function") {
          throw new TypeError("authentication listener must be a function");
        }
        const record = { extId, listener };
        authenticationListeners.push(record);
        let disposed = false;
        return Object.freeze({
          dispose() {
            if (disposed) return;
            disposed = true;
            const index = authenticationListeners.indexOf(record);
            if (index >= 0) authenticationListeners.splice(index, 1);
          },
        });
      },
    });
  }

  function makeThreadsApi(extId) {
    return Object.freeze({
      list: makeThreadListApi(extId),

      getCurrent() {
        return currentThread;
      },

      subscribe(listener) {
        if (typeof listener !== "function") {
          throw new TypeError("current-thread listener must be a function");
        }
        const record = { extId, listener };
        currentThreadListeners.push(record);
        try {
          listener(currentThread);
        } catch (error) {
          warn(`current-thread listener of ${extId} threw`, error);
        }
        let disposed = false;
        return Object.freeze({
          dispose() {
            if (disposed) return;
            disposed = true;
            const index = currentThreadListeners.indexOf(record);
            if (index >= 0) currentThreadListeners.splice(index, 1);
          },
        });
      },
    });
  }

  function makeThreadListApi(extId) {
    return Object.freeze({
      registerItem(provider) {
        if (typeof provider !== "function") {
          throw new TypeError("thread-list registerItem requires a function");
        }
        const registration = {
          extId,
          provider,
          cache: new Map(),
        };
        threadListRegistrations.push(registration);
        emitChange();
        let disposed = false;
        return Object.freeze({
          invalidate(threadId) {
            if (disposed) return;
            if (threadId === undefined) registration.cache.clear();
            else {
              if (typeof threadId !== "string" || threadId.length === 0) {
                throw new TypeError("thread-list invalidate requires a thread id");
              }
              registration.cache.delete(threadId);
            }
            emitChange();
          },
          dispose() {
            if (disposed) return;
            disposed = true;
            const index = threadListRegistrations.indexOf(registration);
            if (index >= 0) threadListRegistrations.splice(index, 1);
            registration.cache.clear();
            emitChange();
          },
        });
      },
    });
  }

  function makeHeaderAppearanceApi(extId) {
    return Object.freeze({
      registerProperties(properties) {
        const registration = {
          extId,
          properties: normalizeHeaderProperties(properties),
        };
        headerPropertyRegistrations.push(registration);
        applyHeaderProperties();
        let disposed = false;
        return Object.freeze({
          update(nextProperties) {
            if (disposed) return;
            registration.properties =
              normalizeHeaderProperties(nextProperties);
            applyHeaderProperties();
          },
          dispose() {
            if (disposed) return;
            disposed = true;
            const index = headerPropertyRegistrations.indexOf(registration);
            if (index >= 0) headerPropertyRegistrations.splice(index, 1);
            applyHeaderProperties();
          },
        });
      },

      getProperties() {
        return computeHeaderProperties();
      },
    });
  }

  function makeAppearanceApi(extId) {
    return Object.freeze({
      header: makeHeaderAppearanceApi(extId),
      getColorScheme() {
        return getHeaderTheme();
      },
      openColorPicker(options) {
        return openColorPicker(extId, options);
      },
    });
  }

  function makeApi(extId) {
    return Object.freeze({
      menus: Object.freeze({
        profile: makeProfileMenuApi(extId),
        thread: makeThreadMenuApi(extId),
      }),
      threads: makeThreadsApi(extId),
      authentication: makeAuthenticationApi(extId),
      appearance: makeAppearanceApi(extId),
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
    version: "26.721.30844",
    registerExtension,
    _debug: Object.freeze({
      captureBuiltInsFromOpenMenu,
      computeEffectiveItems,
      visibleMenuColumn,
      warmModel,
      getCache: () => builtInCache,
      getThreadModels: () => threadModels,
      computeEffectiveThreadItems: (threadId) => {
        const model = threadModels.get(threadId);
        return model ? computeEffectiveThreadItems(model) : Object.freeze([]);
      },
      visibleThreadMenuColumn,
      captureDynamicThreadItemsFromOpenMenus,
      nativeReady: () => native !== null,
      authenticationReady: () => typeof refreshAuthentication === "function",
      authenticationRefreshCount: () => authenticationRefreshCount,
      authenticationAccountInfoResetCount: () =>
        authenticationAccountInfoResetCount,
      authenticationAppServerRestartCount: () =>
        authenticationAppServerRestartCount,
      profileMenuHasNativeProfileCallback: () =>
        profileMenuHasNativeProfileCallback,
      nativeAccount: () => nativeAppServerRegistry?.getDefault().getAccount(),
      nativeSignInStartCount: () => nativeSignInStartCount,
      inspectAuthentication,
      computeHeaderProperties,
      getColorScheme: getHeaderTheme,
      openColorPicker: (options) =>
        openColorPicker("api-ui-test", options),
      activeColorPicker: () =>
        activeColorPicker
          ? Object.freeze({
              id: activeColorPicker.id,
              color: activeColorPicker.color,
              extId: activeColorPicker.extId,
              queued: colorPickerQueue.length,
            })
          : null,
      colorPickerRenderError: () => colorPickerRenderError,
    }),
  });

  log("host installed");
  void installNativeBinding().catch((error) => {
    warn("native binding installation failed", error);
  });
})();
