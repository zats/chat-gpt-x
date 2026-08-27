/**
 * Renderer binding for ChatGPT 26.820.80927.
 *
 * The binding patches the app's shared JSX runtime and transforms native
 * Profile, thread, and assistant-selection menu item trees. Items remain
 * inside the app's existing native owners and use exported app components.
 * Binding revisions can update this bridge without changing the public API.
 */
(() => {
  "use strict";

  if (window.__CGPTX_HOST__) return;

  const LOG_PREFIX = "[cgptx-host]";
  const APP_INITIAL_MODULE = "./assets/app-initial-CpK4W6kT.js";
  const PLUS_ICON_MODULE = "./assets/plus-BgCJgEEs-DfzxPQNa.js";
  const PALETTE_ICON_MODULE = "./assets/palette-lzFbWMQk-D-MoTDe_.js";
  const THREAD_MENU_MODULE = "./assets/thread-overflow-menu-CNwvn1sZ.js";
  const AUTH_MODULE = "./assets/chatgpt-desktop-auth-url-BcNqVSej.js";
  const SETTINGS_VISIBILITY_MODULE =
    "./assets/use-visible-settings-sections-BmMdRqG0.js";
  const SETTINGS_LOADING_MODULE =
    "./assets/settings-loading-row-DeWwhCfK.js";
  const TOOLBAR_BREADCRUMB_MODULE =
    "./assets/toolbar-breadcrumb-D6g0pyfy.js";
  const EXTENSIONS_SETTINGS_PANE_ID = "extensions.installed";
  const RESPONSE_ANNOTATION_CREATION_TIMEOUT_MS = 10_000;
  const HEADER_BACKGROUND_PROPERTY = "--header-background-color";
  const HEADER_FOREGROUND_PROPERTY = "--header-foreground-color";
  const HEADER_PROPERTIES = Object.freeze([
    HEADER_BACKGROUND_PROPERTY,
    HEADER_FOREGROUND_PROPERTY,
  ]);
  const BINDING_STYLE_ID = "cgptx-binding-style";
  const BINDING_STYLE_SOURCE = `
html[data-cgptx-header-background-color] header[data-pip-obstacle="app-shell-header"] {
  background-color: transparent !important;
}
html[data-cgptx-header-background-color] header[data-pip-obstacle="app-shell-header"] > div:nth-of-type(2),
html[data-cgptx-header-background-color] header[data-pip-obstacle="app-shell-header"] > div:nth-of-type(3),
html[data-cgptx-header-background-color] header[data-pip-obstacle="app-shell-header"] > div:nth-of-type(5) {
  background-color: var(--header-background-color) !important;
}
html[data-cgptx-header-background-color]:has(
    aside[data-app-shell-focus-area="right-panel"][style*="opacity: 1"]
  )
  header[data-pip-obstacle="app-shell-header"] > div:nth-of-type(5) {
  background-color: transparent !important;
}
html[data-cgptx-header-background-color] header[data-pip-obstacle="app-shell-header"] > div:nth-of-type(3) {
  box-shadow: -8px 0 var(--header-background-color);
}
html[data-cgptx-header-background-color] aside[data-app-shell-focus-area="right-panel"]
  [data-app-shell-tabs="true"] > .h-toolbar {
  --color-surface: var(--header-background-color);
}
html[data-cgptx-header-background-color] aside[data-app-shell-focus-area="right-panel"]
  [data-app-shell-tabs="true"] > .h-toolbar,
html[data-cgptx-header-background-color] aside[data-app-shell-focus-area="right-panel"]
  [data-app-shell-tabs="true"] > .h-toolbar [class~="bg-surface"] {
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
html[data-cgptx-header-foreground-color] header[data-pip-obstacle="app-shell-header"] {
  --color-text: var(--header-foreground-color);
  --color-text-secondary: color-mix(
    in srgb,
    var(--header-foreground-color) 76%,
    transparent
  );
  --color-text-tertiary: color-mix(
    in srgb,
    var(--header-foreground-color) 72%,
    transparent
  );
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
  header[data-pip-obstacle="app-shell-header"] button[class~="bg-token-bg-fog"] {
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

  function containsMessageId(value, id, depth = 0) {
    if (depth > 30) return false;
    if (Array.isArray(value)) {
      return value.some((child) => containsMessageId(child, id, depth + 1));
    }
    if (!isElement(value)) return false;
    const props = value.props ?? {};
    if (props.id === id) return true;
    return childrenOf(props.children).some((child) =>
      containsMessageId(child, id, depth + 1),
    );
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
      (id.startsWith("threadHeader.") ||
        id.startsWith("sidebarElectron.") ||
        id.startsWith("sidebar.threadProject."))
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
  const assistantSelectionTransformers = [];
  const threadTransformers = [];
  const threadListRegistrations = [];
  const currentThreadListeners = [];
  const authenticationListeners = [];
  const headerPropertyRegistrations = [];
  const colorPickerQueue = [];
  const settingsCategoryTransformers = [];
  const settingsGroupTransformers = [];
  const settingsItemTransformers = [];
  const extensions = new Map();
  const extensionSettings = new Map();
  const extensionSettingsPaneOwners = new Map();
  const safeHandlers = new WeakSet();
  const renderListeners = new Set();
  const assistantSelectionRenderListeners = new Set();
  const threadMenuRenderListeners = new Set();
  const mountedThreadListRows = new WeakMap();
  const builtInSettingsCategories = new Map();
  const settingsNavigationRows = new Map();
  const settingsNavigationGroupTemplates = new Map();
  const settingsGroupModels = new Map();
  const settingsPaneRenderCounts = new Map();
  const settingsPaneRowClasses = new Map();
  const APP_SETTINGS_OWNER = Symbol("app-settings-owner");
  const settingsCategoryOwners = new WeakMap();
  const settingsPaneOwners = new WeakMap();
  const settingsGroupOwners = new WeakMap();
  const settingsItemOwners = new WeakMap();
  const settingsItemControlOwners = new WeakMap();
  const settingsControlHandlers = new WeakMap();
  const settingsNativeControlElements = new WeakMap();
  const settingsNativeCategoryViews = new WeakMap();
  const settingsNativeGroupViews = new WeakMap();
  const settingsNativeItemContent = new WeakMap();
  const debugSettingsSnapshotRequests = new Map();
  const assistantSelectionSafeHandlers = new WeakSet();
  let renderVersion = 0;
  let assistantSelectionRenderVersion = 0;
  let threadMenuRenderVersion = 0;
  let builtInCache = Object.freeze([]);
  let builtInViews = new Map();
  let activeAssistantSelectionModel = null;
  let assistantSelectionPositionContext = null;
  let pendingResponseAnnotationCreation = null;
  let responseAnnotationCreationCount = 0;
  let lastResponseAnnotationCreation = null;
  const threadModels = new Map();
  let currentThread = undefined;
  let currentThreadClearGeneration = 0;
  let native = null;
  let nativeBindingInstalled = false;
  let nativeBindingError = null;
  let applicationRootRefreshCount = 0;
  let assistantSelectionBoundaryRenderCount = 0;
  let threadMenuBoundaryRenderCount = 0;
  let threadMenuAdapterRenderCount = 0;
  const pendingGenericThreadItems = new Map();
  let pendingGenericThreadLeaf = null;
  let pendingExpandedId = null;
  let pendingThreadExpanded = null;
  let nestedItemClassName = null;
  let refreshAuthentication = null;
  let openNativeProfile = null;
  let openNativeSettings = null;
  let profileNavigationAttemptCount = 0;
  let profileNavigationLastRequestedPath = null;
  let profileMenuHasNativeProfileCallback = null;
  let nativeAppServerRegistry = null;
  let nativeApplicationScope = null;
  let nativeSignInScope = null;
  let activeSignIn = null;
  let authenticationOperations = Promise.resolve();
  let nativeSignInStartCount = 0;
  let authenticationRefreshCount = 0;
  let authenticationAccountInfoResetCount = 0;
  let headerThemeObserver = null;
  let observedHeaderTheme = null;
  let activeColorPicker = null;
  let nextColorPickerId = 1;
  let colorPickerRenderError = null;
  let settingsNavigationRowTemplate = null;
  let activeSettingsPaneId = null;
  let activeCustomSettingsPaneId = null;
  let confirmedNativeSettingsPaneId = null;
  let pendingNativeSettingsPaneId = null;
  let settingsPageCaptureContext = null;
  let activeSettingsPageCaptureRegistry = null;
  let holdNextSettingsNavigation = false;
  let heldSettingsNavigation = null;
  let debugSettingsSnapshotCommitCount = 0;
  let settingsContentBoundaryRenderCount = 0;
  let settingsContentMountCount = 0;
  let settingsSearchQuery = "";
  let settingsSetSearchQuery = null;
  let settingsRefreshScheduled = false;
  let settingsOpenOperations = Promise.resolve();
  let nextSettingsPaneRowClass = 1;
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

  function subscribeThreadMenu(listener) {
    threadMenuRenderListeners.add(listener);
    return () => threadMenuRenderListeners.delete(listener);
  }

  function subscribeAssistantSelection(listener) {
    assistantSelectionRenderListeners.add(listener);
    return () => assistantSelectionRenderListeners.delete(listener);
  }

  function emitAssistantSelectionChange() {
    assistantSelectionRenderVersion += 1;
    for (const listener of [...assistantSelectionRenderListeners]) listener();
  }

  function emitThreadMenuChange() {
    threadMenuRenderVersion += 1;
    for (const listener of [...threadMenuRenderListeners]) listener();
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
    if (request === activeColorPicker) {
      activeColorPicker = null;
    } else {
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

  function finishActiveColorPickerFromKeyboard(event) {
    const request = activeColorPicker;
    if (!request || request.status !== "active") return;
    if (event.key !== "Escape" && event.key !== "Enter") return;
    event.preventDefault();
    event.stopImmediatePropagation();
    settleColorPicker(
      request,
      event.key === "Escape" ? undefined : request.color,
    );
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
    const header = document.querySelector(
      'header[data-pip-obstacle="app-shell-header"]',
    );

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
      headerBottom: header?.getBoundingClientRect().bottom ?? null,
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

  function safeAssistantSelectionHandler(handler, id) {
    if (
      typeof handler !== "function" ||
      assistantSelectionSafeHandlers.has(handler)
    ) {
      return handler;
    }
    const wrapped = (activation) => {
      try {
        handler(activation);
      } catch (error) {
        warn("assistant-selection onClick of " + id + " threw", error);
      }
    };
    assistantSelectionSafeHandlers.add(wrapped);
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

  const ASSISTANT_SELECTION_MESSAGE_IDS = Object.freeze(
    new Set([
      "selectedTextOverlay.addToCodex",
      "selectedTextOverlay.moreDetails",
      "selectedTextOverlay.askInSideChat",
    ]),
  );

  function normalizeAssistantSelectionTransformOutput(
    model,
    previous,
    rawOutput,
    extId,
  ) {
    const previousById = deepItemsById(previous);
    const builtInsById = deepItemsById(model.builtInCache);
    const moved = nestedIds(rawOutput);
    const seen = new Set();

    function normalizeList(rawItems, depth, inheritedPlacement) {
      const items = [];
      for (const raw of rawItems) {
        if (!raw || typeof raw !== "object" || raw.kind !== "action") continue;
        if (typeof raw.id !== "string" || raw.id.length === 0) continue;
        if (depth === 0 && moved.has(raw.id) && builtInsById.has(raw.id)) {
          continue;
        }
        if (seen.has(raw.id)) {
          warn("dropping duplicate assistant-selection id: " + raw.id);
          continue;
        }
        const existing =
          builtInsById.get(raw.id) ?? previousById.get(raw.id) ?? null;
        if (!existing && !raw.id.startsWith(extId + ".")) {
          warn(
            "dropping assistant-selection action with foreign-namespace id: " +
              raw.id,
          );
          continue;
        }
        seen.add(raw.id);
        const item = existing
          ? mergeDescriptor(existing, raw)
          : { ...raw, origin: extId };
        if (typeof item.label !== "string") continue;
        if (
          item.disabled !== undefined &&
          typeof item.disabled !== "boolean"
        ) {
          continue;
        }
        if (
          item.labelScale !== undefined &&
          item.labelScale !== 1 &&
          item.labelScale !== 2
        ) {
          continue;
        }
        if (
          item.verticalPadding !== undefined &&
          item.verticalPadding !== 0 &&
          item.verticalPadding !== 4
        ) {
          continue;
        }
        if (depth === 0) {
          item.placement ??= "above";
          if (item.placement !== "above" && item.placement !== "below") {
            continue;
          }
        } else {
          item.placement = inheritedPlacement;
        }
        if (depth >= 1 && Array.isArray(item.items)) {
          warn(
            "dropping unsupported assistant-selection nesting from: " +
              item.id,
          );
          delete item.items;
        } else if (Array.isArray(item.items)) {
          item.items = normalizeList(item.items, depth + 1, item.placement);
        }
        if (
          typeof raw.onClick === "function" &&
          raw.onClick !== existing?.onClick
        ) {
          item.onClick = safeAssistantSelectionHandler(raw.onClick, raw.id);
        }
        items.push(item);
      }
      return items;
    }

    return normalizeList(rawOutput, 0, "above");
  }

  function computeEffectiveAssistantSelectionRootItems(model) {
    let items = model.builtInCache;
    for (const { extId, transform } of assistantSelectionTransformers) {
      try {
        const output = transform(items, model.context);
        if (!Array.isArray(output)) {
          warn(
            "assistant-selection transformer from " +
              extId +
              " returned a non-array; skipped",
          );
          continue;
        }
        items = freezeItems(
          normalizeAssistantSelectionTransformOutput(
            model,
            items,
            output,
            extId,
          ),
        );
      } catch (error) {
        warn(
          "assistant-selection transformer from " + extId + " threw; skipped",
          error,
        );
      }
    }
    return items;
  }

  function computeEffectiveAssistantSelectionPlacementItems(
    model,
    rootItems,
    placement,
  ) {
    const placementItems = rootItems.filter(
      (item) => item.placement === placement,
    );
    const activePageId = model.activePageIds[placement];
    if (activePageId === null) return placementItems;
    const parent = placementItems.find((item) => item.id === activePageId);
    if (parent?.kind === "action" && Array.isArray(parent.items)) {
      return parent.items;
    }
    model.activePageIds[placement] = null;
    return placementItems;
  }

  function computeEffectiveAssistantSelectionPages(model) {
    const rootItems = computeEffectiveAssistantSelectionRootItems(model);
    const above = computeEffectiveAssistantSelectionPlacementItems(
      model,
      rootItems,
      "above",
    );
    const below = computeEffectiveAssistantSelectionPlacementItems(
      model,
      rootItems,
      "below",
    );
    return {
      above,
      below,
      visible: Object.freeze([...above, ...below]),
    };
  }

  function computeEffectiveAssistantSelectionItems(model) {
    return computeEffectiveAssistantSelectionPages(model).visible;
  }

  function dismissAssistantSelection() {
    window.getSelection()?.removeAllRanges();
  }

  const ASSISTANT_SELECTION_ACTIVATION = Object.freeze({ metaKey: false });
  const ASSISTANT_SELECTION_COMMAND_ACTIVATION = Object.freeze({
    metaKey: true,
  });

  function activateAssistantSelectionModelItem(
    model,
    id,
    activation = ASSISTANT_SELECTION_ACTIVATION,
  ) {
    const item = computeEffectiveAssistantSelectionItems(model).find(
      (candidate) => candidate.id === id,
    );
    if (!item || item.disabled === true || typeof item.onClick !== "function") {
      if (
        item?.disabled !== true &&
        item?.kind === "action" &&
        Array.isArray(item.items) &&
        item.items.length > 0
      ) {
        model.activePageIds[item.placement] = item.id;
        emitAssistantSelectionChange();
        return true;
      }
      return false;
    }
    if (Array.isArray(item.items) && item.items.length > 0) {
      model.activePageIds[item.placement] = item.id;
      emitAssistantSelectionChange();
      return true;
    }
    model.activatingLeaf = true;
    dismissAssistantSelection();
    try {
      item.onClick(activation);
    } catch (error) {
      warn("assistant-selection onClick of " + id + " threw", error);
    } finally {
      model.activatingLeaf = false;
    }
    return true;
  }

  function rejectResponseAnnotationCreation(request, error) {
    if (pendingResponseAnnotationCreation === request) {
      pendingResponseAnnotationCreation = null;
    }
    clearTimeout(request.timeout);
    request.reject(error);
  }

  function createAssistantResponseAnnotation(model, annotation, options) {
    if (typeof annotation !== "string" || annotation.trim().length === 0) {
      return Promise.reject(
        new TypeError("response annotation must be a non-empty string"),
      );
    }
    if (
      options !== undefined &&
      (options === null ||
        typeof options !== "object" ||
        (options.submit !== undefined &&
          typeof options.submit !== "boolean"))
    ) {
      return Promise.reject(
        new TypeError("response annotation options are invalid"),
      );
    }
    if (
      activeAssistantSelectionModel !== model &&
      model.activatingLeaf !== true
    ) {
      return Promise.reject(
        new Error("assistant selection is no longer active"),
      );
    }
    if (pendingResponseAnnotationCreation !== null) {
      return Promise.reject(
        new Error("a response annotation request is already pending"),
      );
    }
    const addToChat = model.builtInCache.find(
      (item) => item.id === "selectedTextOverlay.addToCodex",
    );
    if (typeof addToChat?.onClick !== "function") {
      return Promise.reject(
        new Error("ChatGPT Add to chat is unavailable for this selection"),
      );
    }

    return new Promise((resolve, reject) => {
      const request = {
        annotation: annotation.trim(),
        model,
        reject,
        resolve,
        selectedText: model.context.selectedText,
        submit: options?.submit === true,
        timeout: null,
      };
      request.timeout = setTimeout(() => {
        rejectResponseAnnotationCreation(
          request,
          new Error("ChatGPT did not create the response annotation"),
        );
      }, RESPONSE_ANNOTATION_CREATION_TIMEOUT_MS);
      pendingResponseAnnotationCreation = request;
      try {
        addToChat.onClick();
      } catch (error) {
        rejectResponseAnnotationCreation(request, error);
      }
    });
  }

  // ------------------------------------------------------------------
  // Settings model and transformer engine
  // ------------------------------------------------------------------

  const BUILT_IN_SETTINGS_CATEGORY_IDS = Object.freeze([
    "personal",
    "integrations",
    "coding",
    "archived",
  ]);
  const SETTINGS_CATEGORY_MESSAGE_IDS = Object.freeze({
    "settings.nav.heading.personal": "personal",
    "settings.nav.heading.integrations": "integrations",
    "settings.nav.heading.coding": "coding",
    "settings.nav.heading.archived": "archived",
  });

  function freezeStrings(value) {
    return Array.isArray(value)
      ? Object.freeze(value.filter((entry) => typeof entry === "string"))
      : undefined;
  }

  function freezeSettingsItem(
    item,
    owner = settingsItemOwners.get(item),
    nativeSource = item,
    controlOwner = settingsItemControlOwners.get(nativeSource),
  ) {
    if (
      owner !== undefined &&
      settingsItemOwners.get(item) === owner &&
      settingsItemControlOwners.get(item) === controlOwner &&
      Object.isFrozen(item)
    ) {
      return item;
    }
    const descriptor = Object.freeze({
      ...item,
      ...(item.destination === undefined
        ? {}
        : { destination: Object.freeze({ ...item.destination }) }),
      ...(item.keywords === undefined
        ? {}
        : { keywords: freezeStrings(item.keywords) }),
    });
    if (owner !== undefined) settingsItemOwners.set(descriptor, owner);
    if (item.control !== undefined && controlOwner !== undefined) {
      settingsItemControlOwners.set(descriptor, controlOwner);
    }
    const nativeContent = settingsNativeItemContent.get(nativeSource);
    if (nativeContent) settingsNativeItemContent.set(descriptor, nativeContent);
    return descriptor;
  }

  function freezeSettingsGroup(
    group,
    owner = settingsGroupOwners.get(group),
    nativeSource = group,
  ) {
    if (
      owner !== undefined &&
      settingsGroupOwners.get(group) === owner &&
      Object.isFrozen(group)
    ) {
      return group;
    }
    const descriptor = Object.freeze({
      ...group,
      ...(group.keywords === undefined
        ? {}
        : { keywords: freezeStrings(group.keywords) }),
      items: Object.freeze(group.items.map((item) => freezeSettingsItem(item))),
    });
    if (owner !== undefined) settingsGroupOwners.set(descriptor, owner);
    const nativeView = settingsNativeGroupViews.get(nativeSource);
    if (nativeView) settingsNativeGroupViews.set(descriptor, nativeView);
    return descriptor;
  }

  function freezeSettingsPane(pane, owner = settingsPaneOwners.get(pane)) {
    if (
      owner !== undefined &&
      settingsPaneOwners.get(pane) === owner &&
      Object.isFrozen(pane)
    ) {
      return pane;
    }
    const descriptor = Object.freeze({
      ...pane,
      ...(pane.keywords === undefined
        ? {}
        : { keywords: freezeStrings(pane.keywords) }),
    });
    if (owner !== undefined) settingsPaneOwners.set(descriptor, owner);
    return descriptor;
  }

  function freezeSettingsCategory(
    category,
    owner = settingsCategoryOwners.get(category),
    nativeSource = category,
  ) {
    if (
      owner !== undefined &&
      settingsCategoryOwners.get(category) === owner &&
      Object.isFrozen(category)
    ) {
      return category;
    }
    const descriptor = Object.freeze({
      ...category,
      ...(category.keywords === undefined
        ? {}
        : { keywords: freezeStrings(category.keywords) }),
      panes: Object.freeze(
        category.panes.map((pane) => freezeSettingsPane(pane)),
      ),
    });
    if (owner !== undefined) settingsCategoryOwners.set(descriptor, owner);
    const nativeView = settingsNativeCategoryViews.get(nativeSource);
    if (nativeView) settingsNativeCategoryViews.set(descriptor, nativeView);
    return descriptor;
  }

  function freezeSettingsCategories(categories) {
    return Object.freeze(
      categories.map((category) => freezeSettingsCategory(category)),
    );
  }

  function canChangeSettingsDescriptor(owners, descriptor, extId) {
    const owner = owners.get(descriptor);
    return owner === APP_SETTINGS_OWNER || owner === extId;
  }

  function mergeSettingsDescriptor(base, override) {
    const merged = { ...base };
    for (const [key, value] of Object.entries(override)) {
      if (key === "origin") continue;
      if (value === undefined) delete merged[key];
      else merged[key] = value;
    }
    merged.origin = base.origin;
    return merged;
  }

  function normalizeSettingsItemControl(existing, raw, extId) {
    const previousControl = existing?.control;
    const previousOwner = existing
      ? settingsItemControlOwners.get(existing)
      : undefined;
    if (
      !Object.prototype.hasOwnProperty.call(raw, "control") ||
      raw.control === previousControl
    ) {
      return { control: previousControl, owner: previousOwner };
    }
    if (raw.control === undefined) {
      return { control: undefined, owner: undefined };
    }
    if (settingsControlHandlers.get(raw.control)?.extId === extId) {
      return { control: raw.control, owner: extId };
    }
    warn(
      "dropping settings control not created by transformer extension: " +
        (typeof raw.id === "string" ? raw.id : "unidentified item"),
    );
    return { control: undefined, owner: undefined };
  }

  function normalizeSettingsItemDestination(existing, raw) {
    if (!Object.prototype.hasOwnProperty.call(raw, "destination")) {
      return existing?.destination;
    }
    const destination = raw.destination;
    if (destination === undefined) return undefined;
    if (
      !destination ||
      typeof destination !== "object" ||
      Array.isArray(destination) ||
      typeof destination.paneId !== "string" ||
      destination.paneId.length === 0 ||
      (destination.itemId !== undefined &&
        (typeof destination.itemId !== "string" ||
          destination.itemId.length === 0))
    ) {
      warn("dropping invalid settings item destination");
      return undefined;
    }
    return Object.freeze({
      paneId: destination.paneId,
      ...(destination.itemId === undefined
        ? {}
        : { itemId: destination.itemId }),
    });
  }

  function restoreForeignSettingsDescriptors(
    previous,
    normalized,
    seen,
    owners,
    extId,
    kind,
  ) {
    for (const [index, descriptor] of previous.entries()) {
      const id = descriptor.id;
      if (
        typeof id !== "string" ||
        seen.has(id) ||
        canChangeSettingsDescriptor(owners, descriptor, extId)
      ) {
        continue;
      }
      normalized.splice(Math.min(index, normalized.length), 0, descriptor);
      seen.add(id);
      warn(
        `restoring omitted settings ${kind} owned by another extension: ${id}`,
      );
    }
  }

  function baseSettingsCategories() {
    return freezeSettingsCategories(
      BUILT_IN_SETTINGS_CATEGORY_IDS.flatMap((id) => {
        const category = builtInSettingsCategories.get(id);
        return category ? [category] : [];
      }),
    );
  }

  function settingsPanesById(categories) {
    return new Map(
      categories.flatMap((category) =>
        category.panes.map((pane) => [pane.id, pane]),
      ),
    );
  }

  function normalizeSettingsCategories(previous, rawOutput, extId) {
    const builtIns = baseSettingsCategories();
    const existingCategories = new Map(
      [...builtIns, ...previous].map((category) => [category.id, category]),
    );
    const existingPanes = settingsPanesById([...builtIns, ...previous]);
    const existingPaneParents = new WeakMap();
    for (const category of [...builtIns, ...previous]) {
      for (const pane of category.panes) {
        existingPaneParents.set(pane, category.id);
      }
    }
    const seenCategories = new Set();
    const seenPanes = new Set();
    const normalized = [];
    for (const rawCategory of rawOutput) {
      if (!rawCategory || typeof rawCategory !== "object") continue;
      if (typeof rawCategory.id !== "string" || rawCategory.id.length === 0) {
        continue;
      }
      if (seenCategories.has(rawCategory.id)) {
        warn("dropping duplicate settings category id: " + rawCategory.id);
        continue;
      }
      const existingCategory = existingCategories.get(rawCategory.id);
      if (!existingCategory && !rawCategory.id.startsWith(extId + ".")) {
        warn(
          "dropping settings category with foreign-namespace id: " +
            rawCategory.id,
        );
        continue;
      }
      const canChangeCategory =
        !existingCategory ||
        canChangeSettingsDescriptor(
          settingsCategoryOwners,
          existingCategory,
          extId,
        );
      if (canChangeCategory && typeof rawCategory.label !== "string") continue;
      const rawPanes = Array.isArray(rawCategory.panes)
        ? rawCategory.panes
        : canChangeCategory
          ? null
          : existingCategory.panes;
      if (!rawPanes) continue;

      const panes = [];
      for (const rawPane of rawPanes) {
        if (!rawPane || typeof rawPane !== "object") continue;
        if (typeof rawPane.id !== "string" || rawPane.id.length === 0) continue;
        if (seenPanes.has(rawPane.id)) {
          warn("dropping duplicate settings pane id: " + rawPane.id);
          continue;
        }
        const existingPane = existingPanes.get(rawPane.id);
        if (!existingPane && !rawPane.id.startsWith(extId + ".")) {
          warn(
            "dropping settings pane with foreign-namespace id: " + rawPane.id,
          );
          continue;
        }
        const canChangePane =
          !existingPane ||
          canChangeSettingsDescriptor(settingsPaneOwners, existingPane, extId);
        if (
          existingPane &&
          !canChangePane &&
          existingPaneParents.get(existingPane) !== rawCategory.id
        ) {
          warn(
            "dropping settings pane moved from its owner category: " +
              rawPane.id,
          );
          continue;
        }
        if (canChangePane && typeof rawPane.label !== "string") continue;
        const pane = !existingPane
          ? freezeSettingsPane({ ...rawPane, origin: extId }, extId)
          : !canChangePane || rawPane === existingPane
            ? existingPane
            : freezeSettingsPane(
                mergeSettingsDescriptor(existingPane, rawPane),
                settingsPaneOwners.get(existingPane),
              );
        panes.push(pane);
        seenPanes.add(rawPane.id);
      }
      restoreForeignSettingsDescriptors(
        existingCategory?.panes ?? [],
        panes,
        seenPanes,
        settingsPaneOwners,
        extId,
        "pane",
      );

      const category = !existingCategory
        ? freezeSettingsCategory(
            { ...rawCategory, panes, origin: extId },
            extId,
          )
        : !canChangeCategory &&
            panes.length === existingCategory.panes.length &&
            panes.every((pane, index) => pane === existingCategory.panes[index])
          ? existingCategory
          : freezeSettingsCategory(
              canChangeCategory
                ? mergeSettingsDescriptor(existingCategory, {
                    ...rawCategory,
                    panes,
                  })
                : { ...existingCategory, panes },
              settingsCategoryOwners.get(existingCategory),
              existingCategory,
            );
      normalized.push(category);
      seenCategories.add(rawCategory.id);
    }
    restoreForeignSettingsDescriptors(
      previous,
      normalized,
      seenCategories,
      settingsCategoryOwners,
      extId,
      "category",
    );
    return freezeSettingsCategories(normalized);
  }

  function computeEffectiveSettingsCategories() {
    let categories = baseSettingsCategories();
    for (const { extId, transform } of settingsCategoryTransformers) {
      try {
        const output = transform(categories);
        if (!Array.isArray(output)) {
          warn(
            "settings category transformer from " +
              extId +
              " returned a non-array; skipped",
          );
          continue;
        }
        categories = normalizeSettingsCategories(categories, output, extId);
      } catch (error) {
        warn(
          "settings category transformer from " + extId + " threw; skipped",
          error,
        );
      }
    }
    return categories;
  }

  function baseSettingsGroups(paneId) {
    return settingsGroupModels.get(paneId)?.groups ?? Object.freeze([]);
  }

  function normalizeSettingsGroups(paneId, previous, rawOutput, extId) {
    const builtInsById = new Map(
      baseSettingsGroups(paneId)
        .filter((group) => typeof group.id === "string")
        .map((group) => [group.id, group]),
    );
    const previousById = new Map(
      previous
        .filter((group) => typeof group.id === "string")
        .map((group) => [group.id, group]),
    );
    const previousIdentity = new Set(previous);
    const seen = new Set();
    const groups = [];
    for (const raw of rawOutput) {
      if (!raw || typeof raw !== "object" || !Array.isArray(raw.items)) {
        continue;
      }
      if (raw.id === undefined) {
        if (previousIdentity.has(raw)) groups.push(raw);
        else warn("dropping unidentified replacement settings group");
        continue;
      }
      if (typeof raw.id !== "string" || raw.id.length === 0) continue;
      if (seen.has(raw.id)) {
        warn("dropping duplicate settings group id: " + raw.id);
        continue;
      }
      const existing = previousById.get(raw.id) ?? builtInsById.get(raw.id);
      if (!existing && !raw.id.startsWith(extId + ".")) {
        warn("dropping settings group with foreign-namespace id: " + raw.id);
        continue;
      }
      if (
        existing &&
        (!canChangeSettingsDescriptor(settingsGroupOwners, existing, extId) ||
          raw === existing)
      ) {
        groups.push(existing);
        seen.add(raw.id);
        continue;
      }
      const items = normalizeSettingsItems(
        existing?.items ?? Object.freeze([]),
        raw.items,
        extId,
      );
      const group = existing
        ? mergeSettingsDescriptor(existing, { ...raw, items })
        : { ...raw, items, origin: extId };
      groups.push(
        freezeSettingsGroup(
          group,
          existing ? settingsGroupOwners.get(existing) : extId,
          existing ?? group,
        ),
      );
      seen.add(raw.id);
    }
    restoreForeignSettingsDescriptors(
      previous,
      groups,
      seen,
      settingsGroupOwners,
      extId,
      "group",
    );
    return Object.freeze(groups);
  }

  function normalizeSettingsItems(previous, rawOutput, extId) {
    const previousById = new Map(
      previous
        .filter((item) => typeof item.id === "string")
        .map((item) => [item.id, item]),
    );
    const previousIdentity = new Set(previous);
    const seen = new Set();
    const items = [];
    for (const raw of rawOutput) {
      if (!raw || typeof raw !== "object") continue;
      if (raw.id === undefined) {
        if (previousIdentity.has(raw)) items.push(raw);
        else warn("dropping unidentified replacement settings item");
        continue;
      }
      if (typeof raw.id !== "string" || raw.id.length === 0) continue;
      if (seen.has(raw.id)) {
        warn("dropping duplicate settings item id: " + raw.id);
        continue;
      }
      const existing = previousById.get(raw.id);
      if (!existing && !raw.id.startsWith(extId + ".")) {
        warn("dropping settings item with foreign-namespace id: " + raw.id);
        continue;
      }
      if (
        existing &&
        (!canChangeSettingsDescriptor(settingsItemOwners, existing, extId) ||
          raw === existing)
      ) {
        items.push(existing);
        seen.add(raw.id);
        continue;
      }
      if (typeof raw.label !== "string") continue;
      const control = normalizeSettingsItemControl(existing, raw, extId);
      const destination = normalizeSettingsItemDestination(existing, raw);
      const item = existing
        ? mergeSettingsDescriptor(existing, raw)
        : { ...raw, origin: extId };
      if (control.control === undefined) delete item.control;
      else item.control = control.control;
      if (destination === undefined) delete item.destination;
      else item.destination = destination;
      items.push(
        freezeSettingsItem(
          item,
          existing ? settingsItemOwners.get(existing) : extId,
          existing ?? item,
          control.owner,
        ),
      );
      seen.add(raw.id);
    }
    restoreForeignSettingsDescriptors(
      previous,
      items,
      seen,
      settingsItemOwners,
      extId,
      "item",
    );
    return Object.freeze(items);
  }

  function computeEffectiveSettingsGroups(paneId) {
    const pane = settingsPanesById(computeEffectiveSettingsCategories()).get(
      paneId,
    );
    if (!pane) return Object.freeze([]);
    let groups = baseSettingsGroups(paneId);
    for (const { extId, transform } of settingsGroupTransformers) {
      try {
        const output = transform(groups, pane);
        if (!Array.isArray(output)) {
          warn(
            "settings group transformer from " +
              extId +
              " returned a non-array; skipped",
          );
          continue;
        }
        groups = normalizeSettingsGroups(paneId, groups, output, extId);
      } catch (error) {
        warn(
          "settings group transformer from " + extId + " threw; skipped",
          error,
        );
      }
    }
    const seenItemIds = new Set();
    return Object.freeze(
      groups.map((group) => {
        let items = group.items;
        for (const { extId, transform } of settingsItemTransformers) {
          try {
            const context = Object.freeze({
              pane,
              group: Object.freeze({ ...group, items }),
            });
            const output = transform(items, context);
            if (!Array.isArray(output)) {
              warn(
                "settings item transformer from " +
                  extId +
                  " returned a non-array; skipped",
              );
              continue;
            }
            items = normalizeSettingsItems(items, output, extId);
          } catch (error) {
            warn(
              "settings item transformer from " + extId + " threw; skipped",
              error,
            );
          }
        }
        const uniqueItems = [];
        for (const item of items) {
          if (typeof item.id !== "string") {
            uniqueItems.push(item);
            continue;
          }
          if (!seenItemIds.has(item.id)) {
            seenItemIds.add(item.id);
            uniqueItems.push(item);
            continue;
          }
          if (settingsItemOwners.get(item) === APP_SETTINGS_OWNER) {
            const unidentifiedItem = { ...item };
            delete unidentifiedItem.id;
            uniqueItems.push(
              freezeSettingsItem(
                unidentifiedItem,
                APP_SETTINGS_OWNER,
                item,
                settingsItemControlOwners.get(item),
              ),
            );
            warn(
              "removing duplicate native settings item id in pane " +
                paneId +
                ": " +
                item.id,
            );
            continue;
          }
          warn(
            "dropping duplicate settings item id in pane " +
              paneId +
              ": " +
              item.id,
          );
        }
        if (
          uniqueItems.length === group.items.length &&
          uniqueItems.every((item, index) => item === group.items[index])
        ) {
          return group;
        }
        return freezeSettingsGroup(
          { ...group, items: uniqueItems },
          settingsGroupOwners.get(group),
          group,
        );
      }),
    );
  }

  function settingsText(value) {
    return typeof value === "string" && value.length > 0 ? [value] : [];
  }

  function settingsSearchMatches(query) {
    const tokens = query.toLocaleLowerCase().split(/\s+/).filter(Boolean);
    if (tokens.length === 0) return [];
    const matches = [];
    for (const category of computeEffectiveSettingsCategories()) {
      for (const pane of category.panes) {
        const candidates = [
          ...settingsText(pane.label),
          ...settingsText(pane.title),
          ...settingsText(pane.description),
          ...(pane.keywords ?? []),
          ...settingsText(category.label),
          ...(category.keywords ?? []),
        ];
        for (const group of computeEffectiveSettingsGroups(pane.id)) {
          candidates.push(
            ...settingsText(group.title),
            ...settingsText(group.description),
            ...settingsText(group.footer),
            ...(group.keywords ?? []),
          );
          for (const item of group.items) {
            candidates.push(
              ...settingsText(item.label),
              ...settingsText(item.description),
              ...(item.keywords ?? []),
            );
          }
        }
        const lower = candidates.map((candidate) => candidate.toLocaleLowerCase());
        if (!tokens.every((token) => lower.some((text) => text.includes(token)))) {
          continue;
        }
        const label =
          candidates.find((candidate) =>
            tokens.every((token) => candidate.toLocaleLowerCase().includes(token)),
          ) ?? pane.label;
        matches.push({
          id: "section:" + pane.id,
          kind: "section",
          label,
          panelLabel: pane.label,
          sectionSlug: settingsSectionSlug(pane),
        });
      }
    }
    return matches;
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
    synchronizeOpaqueThreadCache(model);
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
    const accountId = nonEmptyString(
      accessAuthentication?.chatgpt_account_id,
      accessAuthentication?.account_id,
      idAuthentication?.chatgpt_account_id,
      idAuthentication?.account_id,
    );
    const authenticationUserId = nonEmptyString(
      accessAuthentication?.user_id,
      accessAuthentication?.chatgpt_user_id,
      idAuthentication?.user_id,
      idAuthentication?.chatgpt_user_id,
    );
    if (!accountId || !authenticationUserId) {
      throw new TypeError(
        "authJson does not contain a ChatGPT account identity",
      );
    }
    const userId = JSON.stringify([accountId, authenticationUserId]);
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
    if (!nativeApplicationScope) {
      throw new Error("ChatGPT application scope is unavailable");
    }
    if (activeSignIn) {
      openSignInUrl(activeSignIn.authUrl);
      return;
    }

    const abortController = new AbortController();
    const signInScope = nativeApplicationScope;
    const attempt = await native.startChatGptSignIn({
      scope: signInScope,
      signal: abortController.signal,
    });
    nativeSignInScope = signInScope;
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
          void refreshAuthentication()
            .then(emitAuthenticationChange)
            .catch((error) =>
              warn("native post-authentication refresh failed", error),
            );
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
    const currentAuthJson = await runtimeRequest("authentication.read-current");
    const credentialsChanged = currentAuthJson !== authJson;
    await runtimeRequest("authentication.replace-current", { authJson });
    if (credentialsChanged) {
      await runtimeRequest("application.relaunch");
    } else if (typeof refreshAuthentication === "function") {
      await refreshAuthentication();
    }
    emitAuthenticationChange();
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
          '[role="separator"], .h-\\[1px\\][class*="bg-border"]',
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
      let nativeHandler;
      if (
        id === "codex.profileDropdown.account" &&
        typeof openNativeProfile === "function"
      ) {
        nativeHandler = () => openNativeProfile();
      } else if (!submenuFiber) {
        nativeHandler =
          typeof props.onClick === "function"
            ? props.onClick
            : typeof props.onSelect === "function"
              ? props.onSelect
              : undefined;
      }
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
      Array.from(cache.entries()).flatMap(([index, entries]) =>
        entries.map((entry) => ({
          index,
          id: entry.descriptor.id,
          label: entry.descriptor.label,
          disabled: entry.descriptor.disabled,
          keyboardShortcut: entry.descriptor.keyboardShortcut,
        })),
      ),
    );
  }

  function synchronizeOpaqueThreadCache(model, cache = model.opaqueCache) {
    const nextEntries = Array.from(cache.values()).flat();
    if (nextEntries.length === 0) return false;
    const previousOpaqueIds = model.opaqueIds;
    const currentItems = [...model.builtInCache];
    let insertionIndex = currentItems.findIndex((item) =>
      previousOpaqueIds.has(item.id),
    );
    const retainedItems = currentItems.filter(
      (item) => !previousOpaqueIds.has(item.id),
    );
    if (insertionIndex < 0) {
      const nextKnownId = model.unboundOpaque[0]?.beforeId;
      insertionIndex = retainedItems.findIndex(
        (item) => item.id === nextKnownId,
      );
    }
    if (insertionIndex < 0) insertionIndex = retainedItems.length;
    const nextIds = nextEntries.map((entry) => entry.descriptor.id);
    const currentIds = currentItems.map((item) => item.id);
    const nextItems = [...retainedItems];
    nextItems.splice(
      insertionIndex,
      0,
      ...nextEntries.map((entry) => entry.descriptor),
    );
    if (
      JSON.stringify(currentIds) ===
      JSON.stringify(nextItems.map((item) => item.id))
    ) {
      return false;
    }
    model.builtInCache = freezeItems(nextItems);
    model.opaqueIds = new Set(nextIds);
    return true;
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
        const fiber = itemFiberOf(row) ?? fiberOf(row);
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
      if (model.opaqueCount === 1 && dynamic.length > 0) {
        nextCache.set(0, dynamic);
      } else {
        for (
          let index = 0;
          index < model.opaqueCount && index < dynamic.length;
          index += 1
        ) {
          nextCache.set(index, [dynamic[index]]);
        }
      }
      if (
        dynamicThreadCacheSignature(nextCache) !==
        dynamicThreadCacheSignature(model.opaqueCache)
      ) {
        changed = true;
        const previousOpaqueIds = model.opaqueIds;
        const currentItems = [...model.builtInCache];
        let insertionIndex = currentItems.findIndex((item) =>
          previousOpaqueIds.has(item.id),
        );
        const retainedItems = currentItems.filter(
          (item) => !previousOpaqueIds.has(item.id),
        );
        if (insertionIndex < 0) {
          const nextKnownId = model.unboundOpaque[0]?.beforeId;
          insertionIndex = retainedItems.findIndex(
            (item) => item.id === nextKnownId,
          );
        }
        if (insertionIndex < 0) insertionIndex = retainedItems.length;
        const nextEntries = Array.from(nextCache.values()).flat();
        retainedItems.splice(
          insertionIndex,
          0,
          ...nextEntries.map((entry) => entry.descriptor),
        );
        model.builtInCache = freezeItems(retainedItems);
        model.opaqueIds = new Set(
          nextEntries.map((entry) => entry.descriptor.id),
        );
      }
      model.opaqueCache = nextCache;
    }
    if (changed) emitThreadMenuChange();
    return changed;
  }

  function currentSettingsPaneId() {
    return activeSettingsPaneId;
  }

  function settingsSlug(paneId) {
    return paneId.startsWith("codex.settings.")
      ? paneId.slice("codex.settings.".length)
      : null;
  }

  function settingsPaneIsNative(pane) {
    return (
      pane !== undefined &&
      settingsPaneOwners.get(pane) === APP_SETTINGS_OWNER &&
      settingsNavigationRows.has(pane.id)
    );
  }

  function settingsNativeSlug(pane) {
    return settingsPaneIsNative(pane) ? settingsSlug(pane.id) : null;
  }

  function settingsSectionSlug(pane) {
    return settingsNativeSlug(pane) ?? pane.id;
  }

  function settingsHostPaneId(paneId) {
    if (typeof paneId !== "string") return null;
    return settingsNavigationRows.has(paneId)
      ? paneId
      : "codex.settings.appearance";
  }

  function settingsPagePaneId(child) {
    const title = child?.props?.title;
    if (
      isElement(title) &&
      title.type === native.SettingsSectionTitle &&
      typeof title.props?.slug === "string" &&
      title.props.slug.length > 0
    ) {
      return "codex.settings." + title.props.slug;
    }
    return child?.props?.fullWidth === true &&
      containsMessageId(child.props.backSlot, "profile.header")
      ? "codex.settings.profile"
      : null;
  }

  function settingsPageIsLoading(child) {
    return child?.props?.children?.type === native.SettingsLoading;
  }

  function settingsPageCommitIsEligible({
    pageId,
    loading,
    confirmedNativePaneId,
    activePaneId,
    captureReady,
  }) {
    return (
      !loading &&
      captureReady &&
      typeof pageId === "string" &&
      pageId === confirmedNativePaneId &&
      pageId === settingsHostPaneId(activePaneId)
    );
  }

  function createSettingsCapturePass(pageId) {
    const pass = {
      pageId,
      entries: new Map(),
      firstToken: null,
      nextOrder: 0,
      collect(token, view) {
        const existing = pass.entries.get(token);
        if (existing) {
          existing.view = view;
          return;
        }
        if (pass.firstToken === null) pass.firstToken = token;
        pass.entries.set(token, {
          token,
          view,
          order: pass.nextOrder,
        });
        pass.nextOrder += 1;
      },
    };
    return pass;
  }

  function scheduleSettingsRefresh() {
    if (settingsRefreshScheduled) return;
    settingsRefreshScheduled = true;
    queueMicrotask(() => {
      settingsRefreshScheduled = false;
      emitChange();
    });
  }

  function flattenedChildren(value, result = []) {
    if (Array.isArray(value)) {
      for (const child of value) flattenedChildren(child, result);
    } else if (value != null && value !== false) {
      result.push(value);
    }
    return result;
  }

  function elementWithProp(value, property) {
    if (!isElement(value)) return null;
    if (Object.hasOwn(value.props ?? {}, property)) return value;
    for (const child of flattenedChildren(value.props?.children)) {
      const found = elementWithProp(child, property);
      if (found) return found;
    }
    return null;
  }

  function settingsPaneFromNavigationRow(row) {
    const button = elementWithProp(row, "data-settings-panel-slug");
    const slug = button?.props?.["data-settings-panel-slug"];
    if (typeof slug !== "string" || slug.length === 0) return null;
    const labelMessage = messageOf(button.props.label);
    const label =
      typeof button.props["aria-label"] === "string"
        ? button.props["aria-label"]
        : labelMessage?.defaultMessage ?? slug;
    return {
      pane: freezeSettingsPane(
        {
          id: "codex.settings." + slug,
          label,
          disabled: button.props.disabled === true,
          origin: "app",
        },
        APP_SETTINGS_OWNER,
      ),
      button,
    };
  }

  function captureSettingsNavigationGroup(source, categoryId) {
    settingsNavigationGroupTemplates.set(categoryId, source);
    const children = childrenOf(source.props?.children);
    const rows = flattenedChildren(children[0]);
    const panes = [];
    let activeBuiltInPaneId = null;
    for (const row of rows) {
      const captured = settingsPaneFromNavigationRow(row);
      if (!captured) continue;
      panes.push(captured.pane);
      settingsNavigationRows.set(captured.pane.id, {
        row,
        button: captured.button,
      });
      settingsNavigationRowTemplate ??= row;
      if (captured.button.props.isActive === true) {
        activeBuiltInPaneId = captured.pane.id;
      }
    }
    if (activeBuiltInPaneId) {
      const confirmedChanged =
        confirmedNativeSettingsPaneId !== activeBuiltInPaneId;
      confirmedNativeSettingsPaneId = activeBuiltInPaneId;
      if (
        pendingNativeSettingsPaneId === null &&
        (activeCustomSettingsPaneId === null ||
          activeBuiltInPaneId !== "codex.settings.appearance")
      ) {
        const changed =
          activeSettingsPaneId !== activeBuiltInPaneId ||
          activeCustomSettingsPaneId !== null;
        activeSettingsPaneId = activeBuiltInPaneId;
        activeCustomSettingsPaneId = null;
        if (changed) scheduleSettingsRefresh();
      }
      if (confirmedChanged) scheduleSettingsRefresh();
    }
    const nativeTitle = source.props?.title;
    const title = messageOf(nativeTitle);
    const label = title?.defaultMessage ?? categoryId;
    const category = freezeSettingsCategory(
      {
        id: categoryId,
        label,
        panes,
        origin: "app",
      },
      APP_SETTINGS_OWNER,
    );
    settingsNativeCategoryViews.set(
      category,
      Object.freeze({ label, title: nativeTitle }),
    );
    const previous = builtInSettingsCategories.get(categoryId);
    builtInSettingsCategories.set(categoryId, category);
    if (
      JSON.stringify(previous?.panes.map((pane) => pane.id)) !==
        JSON.stringify(category.panes.map((pane) => pane.id)) ||
      previous?.label !== category.label
    ) {
      scheduleSettingsRefresh();
    }
  }

  function extensionSettingsParentPane(paneId, panes) {
    if (!extensionSettingsPaneOwners.has(paneId)) return null;
    return panes.get(EXTENSIONS_SETTINGS_PANE_ID) ?? null;
  }

  function cloneSettingsNavigationRow(pane, panes) {
    const source = settingsNavigationRows.get(pane.id);
    const row = source?.row ?? settingsNavigationRowTemplate;
    if (!row) return null;
    const sourceButton = source?.button ?? elementWithProp(
      row,
      "data-settings-panel-slug",
    );
    if (!sourceButton) return null;
    const isBuiltIn = settingsPaneIsNative(pane);
    const sourceOnClick = sourceButton.props.onClick;
    const button = native.jsx(
      sourceButton.type,
      {
        ...sourceButton.props,
        "aria-label": pane.label,
        label: pane.label,
        isActive:
          (extensionSettingsParentPane(currentSettingsPaneId(), panes)?.id ??
            currentSettingsPaneId()) === pane.id,
        disabled: pane.disabled === true,
        "data-settings-panel-slug": settingsSectionSlug(pane),
        ...(isBuiltIn
          ? {
              onClick: (...args) => {
                const nativePaneIsActive =
                  sourceButton.props.isActive === true;
                activeSettingsPaneId = pane.id;
                activeCustomSettingsPaneId = null;
                pendingNativeSettingsPaneId = nativePaneIsActive
                  ? null
                  : pane.id;
                if (!nativePaneIsActive) sourceOnClick?.(...args);
                emitChange();
              },
            }
          : {
              icon: resolveIcon("settings"),
              onClick: () => {
                void navigateSettingsPane(pane.id);
              },
              onFocus: undefined,
              onPointerEnter: undefined,
            }),
      },
      pane.id,
    );
    if (native.settingsSectionIcons && !isBuiltIn) {
      native.settingsSectionIcons[pane.id] = resolveIcon("settings");
    }
    return native.jsx(
      row.type,
      {
        ...row.props,
        disabled: true,
        tooltipContent: pane.label,
        children: button,
      },
      pane.id,
    );
  }

  function renderSettingsNavigationCategory(category, panes) {
    const source =
      settingsNavigationGroupTemplates.get(category.id) ??
      settingsNavigationGroupTemplates.get("personal");
    if (!source) return null;
    const originalChildren = childrenOf(source.props?.children);
    const rows = category.panes
      .filter((pane) => !extensionSettingsParentPane(pane.id, panes))
      .map((pane) => cloneSettingsNavigationRow(pane, panes))
      .filter(Boolean);
    const extras =
      category.id === "personal" ? originalChildren.slice(1) : [];
    const nativeView = settingsNativeCategoryViews.get(category);
    return native.jsx(
      source.type,
      {
        ...source.props,
        title:
          nativeView && category.label === nativeView.label
            ? nativeView.title
            : category.label,
        children: [rows, ...extras],
      },
      category.id,
    );
  }

  function SettingsNavigationBoundary() {
    native.React.useSyncExternalStore(
      subscribe,
      () => renderVersion,
      () => renderVersion,
    );
    const categories = computeEffectiveSettingsCategories();
    const panes = settingsPanesById(categories);
    return native.jsx(
      native.React.Fragment,
      {
        children: categories
          .map((category) => renderSettingsNavigationCategory(category, panes))
          .filter(Boolean),
      },
      "cgptx-settings-navigation",
    );
  }

  function renderSettingsNavigationGroup(source, categoryId) {
    captureSettingsNavigationGroup(source, categoryId);
    if (categoryId !== "personal") return null;
    return native.jsx(SettingsNavigationBoundary, {});
  }

  function settingsValueText(value) {
    if (typeof value === "string") return value;
    return messageOf(value)?.defaultMessage ?? "";
  }

  function settingsElement(value, type) {
    if (!type || !isElement(value)) return null;
    if (value.type === type) return value;
    for (const child of flattenedChildren(value.props?.children)) {
      const found = settingsElement(child, type);
      if (found) return found;
    }
    return null;
  }

  function settingsRowsElement(value) {
    return settingsElement(value, native.SettingsRows);
  }

  function captureSettingsItem(row) {
    const labelMessage = messageOf(row.props?.label);
    const id = labelMessage?.id;
    const control =
      row.props?.control === undefined
        ? undefined
        : Object.freeze({ kind: "native" });
    if (control) {
      settingsNativeControlElements.set(control, row.props.control);
    }
    const item = freezeSettingsItem(
      {
        ...(typeof id === "string" ? { id } : {}),
        label: settingsValueText(row.props?.label),
        ...(row.props?.description === undefined
          ? {}
          : { description: settingsValueText(row.props.description) }),
        ...(control ? { control } : {}),
        origin: "app",
      },
      APP_SETTINGS_OWNER,
      undefined,
      control ? APP_SETTINGS_OWNER : undefined,
    );
    settingsNativeItemContent.set(
      item,
      Object.freeze({
        label: row.props?.label,
        labelText: item.label,
        description: row.props?.description,
        descriptionText: item.description,
      }),
    );
    return item;
  }

  function settingsGroupModel(paneId) {
    let model = settingsGroupModels.get(paneId);
    if (!model) {
      model = {
        groups: Object.freeze([]),
        views: Object.freeze([]),
        viewsById: new Map(),
        viewsByDescriptor: new WeakMap(),
      };
      settingsGroupModels.set(paneId, model);
    }
    return model;
  }

  function captureNativeSettingsGroup(source) {
    const header = settingsElement(source, native.SettingsGroup.Header);
    const footer = settingsElement(source, native.SettingsGroup.Footer);
    const titleMessage = messageOf(header?.props?.title);
    const id = titleMessage?.id;
    const rows = settingsRowsElement(source);
    const rowElements = flattenedChildren(rows?.props?.children).filter(
      (child) => isElement(child) && child.type === native.SettingsRow,
    );
    const key =
      id ??
      [
        source.key,
        settingsValueText(header?.props?.title),
        ...rowElements.map((row) =>
          messageOf(row.props?.label)?.id ?? settingsValueText(row.props?.label),
        ),
      ].join("|");
    const items = Object.freeze(rowElements.map(captureSettingsItem));
    const descriptor = freezeSettingsGroup(
      {
        ...(typeof id === "string" ? { id } : {}),
        ...(header?.props?.title === undefined
          ? {}
          : { title: settingsValueText(header.props.title) }),
        ...(header?.props?.subtitle === undefined
          ? {}
          : { description: settingsValueText(header.props.subtitle) }),
        ...(footer?.props?.children === undefined
          ? {}
          : { footer: settingsValueText(footer.props.children) }),
        items,
        origin: "app",
      },
      APP_SETTINGS_OWNER,
    );
    const view = { source, header, footer, rows, rowElements, descriptor, key };
    settingsNativeGroupViews.set(descriptor, view);
    return view;
  }

  function finalizeNativeSettingsGroups(paneId, captures, confirmsPage) {
    const model = settingsGroupModel(paneId);
    const snapshot = settingsGroupSnapshot(captures);
    model.groups = snapshot.groups;
    model.views = snapshot.views;
    model.viewsById = snapshot.viewsById;
    model.viewsByDescriptor = snapshot.viewsByDescriptor;
    if (confirmsPage) {
      if (pendingNativeSettingsPaneId === paneId) {
        pendingNativeSettingsPaneId = null;
      }
      settingsPaneRenderCounts.set(
        paneId,
        (settingsPaneRenderCounts.get(paneId) ?? 0) + 1,
      );
    }
    scheduleSettingsRefresh();
  }

  function settingsGroupSnapshot(captures) {
    const groups = [];
    const views = [];
    for (const view of captures) {
      const id = view.descriptor.id;
      const existingIndex = views.findIndex((candidate) =>
        id === undefined
          ? candidate.key === view.key
          : candidate.descriptor.id === id,
      );
      if (existingIndex >= 0) {
        groups[existingIndex] = view.descriptor;
        views[existingIndex] = view;
      } else {
        groups.push(view.descriptor);
        views.push(view);
      }
    }

    const viewsById = new Map();
    const viewsByDescriptor = new WeakMap();
    for (const view of views) {
      if (typeof view.descriptor.id === "string") {
        viewsById.set(view.descriptor.id, view);
      } else {
        viewsByDescriptor.set(view.descriptor, view);
      }
    }
    return Object.freeze({
      groups: Object.freeze(groups),
      views: Object.freeze(views),
      viewsById,
      viewsByDescriptor,
    });
  }

  function debugSettingsCapture(id) {
    const rows = native.jsx(native.SettingsRows, { children: [] });
    return {
      key: id,
      rowElements: [],
      rows,
      source: native.jsx(native.SettingsGroup, {
        children: native.jsx(native.SettingsGroup.Content, {
          children: rows,
        }),
      }),
      descriptor: freezeSettingsGroup(
        {
          id,
          items: Object.freeze([
            freezeSettingsItem(
              {
                id: `${id}.item`,
                label: id,
                origin: "app",
              },
              APP_SETTINGS_OWNER,
            ),
          ]),
          origin: "app",
        },
        APP_SETTINGS_OWNER,
      ),
    };
  }

  function replaceDebugSettingsGroupSnapshot(paneId, ids) {
    const request = Object.freeze({
      captures: Object.freeze(ids.map(debugSettingsCapture)),
    });
    debugSettingsSnapshotRequests.set(paneId, request);
    scheduleSettingsRefresh();
    return [...ids];
  }

  function updateDebugSettingsGroupCapture(paneId, groupId, replacementId) {
    const registry = activeSettingsPageCaptureRegistry;
    if (
      !registry?.mounted ||
      registry.pageId !== paneId ||
      typeof replacementId !== "string"
    ) {
      return false;
    }
    const entry = [...(registry.committedPass?.entries.values() ?? [])].find(
      ({ view }) =>
        (view.descriptor.id ?? view.descriptor.title ?? view.key) === groupId,
    );
    const refresh = entry
      ? registry.debugSlotRefreshers.get(entry.token)
      : undefined;
    if (!entry || typeof refresh !== "function") return false;
    registry.debugViews.set(entry.token, {
      source: entry.view,
      replacement: debugSettingsCapture(replacementId),
    });
    refresh();
    return true;
  }

  function debugSettingsPageCommitIsEligible(
    paneId,
    { loading = false, captureReady = true } = {},
  ) {
    const slug =
      typeof paneId === "string" && settingsNavigationRows.has(paneId)
        ? settingsSlug(paneId)
        : null;
    if (slug === null) return false;
    const child = native.jsx(native.SettingsPage, {
      title: native.jsx(native.SettingsSectionTitle, { slug }),
      children: loading
        ? native.jsx(native.SettingsLoading, {})
        : native.jsx(native.React.Fragment, {}),
    });
    return settingsPageCommitIsEligible({
      pageId: settingsPagePaneId(child),
      loading: settingsPageIsLoading(child),
      confirmedNativePaneId: paneId,
      activePaneId: paneId,
      captureReady,
    });
  }

  function runSettingsNavigation(action) {
    if (!holdNextSettingsNavigation) {
      action();
      return;
    }
    holdNextSettingsNavigation = false;
    heldSettingsNavigation = action;
  }

  function settingsGroupView(model, group) {
    return typeof group.id === "string"
      ? model.viewsById.get(group.id)
      : settingsNativeGroupViews.get(group) ??
          model.viewsByDescriptor.get(group);
  }

  function safeSettingsCallback(handler, id) {
    return (...args) => {
      try {
        Promise.resolve(handler(...args)).catch((error) => {
          warn("settings callback of " + id + " rejected", error);
        });
      } catch (error) {
        warn("settings callback of " + id + " threw", error);
      }
    };
  }

  function renderSettingsControl(control, itemId, controlOwner) {
    if (!control || typeof control !== "object") return undefined;
    if (control.kind === "native") {
      return controlOwner === APP_SETTINGS_OWNER
        ? settingsNativeControlElements.get(control)
        : undefined;
    }
    const handler = settingsControlHandlers.get(control);
    if (!handler || handler.extId !== controlOwner) return undefined;
    if (control.kind === "inline") {
      return native.jsx("div", {
        "data-cgptx-settings-inline": "true",
        className: "flex min-w-0 items-center gap-2",
        children: control.controls.map((child, index) =>
          native.jsx(
            "span",
            {
              className: "inline-flex min-w-0 shrink-0",
              children: renderSettingsControl(child, itemId, controlOwner),
            },
            index,
          ),
        ),
      });
    }
    if (control.kind === "toggle") {
      return native.jsx(native.SettingsToggle, {
        checked: control.checked,
        disabled: control.disabled,
        onChange: safeSettingsCallback(handler.callback, itemId),
        ariaLabel: control.ariaLabel,
      });
    }
    if (control.kind === "select") {
      const selected = control.options.find(
        (option) => option.value === control.value,
      );
      const trigger = native.jsx(native.SettingsSelectTrigger, {
        disabled: control.disabled,
        children: native.jsx("span", {
          className: "truncate",
          children: selected?.label ?? control.placeholder ?? "",
        }),
      });
      return native.jsx(native.MenuRoot, {
        align: "end",
        contentWidth: "menuWide",
        disabled: control.disabled,
        triggerButton: trigger,
        children: control.options.map((option) =>
          native.jsx(
            native.Item,
            {
              disabled: option.disabled,
              onSelect: safeSettingsCallback(
                () => handler.callback(option.value),
                itemId,
              ),
              children: option.label,
            },
            option.value,
          ),
        ),
      });
    }
    if (control.kind === "button") {
      return native.jsx(native.SettingsButton, {
        color:
          control.appearance === "danger"
            ? "danger"
            : control.appearance === "primary"
              ? "primary"
              : "secondary",
        disabled: control.disabled,
        size: "toolbar",
        onClick: safeSettingsCallback(handler.callback, itemId),
        children: control.label,
      });
    }
    if (control.kind === "textField") {
      return native.jsx("div", {
        className: "w-44 max-w-full",
        children: native.jsx(native.SettingsTextField, {
          type: "text",
          variant: "compact",
          value: control.value,
          placeholder: control.placeholder,
          disabled: control.disabled,
          onChange: safeSettingsCallback(
            (event) => handler.callback(event.currentTarget.value),
            itemId,
          ),
        }),
      });
    }
    return undefined;
  }

  function renderSettingsTrailingControl(
    item,
    control,
    reserveDisclosure,
  ) {
    if (!reserveDisclosure) return control;
    const disclosure = item.destination
      ? native.jsx(native.SettingsButton, {
          "aria-label": "Open " + item.label + " settings",
          "data-cgptx-settings-disclosure": "true",
          color: "ghost",
          size: "icon",
          uniform: true,
          onClick: safeSettingsCallback(
            () => openSettingsItemDestination(item),
            item.id ?? item.label,
          ),
          children: native.jsx(native.ChevronRight, {
            "aria-hidden": true,
            className: "icon-2xs",
          }),
        })
      : native.jsx(native.SettingsButton, {
          "aria-hidden": true,
          "data-cgptx-settings-disclosure-placeholder": "true",
          color: "ghost",
          size: "icon",
          uniform: true,
          tabIndex: -1,
          style: { opacity: 0, pointerEvents: "none" },
          children: native.jsx(native.ChevronRight, {
            "aria-hidden": true,
            className: "icon-2xs",
          }),
        });
    return native.jsx("div", {
      className: "flex items-center gap-2",
      children: [control, disclosure],
    });
  }

  function openSettingsItemDestination(item) {
    const operation = settingsOpenOperations.then(() =>
      openSettingsPane(item.destination.paneId, item.destination.itemId),
    );
    settingsOpenOperations = operation.catch(() => {});
    return operation;
  }

  function renderSettingsDestinationText(item, content, part) {
    if (!item.destination || content === undefined) return content;
    return native.jsx("span", {
      className: "cursor-interaction",
      "data-cgptx-settings-destination-text": part,
      onClick: safeSettingsCallback(
        () => openSettingsItemDestination(item),
        item.id ?? item.label,
      ),
      children: content,
    });
  }

  function settingsPaneRowClass(paneId) {
    let className = settingsPaneRowClasses.get(paneId);
    if (className === undefined) {
      className = `cgptx-settings-pane-${nextSettingsPaneRowClass++}`;
      settingsPaneRowClasses.set(paneId, className);
    }
    return className;
  }

  function renderSettingsItem(
    paneId,
    model,
    group,
    item,
    reserveDisclosure,
  ) {
    const view =
      typeof item.id === "string"
        ? settingsGroupView(model, group)?.rowElements.find(
            (row) => messageOf(row.props?.label)?.id === item.id,
          )
        : null;
    const itemOwner = settingsItemOwners.get(item);
    const controlOwner = settingsItemControlOwners.get(item);
    const nativeContent =
      itemOwner === APP_SETTINGS_OWNER
        ? settingsNativeItemContent.get(item)
        : undefined;
    return native.jsx(
      native.SettingsRow,
      {
        ...(view?.props ?? {}),
        id: item.id,
        "data-settings-target-id": item.id,
        className: [
          view?.props?.className,
          settingsPaneRowClass(paneId),
        ]
          .filter((value) => typeof value === "string" && value.length > 0)
          .join(" "),
        label: renderSettingsDestinationText(
          item,
          nativeContent && item.label === nativeContent.labelText
            ? nativeContent.label
            : item.label,
          "label",
        ),
        description: renderSettingsDestinationText(
          item,
          nativeContent &&
          item.description === nativeContent.descriptionText
            ? nativeContent.description
            : item.description,
          "description",
        ),
        control: renderSettingsTrailingControl(
          item,
          renderSettingsControl(
            item.control,
            item.id ?? item.label,
            controlOwner,
          ),
          reserveDisclosure,
        ),
      },
      item.id,
    );
  }

  function nativeSettingsMetadata(publicValue, originalValue, nativeValue) {
    return publicValue === originalValue ? nativeValue : publicValue;
  }

  function replaceCapturedSettingsGroupChildren(value, items, metadata) {
    if (Array.isArray(value)) {
      return value.map((child) =>
        replaceCapturedSettingsGroupChildren(child, items, metadata),
      );
    }
    if (!isElement(value)) return value;
    if (value.type === native.SettingsGroup.Header) {
      metadata.hasHeader = true;
      if (metadata.title === undefined && metadata.description === undefined) {
        return null;
      }
      return native.jsx(
        value.type,
        {
          ...value.props,
          title: metadata.title,
          subtitle: metadata.description,
        },
        value.key ?? undefined,
      );
    }
    if (
      native.SettingsGroup.Footer &&
      value.type === native.SettingsGroup.Footer
    ) {
      metadata.hasFooter = true;
      if (metadata.footer === undefined) return null;
      return native.jsx(
        value.type,
        { ...value.props, children: metadata.footer },
        value.key ?? undefined,
      );
    }
    if (value.type === native.SettingsRows) {
      return native.jsx(
        value.type,
        { ...value.props, children: items },
        value.key ?? undefined,
      );
    }
    if (!Object.hasOwn(value.props ?? {}, "children")) return value;
    return native.jsx(
      value.type,
      {
        ...value.props,
        children: replaceCapturedSettingsGroupChildren(
          value.props.children,
          items,
          metadata,
        ),
      },
      value.key ?? undefined,
    );
  }

  function renderCapturedSettingsGroup(view, group, items) {
    const title = nativeSettingsMetadata(
      group.title,
      view.descriptor.title,
      view.header?.props?.title,
    );
    const description = nativeSettingsMetadata(
      group.description,
      view.descriptor.description,
      view.header?.props?.subtitle,
    );
    const footer = nativeSettingsMetadata(
      group.footer,
      view.descriptor.footer,
      view.footer?.props?.children,
    );
    const metadata = {
      title,
      description,
      footer,
      hasHeader: false,
      hasFooter: false,
    };
    let children = replaceCapturedSettingsGroupChildren(
      view.source.props?.children,
      items,
      metadata,
    );
    if (
      !metadata.hasHeader &&
      (title !== undefined || description !== undefined)
    ) {
      children = [
        native.jsx(native.SettingsGroup.Header, {
          title,
          subtitle: description,
        }),
        children,
      ];
    }
    if (
      !metadata.hasFooter &&
      footer !== undefined &&
      native.SettingsGroup.Footer
    ) {
      children = [
        children,
        native.jsx(native.SettingsGroup.Footer, { children: footer }),
      ];
    }
    return native.jsx(
      view.source.type,
      { ...view.source.props, children },
      view.source.key ?? undefined,
    );
  }

  function renderSettingsGroup(paneId, model, group) {
    const reserveDisclosure = group.items.some(
      (item) => item.destination !== undefined,
    );
    const items = group.items.map((item) =>
      renderSettingsItem(
        paneId,
        model,
        group,
        item,
        reserveDisclosure,
      ),
    );
    const view = settingsGroupView(model, group);
    if (view) return renderCapturedSettingsGroup(view, group, items);
    const children = [];
    if (group.title !== undefined || group.description !== undefined) {
      children.push(
        native.jsx(native.SettingsGroup.Header, {
          title: group.title,
          subtitle: group.description,
        }),
      );
    }
    children.push(
      native.jsx(native.SettingsGroup.Content, {
        children: native.jsx(native.SettingsRows, { children: items }),
      }),
    );
    if (group.footer !== undefined && native.SettingsGroup.Footer) {
      children.push(
        native.jsx(native.SettingsGroup.Footer, { children: group.footer }),
      );
    }
    return native.jsx(
      native.SettingsGroup,
      {
        "data-cgptx-settings-group": group.id ?? "",
        children,
      },
      group.id,
    );
  }

  function renderNativeSettingsGroup(source) {
    const view = captureNativeSettingsGroup(source);
    return native.jsx(
      NativeSettingsGroupCapture,
      { view },
      source.key ?? view.key,
    );
  }

  function NativeSettingsGroupCapture({ view }) {
    const React = native.React;
    const context = React.useContext(settingsPageCaptureContext);
    const token = React.useRef(null);
    if (token.current === null) token.current = {};
    const [, refreshDebugView] = React.useReducer(
      (revision) => revision + 1,
      0,
    );
    React.useSyncExternalStore(
      subscribe,
      () => renderVersion,
      () => renderVersion,
    );
    const previousView = React.useRef(view);
    const pageId = context?.pageId ?? null;
    const pass = context?.pass ?? null;
    const registry = context?.registry ?? null;
    const debugView = registry?.debugViews.get(token.current);
    const effectiveView =
      debugView?.source === view ? debugView.replacement : view;
    const wasRegistered = pass?.entries.has(token.current) === true;
    if (pass && registry?.committedPass !== pass) {
      pass.collect(token.current, effectiveView);
    }
    React.useLayoutEffect(() => {
      const changed = previousView.current !== effectiveView;
      previousView.current = effectiveView;
      if (
        pass &&
        registry &&
        (!wasRegistered || changed) &&
        registry.mounted &&
        registry.committedPass === pass
      ) {
        registry.requestRecapture();
      }
    }, [effectiveView, pass, registry, wasRegistered]);
    React.useLayoutEffect(() => {
      if (!registry) return undefined;
      registry.debugSlotRefreshers.set(token.current, refreshDebugView);
      return () => {
        registry.debugSlotRefreshers.delete(token.current);
        registry.debugViews.delete(token.current);
      };
    }, [refreshDebugView, registry]);
    React.useLayoutEffect(
      () => () => {
        if (registry && registry.mounted) {
          registry.requestRecapture();
        }
      },
      [registry],
    );
    if (!context) return effectiveView.source;
    if (!wasRegistered && registry.committedPass === pass) {
      return effectiveView.source;
    }
    const isAnchor =
      registry.committedPass === pass && registry.pageId === pageId
        ? registry.anchorToken === token.current
        : pass.firstToken === token.current;
    if (registry.committedPass !== pass) return effectiveView.source;
    if (!pageId) return null;
    const model = settingsGroupModel(pageId);
    const groups = computeEffectiveSettingsGroups(pageId);
    if (
      groups.length === model.groups.length &&
      groups.every((group, index) => group === model.groups[index])
    ) {
      return effectiveView.source;
    }
    if (!isAnchor) return null;
    return native.jsx(
      native.React.Fragment,
      {
        children: groups.map((group) =>
          renderSettingsGroup(pageId, model, group),
        ),
      },
      "cgptx-settings-groups-" + pageId,
    );
  }

  function renderCustomSettingsChildren(pane) {
    const model = settingsGroupModel(pane.id);
    return computeEffectiveSettingsGroups(pane.id).map((group) =>
      renderSettingsGroup(pane.id, model, group),
    );
  }

  function enhanceSettingsSearchResults(props) {
    const custom = settingsSearchMatches(settingsSearchQuery);
    const byPane = new Map(custom.map((result) => [result.sectionSlug, result]));
    const results = props.searchResults.map(
      (result) => byPane.get(result.sectionSlug) ?? result,
    );
    const existing = new Set(results.map((result) => result.sectionSlug));
    for (const result of custom) {
      if (!existing.has(result.sectionSlug)) results.push(result);
      if (native.settingsSectionIcons?.[result.sectionSlug] === undefined) {
        native.settingsSectionIcons[result.sectionSlug] = resolveIcon("settings");
      }
    }
    return {
      ...props,
      searchResults: results,
      onSelect(sectionSlug) {
        if (
          settingsPanesById(computeEffectiveSettingsCategories()).has(
            sectionSlug,
          )
        ) {
          settingsSearchQuery = "";
          settingsSetSearchQuery?.("");
          void navigateSettingsPane(sectionSlug);
          return;
        }
        props.onSelect(sectionSlug);
      },
    };
  }

  function navigateSettingsPane(paneId) {
    if (typeof paneId !== "string") return false;
    const slug = settingsNavigationRows.has(paneId)
      ? settingsSlug(paneId)
      : null;
    if (slug !== null) {
      const nativeRow = settingsNavigationRows.get(paneId);
      const action = nativeRow?.button.props.onClick;
      if (typeof action !== "function") return false;
      const nativePaneIsActive = nativeRow.button.props.isActive === true;
      activeSettingsPaneId = paneId;
      activeCustomSettingsPaneId = null;
      pendingNativeSettingsPaneId = nativePaneIsActive ? null : paneId;
      if (!nativePaneIsActive) runSettingsNavigation(action);
      emitChange();
      return nativePaneIsActive ? "local" : "native";
    }
    const appearanceRow = settingsNavigationRows.get(
      "codex.settings.appearance",
    );
    const action = appearanceRow?.button.props.onClick;
    if (typeof action !== "function") return false;
    const appearanceIsActive = appearanceRow.button.props.isActive === true;
    activeSettingsPaneId = paneId;
    activeCustomSettingsPaneId = paneId;
    pendingNativeSettingsPaneId = appearanceIsActive
      ? null
      : "codex.settings.appearance";
    if (!appearanceIsActive) runSettingsNavigation(action);
    emitChange();
    return appearanceIsActive ? "local" : "native";
  }

  function waitForSettings(condition, timeoutMs = 5_000) {
    return new Promise((resolve) => {
      const deadline = Date.now() + timeoutMs;
      const tick = () => {
        if (condition()) resolve(true);
        else if (Date.now() >= deadline) resolve(false);
        else setTimeout(tick, 25);
      };
      tick();
    });
  }

  function settingsPaneItemTarget(paneId, itemId) {
    for (const element of document.getElementsByClassName(
      settingsPaneRowClass(paneId),
    )) {
      if (element.id === itemId) return element;
    }
    return null;
  }

  async function openSettingsPane(paneId, itemId) {
    if (
      settingsContentMountCount === 0 ||
      builtInSettingsCategories.size === 0
    ) {
      const canOpen = await waitForSettings(
        () => typeof openNativeSettings === "function",
      );
      if (!canOpen) return false;
      openNativeSettings();
      const opened = await waitForSettings(
        () => {
          const currentPaneId = currentSettingsPaneId();
          return (
            settingsContentMountCount > 0 &&
            builtInSettingsCategories.size > 0 &&
            currentPaneId !== null &&
            pendingNativeSettingsPaneId === null &&
            confirmedNativeSettingsPaneId ===
              settingsHostPaneId(currentPaneId) &&
            settingsPaneRenderCounts.has(currentPaneId)
          );
        },
      );
      if (!opened) return false;
    }
    const pane = settingsPanesById(computeEffectiveSettingsCategories()).get(
      paneId,
    );
    if (!pane || pane.disabled === true) return false;
    const alreadyRendered =
      currentSettingsPaneId() === paneId &&
      pendingNativeSettingsPaneId === null &&
      confirmedNativeSettingsPaneId === settingsHostPaneId(paneId) &&
      settingsPaneRenderCounts.has(paneId);
    if (!alreadyRendered) {
      const renderCount = settingsPaneRenderCounts.get(paneId) ?? 0;
      const navigation = navigateSettingsPane(paneId);
      if (!navigation) return false;
      const rendered = await waitForSettings(
        () =>
          currentSettingsPaneId() === paneId &&
          pendingNativeSettingsPaneId === null &&
          confirmedNativeSettingsPaneId === settingsHostPaneId(paneId) &&
          (settingsPaneRenderCounts.get(paneId) ?? 0) > renderCount,
      );
      if (!rendered) return false;
    }
    const groups = computeEffectiveSettingsGroups(paneId);
    const itemExists =
      itemId === undefined ||
      groups.some((group) => group.items.some((item) => item.id === itemId));
    if (!itemExists) return false;
    if (itemId !== undefined) {
      const rendered = await waitForSettings(
        () =>
          currentSettingsPaneId() === paneId &&
          settingsPaneItemTarget(paneId, itemId) !== null,
      );
      if (!rendered || currentSettingsPaneId() !== paneId) return false;
      const target = settingsPaneItemTarget(paneId, itemId);
      if (target === null) return false;
      target.scrollIntoView({ block: "center" });
    }
    return true;
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

  function updateAssistantSelectionModel(model, tree, selectedText, intl) {
    const selectionChanged = model.context?.selectedText !== selectedText;
    const context = selectionChanged
      ? Object.freeze({
          selectedText,
          createResponseAnnotation(annotation, options) {
            return createAssistantResponseAnnotation(
              model,
              annotation,
              options,
            );
          },
        })
      : model.context;
    if (selectionChanged) {
      model.activePageIds.above = null;
      model.activePageIds.below = null;
    }
    const views = new Map();
    const builtIns = [];
    let actionType = null;
    if (isElement(tree)) {
      for (const child of childrenOf(tree.props?.children)) {
        if (!isElement(child)) continue;
        const message = messageOf(child.props?.children);
        if (!ASSISTANT_SELECTION_MESSAGE_IDS.has(message?.id)) continue;
        const props = child.props ?? {};
        actionType ??= child.type;
        views.set(message.id, {
          props: { ...props },
          type: child.type,
        });
        builtIns.push({
          kind: "action",
          id: message.id,
          label: intl.formatMessage(message),
          placement: "above",
          disabled: props.disabled === true,
          onClick:
            typeof props.onClick === "function"
              ? () => props.onClick()
              : undefined,
          origin: "app",
        });
      }
    }
    model.context = context;
    model.builtInCache = freezeItems(builtIns);
    model.builtInViews = views;
    model.actionType = actionType;
    return model;
  }

  function renderAssistantSelectionAction(model, item) {
    const view = model.builtInViews.get(item.id);
    const builtIn = model.builtInCache.find(
      (candidate) => candidate.id === item.id,
    );
    const type = view?.type ?? model.actionType;
    if (!type) return null;
    const props = view ? { ...view.props } : {};
    const label =
      view && builtIn && item.label === builtIn.label
        ? view.props.children
        : item.label;
    props.children =
      item.labelScale === 2
        ? native.jsx("span", {
            "data-cgptx-label-scale": "2",
            style: { fontSize: "2em", lineHeight: 1 },
            children: label,
          })
        : label;
    props.disabled = item.disabled === true;
    if (item.verticalPadding === 4) {
      props.style = {
        ...props.style,
        height: "auto",
        paddingBlock: "4px",
      };
      props["data-cgptx-vertical-padding"] = "4";
    }
    props["data-cgptx-id"] = item.id;
    props["data-cgptx-origin"] = item.origin ?? "";
    props["data-cgptx-placement"] = item.placement;
    props["data-cgptx-assistant-selection-action"] = "";
    if (
      Array.isArray(item.items) ||
      !(view && builtIn?.onClick === item.onClick)
    ) {
      delete props.onClick;
      if (
        typeof item.onClick === "function" ||
        (Array.isArray(item.items) && item.items.length > 0)
      ) {
        props.onClick = (event) =>
          activateAssistantSelectionModelItem(
            model,
            item.id,
            event?.metaKey === true
              ? ASSISTANT_SELECTION_COMMAND_ACTIVATION
              : ASSISTANT_SELECTION_ACTIVATION,
          );
      }
    }
    return native.jsx(type, props, item.id);
  }

  function renderAssistantSelectionMenu(tree, model, items) {
    if (!isElement(tree)) return tree;
    if (items.length === 0) return null;
    return native.jsx(
      tree.type,
      {
        ...tree.props,
        children: items
          .map((item) => renderAssistantSelectionAction(model, item))
          .filter(Boolean),
      },
      tree.key ?? undefined,
    );
  }

  function positionAssistantSelectionBelowSurface(element, position) {
    const info = position.getPositionInfo();
    const offsetParent = element.offsetParent;
    if (!info || !(offsetParent instanceof HTMLElement)) return;

    const zoom =
      position.selection.portalTarget == null && info.windowZoom > 0
        ? info.windowZoom
        : 1;
    const portalRect =
      position.selection.portalTarget?.getBoundingClientRect() ?? null;
    const boundsLeft =
      portalRect == null
        ? position.selection.horizontalBounds.left
        : portalRect.left +
          position.selection.horizontalBounds.left * info.windowZoom;
    const boundsRight =
      portalRect == null
        ? position.selection.horizontalBounds.right
        : portalRect.left +
          position.selection.horizontalBounds.right * info.windowZoom;
    const availableWidth = Math.max(0, boundsRight - boundsLeft - 16);
    element.style.maxWidth = `${availableWidth / zoom}px`;

    const elementRect = element.getBoundingClientRect();
    const parentRect = offsetParent.getBoundingClientRect();
    const desiredLeft = Math.min(
      Math.max(
        info.selectionRect.x + info.selectionRect.width / 2 -
          elementRect.width / 2,
        boundsLeft + 8,
      ),
      boundsRight - 8 - elementRect.width,
    );
    const desiredTop =
      info.selectionRect.y + info.selectionRect.height + 8;
    element.style.left = `${(desiredLeft - parentRect.left) / zoom}px`;
    element.style.top = `${(desiredTop - parentRect.top) / zoom}px`;
    element.style.visibility = "visible";
  }

  function AssistantSelectionBelowSurface({ tree, model, items, position }) {
    const elementRef = native.React.useRef(null);
    native.React.useLayoutEffect(() => {
      const element = elementRef.current;
      if (!(element instanceof HTMLElement)) return undefined;
      const place = () =>
        positionAssistantSelectionBelowSurface(element, position);
      place();
      const observer = new ResizeObserver(place);
      observer.observe(element);
      return () => observer.disconnect();
    }, [items, position]);
    return native.jsx("div", {
      ref: elementRef,
      "data-cgptx-assistant-selection-below-surface": "",
      style: {
        position: "absolute",
        width: "max-content",
        visibility: "hidden",
        pointerEvents: "none",
      },
      children: renderAssistantSelectionMenu(tree, model, items),
    });
  }

  function renderAssistantSelectionTree(tree, model, position) {
    if (!isElement(tree)) return tree;
    const pages = computeEffectiveAssistantSelectionPages(model);
    if (pages.above.length === 0 && pages.below.length === 0) return null;
    const above = renderAssistantSelectionMenu(
      tree,
      model,
      pages.above,
    );
    if (pages.below.length === 0 || position == null) return above;
    return native.jsx(native.React.Fragment, {
      children: [
        above,
        native.jsx(
          AssistantSelectionBelowSurface,
          { tree, model, items: pages.below, position },
          "cgptx-assistant-selection-below",
        ),
      ],
    });
  }

  function genericThreadDescriptor(raw, shortcuts, views, state, intl) {
    if (raw?.type === "separator") {
      const id = "threadHeader.separator-" + state.separatorIndex.toString();
      state.separatorIndex += 1;
      views.set(id, { raw });
      return { kind: "separator", id, origin: "app" };
    }
    if (!raw || typeof raw !== "object" || typeof raw.id !== "string") {
      return null;
    }
    const message = raw.message;
    if (typeof message?.id !== "string" || message.id.length === 0) {
      return null;
    }
    const id = message.id;
    const label = intl.formatMessage(message, raw.messageValues);
    const nativeHandler =
      typeof raw.onClick === "function"
        ? raw.onClick
        : typeof raw.onSelect === "function"
          ? raw.onSelect
          : undefined;
    const submenu = Array.isArray(raw.submenu)
      ? raw.submenu
          .map((item) =>
            genericThreadDescriptor(item, shortcuts, views, state, intl),
          )
          .filter(Boolean)
      : undefined;
    views.set(id, { raw });
    return {
      kind: "action",
      id,
      label,
      subText: undefined,
      keyboardShortcut:
        typeof shortcuts?.[raw.id] === "string"
          ? shortcuts[raw.id]
          : typeof raw.accelerator === "string"
            ? raw.accelerator
            : undefined,
      disabled: raw.enabled === false,
      onClick:
        nativeHandler === raw.onSelect
          ? publicSelectAction(nativeHandler)
          : nativeHandler,
      ...(submenu ? { items: submenu } : {}),
      origin: "app",
    };
  }

  function updateGenericThreadModel(context, rawItems, shortcuts, intl) {
    let model = threadModels.get(context.threadId);
    if (!model) {
      model = {
        context,
        builtInCache: Object.freeze([]),
        builtInViews: new Map(),
        genericViews: new Map(),
        renderEntriesByRawId: new Map(),
        stockShortcuts: {},
        renderShortcuts: {},
        opaqueCache: new Map(),
        opaqueCount: 0,
        opaqueIds: new Set(),
        unboundOpaque: [],
      };
      threadModels.set(context.threadId, model);
    }
    const views = new Map();
    const state = { separatorIndex: 0 };
    model.context = context;
    model.builtInCache = freezeItems(
      rawItems
        .map((item) =>
          genericThreadDescriptor(item, shortcuts, views, state, intl),
        )
        .filter(Boolean),
    );
    model.builtInViews = new Map();
    model.genericViews = views;
    model.stockShortcuts = { ...(shortcuts ?? {}) };
    model.opaqueCache = new Map();
    model.opaqueCount = 0;
    model.opaqueIds = new Set();
    model.unboundOpaque = [];
    return model;
  }

  function rawThreadItem(model, item, builtIns) {
    const view = model.genericViews.get(item.id);
    const builtIn = builtIns.get(item.id);
    const rawId = view?.raw?.id ?? item.id;
    model.renderEntriesByRawId.set(rawId, { model, item, builtIn });

    if (sameThreadDescriptor(item, builtIn) && view) {
      if (item.kind === "action" && Array.isArray(item.items)) {
        for (const child of item.items) rawThreadItem(model, child, builtIns);
      }
      return view.raw;
    }
    if (item.kind === "separator") {
      return {
        ...(view?.raw ?? {}),
        id: rawId,
        type: "separator",
      };
    }

    const raw = {
      ...(view?.raw ?? {}),
      id: rawId,
      message: { id: item.id, defaultMessage: item.label },
      enabled: item.disabled !== true,
    };
    delete raw.nativeLabel;
    delete raw.nativeTooltip;
    if (item.keyboardShortcut === undefined) delete raw.accelerator;
    else raw.accelerator = item.keyboardShortcut;
    if (item.keyboardShortcut !== builtIn?.keyboardShortcut) {
      if (item.keyboardShortcut === undefined) {
        delete model.renderShortcuts[rawId];
      } else {
        model.renderShortcuts[rawId] = item.keyboardShortcut;
      }
    }
    if (item.icon !== undefined) delete raw.icon;

    if (Array.isArray(item.items) && item.items.length > 0) {
      raw.submenu = item.items.map((child) =>
        rawThreadItem(model, child, builtIns),
      );
      delete raw.onClick;
      delete raw.onSelect;
    } else {
      delete raw.submenu;
      if (view && builtIn?.onClick === item.onClick) {
        raw.onClick = view.raw.onClick;
        raw.onSelect = view.raw.onSelect;
      } else {
        delete raw.onSelect;
        if (typeof item.onClick === "function") raw.onClick = item.onClick;
        else delete raw.onClick;
      }
    }
    return raw;
  }

  function rawThreadItems(model) {
    const effective = computeEffectiveThreadItems(model);
    const builtIns = deepItemsById(model.builtInCache);
    model.renderEntriesByRawId = new Map();
    for (const key of Object.keys(model.renderShortcuts)) {
      delete model.renderShortcuts[key];
    }
    Object.assign(model.renderShortcuts, model.stockShortcuts);
    return effective.map((item) => rawThreadItem(model, item, builtIns));
  }

  function synchronousThreadItems(getItems) {
    const items = getItems();
    if (!Array.isArray(items)) {
      throw new Error("ChatGPT thread menu items are not synchronous");
    }
    return items;
  }

  function renderGenericThreadMenu(tree, context, intl) {
    threadMenuAdapterRenderCount += 1;
    const sourceItems = () => synchronousThreadItems(tree.props.getItems);
    let model = updateGenericThreadModel(
      context,
      sourceItems(),
      tree.props.shortcuts,
      intl,
    );
    const items = rawThreadItems(model);
    const shortcuts = model.renderShortcuts;
    const getItems = () => {
      model = updateGenericThreadModel(
        context,
        sourceItems(),
        tree.props.shortcuts,
        intl,
      );
      return rawThreadItems(model);
    };
    const originalRenderItem = tree.props.renderItem;
    let renderStarted = false;
    const renderItem = (raw) => {
      if (!renderStarted) {
        renderStarted = true;
        pendingGenericThreadItems.clear();
        pendingGenericThreadLeaf = null;
      }
      const entry = model.renderEntriesByRawId.get(raw.id);
      if (!entry) return undefined;
      if (raw.type === "separator" || Array.isArray(raw.submenu)) {
        pendingGenericThreadItems.set(raw.id, entry);
      } else {
        pendingGenericThreadLeaf = entry;
      }
      const stock = sameThreadDescriptor(entry.item, entry.builtIn)
        ? originalRenderItem?.(raw)
        : undefined;
      if (stock != null) {
        if (pendingGenericThreadLeaf === entry) pendingGenericThreadLeaf = null;
        if (pendingGenericThreadItems.get(raw.id) === entry) {
          pendingGenericThreadItems.delete(raw.id);
        }
        return stock;
      }
      return undefined;
    };
    const trigger = tree.props.children;
    const children = isElement(trigger)
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
        items,
        getItems,
        renderItem,
        shortcuts,
        children,
      },
      context.threadId,
    );
  }

  function decorateGenericThreadItem(type, props, key) {
    let entry;
    if (type === native.Item) {
      entry = pendingGenericThreadLeaf;
      pendingGenericThreadLeaf = null;
    } else if (
      type === native.FlyoutSubmenuItem ||
      type === native.Separator
    ) {
      entry = pendingGenericThreadItems.get(key);
      pendingGenericThreadItems.delete(key);
    }
    if (!entry) return props;
    const { item, model, builtIn } = entry;
    const next = {
      ...props,
      "data-cgptx-id": item.id,
      "data-cgptx-origin": item.origin ?? "",
      "data-cgptx-thread-id": model.context.threadId,
    };
    if (item.kind === "separator") return next;
    next.disabled = item.disabled === true;
    if (item.keyboardShortcut !== builtIn?.keyboardShortcut) {
      if (item.keyboardShortcut === undefined) delete next.keyboardShortcut;
      else next.keyboardShortcut = item.keyboardShortcut;
    }
    const hasRichPresentation =
      item.icon !== undefined ||
      item.rightIcon !== undefined ||
      item.subText !== undefined;
    if (item.icon !== undefined) next.LeftIcon = resolveThreadIcon(item.icon);
    else if (hasRichPresentation) {
      const rawIcon = model.genericViews.get(item.id)?.raw?.icon;
      if (typeof rawIcon === "string") {
        next.LeftIcon = function GenericThreadNativeIcon({ className }) {
          return native.jsx("span", {
            "aria-hidden": true,
            className: `${className ?? ""} block shrink-0`.trim(),
            style: {
              maskImage: `url("${rawIcon}")`,
              maskPosition: "center",
              maskRepeat: "no-repeat",
              maskSize: "contain",
              backgroundColor: "currentColor",
            },
          });
        };
      }
    }
    if (item.rightIcon !== undefined) {
      next.RightIcon = resolveIcon(item.rightIcon);
    }
    if (item.subText !== undefined) next.SubText = item.subText;
    if (hasRichPresentation) {
      if (type === native.FlyoutSubmenuItem) next.label = item.label;
      else next.children = item.label;
    }
    return next;
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
      if (cached?.length > 0) {
        const groupIds = cached.map((entry) => entry.descriptor.id);
        for (const entry of cached) {
          entries.push({ kind: "item", descriptor: entry.descriptor });
          views.set(entry.descriptor.id, {
            kind: "opaque-group",
            props: entry.props,
            sourceElement: value,
            groupIds,
          });
          state.opaqueIds.add(entry.descriptor.id);
        }
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
      view && builtIn && item.label === builtIn.label
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
        view && builtIn && item.label === builtIn.label
          ? view.props.label
          : item.label;
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
    const builtIns = deepItemsById(model.builtInCache);
    const rendered = [];
    for (let index = 0; index < effective.length; index += 1) {
      const item = effective[index];
      const view = model.builtInViews.get(item.id);
      if (
        view?.kind === "opaque-group" &&
        view.groupIds[0] === item.id
      ) {
        const group = effective.slice(index, index + view.groupIds.length);
        const unchanged =
          group.length === view.groupIds.length &&
          group.every(
            (candidate, groupIndex) =>
              candidate.id === view.groupIds[groupIndex] &&
              sameThreadDescriptor(candidate, builtIns.get(candidate.id)),
          );
        if (unchanged) {
          rendered.push({ id: item.id, element: view.sourceElement });
          index += view.groupIds.length - 1;
          continue;
        }
      }
      rendered.push({
        id: item.id,
        element: renderThreadItem(model, item),
      });
    }
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
    const rootProps = {
      ...tree.props,
      triggerButton,
      children: rendered.map((entry) => entry.element),
    };
    return native.jsx(tree.type, rootProps, tree.key ?? undefined);
  }

  function renderThreadTree(value, context, intl) {
    if (Array.isArray(value)) {
      return value.map((child) => renderThreadTree(child, context, intl));
    }
    if (!isElement(value)) return value;
    if (value.type === native.ThreadMenuAdapter) {
      return renderGenericThreadMenu(value, context, intl);
    }
    if (value.type === native.MenuRoot) {
      return renderThreadMenuRoot(value, context);
    }
    if (value.props?.children === undefined) return value;
    const children = renderThreadTree(value.props.children, context, intl);
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
    const [headerBottom, setHeaderBottom] = React.useState(
      request.headerBottom,
    );
    const surface = React.useRef(null);
    const changeColor = (nextColor) => {
      const normalized = normalizePickerColor(nextColor);
      setColor(normalized);
      previewColorPicker(request, normalized);
    };
    React.useLayoutEffect(() => {
      const finishOutside = (event) => {
        if (!surface.current.contains(event.target)) {
          settleColorPicker(request, request.color);
        }
      };
      addEventListener("pointerdown", finishOutside, true);
      return () => {
        removeEventListener("pointerdown", finishOutside, true);
      };
    }, [request]);
    React.useEffect(() => {
      if (headerBottom !== null) return undefined;
      let frame;
      const captureHeader = () => {
        const header = document.querySelector(
          'header[data-pip-obstacle="app-shell-header"]',
        );
        if (header) setHeaderBottom(header.getBoundingClientRect().bottom);
        else frame = requestAnimationFrame(captureHeader);
      };
      captureHeader();
      return () => cancelAnimationFrame(frame);
    }, [headerBottom]);
    React.useLayoutEffect(() => {
      surface.current?.querySelector('[role="slider"]')?.focus();
    }, [headerBottom]);
    if (headerBottom === null) return null;
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
    addEventListener("keydown", finishActiveColorPickerFromKeyboard, true);
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
      nativeApplicationScope = native.useScope(native.ApplicationScope);
      const queryClient = native.useQueryClient();
      const appServerRegistry = native.useAppServerRegistry();
      nativeAppServerRegistry = appServerRegistry;
      refreshAuthentication = async () => {
        authenticationRefreshCount += 1;
        queryClient.removeQueries({
          queryKey: native.accountInfoQueryKey("account-info"),
          exact: true,
        });
        queryClient.removeQueries({
          queryKey: ["accounts", "check"],
          exact: true,
        });
        authenticationAccountInfoResetCount += 1;
      };
    }

    function useNativeProfileNavigation(profileProps) {
      const dispatchHostMessage = native.messageBus?.dispatchHostMessage;
      openNativeProfile = () => {
        profileNavigationAttemptCount += 1;
        profileNavigationLastRequestedPath = "/settings/profile";
        if (typeof dispatchHostMessage === "function") {
          // Let the native submenu close before its focus restoration runs.
          setTimeout(() => {
            void openSettingsPane("codex.settings.profile");
          }, 250);
        } else {
          profileProps?.onOpenProfile?.();
        }
      };
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

    function isAssistantSelectionMenu(type, props) {
      return (
        type === native.SelectedTextOverlay &&
        typeof props?.selectedText === "string" &&
        props.selectedText.length > 0 &&
        props.onCommentSelectedText == null &&
        props.onEditSelectedText == null &&
        [
          props.onAddSelectedText,
          props.onOpenQuickChat,
          props.onOpenSideChat,
        ].some((handler) => typeof handler === "function")
      );
    }

    function isAssistantSelectionPositioner(type, props) {
      return (
        type === native.SelectedTextPositioner &&
        props?.bottomBoundarySelector ===
          "[data-thread-scroll-footer='true']" &&
        typeof props?.children === "function"
      );
    }

    function wrapAssistantSelectionPositionerProps(props) {
      const render = props.children;
      return {
        ...props,
        children(selection, getPositionInfo) {
          const value = Object.freeze({ selection, getPositionInfo });
          return originalJsx(assistantSelectionPositionContext.Provider, {
            value,
            children: render(selection, getPositionInfo),
          });
        },
      };
    }

    function AssistantSelectionBoundary({ child }) {
      assistantSelectionBoundaryRenderCount += 1;
      const intl = native.useIntl();
      const position = React.useContext(assistantSelectionPositionContext);
      React.useSyncExternalStore(
        subscribeAssistantSelection,
        () => assistantSelectionRenderVersion,
        () => assistantSelectionRenderVersion,
      );
      const modelRef = React.useRef(null);
      if (modelRef.current === null) {
        modelRef.current = {
          activePageIds: { above: null, below: null },
          activatingLeaf: false,
          context: null,
          builtInCache: Object.freeze([]),
          builtInViews: new Map(),
          actionType: null,
        };
      }
      const tree = child.type(child.props);
      const model = updateAssistantSelectionModel(
        modelRef.current,
        tree,
        child.props.selectedText,
        intl,
      );
      React.useLayoutEffect(() => {
        activeAssistantSelectionModel = model;
        return () => {
          if (activeAssistantSelectionModel === model) {
            activeAssistantSelectionModel = null;
          }
        };
      }, [model]);
      return renderAssistantSelectionTree(tree, model, position);
    }

    function isResponseAnnotationLayer(type, props) {
      return (
        pendingResponseAnnotationCreation !== null &&
        typeof type === "function" &&
        Array.isArray(props?.annotations) &&
        props.editingAnnotation?.mode === "create" &&
        typeof props.editingAnnotation.id === "string" &&
        typeof props.onDirectSubmit === "function" &&
        typeof props.onDiscardAnnotation === "function" &&
        typeof props.onEditingAnnotationChange === "function" &&
        typeof props.onRemoveAnnotation === "function" &&
        typeof props.onUpdateAnnotation === "function"
      );
    }

    function ResponseAnnotationCreationBoundary({ child, layerProps }) {
      const request = pendingResponseAnnotationCreation;
      const annotationId = layerProps.editingAnnotation?.id;
      const createdAnnotation = layerProps.annotations.find(
        (annotation) => annotation.id === annotationId,
      );
      React.useLayoutEffect(() => {
        if (
          request === null ||
          pendingResponseAnnotationCreation !== request ||
          createdAnnotation == null ||
          createdAnnotation.text.trim() !== request.selectedText.trim()
        ) {
          return;
        }
        pendingResponseAnnotationCreation = null;
        clearTimeout(request.timeout);
        try {
          layerProps.onEditingAnnotationChange(null);
          if (request.submit) {
            layerProps.onDirectSubmit(annotationId, request.annotation);
          } else {
            layerProps.onUpdateAnnotation(annotationId, request.annotation);
          }
          responseAnnotationCreationCount += 1;
          lastResponseAnnotationCreation = Object.freeze({
            annotation: request.annotation,
            selectedText: createdAnnotation.text,
            submit: request.submit,
          });
          request.resolve();
        } catch (error) {
          request.reject(error);
        }
      }, [annotationId, createdAnnotation, layerProps, request]);
      return child;
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
      threadMenuBoundaryRenderCount += 1;
      const intl = native.useIntl();
      React.useSyncExternalStore(
        subscribeThreadMenu,
        () => threadMenuRenderVersion,
        () => threadMenuRenderVersion,
      );
      const context = threadContextForMenuProps(child.props);
      React.useLayoutEffect(() => {
        setCurrentThread(context);
        return () => clearCurrentThreadAfterUnmount(context.threadId);
      }, [context.threadId, context.title, context.workingDirectory]);
      return renderThreadTree(child.type(child.props), context, intl);
    }

    function ProfileComponentBoundary({ child }) {
      useNativePostAuthenticationRefresh();
      useNativeProfileNavigation(child.props);
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
      useNativeProfileNavigation(child.props);
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

    function SettingsContentBoundary({ child }) {
      settingsContentBoundaryRenderCount += 1;
      React.useSyncExternalStore(
        subscribe,
        () => renderVersion,
        () => renderVersion,
      );
      const renderedActivePaneId = activeSettingsPaneId;
      const renderedConfirmedNativePaneId = confirmedNativeSettingsPaneId;
      const renderedCustomPaneId = activeCustomSettingsPaneId;
      const explicitPageId = settingsPagePaneId(child);
      const loading = settingsPageIsLoading(child);
      const [captureRevision, requestCaptureRevision] = React.useReducer(
        (revision) => revision + 1,
        0,
      );
      const registryRef = React.useRef(null);
      if (registryRef.current === null) {
        registryRef.current = {
          mounted: false,
          pageId: null,
          committedPass: null,
          anchorToken: null,
          debugViews: new Map(),
          debugSlotRefreshers: new Map(),
          requestRecapture: requestCaptureRevision,
        };
      }
      const registry = registryRef.current;
      const pageId = explicitPageId;
      const debugSnapshotPaneId = renderedCustomPaneId ?? pageId;
      const debugSnapshotRequest = debugSnapshotPaneId
        ? debugSettingsSnapshotRequests.get(debugSnapshotPaneId)
        : undefined;
      registry.requestRecapture = () => {
        if (registry.mounted) requestCaptureRevision();
      };
      const pass = React.useMemo(
        () => createSettingsCapturePass(pageId),
        [child, pageId, renderedCustomPaneId, captureRevision],
      );
      React.useEffect(() => {
        settingsContentMountCount += 1;
        return () => {
          settingsContentMountCount -= 1;
        };
      }, []);
      React.useLayoutEffect(() => {
        registry.mounted = true;
        activeSettingsPageCaptureRegistry = registry;
        return () => {
          registry.mounted = false;
          if (activeSettingsPageCaptureRegistry === registry) {
            activeSettingsPageCaptureRegistry = null;
          }
        };
      }, [registry]);
      React.useLayoutEffect(() => {
        const entries = [...pass.entries.values()].sort(
          (left, right) => left.order - right.order,
        );
        registry.pageId = pageId;
        registry.committedPass = pass;
        registry.anchorToken = entries[0]?.token ?? null;
        if (!pageId || loading) return;
        const captureReady =
          renderedCustomPaneId !== null ||
          entries.length > 0 ||
          pageId === "codex.settings.environments" ||
          pageId === "codex.settings.profile";
        const confirmsPage = settingsPageCommitIsEligible({
          pageId,
          loading,
          confirmedNativePaneId: renderedConfirmedNativePaneId,
          activePaneId: renderedActivePaneId,
          captureReady,
        });
        if (
          debugSnapshotPaneId &&
          debugSnapshotRequest &&
          debugSettingsSnapshotRequests.get(debugSnapshotPaneId) ===
            debugSnapshotRequest
        ) {
          debugSettingsSnapshotRequests.delete(debugSnapshotPaneId);
          debugSettingsSnapshotCommitCount += 1;
        }
        if (!renderedCustomPaneId) {
          finalizeNativeSettingsGroups(
            pageId,
            debugSnapshotRequest?.captures ??
              entries.map((entry) => entry.view),
            confirmsPage,
          );
          return;
        }
        if (debugSnapshotRequest) {
          finalizeNativeSettingsGroups(
            renderedCustomPaneId,
            debugSnapshotRequest.captures,
            false,
          );
        }
        if (!confirmsPage) return;
        if (pendingNativeSettingsPaneId === pageId) {
          pendingNativeSettingsPaneId = null;
        }
        settingsPaneRenderCounts.set(
          renderedCustomPaneId,
          (settingsPaneRenderCounts.get(renderedCustomPaneId) ?? 0) + 1,
        );
        scheduleSettingsRefresh();
      }, [
        debugSnapshotPaneId,
        debugSnapshotRequest,
        captureRevision,
        loading,
        pageId,
        pass,
        registry,
        renderedActivePaneId,
        renderedConfirmedNativePaneId,
        renderedCustomPaneId,
      ]);
      const paneId = renderedCustomPaneId;
      let content = child;
      if (paneId) {
        const panes = settingsPanesById(computeEffectiveSettingsCategories());
        const pane = panes.get(paneId);
        if (pane) {
          const parentPane = extensionSettingsParentPane(paneId, panes);
          const title = pane.title ?? pane.label;
          content = React.cloneElement(child, {
            title: parentPane
              ? native.jsx(native.ToolbarBreadcrumb, {
                  ancestors: [
                    {
                      id: parentPane.id,
                      label: parentPane.label,
                      onClick: () => {
                        void openSettingsPane(parentPane.id).catch((error) =>
                          warn(
                            'extension settings breadcrumb failed to open',
                            error,
                          ),
                        );
                      },
                    },
                  ],
                  current: title,
                })
              : title,
            children: renderCustomSettingsChildren(pane),
          });
        }
      } else if (
        !loading &&
        (pageId === "codex.settings.profile" ||
          pageId === "codex.settings.environments")
      ) {
        const groups =
          registry.committedPass === pass && registry.anchorToken === null
            ? computeEffectiveSettingsGroups(pageId).map((group) =>
                renderSettingsGroup(
                  pageId,
                  settingsGroupModel(pageId),
                  group,
                ),
              )
            : [];
        content = React.cloneElement(child, {
          children: [
            React.createElement(React.Fragment, {
              key: "cgptx-native-settings-content",
              children: child.props.children,
            }),
            React.createElement(React.Fragment, {
              key: "cgptx-extension-settings-groups",
              children: groups,
            }),
          ],
        });
      }
      const context = React.useMemo(
        () => ({ pageId, pass, registry }),
        [pageId, pass, registry],
      );
      return React.createElement(
        settingsPageCaptureContext.Provider,
        { value: context },
        content,
      );
    }

    function wrap(original) {
      return function cgptxJsx(type, props, key) {
        if (isAssistantSelectionPositioner(type, props)) {
          props = wrapAssistantSelectionPositionerProps(props);
        }
        if (
          type === native.Item ||
          type === native.FlyoutSubmenuItem ||
          type === native.Separator
        ) {
          props = decorateGenericThreadItem(type, props, key);
        }
        if (type === native.SettingsPage) {
          return originalJsx(
            SettingsContentBoundary,
            { child: original(type, props, key) },
            key,
          );
        }
        const settingsCategoryId =
          SETTINGS_CATEGORY_MESSAGE_IDS[messageOf(props?.title)?.id];
        if (settingsCategoryId) {
          return renderSettingsNavigationGroup(
            original(type, props, key),
            settingsCategoryId,
          );
        }
        if (type === native.SettingsGroup) {
          return renderNativeSettingsGroup(original(type, props, key));
        }
        if (
          typeof props?.searchQuery === "string" &&
          typeof props?.onQueryChange === "function"
        ) {
          settingsSearchQuery = props.searchQuery;
          const onQueryChange = props.onQueryChange;
          settingsSetSearchQuery = onQueryChange;
          props = {
            ...props,
            onQueryChange(query) {
              settingsSearchQuery = query;
              onQueryChange(query);
            },
          };
        }
        if (
          Array.isArray(props?.searchResults) &&
          typeof props?.onSelect === "function" &&
          props?.intl &&
          props?.listRef
        ) {
          props = enhanceSettingsSearchResults(props);
        }
        if (isResponseAnnotationLayer(type, props)) {
          return originalJsx(
            ResponseAnnotationCreationBoundary,
            {
              child: original(type, props, key),
              layerProps: props,
            },
            key,
          );
        }
        if (isAssistantSelectionMenu(type, props)) {
          return originalJsx(
            AssistantSelectionBoundary,
            {
              child: original(type, props, key),
            },
            key,
          );
        }
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

  function applicationReactRoot() {
    if (!document.body) return null;
    for (const node of document.body.querySelectorAll("*")) {
      let fiber = fiberOf(node);
      if (!fiber) continue;
      while (fiber.return) fiber = fiber.return;
      if (fiber.tag === 3 && fiber.stateNode?.current) {
        return fiber.stateNode;
      }
    }
    return null;
  }

  async function reconcileApplicationTree() {
    const deadline = Date.now() + 10_000;
    let root = null;
    let element = null;
    while (Date.now() < deadline) {
      root = applicationReactRoot();
      element = root?.current?.memoizedState?.element;
      if (root && isElement(element)) break;
      await new Promise((resolve) => setTimeout(resolve, 25));
    }
    if (!root || !isElement(element)) {
      throw new Error("ChatGPT React root is unavailable");
    }

    const existingThreadMenu = Array.from(
      document.querySelectorAll('button[aria-label="Chat actions"]'),
    ).some((button) => button.getBoundingClientRect().height > 0);
    const probe = native.ReactDOM.createRoot(document.createElement("div"));
    const render = Object.getPrototypeOf(probe)?.render;
    probe.unmount();
    if (typeof render !== "function") {
      throw new Error("ChatGPT React root renderer is unavailable");
    }
    render.call(
      { _internalRoot: root },
      native.React.cloneElement(element),
    );
    applicationRootRefreshCount += 1;

    if (!existingThreadMenu) return;
    const boundaryDeadline = Date.now() + 10_000;
    while (Date.now() < boundaryDeadline) {
      const boundaryReady = Array.from(
        document.querySelectorAll('button[aria-label="Chat actions"]'),
      ).some(
        (button) =>
          button.getBoundingClientRect().height > 0 &&
          typeof threadIdForTrigger(button) === "string",
      );
      if (boundaryReady) return;
      await new Promise((resolve) => setTimeout(resolve, 50));
    }
    throw new Error("ChatGPT thread menu did not enter the native boundary");
  }

  async function installNativeBinding() {
    const [
      appInitialModule,
      plusIconModule,
      paletteIconModule,
      threadMenuModule,
      authModule,
      settingsVisibilityModule,
      settingsLoadingModule,
      toolbarBreadcrumbModule,
    ] = await Promise.all([
      import(APP_INITIAL_MODULE),
      import(PLUS_ICON_MODULE),
      import(PALETTE_ICON_MODULE),
      import(THREAD_MENU_MODULE),
      import(AUTH_MODULE),
      import(SETTINGS_VISIBILITY_MODULE),
      import(SETTINGS_LOADING_MODULE),
      import(TOOLBAR_BREADCRUMB_MODULE),
    ]);
    authModule.r();
    appInitialModule.c4();
    appInitialModule.x0();
    appInitialModule.zI();
    appInitialModule.UGt();
    appInitialModule.Jct();
    appInitialModule.zct();
    appInitialModule.yFt();
    appInitialModule.co();
    appInitialModule.to();
    appInitialModule.kn();
    appInitialModule.IS();
    appInitialModule.HS();
    appInitialModule.aG();
    appInitialModule.XN();
    appInitialModule.$Y();
    appInitialModule.n4();
    appInitialModule.rh();
    appInitialModule.V8();
    appInitialModule.tc();
    settingsVisibilityModule.t();
    settingsLoadingModule.n();
    toolbarBreadcrumbModule.n();
    plusIconModule.t();
    paletteIconModule.n();
    threadMenuModule.n();
    const jsxRuntime = appInitialModule.VKt();
    const PlusIcon = ({ className = "", ...props }) =>
      jsxRuntime.jsx(plusIconModule.n, {
        ...props,
        className: `${className} lucide-plus-icon`.trim(),
        size: 16,
      });
    native = {
      React: appInitialModule.XKt(),
      ReactDOM: appInitialModule.Kzt(),
      jsxRuntime,
      jsx: jsxRuntime.jsx,
      Item: appInitialModule.a4.Item,
      Separator: appInitialModule.a4.Separator,
      SubmenuItem: appInitialModule.a4.SubmenuItem,
      FlyoutSubmenuItem: appInitialModule.a4.FlyoutSubmenuItem,
      MenuRoot: appInitialModule.r4,
      SelectedTextOverlay: appInitialModule.RI,
      SelectedTextPositioner: appInitialModule.jX,
      ThreadMenuAdapter: appInitialModule.b0,
      ThreadMenu: threadMenuModule.t,
      ColorPicker: appInitialModule.ec,
      startChatGptSignIn: authModule.o,
      decorateAuthUrl: authModule.t,
      useAppServerRegistry: appInitialModule.Zct,
      useQueryClient: appInitialModule.BKt,
      accountInfoQueryKey: appInitialModule.oFt,
      messageBus: appInitialModule.bFt,
      openInBrowser: appInitialModule.Zpt,
      useNavigate: appInitialModule.FIt,
      useIntl: appInitialModule.Pzt,
      useScope: appInitialModule.HGt,
      ApplicationScope: appInitialModule.bzt,
      SettingsPage: appInitialModule.oo,
      SettingsSectionTitle: appInitialModule.eo,
      SettingsLoading: settingsLoadingModule.t,
      SettingsGroup: appInitialModule.On,
      SettingsRows: appInitialModule.FS,
      SettingsRow: appInitialModule.VS,
      SettingsToggle: appInitialModule.iG,
      SettingsSelectTrigger: appInitialModule.Qa,
      SettingsButton: appInitialModule.qN,
      SettingsTextField: appInitialModule.ZY,
      ChevronRight: appInitialModule.t4,
      ToolbarBreadcrumb: toolbarBreadcrumbModule.t,
      settingsSectionIcons: settingsVisibilityModule.r,
      iconComponents: new Map([
        ["chevron-right", appInitialModule.t4],
        ["person", appInitialModule.nh],
        ["plus", PlusIcon],
        ["palette", paletteIconModule.t],
        ["settings", appInitialModule.B8],
      ]),
    };
    openNativeSettings = () => {
      native.messageBus.dispatchHostMessage({
        type: "navigate-to-route",
        path: "/settings/general-settings",
      });
    };
    settingsPageCaptureContext = native.React.createContext(null);
    assistantSelectionPositionContext = native.React.createContext(null);
    installJsxHook();
    await reconcileApplicationTree();
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
    nativeBindingInstalled = true;
  }

  // ------------------------------------------------------------------
  // Public API and extension registry
  // ------------------------------------------------------------------

  function makeAssistantSelectionMenuApi(extId) {
    return Object.freeze({
      transformItems(transform) {
        if (typeof transform !== "function") {
          throw new TypeError(
            "assistant-selection transformItems requires a function",
          );
        }
        const entry = { extId, transform };
        assistantSelectionTransformers.push(entry);
        emitAssistantSelectionChange();
        let disposed = false;
        return Object.freeze({
          dispose() {
            if (disposed) return;
            disposed = true;
            const index = assistantSelectionTransformers.indexOf(entry);
            if (index >= 0) assistantSelectionTransformers.splice(index, 1);
            emitAssistantSelectionChange();
          },
        });
      },

      getItems() {
        return activeAssistantSelectionModel
          ? computeEffectiveAssistantSelectionItems(
              activeAssistantSelectionModel,
            )
          : Object.freeze([]);
      },

      activateItem(id) {
        return activeAssistantSelectionModel
          ? activateAssistantSelectionModelItem(
              activeAssistantSelectionModel,
              id,
            )
          : false;
      },
    });
  }

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
        emitThreadMenuChange();
        let disposed = false;
        return Object.freeze({
          dispose() {
            if (disposed) return;
            disposed = true;
            const index = threadTransformers.indexOf(entry);
            if (index >= 0) threadTransformers.splice(index, 1);
            emitThreadMenuChange();
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

  function settingsRegistration(collection, extId, transform, label) {
    if (typeof transform !== "function") {
      throw new TypeError(label + " requires a function");
    }
    const entry = { extId, transform };
    collection.push(entry);
    emitChange();
    let disposed = false;
    return Object.freeze({
      invalidate() {
        if (!disposed) emitChange();
      },
      dispose() {
        if (disposed) return;
        disposed = true;
        const index = collection.indexOf(entry);
        if (index >= 0) collection.splice(index, 1);
        emitChange();
      },
    });
  }

  function settingsOptions(value, label) {
    if (!value || typeof value !== "object" || Array.isArray(value)) {
      throw new TypeError(label + " requires options");
    }
    return value;
  }

  function makeSettingsUiApi(extId) {
    return Object.freeze({
      toggle(rawOptions) {
        const options = settingsOptions(rawOptions, "settings toggle");
        if (typeof options.checked !== "boolean") {
          throw new TypeError("settings toggle checked must be boolean");
        }
        if (
          options.disabled !== undefined &&
          typeof options.disabled !== "boolean"
        ) {
          throw new TypeError("settings toggle disabled must be boolean");
        }
        if (typeof options.onChange !== "function") {
          throw new TypeError("settings toggle onChange must be a function");
        }
        const control = Object.freeze({
          kind: "toggle",
          checked: options.checked,
          disabled: options.disabled === true,
        });
        settingsControlHandlers.set(control, {
          extId,
          callback: options.onChange,
        });
        return control;
      },

      select(rawOptions) {
        const options = settingsOptions(rawOptions, "settings select");
        if (
          options.value !== undefined &&
          typeof options.value !== "string"
        ) {
          throw new TypeError("settings select value must be a string");
        }
        if (
          options.placeholder !== undefined &&
          typeof options.placeholder !== "string"
        ) {
          throw new TypeError("settings select placeholder must be a string");
        }
        if (!Array.isArray(options.options)) {
          throw new TypeError("settings select options must be an array");
        }
        if (typeof options.onChange !== "function") {
          throw new TypeError("settings select onChange must be a function");
        }
        const seen = new Set();
        const normalized = options.options.map((option) => {
          if (
            !option ||
            typeof option !== "object" ||
            typeof option.value !== "string" ||
            typeof option.label !== "string"
          ) {
            throw new TypeError(
              "settings select options require string values and labels",
            );
          }
          if (seen.has(option.value)) {
            throw new TypeError(
              "settings select option values must be unique: " + option.value,
            );
          }
          if (
            option.disabled !== undefined &&
            typeof option.disabled !== "boolean"
          ) {
            throw new TypeError(
              "settings select option disabled must be boolean",
            );
          }
          seen.add(option.value);
          return Object.freeze({
            value: option.value,
            label: option.label,
            disabled: option.disabled === true,
          });
        });
        if (
          options.value !== undefined &&
          !seen.has(options.value)
        ) {
          throw new TypeError(
            "settings select value must match an option value",
          );
        }
        if (
          options.disabled !== undefined &&
          typeof options.disabled !== "boolean"
        ) {
          throw new TypeError("settings select disabled must be boolean");
        }
        const control = Object.freeze({
          kind: "select",
          value: options.value,
          placeholder: options.placeholder,
          options: Object.freeze(normalized),
          disabled: options.disabled === true,
        });
        settingsControlHandlers.set(control, {
          extId,
          callback: options.onChange,
        });
        return control;
      },

      button(rawOptions) {
        const options = settingsOptions(rawOptions, "settings button");
        if (typeof options.label !== "string" || options.label.length === 0) {
          throw new TypeError("settings button label must be non-empty");
        }
        if (
          options.appearance !== undefined &&
          !["primary", "secondary", "danger"].includes(options.appearance)
        ) {
          throw new TypeError("settings button appearance is invalid");
        }
        if (
          options.disabled !== undefined &&
          typeof options.disabled !== "boolean"
        ) {
          throw new TypeError("settings button disabled must be boolean");
        }
        if (typeof options.onClick !== "function") {
          throw new TypeError("settings button onClick must be a function");
        }
        const control = Object.freeze({
          kind: "button",
          label: options.label,
          appearance: options.appearance ?? "secondary",
          disabled: options.disabled === true,
        });
        settingsControlHandlers.set(control, {
          extId,
          callback: options.onClick,
        });
        return control;
      },

      textField(rawOptions) {
        const options = settingsOptions(rawOptions, "settings text field");
        if (typeof options.value !== "string") {
          throw new TypeError("settings text field value must be a string");
        }
        if (
          options.placeholder !== undefined &&
          typeof options.placeholder !== "string"
        ) {
          throw new TypeError(
            "settings text field placeholder must be a string",
          );
        }
        if (
          options.disabled !== undefined &&
          typeof options.disabled !== "boolean"
        ) {
          throw new TypeError("settings text field disabled must be boolean");
        }
        if (typeof options.onChange !== "function") {
          throw new TypeError(
            "settings text field onChange must be a function",
          );
        }
        const control = Object.freeze({
          kind: "textField",
          value: options.value,
          placeholder: options.placeholder,
          disabled: options.disabled === true,
        });
        settingsControlHandlers.set(control, {
          extId,
          callback: options.onChange,
        });
        return control;
      },

      inline(rawControls) {
        if (!Array.isArray(rawControls) || rawControls.length === 0) {
          throw new TypeError(
            "settings inline requires one or more controls",
          );
        }
        for (const control of rawControls) {
          const handler = settingsControlHandlers.get(control);
          if (!handler || handler.extId !== extId) {
            throw new TypeError(
              "settings inline controls must belong to this extension",
            );
          }
          if (control.kind === "inline") {
            throw new TypeError("settings inline controls cannot be nested");
          }
        }
        const control = Object.freeze({
          kind: "inline",
          controls: Object.freeze([...rawControls]),
        });
        settingsControlHandlers.set(control, { extId });
        return control;
      },
    });
  }

  function makeSettingsApi(extId) {
    return Object.freeze({
      ui: makeSettingsUiApi(extId),

      transformCategories(transform) {
        return settingsRegistration(
          settingsCategoryTransformers,
          extId,
          transform,
          "settings transformCategories",
        );
      },

      transformGroups(transform) {
        return settingsRegistration(
          settingsGroupTransformers,
          extId,
          transform,
          "settings transformGroups",
        );
      },

      transformItems(transform) {
        return settingsRegistration(
          settingsItemTransformers,
          extId,
          transform,
          "settings transformItems",
        );
      },

      getCategories() {
        return computeEffectiveSettingsCategories();
      },

      getGroups(paneId) {
        if (typeof paneId !== "string" || paneId.length === 0) {
          throw new TypeError("settings getGroups requires a pane id");
        }
        return computeEffectiveSettingsGroups(paneId);
      },

      open(paneId, rawOptions = {}) {
        if (typeof paneId !== "string" || paneId.length === 0) {
          throw new TypeError("settings open requires a pane id");
        }
        const options = settingsOptions(rawOptions, "settings open");
        if (
          options.itemId !== undefined &&
          (typeof options.itemId !== "string" || options.itemId.length === 0)
        ) {
          throw new TypeError("settings open itemId must be non-empty");
        }
        const operation = settingsOpenOperations.then(() =>
          openSettingsPane(paneId, options.itemId),
        );
        settingsOpenOperations = operation.catch(() => {});
        return operation;
      },
    });
  }

  function makeApi(extId) {
    return Object.freeze({
      menus: Object.freeze({
        assistantSelection: makeAssistantSelectionMenuApi(extId),
        profile: makeProfileMenuApi(extId),
        thread: makeThreadMenuApi(extId),
      }),
      threads: makeThreadsApi(extId),
      authentication: makeAuthenticationApi(extId),
      appearance: makeAppearanceApi(extId),
      settings: makeSettingsApi(extId),
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

  function registerExtensionSettings(id, moduleExports, paneId) {
    if (extensionSettings.has(id)) return;
    if (
      typeof paneId !== "string" ||
      !paneId.startsWith(`${id}.`) ||
      paneId.length <= id.length + 1
    ) {
      warn('extension settings "' + id + '" has an invalid pane id');
      return;
    }
    extensionSettings.set(id, { id, exports: moduleExports });
    extensionSettingsPaneOwners.set(paneId, id);
    if (typeof moduleExports?.activate !== "function") return;
    try {
      moduleExports.activate(makeApi(id));
      log("extension settings activated: " + id);
    } catch (error) {
      warn('extension settings "' + id + '" failed to activate', error);
    }
  }

  window.__CGPTX_HOST__ = Object.freeze({
    version: "26.820.80927",
    registerExtension,
    registerExtensionSettings,
    _debug: Object.freeze({
      captureBuiltInsFromOpenMenu,
      computeEffectiveItems,
      computeEffectiveAssistantSelectionItems: () =>
        activeAssistantSelectionModel
          ? computeEffectiveAssistantSelectionItems(
              activeAssistantSelectionModel,
            )
          : Object.freeze([]),
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
      nativeReady: () => nativeBindingInstalled,
      nativeBindingError: () => nativeBindingError,
      applicationRootRefreshCount: () => applicationRootRefreshCount,
      assistantSelectionBoundaryRenderCount: () =>
        assistantSelectionBoundaryRenderCount,
      responseAnnotationCreationCount: () =>
        responseAnnotationCreationCount,
      lastResponseAnnotationCreation: () => lastResponseAnnotationCreation,
      threadMenuBoundaryRenderCount: () => threadMenuBoundaryRenderCount,
      threadMenuAdapterRenderCount: () => threadMenuAdapterRenderCount,
      authenticationReady: () => typeof refreshAuthentication === "function",
      authenticationScopeReady: () => nativeApplicationScope !== null,
      nativeSignInUsedApplicationScope: () =>
        nativeSignInScope !== null &&
        nativeSignInScope === nativeApplicationScope,
      authenticationRefreshCount: () => authenticationRefreshCount,
      authenticationAccountInfoResetCount: () =>
        authenticationAccountInfoResetCount,
      profileMenuHasNativeProfileCallback: () =>
        profileMenuHasNativeProfileCallback,
      profileNavigationAttemptCount: () => profileNavigationAttemptCount,
      profileNavigationLastRequestedPath: () =>
        profileNavigationLastRequestedPath,
      openNativeProfile: () => {
        const navigate = openNativeProfile;
        if (typeof navigate !== "function") return false;
        navigate();
        return true;
      },
      settingsState: () => ({
        activePaneId: activeSettingsPaneId,
        activeCustomPaneId: activeCustomSettingsPaneId,
        confirmedNativePaneId: confirmedNativeSettingsPaneId,
        pendingNativePaneId: pendingNativeSettingsPaneId,
        currentPaneId: currentSettingsPaneId(),
        contentBoundaryRenderCount: settingsContentBoundaryRenderCount,
        contentMountCount: settingsContentMountCount,
      }),
      settingsNavigationReady: () =>
        typeof openNativeSettings === "function",
      replaceSettingsGroupSnapshot: replaceDebugSettingsGroupSnapshot,
      settingsSnapshotCommitCount: () =>
        debugSettingsSnapshotCommitCount,
      settingsPaneRenderCount: (paneId) =>
        settingsPaneRenderCounts.get(paneId) ?? 0,
      updateSettingsGroupCapture: updateDebugSettingsGroupCapture,
      settingsPageCommitIsEligible: debugSettingsPageCommitIsEligible,
      holdNextSettingsNavigation: () => {
        if (heldSettingsNavigation !== null) return false;
        holdNextSettingsNavigation = true;
        return true;
      },
      confirmNativeSettingsPane: (paneId) => {
        if (
          typeof paneId !== "string" ||
          !settingsNavigationRows.has(paneId)
        ) {
          return false;
        }
        confirmedNativeSettingsPaneId = paneId;
        scheduleSettingsRefresh();
        return true;
      },
      releaseSettingsNavigation: () => {
        const action = heldSettingsNavigation;
        heldSettingsNavigation = null;
        if (typeof action !== "function") return false;
        action();
        return true;
      },
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
  window.__CGPTX_NATIVE_READY__ = installNativeBinding().then(
    () => true,
    (error) => {
      nativeBindingError = String(error?.stack ?? error);
      warn("native binding installation failed", error);
      return false;
    },
  );
})();
