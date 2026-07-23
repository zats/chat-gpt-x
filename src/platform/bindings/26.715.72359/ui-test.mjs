/**
 * Binding-specific live UI validation for menus.profile and menus.thread.
 *
 * This intentionally inspects version-specific renderer state. The stable
 * api-test-suite remains limited to src/platform/types.d.ts.
 *
 * Usage: node src/platform/bindings/26.715.72359/ui-test.mjs [port]
 *   [--expect-native-profile-callback-missing]
 *   [--alternate-auth=/path/to/auth.json]
 */

import { readFile } from 'node:fs/promises';

const port = process.argv[2] ?? '9222';
const expectNativeProfileCallbackMissing = process.argv.includes(
  '--expect-native-profile-callback-missing',
);
const alternateAuthPath = process.argv
  .find((argument) => argument.startsWith('--alternate-auth='))
  ?.slice('--alternate-auth='.length);
const alternateAuthJson = alternateAuthPath
  ? await readFile(alternateAuthPath, 'utf8')
  : undefined;
const targets = await fetch('http://127.0.0.1:' + port + '/json').then((response) =>
  response.json(),
);
const page =
  targets.find((target) => target.type === 'page' && target.url.startsWith('app:')) ??
  targets.find((target) => target.type === 'page');

if (!page) throw new Error('No ChatGPT page target on CDP port ' + port);

const socket = new WebSocket(page.webSocketDebuggerUrl);
await new Promise((resolve, reject) => {
  socket.addEventListener('open', resolve, { once: true });
  socket.addEventListener('error', reject, { once: true });
});

let nextId = 0;
function send(method, params) {
  return new Promise((resolve, reject) => {
    const id = ++nextId;
    const onMessage = (event) => {
      const message = JSON.parse(event.data);
      if (message.id !== id) return;
      socket.removeEventListener('message', onMessage);
      if (message.error) reject(new Error(JSON.stringify(message.error)));
      else resolve(message.result);
    };
    socket.addEventListener('message', onMessage);
    socket.send(JSON.stringify({ id, method, params }));
  });
}

async function evaluate(expression) {
  const result = await send('Runtime.evaluate', {
    expression,
    awaitPromise: true,
    returnByValue: true,
  });
  if (result.exceptionDetails) {
    throw new Error(
      result.exceptionDetails.exception?.description ??
        result.exceptionDetails.text ??
        'Renderer evaluation failed',
    );
  }
  return result.result.value;
}

async function waitFor(expression, timeoutMs = 20000) {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    if (await evaluate(expression)) return;
    await new Promise((resolve) => setTimeout(resolve, 100));
  }
  throw new Error('Timed out waiting for: ' + expression);
}

