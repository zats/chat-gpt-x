/**
 * Renderer binding for ChatGPT 26.715.70719.
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
    "./assets/app-initial~avatarOverlayCompositionSurface~index-9fQ9wihu~index-BFCcxPM5~mapbox-gl-DVWlwqb~kppdhley-Hrn9ylUK.js";
  const MENU_MODULE =
    "./assets/app-initial~artifact-tab-content.electron~notebook-preview-panel~app-main~appgen-settings-p~evbmo86c-D4aWp9Ck.js";
  const ICON_MODULE =
    "./assets/app-initial~avatarOverlayCompositionSurface~artifact-tab-content.electron~notebook-preview-~dg0b1kws-Cen01Onw.js";
  const PROFILE_ICON_MODULE =
    "./assets/app-initial~app-main~settings-command-menu-section-items~pull-request-route~new-thread-pane~fnoshreu-CHWJP-re.js";
  const PLUS_ICON_MODULE = "./assets/plus-BgCJgEEs-DSk_o46V.js";
  const AUTH_MODULE = "./assets/chatgpt-desktop-auth-url-CTvO8J1r.js";
  const AUTH_CONTEXT_MODULE =
    "./assets/app-initial~artifact-tab-content.electron~notebook-preview-panel~app-main~business-checkout~k87y25tw-DjPeV3vC.js";
  const BROWSER_MODULE =
    "./assets/app-initial~artifact-tab-content.electron~notebook-preview-panel~app-main~business-checkout~c1u3yp5s-9RGNa6St.js";
  const QUERY_MODULE =
    "./assets/app-initial~avatarOverlayCompositionSurface~artifact-tab-content.electron~notebook-preview-~ngwudnyz-DEp-3H1N.js";
  const AUTHENTICATION_RESTART_TIMEOUT_MS = 20_000;
  const HEADER_BACKGROUND_PROPERTY = "--header-background-color";
  const HEADER_FOREGROUND_PROPERTY = "--header-foreground-color";
  const HEADER_PROPERTIES = Object.freeze([
    HEADER_BACKGROUND_PROPERTY,
    HEADER_FOREGROUND_PROPERTY,
  ]);
  const HEADER_STYLE_ID = "cgptx-header-appearance";
  const HEADER_STYLE_SOURCE = `
html[data-cgptx-header-background-color] header.app-header-tint {
  background-color: transparent !important;
}
html[data-cgptx-header-background-color] header.app-header-tint > div:nth-of-type(2),
html[data-cgptx-header-background-color] header.app-header-tint > div:nth-of-type(3) {
  background-color: var(--header-background-color) !important;
}
html[data-cgptx-header-background-color] header.app-header-tint > div:nth-of-type(3) {
  box-shadow: -8px 0 var(--header-background-color);
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
  const authenticationListeners = [];
  const headerPropertyRegistrations = [];
  const extensions = new Map();
  const safeHandlers = new WeakSet();
  const renderListeners = new Set();
  let renderVersion = 0;
  let builtInCache = Object.freeze([]);
  let builtInViews = new Map();
  let native = null;
  let pendingExpandedId = null;
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

  function subscribe(listener) {
    renderListeners.add(listener);
    return () => renderListeners.delete(listener);
  }

  function emitChange() {
    renderVersion += 1;
    for (const listener of [...renderListeners]) listener();
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

  function installHeaderStyle() {
    if (document.getElementById(HEADER_STYLE_ID)) return;
    const style = document.createElement("style");
    style.id = HEADER_STYLE_ID;
    style.textContent = HEADER_STYLE_SOURCE;
    document.head.append(style);
  }

  function applyHeaderProperties() {
    installHeaderStyle();
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
      coreModule,
      menuModule,
      iconModule,
      profileIconModule,
      plusIconModule,
      authModule,
      authContextModule,
      browserModule,
      queryModule,
    ] = await Promise.all([
      import(CORE_MODULE),
      import(MENU_MODULE),
      import(ICON_MODULE),
      import(PROFILE_ICON_MODULE),
      import(PLUS_ICON_MODULE),
      import(AUTH_MODULE),
      import(AUTH_CONTEXT_MODULE),
      import(BROWSER_MODULE),
      import(QUERY_MODULE),
    ]);
    authModule.r();
    authContextModule.f();
    browserModule.r();
    iconModule.s();
    profileIconModule.i();
    plusIconModule.t();
    const jsxRuntime = coreModule.zt();
    const PlusIcon = ({ className = "", ...props }) =>
      jsxRuntime.jsx(plusIconModule.n, {
        ...props,
        className: `${className} lucide-plus-icon`.trim(),
        size: 16,
      });
    native = {
      React: coreModule.dn(),
      jsxRuntime,
      jsx: jsxRuntime.jsx,
      Item: menuModule.i,
      Separator: menuModule.o,
      SubmenuItem: menuModule.n,
      MenuRoot: menuModule.t,
      startChatGptSignIn: authModule.o,
      decorateAuthUrl: authModule.t,
      useUpdateAuthNonce: authContextModule.g,
      useAppServerRegistry: authContextModule.A,
      useQueryClient: queryModule.Bl,
      accountInfoQueryKey: queryModule.r,
      messageBus: queryModule.m,
      openInBrowser: browserModule.o,
      useNavigate: browserModule.mt,
      iconComponents: new Map([
        ["chevron-right", iconModule.o],
        ["person", profileIconModule.r],
        ["plus", PlusIcon],
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

  function makeApi(extId) {
    return Object.freeze({
      menus: Object.freeze({
        profile: makeProfileMenuApi(extId),
      }),
      authentication: makeAuthenticationApi(extId),
      appearance: Object.freeze({
        header: makeHeaderAppearanceApi(extId),
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
    version: "26.715.70719",
    registerExtension,
    _debug: Object.freeze({
      captureBuiltInsFromOpenMenu,
      computeEffectiveItems,
      visibleMenuColumn,
      warmModel,
      getCache: () => builtInCache,
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
    }),
  });

  log("host installed");
  void installNativeBinding().catch((error) => {
    warn("native binding installation failed", error);
  });
})();