async function validateUi(
  expectMissingProfileCallback,
  alternateAuthentication,
) {
  const checks = [];
  const markProgress = (value) => {
    globalThis.__CGPTX_UI_TEST_PROGRESS__ = value;
  };
  markProgress('starting');
  const check = (condition, name, detail) => {
    checks.push({ name, pass: Boolean(condition), detail });
  };
  const initialClickCount = Number(
    globalThis.__CGPTX_VISUAL_CLICK_COUNT__ ?? 0,
  );
  const initialChildClickCount = Number(
    globalThis.__CGPTX_VISUAL_CHILD_CLICK_COUNT__ ?? 0,
  );
  const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
  const waitUntil = async (condition, timeoutMs = 10000) => {
    const deadline = Date.now() + timeoutMs;
    while (Date.now() < deadline) {
      if (condition()) return;
      await sleep(50);
    }
    throw new Error('Timed out waiting for native UI state');
  };
  const compositeCssColors = (...colors) => {
    const canvas = document.createElement('canvas');
    canvas.width = 1;
    canvas.height = 1;
    const context = canvas.getContext('2d', { willReadFrequently: true });
    context.clearRect(0, 0, 1, 1);
    for (const color of colors) {
      context.fillStyle = color;
      context.fillRect(0, 0, 1, 1);
    }
    return Array.from(context.getImageData(0, 0, 1, 1).data.slice(0, 3));
  };
  const relativeLuminance = (channels) => {
    const linear = channels.map((channel) => {
      const value = channel / 255;
      return value <= 0.04045
        ? value / 12.92
        : ((value + 0.055) / 1.055) ** 2.4;
    });
    return 0.2126 * linear[0] + 0.7152 * linear[1] + 0.0722 * linear[2];
  };
  const contrastRatio = (foreground, background) => {
    const backgroundChannels = compositeCssColors(background);
    const foregroundChannels = compositeCssColors(background, foreground);
    const lighter = Math.max(
      relativeLuminance(backgroundChannels),
      relativeLuminance(foregroundChannels),
    );
    const darker = Math.min(
      relativeLuminance(backgroundChannels),
      relativeLuminance(foregroundChannels),
    );
    return (lighter + 0.05) / (darker + 0.05);
  };
  const idOf = (node) =>
    node?.getAttribute('data-cgptx-id') ?? node?.getAttribute('data-cgptx');
  const idOfBlock = (block) =>
    idOf(block) ?? idOf(block.querySelector(':scope > [data-cgptx-id]'));
  const activateButton = (button) => {
    const rect = button?.getBoundingClientRect();
    for (const type of ['pointerdown', 'pointerup', 'click']) {
      const EventType = type.startsWith('pointer') ? PointerEvent : MouseEvent;
      button?.dispatchEvent(
        new EventType(type, {
          bubbles: true,
          cancelable: true,
          button: 0,
          clientX: rect ? rect.x + rect.width / 2 : 0,
          clientY: rect ? rect.y + rect.height / 2 : 0,
          ...(type.startsWith('pointer')
            ? { isPrimary: true, pointerType: 'mouse' }
            : {}),
        }),
      );
    }
  };
  const invokeNativeButton = (button) => {
    const rect = button?.getBoundingClientRect();
    button?.dispatchEvent(
      new MouseEvent('click', {
        bubbles: true,
        cancelable: true,
        button: 0,
        clientX: rect ? rect.x + rect.width / 2 : 0,
        clientY: rect ? rect.y + rect.height / 2 : 0,
      }),
    );
  };
  const openThreadMenu = async () => {
    const trigger = Array.from(document.querySelectorAll('button')).find(
      (button) => button.getAttribute('aria-label') === 'Chat actions',
    );
    if (!trigger) throw new Error('Thread menu trigger missing');
    activateButton(trigger);
    await sleep(350);
    return Array.from(document.querySelectorAll('[role="menu"]')).find((menu) =>
      Array.from(menu.children).some((child) =>
        child.hasAttribute('data-cgptx-thread-id'),
      ),
    );
  };
  const openProfile = async () => {
    const trigger = Array.from(document.querySelectorAll('button')).find((button) =>
      button.querySelector('img.rounded-full'),
    );
    if (!trigger) throw new Error('Profile trigger missing');
    for (const type of ['pointerdown', 'pointerup']) {
      trigger.dispatchEvent(
        new PointerEvent(type, {
          bubbles: true,
          cancelable: true,
          isPrimary: true,
          button: 0,
          pointerType: 'mouse',
        }),
      );
    }
    await sleep(350);
    return globalThis.__CGPTX_HOST__?._debug.visibleMenuColumn();
  };

  let headerAppearance;
  let threadsApi;
  globalThis.__CGPTX_HOST__.registerExtension(`header-appearance-ui-fixture-${Date.now()}`, {
    activate(api) {
      headerAppearance = api.appearance.header;
      threadsApi = api.threads;
    },
  });
  let originalThread = threadsApi.getCurrent();
  if (!originalThread) {
    const persistedThreadRow = Array.from(
      document.querySelectorAll('[data-app-action-sidebar-thread-row]'),
    ).find(
      (row) =>
        row.getAttribute('data-app-action-sidebar-thread-kind') === 'local' &&
        row.getBoundingClientRect().height > 0,
    );
    if (!persistedThreadRow) throw new Error('Persisted thread row missing');
    persistedThreadRow.click();
    await waitUntil(() => threadsApi.getCurrent() !== undefined);
    originalThread = threadsApi.getCurrent();
  }
  if (!originalThread) throw new Error('Current persisted thread missing');
  const currentThreadDeliveries = [];
  const currentThreadRegistration = threadsApi.subscribe((thread) => {
    currentThreadDeliveries.push(thread?.threadId);
  });
  const newChat = Array.from(document.querySelectorAll('button')).find(
    (button) =>
      button.textContent?.trim() === 'New chat' &&
      button.getBoundingClientRect().width > 0,
  );
  if (!newChat) throw new Error('New-chat action missing');
  newChat.click();
  await waitUntil(() => threadsApi.getCurrent() === undefined);
  const clearedThread = threadsApi.getCurrent();
  const originalThreadRow = Array.from(
    document.querySelectorAll('[data-app-action-sidebar-thread-row]'),
  ).find((row) =>
    row
      .getAttribute('data-app-action-sidebar-thread-id')
      ?.endsWith(originalThread.threadId),
  );
  if (!originalThreadRow) throw new Error('Original thread row missing');
  originalThreadRow.click();
  await waitUntil(
    () => threadsApi.getCurrent()?.threadId === originalThread.threadId,
  );
  const restoredThread = threadsApi.getCurrent();
  check(
    clearedThread === undefined &&
      restoredThread?.threadId === originalThread.threadId &&
      currentThreadDeliveries[0] === originalThread.threadId &&
      currentThreadDeliveries.includes(undefined) &&
      currentThreadDeliveries.at(-1) === originalThread.threadId,
    'current-thread subscription follows native navigation and restoration',
    { currentThreadDeliveries },
  );
  await waitUntil(() =>
    Boolean(
      originalThreadRow.querySelector(
        '[data-api-test-suite-thread-list-view]',
      ),
    ),
  );
  const threadListView = originalThreadRow.querySelector(
    '[data-api-test-suite-thread-list-view]',
  );
  const threadListViewHost = threadListView?.closest(
    '[data-cgptx-thread-list-leading-views]',
  );
  const threadTitle = originalThreadRow.querySelector('[data-thread-title]');
  const archiveButton = Array.from(originalThreadRow.querySelectorAll('button')).find(
    (button) => button.getAttribute('aria-label') === 'Archive chat',
  );
  const rowRect = originalThreadRow.getBoundingClientRect();
  const viewRect = threadListView?.getBoundingClientRect();
  const hostRect = threadListViewHost?.getBoundingClientRect();
  const titleRect = threadTitle?.getBoundingClientRect();
  const archiveRect = archiveButton?.getBoundingClientRect();
  const leadingInset = hostRect ? hostRect.left - rowRect.left : undefined;
  const trailingInset = archiveRect ? rowRect.right - archiveRect.right : undefined;
  const titleGap = hostRect && titleRect ? titleRect.left - hostRect.right : undefined;
  const mountedViewRects = Array.from(
    threadListViewHost?.querySelectorAll(
      '[data-cgptx-thread-list-item-view]',
    ) ?? [],
  )
    .map((view) => view.firstElementChild?.getBoundingClientRect())
    .filter(Boolean);
  const titleLeftWithView = titleRect?.left;
  if (threadListViewHost) threadListViewHost.style.display = 'none';
  const titleLeftWithoutView = threadTitle?.getBoundingClientRect().left;
  if (threadListViewHost) threadListViewHost.style.removeProperty('display');
  check(
    Boolean(
      threadListView &&
        threadListViewHost &&
        viewRect?.width === 3 &&
        viewRect?.height === 16 &&
        hostRect &&
        titleRect &&
        archiveRect &&
        Math.abs(titleGap - 3) <= 0.5 &&
        mountedViewRects.every(
          (rect, index) =>
            index === 0 || rect.right < mountedViewRects[index - 1].left,
        ) &&
        Math.abs(titleLeftWithView - titleLeftWithoutView) <= 0.5 &&
        Number.parseFloat(getComputedStyle(threadListView).borderRadius) > 0,
    ),
    'thread-list extension view hangs at the leading edge without moving the title',
    {
      rowRect: rowRect.toJSON(),
      viewRect: viewRect?.toJSON(),
      hostRect: hostRect?.toJSON(),
      titleRect: titleRect?.toJSON(),
      archiveRect: archiveRect?.toJSON(),
      leadingInset,
      trailingInset,
      titleGap,
      mountedViewRects: mountedViewRects.map((rect) => rect.toJSON()),
      titleLeftWithView,
      titleLeftWithoutView,
      rowActive: originalThreadRow.getAttribute(
        'data-app-action-sidebar-thread-active',
      ),
    },
  );
  currentThreadRegistration.dispose();
  markProgress('current-thread');
  const root = document.documentElement;
  const originalHeaderTheme = root.classList.contains('electron-dark')
    ? 'dark'
    : root.classList.contains('electron-light')
      ? 'light'
      : null;
  if (!originalHeaderTheme) throw new Error('ChatGPT theme class missing');
  const headerColors = {
    light: {
      background: 'rgb(220, 252, 231)',
      foreground: 'rgb(5, 46, 22)',
    },
    dark: {
      background: 'rgb(0, 80, 45)',
      foreground: 'rgb(255, 255, 255)',
    },
  };
  const appHeader = document.querySelector('header.app-header-tint');
  if (!appHeader) throw new Error('Thread header missing');
  const headerToggle = (label) =>
    Array.from(
      document.querySelectorAll(
        `header.app-header-tint button[aria-label="${label}"]`,
      ),
    ).find((button) => button.getBoundingClientRect().x > innerWidth / 2);
  const toggleSidePanel = headerToggle('Toggle side panel');
  if (!toggleSidePanel) throw new Error('Side-panel toggle missing');
  const toggleBottomPanel = headerToggle('Toggle bottom panel');
  if (!toggleBottomPanel) throw new Error('Bottom-panel toggle missing');
  const sidePanelIsOpen = () => {
    const panel = document.querySelector(
      'aside[data-app-shell-focus-area="right-panel"]',
    );
    return Boolean(
      panel &&
        getComputedStyle(panel).opacity === '1' &&
        panel.getBoundingClientRect().width > 0,
    );
  };
  const setSidePanelOpen = async (open) => {
    for (let attempt = 0; attempt < 4; attempt += 1) {
      if (sidePanelIsOpen() === open) return;
      invokeNativeButton(headerToggle('Toggle side panel'));
      const deadline = Date.now() + 2500;
      while (Date.now() < deadline) {
        if (sidePanelIsOpen() === open) return;
        await sleep(50);
      }
    }
    throw new Error(`Timed out setting side-panel open state to ${open}`);
  };
  const sidePanelWasOpen = sidePanelIsOpen();
  const bottomPanelWasOpen = Boolean(
    document.querySelector('[data-app-shell-focus-area="bottom-panel"]'),
  );
  if (sidePanelWasOpen) {
    await setSidePanelOpen(false);
  }
  if (bottomPanelWasOpen) {
    invokeNativeButton(headerToggle('Toggle bottom panel'));
    await waitUntil(
      () =>
        !document.querySelector(
          '[data-app-shell-focus-area="bottom-panel"]',
        ),
    );
  }
  const collapsedHeaderControls = appHeader.querySelector(
    ':scope > div:nth-of-type(5)',
  );
  const collapsedAppearanceRegistration = headerAppearance.registerProperties({
    '--header-background-color': {
      light: headerColors.light.background,
      dark: headerColors.dark.background,
    },
    '--header-foreground-color': {
      light: headerColors.light.foreground,
      dark: headerColors.dark.foreground,
    },
  });
  await sleep(50);
  const initialHeaderColors = headerColors[originalHeaderTheme];
  const collapsedPanelButtons = [
    headerToggle('Toggle bottom panel'),
    headerToggle('Toggle side panel'),
  ];
  const collapsedPanelButtonStates = collapsedPanelButtons.map((button) => {
    const rect = button.getBoundingClientRect();
    const style = getComputedStyle(button);
    return {
      label: button.getAttribute('aria-label'),
      visible:
        style.visibility === 'visible' &&
        style.opacity !== '0',
      hit:
        document
          .elementFromPoint(rect.x + rect.width / 2, rect.y + rect.height / 2)
          ?.closest('button') === button,
      contrast: contrastRatio(style.color, initialHeaderColors.background),
    };
  });
  check(
    !sidePanelIsOpen() &&
      !document.querySelector('[data-app-shell-focus-area="bottom-panel"]') &&
      getComputedStyle(collapsedHeaderControls).backgroundColor ===
        initialHeaderColors.background &&
      collapsedPanelButtonStates.every(
        ({ visible, hit, contrast }) => visible && hit && contrast >= 3,
      ),
    'collapsed panel controls use the header appearance and remain readable',
    {
      background: getComputedStyle(collapsedHeaderControls).backgroundColor,
      expectedBackground: initialHeaderColors.background,
      collapsedPanelButtonStates,
    },
  );
  collapsedAppearanceRegistration.dispose();
  markProgress('collapsed-header');
  if (bottomPanelWasOpen) {
    invokeNativeButton(headerToggle('Toggle bottom panel'));
    await waitUntil(() =>
      Boolean(
        document.querySelector('[data-app-shell-focus-area="bottom-panel"]'),
      ),
    );
  }
  if (!sidePanelIsOpen()) {
    await setSidePanelOpen(true);
    await sleep(300);
  }
  let sidePanel = document.querySelector(
    'aside[data-app-shell-focus-area="right-panel"]',
  );
  let tabToolbar = sidePanel?.querySelector(
    '[data-app-shell-tabs="true"] > .h-toolbar',
  );
  if (!tabToolbar?.querySelector('[role="tab"][aria-selected="true"]')) {
    const browserAction = Array.from(document.querySelectorAll('button')).find(
      (button) => button.textContent?.trim().startsWith('Browser'),
    );
    if (!browserAction) throw new Error('Browser side-panel action missing');
    activateButton(browserAction);
    await sleep(500);
    sidePanel = document.querySelector(
      'aside[data-app-shell-focus-area="right-panel"]',
    );
    tabToolbar = sidePanel?.querySelector(
      '[data-app-shell-tabs="true"] > .h-toolbar',
    );
  }
  if (!tabToolbar) throw new Error('Side-panel tab header missing');
  const threadHeaderRegion = appHeader?.querySelector(
    ':scope > div:nth-of-type(3)',
  );
  const contentToolbarButtons = Array.from(
    tabToolbar?.nextElementSibling?.querySelectorAll('button') ?? [],
  ).slice(0, 8);
  const contentToolbarColorsBefore = contentToolbarButtons.map(
    (button) => getComputedStyle(button).color,
  );
  const baselineHeaderProperties = headerAppearance.getProperties();
  const baselineHeaderBackground = root.style.getPropertyValue(
    '--header-background-color',
  );
  const baselineHeaderForeground = root.style.getPropertyValue(
    '--header-foreground-color',
  );
  const emptyAppearanceRegistration = headerAppearance.registerProperties({});
  check(
    JSON.stringify(headerAppearance.getProperties()) ===
      JSON.stringify(baselineHeaderProperties) &&
      root.style.getPropertyValue('--header-background-color') ===
        baselineHeaderBackground &&
      root.style.getPropertyValue('--header-foreground-color') ===
        baselineHeaderForeground,
    'empty registration preserves ChatGPT native header appearance',
  );
  emptyAppearanceRegistration.dispose();
  const appearanceRegistration = headerAppearance.registerProperties({
    '--header-background-color': {
      light: headerColors.light.background,
      dark: headerColors.dark.background,
    },
    '--header-foreground-color': {
      light: headerColors.light.foreground,
      dark: headerColors.dark.foreground,
    },
  });
  await sleep(50);
  const sideHeaderButtons = [
    ...Array.from(tabToolbar?.querySelectorAll('button') ?? []),
    ...Array.from(appHeader?.querySelectorAll('button') ?? []).filter(
      (button) => button.getBoundingClientRect().x > innerWidth / 2,
    ),
  ].filter((button) => {
    const rect = button.getBoundingClientRect();
    const style = getComputedStyle(button);
    return (
      rect.width > 0 &&
      rect.height > 0 &&
      style.visibility === 'visible' &&
      style.opacity !== '0' &&
      style.pointerEvents !== 'none'
    );
  });
  const getSideHeaderButtonStates = () =>
    sideHeaderButtons.map((button) => {
      const rect = button.getBoundingClientRect();
      const style = getComputedStyle(button);
      const hitButton = document
        .elementFromPoint(rect.x + rect.width / 2, rect.y + rect.height / 2)
        ?.closest('button');
      return {
        label:
          button.textContent?.trim() ||
          button.title ||
          button.getAttribute('aria-label'),
        visible:
          style.visibility === 'visible' &&
          style.opacity !== '0',
        role: button.getAttribute('role'),
        hit: Boolean(hitButton),
        directHit: hitButton === button,
        contrast: contrastRatio(style.color, initialHeaderColors.background),
      };
    });
  await waitUntil(() =>
    getSideHeaderButtonStates().every(({ visible, hit }) => visible && hit),
  );
  const sideHeaderButtonStates = getSideHeaderButtonStates();
  const expandedHeaderControls = appHeader.querySelector(
    ':scope > div:nth-of-type(5)',
  );
  check(
    root.style.getPropertyValue('--header-background-color') ===
      initialHeaderColors.background &&
      root.style.getPropertyValue('--header-foreground-color') ===
        initialHeaderColors.foreground,
    'header appearance exposes the current theme values as stable CSS custom properties',
  );
  check(
    getComputedStyle(threadHeaderRegion).backgroundColor ===
      initialHeaderColors.background &&
      getComputedStyle(tabToolbar).backgroundColor ===
        initialHeaderColors.background,
    'header background property colors thread and side-panel tab headers',
  );
  const tabFadeGradients = Array.from(
    tabToolbar.querySelectorAll(
      '[class*="after:to-token-main-surface-primary"]',
    ),
  ).map((overlay) => getComputedStyle(overlay, '::after').backgroundImage);
  check(
    tabFadeGradients.length >= 2 &&
      tabFadeGradients.every((gradient) =>
        gradient.includes(initialHeaderColors.background),
      ),
    'side-panel tab overflow fades into the selected header background',
    { tabFadeGradients },
  );
  check(
    sideHeaderButtons.length >= 4 &&
      getComputedStyle(expandedHeaderControls).backgroundColor ===
        'rgba(0, 0, 0, 0)' &&
      sideHeaderButtonStates.some(
        ({ role, directHit }) => role === 'tab' && directHit,
      ) &&
      sideHeaderButtonStates.every(
        ({ visible, hit, contrast }) => visible && hit && contrast >= 3,
      ),
    'side-panel tabs and header controls remain painted, readable, and hit-testable',
    {
      controlsRegionBackground: getComputedStyle(expandedHeaderControls)
        .backgroundColor,
      controls: sideHeaderButtonStates,
    },
  );
  check(
    contentToolbarButtons.length > 0 &&
      JSON.stringify(
      contentToolbarButtons.map((button) => getComputedStyle(button).color),
      ) === JSON.stringify(contentToolbarColorsBefore),
    'content-panel toolbar foreground remains unchanged',
    { contentToolbarColorsBefore },
  );
  markProgress('expanded-header');

  appearanceRegistration.update({
    '--header-background-color': {
      light: 'rgb(219, 234, 254)',
      dark: 'rgb(23, 37, 84)',
    },
    '--header-foreground-color': {
      light: 'rgb(30, 64, 175)',
      dark: 'rgb(255, 255, 0)',
    },
  });
  await sleep(50);
  const updatedHeaderColors = {
    light: {
      background: 'rgb(219, 234, 254)',
      foreground: 'rgb(30, 64, 175)',
    },
    dark: {
      background: 'rgb(23, 37, 84)',
      foreground: 'rgb(255, 255, 0)',
    },
  };
  const currentUpdatedHeaderColors = updatedHeaderColors[originalHeaderTheme];
  const selectedSideTab = tabToolbar?.querySelector(
    '[role="tab"][aria-selected="true"]',
  );
  check(
    getComputedStyle(threadHeaderRegion).backgroundColor ===
      currentUpdatedHeaderColors.background &&
      getComputedStyle(tabToolbar).backgroundColor ===
        currentUpdatedHeaderColors.background &&
      getComputedStyle(selectedSideTab).color ===
        currentUpdatedHeaderColors.foreground,
    'registration updates repaint both headers immediately',
  );

  const alternateHeaderTheme = originalHeaderTheme === 'dark' ? 'light' : 'dark';
  root.classList.toggle('electron-dark', alternateHeaderTheme === 'dark');
  root.classList.toggle('electron-light', alternateHeaderTheme === 'light');
  await sleep(50);
  const alternateHeaderColors = updatedHeaderColors[alternateHeaderTheme];
  check(
    root.style.getPropertyValue('--header-background-color') ===
      alternateHeaderColors.background &&
      root.style.getPropertyValue('--header-foreground-color') ===
        alternateHeaderColors.foreground &&
      getComputedStyle(threadHeaderRegion).backgroundColor ===
        alternateHeaderColors.background &&
      getComputedStyle(tabToolbar).backgroundColor ===
        alternateHeaderColors.background &&
      getComputedStyle(selectedSideTab).color ===
        alternateHeaderColors.foreground &&
      JSON.stringify(headerAppearance.getProperties()) ===
        JSON.stringify({
          '--header-background-color': alternateHeaderColors.background,
          '--header-foreground-color': alternateHeaderColors.foreground,
        }),
    'effective ChatGPT theme changes select and repaint the matching values',
  );
  root.classList.toggle('electron-dark', originalHeaderTheme === 'dark');
  root.classList.toggle('electron-light', originalHeaderTheme === 'light');
  await sleep(50);
  check(
    root.style.getPropertyValue('--header-background-color') ===
      currentUpdatedHeaderColors.background &&
      root.style.getPropertyValue('--header-foreground-color') ===
        currentUpdatedHeaderColors.foreground,
    'restoring ChatGPT theme restores the matching registered values',
  );

  root.style.setProperty('--header-background-color', 'rgb(80, 0, 80)');
  await sleep(50);
  check(
    getComputedStyle(threadHeaderRegion).backgroundColor === 'rgb(80, 0, 80)' &&
      getComputedStyle(tabToolbar).backgroundColor === 'rgb(80, 0, 80)',
    'direct custom-property changes repaint both headers immediately',
  );

  appearanceRegistration.dispose();
  await sleep(50);
  check(
    JSON.stringify(headerAppearance.getProperties()) ===
      JSON.stringify(baselineHeaderProperties) &&
      root.style.getPropertyValue('--header-background-color') ===
        baselineHeaderBackground &&
      root.style.getPropertyValue('--header-foreground-color') ===
        baselineHeaderForeground,
    'disposing header appearance restores native property ownership',
  );
  if (!sidePanelWasOpen) {
    await setSidePanelOpen(false);
    await sleep(300);
  }
  markProgress('header-appearance');

  const pickerAnchorX = Math.min(innerWidth - 150, innerWidth * 0.7);
  appHeader.dispatchEvent(new PointerEvent('pointerdown', {
    bubbles: true,
    cancelable: true,
    isPrimary: true,
    pointerType: 'mouse',
    clientX: pickerAnchorX,
    clientY: appHeader.getBoundingClientRect().bottom / 2,
  }));
  let pickerPreview;
  let pickerResult;
  const pickerSession = globalThis.__CGPTX_HOST__._debug.openColorPicker({
    initialColor: '#3A83F7',
    title: 'API UI color',
    onChange(color) {
      pickerPreview = color;
    },
  });
  void pickerSession.result.then((color) => {
    pickerResult = color;
  });
  await waitUntil(() =>
    Boolean(document.querySelector('[data-cgptx-native-color-picker]')),
  );
  const picker = document.querySelector('[data-cgptx-native-color-picker]');
  const pickerSliders = Array.from(
    picker?.querySelectorAll('[role="slider"]') ?? [],
  );
  check(
      picker?.querySelector('.react-colorful') !== null &&
      pickerSliders.length >= 2 &&
      document.activeElement === pickerSliders[0] &&
      picker.querySelector('button') === null &&
      picker.textContent?.trim() === '' &&
      picker.getBoundingClientRect().top ===
        appHeader.getBoundingClientRect().bottom + 8 &&
      Math.abs(
        picker.getBoundingClientRect().left +
          picker.getBoundingClientRect().width / 2 -
          pickerAnchorX,
      ) < 1,
    'color-picker API renders the chrome-free native picker below the header',
    {
      sliderCount: pickerSliders.length,
      top: picker?.getBoundingClientRect().top,
      headerBottom: appHeader.getBoundingClientRect().bottom,
      centerX:
        picker?.getBoundingClientRect().left +
        picker?.getBoundingClientRect().width / 2,
      pickerAnchorX,
    },
  );
  const hueSlider = pickerSliders.at(-1);
  const hueRect = hueSlider?.getBoundingClientRect();
  hueSlider?.dispatchEvent(new MouseEvent('mousedown', {
    bubbles: true,
    cancelable: true,
    buttons: 1,
    clientX: hueRect ? hueRect.x + hueRect.width * 0.7 : 0,
    clientY: hueRect ? hueRect.y + hueRect.height / 2 : 0,
  }));
  window.dispatchEvent(new MouseEvent('mousemove', {
    bubbles: true,
    cancelable: true,
    buttons: 1,
    clientX: hueRect ? hueRect.x + hueRect.width * 0.8 : 0,
    clientY: hueRect ? hueRect.y + hueRect.height / 2 : 0,
  }));
  window.dispatchEvent(new MouseEvent('mouseup', {
    bubbles: true,
    cancelable: true,
    buttons: 0,
  }));
  await waitUntil(() => pickerPreview !== undefined);
  check(
    /^#[0-9A-F]{6}$/.test(pickerPreview ?? '') &&
      globalThis.__CGPTX_HOST__._debug.activeColorPicker()?.color === pickerPreview,
    'native picker interaction emits normalized live color changes',
    { pickerPreview },
  );
  document.body.dispatchEvent(new PointerEvent('pointerdown', {
    bubbles: true,
    cancelable: true,
    isPrimary: true,
    pointerType: 'mouse',
  }));
  await waitUntil(() => pickerResult !== undefined);
  check(
    pickerResult === pickerPreview &&
      document.querySelector('[data-cgptx-native-color-picker]') === null,
    'clicking outside returns the live selected color and dismisses the picker',
    { pickerPreview, pickerResult },
  );
  let cancelledPickerSettled = false;
  let cancelledPickerResult = '#pending';
  const cancelledPicker = globalThis.__CGPTX_HOST__._debug.openColorPicker({
    initialColor: '#53B559',
    title: 'Cancelled API UI color',
    onChange() {},
  });
  void cancelledPicker.result.then((color) => {
    cancelledPickerSettled = true;
    cancelledPickerResult = color;
  });
  await waitUntil(() =>
    Boolean(document.querySelector('[data-cgptx-native-color-picker]')),
  );
  document.dispatchEvent(new KeyboardEvent('keydown', {
    key: 'Escape',
    bubbles: true,
    cancelable: true,
  }));
  await waitUntil(() => cancelledPickerSettled);
  check(
    cancelledPickerResult === undefined &&
      document.querySelector('[data-cgptx-native-color-picker]') === null,
    'Escape cancels and dismisses the native picker',
  );
  markProgress('color-picker');

  let threadMenu = await openThreadMenu();
  if (!threadMenu) throw new Error('Thread menu did not open');
  const threadId = threadMenu
    .querySelector('[data-cgptx-thread-id]')
    ?.getAttribute('data-cgptx-thread-id');
  if (!threadId) throw new Error('Thread menu identity missing');
  await sleep(350);
  const threadItems = globalThis.__CGPTX_HOST__._debug.computeEffectiveThreadItems(
    threadId,
  );
  const threadActionLabels = threadItems
    .filter((item) => item.kind === 'action')
    .map((item) => item.label);
  const threadRows = Array.from(threadMenu.children).filter(
    (child) => child.getAttribute('role') === 'menuitem',
  );
  const threadRowLabel = (row) =>
    row?.querySelector('span.min-w-0.flex-1.truncate')?.textContent?.trim() ??
    row?.textContent?.trim();
  const menuRows = (menu) =>
    Array.from(menu?.querySelectorAll('[role="menuitem"]') ?? []).filter(
      (row) => row.closest('[role="menu"]') === menu,
    );
  const renderedThreadLabels = threadRows.map(threadRowLabel);
  check(
    JSON.stringify(renderedThreadLabels) === JSON.stringify(threadActionLabels),
    'native thread action order equals effective public model',
    { threadActionLabels, renderedThreadLabels },
  );

  const colorRow = threadRows.find((row) => threadRowLabel(row) === 'Color');
  const colorIndex = Array.from(threadMenu.children).indexOf(colorRow);
  const firstThreadSeparatorIndex = Array.from(threadMenu.children).findIndex(
    (child) =>
      child.getAttribute('role') !== 'menuitem' &&
      Boolean(child.querySelector('.h-\\[1px\\][class*="bg-token-menu-border"]')),
  );
  check(
    colorIndex >= 0 && colorIndex === firstThreadSeparatorIndex - 1,
    'Color is the last item in the first native section',
    { colorIndex, firstThreadSeparatorIndex },
  );
  check(
    colorRow?.getAttribute('aria-haspopup') === 'menu' &&
      colorRow.querySelector('svg.lucide-palette')?.getAttribute('stroke-width') ===
        '1.75' &&
      colorRow.querySelectorAll('svg.lucide-palette > circle').length === 4,
    'Color uses the supplied Palette SVG in the native flyout icon slot',
  );
  const nativeFlyoutRow = threadRows.find(
    (row) =>
      row !== colorRow &&
      row.getAttribute('aria-haspopup') === 'menu',
  );
  check(
    Boolean(nativeFlyoutRow) && colorRow?.className === nativeFlyoutRow.className,
    'Color reuses the native thread flyout presentation',
  );

  let threadMenuApi;
  globalThis.__CGPTX_HOST__.registerExtension(
    `thread-menu-ui-observer-${Date.now()}`,
    {
      activate(api) {
        threadMenuApi = api.menus.thread;
      },
    },
  );
  const programmaticColorActivation = threadMenuApi.activateItem(
    threadId,
    'thread-colors.color',
  );
  await sleep(500);
  const expectedColors = [
    { name: 'Default', light: 'rgb(155, 155, 155)', dark: 'rgb(155, 155, 155)' },
    { name: 'Blue', light: 'rgb(58, 131, 247)', dark: 'rgb(58, 131, 247)' },
    { name: 'Green', light: 'rgb(83, 181, 89)', dark: 'rgb(83, 181, 89)' },
    { name: 'Yellow', light: 'rgb(246, 197, 67)', dark: 'rgb(246, 197, 67)' },
    { name: 'Pink', light: 'rgb(240, 119, 175)', dark: 'rgb(240, 119, 175)' },
    { name: 'Orange', light: 'rgb(238, 124, 55)', dark: 'rgb(238, 124, 55)' },
    { name: 'Purple', light: 'rgb(166, 125, 226)', dark: 'rgb(166, 125, 226)' },
    { name: 'Black', light: 'rgb(0, 0, 0)', dark: 'rgb(0, 0, 0)' },
  ];
  const colorNames = [...expectedColors.map(({ name }) => name), 'Custom'];
  let colorFlyout = Array.from(document.querySelectorAll('[role="menu"]')).find(
    (menu) =>
      menu !== threadMenu &&
      JSON.stringify(
        menuRows(menu).map(threadRowLabel),
      ) === JSON.stringify(colorNames),
  );
  const colorRows = menuRows(colorFlyout);
  const colorIcons = colorRows.map((row) =>
    row.querySelector('[data-cgptx-thread-menu-color-icon]'),
  );
  check(
    Boolean(colorFlyout) &&
      colorFlyout.parentElement?.hasAttribute('data-radix-popper-content-wrapper') ===
        true &&
      colorFlyout.getAttribute('data-side') === 'right',
    'Color opens a separate native flyout portal',
    {
      menus: Array.from(document.querySelectorAll('[role="menu"]')).map((menu) => ({
        side: menu.getAttribute('data-side'),
        text: menu.textContent?.trim(),
      })),
    },
  );
  check(
    programmaticColorActivation === true && Boolean(threadMenu && colorFlyout),
    'public activateItem opens the native Color flyout',
    {
      programmaticColorActivation,
      threadMenuConnected: threadMenu?.isConnected,
      colorFlyoutFound: Boolean(colorFlyout),
    },
  );
  check(
    JSON.stringify(colorRows.map(threadRowLabel)) === JSON.stringify(colorNames) &&
      colorRows.every(
        (row, index) =>
          colorIcons[index] &&
          row.querySelector('svg') === null &&
          row.textContent?.trim() === threadRowLabel(row) &&
          row.className.includes('hover:bg-token-list-hover-background'),
      ),
    'Color flyout contains only the requested names and native color icons',
    { rendered: colorRows.map(threadRowLabel) },
  );
  check(
    colorIcons.slice(0, expectedColors.length).every(
      (icon, index) =>
        icon?.classList.contains('rounded-full') &&
        getComputedStyle(icon).backgroundColor ===
          expectedColors[index][originalHeaderTheme],
    ),
    'Color icons use the exact palette for the active ChatGPT appearance',
    {
      colors: colorIcons.map((icon) => getComputedStyle(icon).backgroundColor),
      theme: originalHeaderTheme,
    },
  );
  root.classList.toggle('electron-dark', alternateHeaderTheme === 'dark');
  root.classList.toggle('electron-light', alternateHeaderTheme === 'light');
  await sleep(50);
  check(
    colorIcons.slice(0, expectedColors.length).every(
      (icon, index) =>
        getComputedStyle(icon).backgroundColor ===
        expectedColors[index][alternateHeaderTheme],
    ),
    'Color icons follow ChatGPT appearance changes',
    {
      colors: colorIcons.map((icon) => getComputedStyle(icon).backgroundColor),
      theme: alternateHeaderTheme,
    },
  );
  root.classList.toggle('electron-dark', originalHeaderTheme === 'dark');
  root.classList.toggle('electron-light', originalHeaderTheme === 'light');
  await sleep(50);
  colorRows[0]?.focus();
  const focusedColorStyle = getComputedStyle(document.activeElement);
  const nativeThreadItemCursor = getComputedStyle(threadRows[0]).cursor;
  check(
    focusedColorStyle.cursor === nativeThreadItemCursor &&
      colorRows[0]?.className.includes(
        'hover:bg-token-list-hover-background',
      ) &&
      colorRows[0]?.className.includes(
        'focus:bg-token-list-hover-background',
      ),
    'Color choices use the native interactive highlight state',
    {
      cursor: focusedColorStyle.cursor,
      nativeCursor: nativeThreadItemCursor,
      className: colorRows[0]?.className,
    },
  );
  colorRows[0]?.dispatchEvent(
    new KeyboardEvent('keydown', {
      key: 'ArrowDown',
      bubbles: true,
      cancelable: true,
    }),
  );
  await sleep(100);
  check(
    document.activeElement === colorRows[1],
    'Color flyout participates in native keyboard navigation',
  );
  activateButton(colorRows[1]);
  await waitUntil(() =>
    Boolean(
      originalThreadRow.querySelector('[data-thread-colors-indicator]'),
    ),
  );
  const blueThreadIndicator = originalThreadRow.querySelector(
    '[data-thread-colors-indicator]',
  );
  check(
    JSON.stringify(headerAppearance.getProperties()) ===
      JSON.stringify({
        '--header-background-color': '#3A83F7',
        '--header-foreground-color': '#FFFFFF',
      }) &&
      getComputedStyle(threadHeaderRegion).backgroundColor ===
        'rgb(58, 131, 247)',
    'selecting Blue applies its CSS to the native header',
  );
  check(
    blueThreadIndicator?.closest(
      '[data-cgptx-thread-list-leading-views]',
    ) === threadListViewHost &&
      getComputedStyle(blueThreadIndicator).backgroundColor ===
        'rgb(58, 131, 247)',
    'selecting Blue adds the thread indicator at the native row edge',
  );

  threadMenu = await openThreadMenu();
  if (!threadMenu) throw new Error('Thread menu did not reopen');
  threadMenuApi.activateItem(threadId, 'thread-colors.color');
  await sleep(300);
  colorFlyout = Array.from(document.querySelectorAll('[role="menu"]')).find(
    (menu) =>
      menu !== threadMenu &&
      JSON.stringify(menuRows(menu).map(threadRowLabel)) ===
        JSON.stringify(colorNames),
  );
  activateButton(menuRows(colorFlyout)[0]);
  await waitUntil(
    () =>
      originalThreadRow.querySelector('[data-thread-colors-indicator]') ===
      null,
  );
  check(
    Object.keys(headerAppearance.getProperties()).length === 0 &&
      root.style.getPropertyValue('--header-background-color') === '' &&
      root.style.getPropertyValue('--header-foreground-color') === '',
    'selecting Default restores ChatGPT native header CSS',
  );
  check(
    originalThreadRow.querySelector('[data-thread-colors-indicator]') === null,
    'selecting Default removes the thread indicator',
  );
  markProgress('thread-menu');

  let column = await openProfile();
  if (!column) throw new Error('Profile menu did not open');
  check(
    typeof globalThis.__CGPTX_RUNTIME__?.request === 'function',
    'version-independent runtime preload is available',
  );
  check(
    globalThis.__CGPTX_HOST__?._debug.authenticationReady() === true,
    'native post-authentication refresh callback is captured',
  );
  check(
    globalThis.__CGPTX_HOST__?._debug.nativeSignInStartCount() >= 1,
    'public startSignIn used ChatGPT native login',
  );
  check(
    globalThis.__CGPTX_HOST__?._debug.authenticationRefreshCount() >= 1,
    'public credential replacement used ChatGPT post-auth refresh',
  );
  check(
    globalThis.__CGPTX_HOST__?._debug.authenticationAccountInfoResetCount() >= 1,
    'public credential replacement clears the native account-info query',
  );
  check(
    globalThis.__CGPTX_HOST__?._debug.authenticationAppServerRestartCount() >= 1,
    'public credential replacement restarts ChatGPT\'s native app server',
  );
  if (expectMissingProfileCallback) {
    check(
      globalThis.__CGPTX_HOST__?._debug.profileMenuHasNativeProfileCallback() ===
        false,
      'fixture omits ChatGPT\'s conditional profile-menu callback',
    );
  }
  const syntheticClaims = btoa(
    JSON.stringify({
      sub: 'synthetic-user',
      name: 'Shared Name',
      email: 'unique@example.com',
    }),
  )
    .replaceAll('+', '-')
    .replaceAll('/', '_')
    .replaceAll('=', '');
  const syntheticIdentity = globalThis.__CGPTX_HOST__._debug.inspectAuthentication(
    JSON.stringify({ tokens: { id_token: `header.${syntheticClaims}.signature` } }),
  );
  check(
    syntheticIdentity.label === 'unique@example.com',
    'authentication identity prefers email over account name',
    { label: syntheticIdentity.label },
  );
  const effective = globalThis.__CGPTX_HOST__._debug.computeEffectiveItems();
  const expectedIds = effective
    .filter((item) => item.kind === 'action')
    .map((item) => item.id);
  let list = column.querySelector('[data-cgptx-profile-menu]');
  let blocks = Array.from(list.children);
  const actualIds = blocks.map(idOfBlock).filter(Boolean);
  check(
    JSON.stringify(actualIds) === JSON.stringify(expectedIds),
    'native action order equals effective public model',
    { expectedIds, actualIds },
  );
  const expectedSeparators = effective.filter(
    (item) => item.kind === 'separator',
  ).length;
  const actualSeparators = blocks.filter((block) =>
    block.querySelector('.h-\\[1px\\][class*="bg-token-menu-border"]'),
  ).length;
  check(
    actualSeparators === expectedSeparators,
    'native separator count equals effective public model',
    { expectedSeparators, actualSeparators },
  );

  const usage = column.querySelector(
    '[data-cgptx-id="codex.profileDropdown.usageSummary"]',
  );
  const usageWrapper = usage?.parentElement?.matches(
    '.flex.flex-col[data-state]',
  )
    ? usage.parentElement
    : null;
  const itemCountBeforeUsageExpansion = column.querySelectorAll(
    '[role="menuitem"]',
  ).length;
  usage?.click();
  await sleep(100);
  const itemCountAfterUsageExpansion = column.querySelectorAll(
    '[role="menuitem"]',
  ).length;
  const nativeNestedItem = Array.from(
    usageWrapper?.querySelectorAll('[role="menuitem"]') ?? [],
  ).find((row) => row !== usage);
  const nativeNestedItemClassName = nativeNestedItem?.className;
  check(
    usageWrapper?.getAttribute('data-state') === 'open' &&
      itemCountAfterUsageExpansion > itemCountBeforeUsageExpansion,
    'built-in usage submenu preserves native expansion',
    {
      state: usageWrapper?.getAttribute('data-state'),
      itemCountBeforeUsageExpansion,
      itemCountAfterUsageExpansion,
    },
  );
  check(
    typeof nativeNestedItemClassName === 'string' && nativeNestedItemClassName.length > 0,
    'native nested Item presentation was captured',
  );
  usage?.click();
  await sleep(100);

  const rich = column.querySelector('[data-cgptx-id="api-test-suite.visual-rich"]');
  check(Boolean(rich), 'rich action rendered');
  check(
    (rich?.querySelectorAll('svg').length ?? 0) >= 1,
    'left app icon rendered',
  );
  check(
    (rich?.querySelectorAll('svg').length ?? 0) >= 2,
    'right app icon rendered',
  );
  check(
    rich?.textContent?.includes('Binding subtext'),
    'subtext rendered',
  );
  check(
    rich?.textContent?.includes('⌘T'),
    'keyboard shortcut rendered',
  );

  const disabled = column.querySelector(
    '[data-cgptx-id="api-test-suite.visual-disabled"]',
  );
  check(
    disabled?.getAttribute('aria-disabled') === 'true',
    'disabled state rendered',
  );

  const parent = column.querySelector(
    '[data-cgptx-id="api-test-suite.visual-parent"]',
  );
  const parentWrapper = parent?.closest('.flex.flex-col[data-state]');
  check(
    Boolean(parentWrapper?.querySelector('svg')),
    'submenu uses the app SubmenuItem component',
  );

  const focusable = blocks
    .map((block) =>
      block.matches('[role="menuitem"]')
        ? block
        : block.querySelector(':scope > [role="menuitem"]'),
    )
    .filter(
      (row) => row && row.getAttribute('aria-disabled') !== 'true',
    );
  focusable[0]?.focus();
  const visited = new Set();
  for (let index = 0; index < focusable.length + 2; index += 1) {
    const focusedId = idOf(document.activeElement);
    if (focusedId) visited.add(focusedId);
    document.activeElement?.dispatchEvent(
      new KeyboardEvent('keydown', {
        key: 'ArrowDown',
        bubbles: true,
        cancelable: true,
      }),
    );
    await sleep(20);
  }
  check(
    visited.has('api-test-suite.visual-rich') &&
      visited.has('api-test-suite.visual-parent'),
    'contributed rows participate in keyboard navigation',
    { visited: Array.from(visited) },
  );

  rich?.click();
  await sleep(100);
  check(
    globalThis.__CGPTX_VISUAL_CLICK_COUNT__ === initialClickCount + 1,
    'top-level user click activates handler once',
  );

  column = await openProfile();
  list = column?.querySelector('[data-cgptx-profile-menu]');
  blocks = list ? Array.from(list.children) : [];
  const reopenedParent = column?.querySelector(
    '[data-cgptx-id="api-test-suite.visual-parent"]',
  );
  const reopenedWrapper = reopenedParent?.closest('.flex.flex-col[data-state]');
  reopenedParent?.click();
  await sleep(100);
  const child = reopenedWrapper?.querySelector(
    '[data-cgptx-id="api-test-suite.visual-child"]',
  );
  const movedId = globalThis.__CGPTX_VISUAL_MOVED_ID__;
  const moved = reopenedWrapper?.querySelector('[data-cgptx-id="' + movedId + '"]');
  check(
    reopenedWrapper?.getAttribute('data-state') === 'open' &&
      Boolean(child && moved),
    'submenu expands in place with children',
  );
  check(
    child?.className === nativeNestedItemClassName,
    'contributed submenu child uses the native nested Item presentation',
    { nativeNestedItemClassName, childClassName: child?.className },
  );
  check(
    !blocks.some((block) => idOfBlock(block) === movedId),
    'moved built-in is absent from top level',
  );

  child?.click();
  await sleep(50);
  check(
    globalThis.__CGPTX_VISUAL_CHILD_CLICK_COUNT__ ===
      initialChildClickCount + 1,
    'submenu child user click activates handler once',
  );

  document.dispatchEvent(
    new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }),
  );
  await sleep(100);
  const programmaticActivation =
    globalThis.__CGPTX_ACTIVATE_VISUAL_PARENT__?.();
  await sleep(500);
  const programmaticColumn =
    globalThis.__CGPTX_HOST__?._debug.visibleMenuColumn();
  const programmaticParent = programmaticColumn?.querySelector(
    '[data-cgptx-id="api-test-suite.visual-parent"]',
  );
  check(
    programmaticActivation === true &&
      programmaticParent
        ?.closest('.flex.flex-col[data-state]')
        ?.getAttribute('data-state') === 'open',
    'public activateItem opens the native submenu',
  );

  document.dispatchEvent(
    new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }),
  );
  await sleep(100);
  const backToApp = Array.from(
    document.querySelectorAll('button, a, [role="button"]'),
  ).find((element) => element.textContent?.trim() === 'Back to app');
  backToApp?.click();
  await sleep(300);
  globalThis.__CGPTX_HOST__.registerExtension(
    'profile-navigation-fixture',
    {
      activate(api) {
        api.menus.profile.transformItems((items) => {
          const findAccount = (candidates) => {
            for (const candidate of candidates) {
              if (
                candidate.id === 'codex.profileDropdown.account' &&
                candidate.kind === 'action'
              ) {
                return candidate;
              }
              if (candidate.kind === 'action' && candidate.items) {
                const found = findAccount(candidate.items);
                if (found) return found;
              }
            }
          };
          const withoutAccount = (candidates) =>
            candidates.flatMap((candidate) => {
              if (candidate.id === 'codex.profileDropdown.account') return [];
              if (candidate.kind !== 'action' || !candidate.items) {
                return [candidate];
              }
              return [
                {
                  ...candidate,
                  items: withoutAccount(candidate.items),
                },
              ];
            });
          const nativeAccount = findAccount(items);
          if (!nativeAccount) return items;
          return [
            {
              ...nativeAccount,
              items: [
                {
                  kind: 'action',
                  id: 'profile-navigation-fixture.profile',
                  label: 'Profile',
                  onClick: nativeAccount.onClick,
                },
              ],
            },
            ...withoutAccount(items),
          ];
        });
      },
    },
  );
  const profileWasCurrent = Array.from(
    document.querySelectorAll('[aria-current="page"]'),
  ).some((element) => element.textContent?.trim() === 'Profile');
  column = await openProfile();
  const account = column?.querySelector(
    '[data-cgptx-id="codex.profileDropdown.account"]',
  );
  account?.click();
  await sleep(100);
  const profile = column?.querySelector(
    '[data-cgptx-id="profile-navigation-fixture.profile"]',
  );
  profile?.click();
  await sleep(500);
  const profileIsCurrent = Array.from(
    document.querySelectorAll('[aria-current="page"]'),
  ).some((element) => element.textContent?.trim() === 'Profile');
  check(
    Boolean(account && profile) &&
      !profileWasCurrent &&
      profileIsCurrent,
    'account submenu Profile child opens native Profile settings',
    {
      profileWasCurrent,
      profileIsCurrent,
      foundAccount: Boolean(account),
      foundProfile: Boolean(profile),
    },
  );
  markProgress('profile-menu');

  if (alternateAuthentication) {
    let authenticationApi;
    globalThis.__CGPTX_HOST__.registerExtension('authentication-switch-fixture', {
      activate(api) {
        authenticationApi = api.authentication;
      },
    });
    const original = await authenticationApi.getCurrent();
    const alternate = await authenticationApi.inspect(alternateAuthentication);
    check(
      Boolean(original && original.userId !== alternate.userId),
      'alternate authentication fixture identifies a different account',
    );
    if (original && original.userId !== alternate.userId) {
      try {
        await authenticationApi.replaceCurrent(alternateAuthentication);
        const adopted = await authenticationApi.getCurrent();
        const nativeAccount =
          await globalThis.__CGPTX_HOST__._debug.nativeAccount();
        check(
          adopted?.userId === alternate.userId &&
            nativeAccount?.account?.email === alternate.label,
          'credential replacement makes the native app server adopt the selected account',
          {
            selectedUserId: alternate.userId,
            adoptedUserId: adopted?.userId,
            selectedLabel: alternate.label,
            nativeEmail: nativeAccount?.account?.email,
          },
        );
      } finally {
        await authenticationApi.replaceCurrent(original.authJson);
      }
      const restored = await authenticationApi.getCurrent();
      const restoredNativeAccount =
        await globalThis.__CGPTX_HOST__._debug.nativeAccount();
      check(
        restored?.userId === original.userId &&
          restoredNativeAccount?.account?.email === original.label,
        'credential replacement restores the original native account',
        {
          selectedUserId: original.userId,
          restoredUserId: restored?.userId,
          selectedLabel: original.label,
          nativeEmail: restoredNativeAccount?.account?.email,
        },
      );
    }
  }

  markProgress('complete');
  return checks;
}

await waitFor('globalThis.__CGPTX_BINDING_FIXTURE_READY__ === true');
const semanticResults = await evaluate('globalThis.__CGPTX_TEST_RESULTS__');
const failedSemantic = semanticResults.filter((result) => !result.pass);
if (failedSemantic.length > 0) {
  throw new Error('Public API suite failed: ' + JSON.stringify(failedSemantic));
}

const report = await evaluate(
  '(' +
    validateUi.toString() +
    ')(' +
    JSON.stringify(expectNativeProfileCallbackMissing) +
    ',' +
    JSON.stringify(alternateAuthJson) +
    ')',
);
socket.close();
const failed = report.filter((check) => !check.pass);
console.log(
  JSON.stringify(
    { passed: report.length - failed.length, total: report.length, checks: report },
    null,
    2,
  ),
);
if (failed.length > 0) process.exitCode = 1;
