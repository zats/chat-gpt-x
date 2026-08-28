/**
 * Binding-specific live UI validation for menus.profile, menus.thread, and
 * menus.assistantSelection.
 *
 * This intentionally inspects version-specific renderer state. The stable
 * api-test-suite remains limited to src/platform/types.d.ts.
 *
 * Usage: node src/platform/bindings/26.825.32147/ui-test.mjs [port]
 *   [--expect-native-profile-callback-missing]
 *   [--select-thread=<thread-id>]
 *   [--select-thread-kind=remote]
 *   [--public-api-only]
 *
 * Set CHATGPTX_TEST_NO_PROFILE=1 for API-key authentication.
 */

const port = process.argv[2] ?? '9222';
const expectNativeProfileCallbackMissing = process.argv.includes(
  '--expect-native-profile-callback-missing',
);
const publicAPIOnly = process.argv.includes('--public-api-only');
const noProfile = process.env.CHATGPTX_TEST_NO_PROFILE === '1';
const selectThreadId = process.argv
  .find((argument) => argument.startsWith('--select-thread='))
  ?.slice('--select-thread='.length);
const selectThreadKind = process.argv
  .find((argument) => argument.startsWith('--select-thread-kind='))
  ?.slice('--select-thread-kind='.length);
if (selectThreadKind && selectThreadKind !== 'remote') {
  throw new Error('select-thread-kind must be remote');
}
const targets = await fetch('http://127.0.0.1:' + port + '/json').then((response) =>
  response.json(),
);
const page = targets.find(
  (target) => target.type === 'page' && target.url === 'app://-/index.html',
);

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

async function selectAssistantResponseText() {
  const targetSelector =
    '[data-response-annotation-target][data-response-annotation-conversation]';
  await waitFor(
    `Array.from(document.querySelectorAll(${JSON.stringify(targetSelector)})).some(
      (element) =>
        element.getBoundingClientRect().height > 0 &&
        (element.textContent?.trim().length ?? 0) > 0
    )`,
    60000,
  );
  const selection = await evaluate(`(() => {
    const targets = Array.from(document.querySelectorAll(${JSON.stringify(targetSelector)}))
      .filter((element) =>
        element.getBoundingClientRect().height > 0 &&
        (element.textContent?.trim().length ?? 0) > 0
      );
    const target = targets.at(-1);
    if (!target) throw new Error('Visible assistant response target missing');
    const walker = document.createTreeWalker(target, NodeFilter.SHOW_TEXT, {
      acceptNode(node) {
        if (node.parentElement?.closest('button, [contenteditable="true"]')) {
          return NodeFilter.FILTER_REJECT;
        }
        return /\\S/.test(node.data)
          ? NodeFilter.FILTER_ACCEPT
          : NodeFilter.FILTER_REJECT;
      },
    });
    let textNode = null;
    let candidate;
    while ((candidate = walker.nextNode())) {
      const parent = candidate.parentElement;
      if (
        !parent ||
        parent.closest('[aria-hidden="true"]') ||
        getComputedStyle(parent).userSelect === 'none'
      ) {
        continue;
      }
      const probe = document.createRange();
      probe.selectNodeContents(candidate);
      if (
        Array.from(probe.getClientRects()).some(
          (rect) => rect.width > 0 && rect.height > 0,
        )
      ) {
        textNode = candidate;
        break;
      }
    }
    if (!textNode) throw new Error('Assistant response text node missing');
    const start = textNode.data.search(/\\S/);
    const end = Math.min(textNode.data.length, start + 32);
    const range = document.createRange();
    range.setStart(textNode, start);
    range.setEnd(textNode, end);
    const browserSelection = window.getSelection();
    browserSelection.removeAllRanges();
    browserSelection.addRange(range);
    document.dispatchEvent(new Event('selectionchange', { bubbles: true }));
    return { selectedText: browserSelection.toString(), targetText: target.textContent };
  })()`);
  if (!selection?.selectedText) {
    throw new Error(
      'Assistant response selection was empty: ' + JSON.stringify(selection),
    );
  }
  try {
    await waitFor(
      `globalThis.__CGPTX_HOST__?._debug
        .computeEffectiveAssistantSelectionItems()
        .some((item) => item.origin === "app") ||
       globalThis.__CGPTX_HOST__?._debug
        .responseAnnotationCreationCount() > 0`,
      20000,
    );
  } catch (error) {
    const state = await evaluate(`({
      boundaryRenders:
        globalThis.__CGPTX_HOST__?._debug
          .assistantSelectionBoundaryRenderCount(),
      nativeBindingError:
        globalThis.__CGPTX_HOST__?._debug.nativeBindingError(),
      selectedText: window.getSelection()?.toString(),
      visibleButtons: Array.from(document.querySelectorAll('button'))
        .filter((button) => button.getBoundingClientRect().height > 0)
        .map((button) => button.textContent?.trim())
        .filter(Boolean),
    })`);
    throw new Error(
      `${error.message}; assistant selection state: ${JSON.stringify(state)}`,
    );
  }
  return selection.selectedText;
}

function findSettingsBackLink() {
  const hasMessageId = (value) =>
    Array.isArray(value)
      ? value.some(hasMessageId)
      : Boolean(
          value &&
            typeof value === 'object' &&
            (value.props?.id === 'settings.nav.back' ||
              hasMessageId(value.props?.children)),
        );
  return Array.from(document.querySelectorAll('[role="link"]')).find((link) => {
    const reactPropsKey = Object.keys(link).find((key) =>
      key.startsWith('__reactProps$'),
    );
    return hasMessageId(link[reactPropsKey]?.children);
  });
}

async function validateUi(
  expectMissingProfileCallback,
  noProfile,
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
    throw new Error(
      `Timed out waiting for native UI state during ${globalThis.__CGPTX_UI_TEST_PROGRESS__}: ${condition.toString().replace(/\s+/g, ' ')}`,
    );
  };
  markProgress('assistant-selection menu');
  await waitUntil(() =>
    Array.from(
      document.querySelectorAll('[data-cgptx-assistant-selection-action]'),
    ).some(
      (action) =>
        action.getAttribute('data-cgptx-id') ===
      'api-test-suite.assistant-selection-visual',
    ),
  );
  await waitUntil(() => {
    const belowAction = Array.from(
      document.querySelectorAll('[data-cgptx-assistant-selection-action]'),
    ).find((action) => action.getAttribute('data-cgptx-placement') === 'below');
    const belowMenu = belowAction?.closest('[role="presentation"]');
    return (
      belowMenu != null && getComputedStyle(belowMenu).visibility === 'visible'
    );
  });
  const assistantSelectionActions = Array.from(
    document.querySelectorAll('[data-cgptx-assistant-selection-action]'),
  );
  const assistantSelectionAboveAction = assistantSelectionActions.find(
    (action) => action.getAttribute('data-cgptx-placement') === 'above',
  );
  const assistantSelectionBelowAction = assistantSelectionActions.find(
    (action) => action.getAttribute('data-cgptx-placement') === 'below',
  );
  const assistantSelectionAboveMenu =
    assistantSelectionAboveAction?.closest('[role="presentation"]');
  const assistantSelectionBelowMenu =
    assistantSelectionBelowAction?.closest('[role="presentation"]');
  const assistantSelectionAboveLabels = Array.from(
    assistantSelectionAboveMenu?.querySelectorAll(
      '[data-cgptx-assistant-selection-action]',
    ) ?? [],
  ).map((action) => action.textContent?.trim());
  const assistantSelectionBelowLabels = Array.from(
    assistantSelectionBelowMenu?.querySelectorAll(
      '[data-cgptx-assistant-selection-action]',
    ) ?? [],
  ).map((action) => action.textContent?.trim());
  const assistantSelectionLabels = assistantSelectionActions.map((action) =>
    action.textContent?.trim(),
  );
  const expectedAssistantSelectionLabels = noProfile
    ? ['Add to chat']
    : ['Add to chat', 'More details', 'Ask in side chat'];
  check(
    expectedAssistantSelectionLabels.every((label) =>
      assistantSelectionAboveLabels.includes(label),
    ),
    'assistant selection keeps all native actions above the selection',
    { labels: assistantSelectionAboveLabels },
  );
  check(
    ['👍', '👎', '🤷', '🤬'].every((label) =>
      assistantSelectionBelowLabels.includes(label),
    ) && !assistantSelectionAboveLabels.includes('React'),
    'assistant selection shows direct emoji actions below the selection',
    {
      aboveLabels: assistantSelectionAboveLabels,
      belowLabels: assistantSelectionBelowLabels,
    },
  );
  const assistantSelectionBuiltIn = assistantSelectionActions.find(
    (action) => action.getAttribute('data-cgptx-origin') === 'app',
  );
  const assistantSelectionExtension = assistantSelectionActions.find(
    (action) =>
      action.getAttribute('data-cgptx-id') ===
      'api-test-suite.assistant-selection-visual',
  );
  const assistantSelectionBuiltInFontSize = assistantSelectionBuiltIn
    ? Number.parseFloat(getComputedStyle(assistantSelectionBuiltIn).fontSize)
    : Number.NaN;
  const assistantSelectionBuiltInHeight =
    assistantSelectionBuiltIn?.getBoundingClientRect().height ?? Number.NaN;
  check(
    Boolean(assistantSelectionExtension),
    'assistant selection renders an extension action',
    { labels: assistantSelectionLabels },
  );
  check(
    assistantSelectionBuiltIn?.tagName === assistantSelectionExtension?.tagName &&
      assistantSelectionBuiltIn?.className ===
        assistantSelectionExtension?.className,
    'assistant selection extension action reuses the native button component',
    {
      builtIn: assistantSelectionBuiltIn
        ? {
            tagName: assistantSelectionBuiltIn.tagName,
            className: assistantSelectionBuiltIn.className,
          }
        : null,
      extension: assistantSelectionExtension
        ? {
            tagName: assistantSelectionExtension.tagName,
            className: assistantSelectionExtension.className,
          }
        : null,
    },
  );
  const assistantSelectionClickCount = Number(
    globalThis.__CGPTX_ASSISTANT_SELECTION_CLICK_COUNT__ ?? 0,
  );
  const standardAnnotationCreation =
    globalThis.__CGPTX_HOST__._debug.lastResponseAnnotationCreation();
  check(
    standardAnnotationCreation?.submit === false &&
      document.querySelector('[data-response-text-annotation-id]') != null,
    'normal response annotation creation stays in the composer',
    standardAnnotationCreation,
  );
  const selectionRange = window.getSelection()?.getRangeAt(0);
  const selectionRect = selectionRange?.getBoundingClientRect();
  const aboveRect = assistantSelectionAboveMenu?.getBoundingClientRect();
  const belowRect = assistantSelectionBelowMenu?.getBoundingClientRect();
  const belowVisibility = assistantSelectionBelowMenu
    ? getComputedStyle(assistantSelectionBelowMenu).visibility
    : null;
  const serializeRect = (rect) =>
    rect
      ? {
          x: rect.x,
          y: rect.y,
          width: rect.width,
          height: rect.height,
          top: rect.top,
          right: rect.right,
          bottom: rect.bottom,
          left: rect.left,
        }
      : null;
  check(
    aboveRect &&
      belowRect &&
      selectionRect &&
      belowVisibility === 'visible' &&
      Math.abs(selectionRect.top - aboveRect.bottom - 8) < 1 &&
      Math.abs(belowRect.top - selectionRect.bottom - 8) < 1,
    'assistant selection native toolbars stay 8 px above and below the selection',
    {
      aboveRect: serializeRect(aboveRect),
      belowRect: serializeRect(belowRect),
      belowVisibility,
      selectionRect: serializeRect(selectionRect),
    },
  );
  const assistantSelectionScaledChildren = assistantSelectionActions.filter(
    (action) => {
      const id = action.getAttribute('data-cgptx-id');
      return (
        id === 'api-test-suite.assistant-selection-visual' ||
        id?.startsWith('api-test-suite.assistant-selection-visual-')
      );
    },
  );
  const assistantSelectionScaledFontSizes =
    assistantSelectionScaledChildren.map((action) => {
      const label = action.querySelector('[data-cgptx-label-scale="2"]');
      return label
        ? Number.parseFloat(getComputedStyle(label).fontSize)
        : Number.NaN;
    });
  const assistantSelectionPaddedMetrics = assistantSelectionScaledChildren.map(
    (action) => {
      const style = getComputedStyle(action);
      return {
        height: action.getBoundingClientRect().height,
        paddingTop: Number.parseFloat(style.paddingTop),
        paddingBottom: Number.parseFloat(style.paddingBottom),
      };
    },
  );
  check(
    Number.isFinite(assistantSelectionBuiltInFontSize) &&
      assistantSelectionScaledChildren.length === 4 &&
      assistantSelectionScaledFontSizes.every(
        (fontSize) =>
          Math.abs(fontSize - assistantSelectionBuiltInFontSize * 2) < 0.01,
      ),
    'assistant selection scaled labels use twice the native font size',
    {
      nativeFontSize: assistantSelectionBuiltInFontSize,
      scaledFontSizes: assistantSelectionScaledFontSizes,
    },
  );
  check(
    Number.isFinite(assistantSelectionBuiltInHeight) &&
      assistantSelectionScaledChildren.length === 4 &&
      assistantSelectionPaddedMetrics.every(
        ({ height, paddingTop, paddingBottom }) =>
          Math.abs(paddingTop - 4) < 0.01 &&
          Math.abs(paddingBottom - 4) < 0.01 &&
          Math.abs(height - (assistantSelectionBuiltInHeight + 8)) < 0.01,
      ),
    'assistant selection padded actions add 4 px above and below the label',
    {
      nativeHeight: assistantSelectionBuiltInHeight,
      paddedMetrics: assistantSelectionPaddedMetrics,
    },
  );
  check(
    assistantSelectionBuiltIn?.tagName ===
      assistantSelectionExtension?.tagName &&
      assistantSelectionBuiltIn?.className ===
        assistantSelectionExtension?.className,
    'assistant selection below action reuses the native button component',
  );
  const responseAnnotationCreationCount =
    globalThis.__CGPTX_HOST__._debug.responseAnnotationCreationCount();
  assistantSelectionExtension?.dispatchEvent(
    new MouseEvent('click', { bubbles: true, metaKey: true }),
  );
  await waitUntil(
    () =>
      Number(globalThis.__CGPTX_ASSISTANT_SELECTION_CLICK_COUNT__ ?? 0) ===
        assistantSelectionClickCount + 1 &&
      window.getSelection()?.isCollapsed === true &&
      globalThis.__CGPTX_HOST__._debug.responseAnnotationCreationCount() ===
        responseAnnotationCreationCount + 1,
  );
  check(
    globalThis.__CGPTX_ASSISTANT_SELECTION_META_KEY__ === true &&
      globalThis.__CGPTX_ASSISTANT_SELECTION_ANNOTATION_ERROR__ == null &&
      globalThis.__CGPTX_HOST__._debug.lastResponseAnnotationCreation()
        ?.submit === true,
    'Command-click activates once, dismisses the selection, and directly submits',
    {
      metaKey: globalThis.__CGPTX_ASSISTANT_SELECTION_META_KEY__,
      annotationError:
        globalThis.__CGPTX_ASSISTANT_SELECTION_ANNOTATION_ERROR__ ?? null,
      annotation:
        globalThis.__CGPTX_HOST__._debug.lastResponseAnnotationCreation(),
    },
  );
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
    const findTrigger = () =>
      Array.from(document.querySelectorAll('button')).find(
        (button) =>
          button.getAttribute('aria-label') === 'Chat actions' &&
          button.getBoundingClientRect().height > 0,
      );
    await waitUntil(
      () =>
        typeof findTrigger()?.getAttribute('data-cgptx-thread-id') === 'string',
    );
    await sleep(250);
    const trigger = findTrigger();
    if (!trigger) throw new Error('Thread menu trigger missing');
    const triggerRect = trigger.getBoundingClientRect();
    trigger.dispatchEvent(
      new PointerEvent('pointerdown', {
        bubbles: true,
        cancelable: true,
        button: 0,
        buttons: 1,
        clientX: triggerRect.x + triggerRect.width / 2,
        clientY: triggerRect.y + triggerRect.height / 2,
        isPrimary: true,
        pointerType: 'mouse',
      }),
    );
    let menu;
    try {
      await waitUntil(
        () => {
          menu = Array.from(document.querySelectorAll('[role="menu"]')).find(
            (candidate) =>
              Array.from(candidate.children).some((child) =>
                child.hasAttribute('data-cgptx-thread-id'),
              ),
          );
          return (
            trigger.getAttribute('aria-expanded') === 'true' && Boolean(menu)
          );
        },
      );
    } catch (error) {
      const currentTriggerRect = trigger.getBoundingClientRect();
      const state = {
        triggerConnected: trigger.isConnected,
        threadId: trigger.getAttribute('data-cgptx-thread-id'),
        ariaExpanded: trigger.getAttribute('aria-expanded'),
        dataState: trigger.getAttribute('data-state'),
        triggerRect: {
          x: currentTriggerRect.x,
          y: currentTriggerRect.y,
          width: currentTriggerRect.width,
          height: currentTriggerRect.height,
        },
        visibleTriggerCount: Array.from(
          document.querySelectorAll('button[aria-label="Chat actions"]'),
        ).filter((button) => button.getBoundingClientRect().height > 0).length,
        visibleMenus: Array.from(document.querySelectorAll('[role="menu"]')).map(
          (candidate) => candidate.textContent?.trim(),
        ),
      };
      const cause = error instanceof Error ? error.message : String(error);
      throw new Error(
        `Thread menu did not open after its native pointer-down activation: ${JSON.stringify(state)}. ${cause}`,
      );
    }
    return menu;
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
    ).find((row) => row.getBoundingClientRect().height > 0);
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
  const findThreadRow = (threadId) =>
    Array.from(
      document.querySelectorAll('[data-app-action-sidebar-thread-row]'),
    ).find((row) =>
      row
        .getAttribute('data-app-action-sidebar-thread-id')
        ?.endsWith(threadId),
    );
  const originalThreadRow = findThreadRow(originalThread.threadId);
  if (!originalThreadRow) throw new Error('Original thread row missing');
  const originalThreadKind = originalThreadRow.getAttribute(
    'data-app-action-sidebar-thread-kind',
  );
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
    Boolean(document.querySelector('[data-api-test-suite-thread-list-view]')),
  );
  const threadListView = document.querySelector(
    '[data-api-test-suite-thread-list-view]',
  );
  const threadListFixtureRow = threadListView?.closest(
    '[data-app-action-sidebar-thread-row]',
  );
  const threadListViewHost = threadListView?.closest(
    '[data-cgptx-thread-list-leading-views]',
  );
  const threadTitle = threadListFixtureRow?.querySelector('[data-thread-title]');
  const archiveButton = Array.from(threadListFixtureRow?.querySelectorAll('button') ?? []).find(
    (button) => button.getAttribute('aria-label') === 'Archive chat',
  );
  const rowRect = threadListFixtureRow?.getBoundingClientRect();
  const viewRect = threadListView?.getBoundingClientRect();
  const hostRect = threadListViewHost?.getBoundingClientRect();
  const titleRect = threadTitle?.getBoundingClientRect();
  const archiveRect = archiveButton?.getBoundingClientRect();
  const leadingInset =
    hostRect && rowRect ? hostRect.left - rowRect.left : undefined;
  const trailingInset =
    archiveRect && rowRect ? rowRect.right - archiveRect.right : undefined;
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
        threadListFixtureRow &&
        threadListViewHost &&
        rowRect &&
        viewRect?.width === 3 &&
        viewRect?.height === 14 &&
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
      rowRect: rowRect?.toJSON(),
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
      rowActive: threadListFixtureRow?.getAttribute(
        'data-app-action-sidebar-thread-active',
      ),
    },
  );
  globalThis.__CGPTX_REMOVE_THREAD_LIST_VISUAL_FIXTURE__();
  await waitUntil(
    () =>
      threadListFixtureRow?.querySelector(
        '[data-api-test-suite-thread-list-view]',
      ) === null,
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
  const appHeader = document.querySelector(
    'header[data-pip-obstacle="app-shell-header"]',
  );
  if (!appHeader) throw new Error('Thread header missing');
  const findThreadHeaderTitle = () =>
    Array.from(appHeader.querySelectorAll('*')).find(
      (element) =>
        element.textContent?.trim() === originalThread.title &&
        !Array.from(element.children).some(
          (child) => child.textContent?.trim() === originalThread.title,
        ),
    );
  let threadHeaderTitle;
  await waitUntil(() => {
    threadHeaderTitle = findThreadHeaderTitle();
    return Boolean(threadHeaderTitle);
  });
  const headerToggle = (label) =>
    Array.from(
      document.querySelectorAll(
        `header[data-pip-obstacle="app-shell-header"] button[aria-label="${label}"]`,
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
  await waitUntil(() => {
    threadHeaderTitle = findThreadHeaderTitle();
    return Boolean(threadHeaderTitle?.isConnected);
  });
  const initialHeaderColors = headerColors[originalHeaderTheme];
  const collapsedPanelButtons = [
    headerToggle('Toggle bottom panel'),
    headerToggle('Toggle side panel'),
  ];
  const headerSurfaceButtons = Array.from(
    appHeader.querySelectorAll('button[class~="bg-token-bg-fog"]'),
  ).filter((button) => button.getBoundingClientRect().width > 0);
  const headerSurfaceButtonStates = headerSurfaceButtons.map((button) => {
    const style = getComputedStyle(button);
    return {
      label: button.textContent?.trim(),
      background: style.backgroundColor,
      color: style.color,
      contrast: contrastRatio(style.color, style.backgroundColor),
    };
  });
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
      getComputedStyle(threadHeaderTitle).color ===
        initialHeaderColors.foreground &&
      (originalThreadKind !== 'remote' ||
        (headerSurfaceButtonStates.length > 0 &&
          headerSurfaceButtonStates.every(
            ({ background, contrast }) =>
              background !== 'rgba(255, 255, 255, 0.96)' && contrast >= 3,
          ))) &&
      collapsedPanelButtonStates.every(
        ({ visible, hit, contrast }) => visible && hit && contrast >= 3,
      ),
    'collapsed panel controls use the header appearance and remain readable',
    {
      background: getComputedStyle(collapsedHeaderControls).backgroundColor,
      expectedBackground: initialHeaderColors.background,
      titleColor: getComputedStyle(threadHeaderTitle).color,
      expectedTitleColor: initialHeaderColors.foreground,
      headerSurfaceButtonStates,
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
    if (browserAction) {
      activateButton(browserAction);
      await sleep(500);
      sidePanel = document.querySelector(
        'aside[data-app-shell-focus-area="right-panel"]',
      );
      tabToolbar = sidePanel?.querySelector(
        '[data-app-shell-tabs="true"] > .h-toolbar',
      );
    } else {
      tabToolbar = null;
    }
  }
  if (
    tabToolbar &&
    !tabToolbar.querySelector('[role="tab"][aria-selected="true"]')
  ) {
    throw new Error('Side-panel selected tab missing');
  }
  const threadHeaderRegion = appHeader?.querySelector(
    ':scope > div:nth-of-type(3)',
  );
  let contentToolbarButtons = Array.from(
    tabToolbar?.nextElementSibling?.querySelectorAll('button') ?? [],
  ).slice(0, 8);
  if (
    tabToolbar?.querySelector(
      '[role="tab"][aria-selected="true"] [data-browser-tab-icon-phase]',
    ) &&
    contentToolbarButtons.length === 0
  ) {
    await waitUntil(() => {
      sidePanel = document.querySelector(
        'aside[data-app-shell-focus-area="right-panel"]',
      );
      tabToolbar = sidePanel?.querySelector(
        '[data-app-shell-tabs="true"] > .h-toolbar',
      );
      contentToolbarButtons = Array.from(
        tabToolbar?.nextElementSibling?.querySelectorAll('button') ?? [],
      ).slice(0, 8);
      return contentToolbarButtons.length > 0;
    });
  } else if (tabToolbar && contentToolbarButtons.length === 0) {
    const browserAction = Array.from(document.querySelectorAll('button')).find(
      (button) => button.textContent?.trim().startsWith('Browser'),
    );
    if (browserAction) {
      activateButton(browserAction);
      await sleep(500);
      sidePanel = document.querySelector(
        'aside[data-app-shell-focus-area="right-panel"]',
      );
      tabToolbar = sidePanel?.querySelector(
        '[data-app-shell-tabs="true"] > .h-toolbar',
      );
      contentToolbarButtons = Array.from(
        tabToolbar?.nextElementSibling?.querySelectorAll('button') ?? [],
      ).slice(0, 8);
    }
  }
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
      (!tabToolbar ||
        getComputedStyle(tabToolbar).backgroundColor ===
          initialHeaderColors.background),
    'header background property colors every available native header',
  );
  const tabFadeGradients = Array.from(
    tabToolbar?.querySelectorAll(
      '[class*="after:to-surface"]',
    ) ?? [],
  ).map((overlay) => getComputedStyle(overlay, '::after').backgroundImage);
  check(
    !tabToolbar ||
      (tabFadeGradients.length >= 2 &&
        tabFadeGradients.every((gradient) =>
          gradient.includes(initialHeaderColors.background),
        )),
    'side-panel tab overflow fades into the selected header background',
    { tabFadeGradients },
  );
  check(
    sideHeaderButtons.length >= (tabToolbar ? 4 : 2) &&
      getComputedStyle(expandedHeaderControls).backgroundColor ===
        'rgba(0, 0, 0, 0)' &&
      (!tabToolbar ||
        sideHeaderButtonStates.some(
          ({ role, directHit }) => role === 'tab' && directHit,
        )) &&
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
    !tabToolbar ||
      (contentToolbarButtons.length > 0 &&
        JSON.stringify(
          contentToolbarButtons.map((button) => getComputedStyle(button).color),
        ) === JSON.stringify(contentToolbarColorsBefore)),
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
      (!tabToolbar ||
        (getComputedStyle(tabToolbar).backgroundColor ===
          currentUpdatedHeaderColors.background &&
          getComputedStyle(selectedSideTab).color ===
            currentUpdatedHeaderColors.foreground)),
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
      (!tabToolbar ||
        (getComputedStyle(tabToolbar).backgroundColor ===
          alternateHeaderColors.background &&
          getComputedStyle(selectedSideTab).color ===
            alternateHeaderColors.foreground)) &&
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
      (!tabToolbar ||
        getComputedStyle(tabToolbar).backgroundColor === 'rgb(80, 0, 80)'),
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
  await waitUntil(
    () =>
      pickerResult !== undefined &&
      document.querySelector('[data-cgptx-native-color-picker]') === null,
  );
  check(
    pickerResult === pickerPreview &&
      document.querySelector('[data-cgptx-native-color-picker]') === null,
    'clicking outside returns the live selected color and dismisses the picker',
    { pickerPreview, pickerResult },
  );
  const cancelledPickerResults = [];
  for (let attempt = 0; attempt < 3; attempt += 1) {
    let settled = false;
    let result = '#pending';
    const cancelledPicker = globalThis.__CGPTX_HOST__._debug.openColorPicker({
      initialColor: '#53B559',
      title: `Cancelled API UI color ${attempt}`,
      onChange() {},
    });
    void cancelledPicker.result.then((color) => {
      settled = true;
      result = color;
    });
    await waitUntil(() => {
      const dialog = document.querySelector(
        '[data-cgptx-native-color-picker]',
      );
      return Boolean(dialog?.contains(document.activeElement));
    });
    document.activeElement?.dispatchEvent(
      new KeyboardEvent('keydown', {
        key: 'Escape',
        bubbles: true,
        cancelable: true,
      }),
    );
    try {
      await waitUntil(
        () =>
          settled &&
          document.querySelector('[data-cgptx-native-color-picker]') === null,
      );
    } catch (error) {
      const dialog = document.querySelector(
        '[data-cgptx-native-color-picker]',
      );
      throw new Error(
        `color-picker cancellation ${attempt} failed: ${JSON.stringify({
          settled,
          result,
          active: globalThis.__CGPTX_HOST__._debug.activeColorPicker(),
          dialogLabel: dialog?.getAttribute('aria-label'),
          activeElementRole: document.activeElement?.getAttribute('role'),
          renderError: globalThis.__CGPTX_HOST__._debug.colorPickerRenderError(),
        })}`,
        { cause: error },
      );
    }
    cancelledPickerResults.push(result);
  }
  check(
    cancelledPickerResults.length === 3 &&
      cancelledPickerResults.every((result) => result === undefined),
    'Escape immediately cancels consecutive native picker sessions',
    { cancelledPickerResults },
  );
  markProgress('color-picker');

  let threadMenu = await openThreadMenu();
  if (!threadMenu) throw new Error('Thread menu did not open');
  check(
    globalThis.__CGPTX_HOST__._debug.applicationRootRefreshCount() === 1 &&
      globalThis.__CGPTX_HOST__._debug.threadMenuBoundaryRenderCount() > 0 &&
      globalThis.__CGPTX_HOST__._debug.threadMenuAdapterRenderCount() > 0,
    'native binding reconciles the application tree before activation',
  );
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
  const threadRowLabel = (row) => {
    const labelContainer = row?.querySelector(
      'span.flex-1.min-w-0.truncate, span.min-w-0.flex-1.truncate',
    );
    return (
      labelContainer?.querySelector('span.truncate')?.textContent?.trim() ??
      labelContainer?.textContent?.trim() ??
      row?.textContent?.trim()
    );
  };
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
      Boolean(child.querySelector('.h-\\[1px\\][class*="bg-border"]')),
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
  const nativeActionRow = threadRows.find(
    (row) =>
      row !== colorRow &&
      row.getAttribute('aria-haspopup') !== 'menu' &&
      row.className.includes('cursor-interaction'),
  );
  const threadItemPresentation = (row) => {
    if (!row) return undefined;
    const style = getComputedStyle(row);
    return {
      paddingLeft: style.paddingLeft,
      paddingRight: style.paddingRight,
      paddingTop: style.paddingTop,
      paddingBottom: style.paddingBottom,
      color: style.color,
      fontSize: style.fontSize,
      lineHeight: style.lineHeight,
      borderRadius: style.borderRadius,
    };
  };
  const referenceThreadItem = nativeFlyoutRow ?? nativeActionRow;
  check(
    Boolean(colorRow) &&
      Boolean(referenceThreadItem) &&
      JSON.stringify(threadItemPresentation(colorRow)) ===
        JSON.stringify(threadItemPresentation(referenceThreadItem)) &&
      colorRow.className === referenceThreadItem.className,
    'Color reuses the native thread item presentation',
    {
      color: threadItemPresentation(colorRow),
      reference: threadItemPresentation(referenceThreadItem),
      colorClassName: colorRow?.className,
      referenceClassName: referenceThreadItem?.className,
    },
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
  const findColorFlyout = () =>
    Array.from(document.querySelectorAll('[role="menu"]')).find(
      (menu) =>
        menu !== threadMenu &&
        JSON.stringify(menuRows(menu).map(threadRowLabel)) ===
          JSON.stringify(colorNames),
    );
  const openColorFlyout = async () => {
    if (!findColorFlyout()) {
      const activated = threadMenuApi.activateItem(
        threadId,
        'thread-colors.color',
      );
      if (!activated) {
        throw new Error('Could not reopen the native Color flyout');
      }
    }
    await waitUntil(
      () => menuRows(findColorFlyout()).length === colorNames.length,
    );
    return findColorFlyout();
  };
  const colorIconsFor = (rows) =>
    rows.map((row) =>
      row.querySelector('[data-cgptx-thread-menu-color-icon]'),
    );
  let colorFlyout = await openColorFlyout();
  let colorRows = menuRows(colorFlyout);
  let colorIcons = colorIconsFor(colorRows);
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
          row.className.includes('hover:bg-primary-ghost-hover'),
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
  colorFlyout = await openColorFlyout();
  colorRows = menuRows(colorFlyout);
  colorIcons = colorIconsFor(colorRows);
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
  colorFlyout = await openColorFlyout();
  colorRows = menuRows(colorFlyout);
  const currentThreadMenu = Array.from(
    document.querySelectorAll('[role="menu"]'),
  ).find(
    (menu) =>
      menu !== colorFlyout &&
      menuRows(menu).some((row) => threadRowLabel(row) === 'Color'),
  );
  const currentNativeThreadRow = menuRows(currentThreadMenu).find((row) =>
    row.className.includes('cursor-interaction'),
  );
  const nativeThreadItemCursor = currentNativeThreadRow
    ? getComputedStyle(currentNativeThreadRow).cursor
    : undefined;
  colorRows[0]?.focus();
  const focusedColorStyle = getComputedStyle(document.activeElement);
  check(
    document.activeElement === colorRows[0] &&
      Boolean(currentNativeThreadRow) &&
      focusedColorStyle.cursor === nativeThreadItemCursor &&
      colorRows[0]?.className.includes(
        'hover:bg-primary-ghost-hover',
      ) &&
      colorRows[0]?.className.includes(
        'focus:bg-primary-ghost-hover',
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
  await waitUntil(
    () => document.activeElement === menuRows(findColorFlyout())[1],
  );
  colorFlyout = findColorFlyout();
  colorRows = menuRows(colorFlyout);
  check(
    document.activeElement === colorRows[1],
    'Color flyout participates in native keyboard navigation',
  );
  activateButton(colorRows[1]);
  await waitUntil(() =>
    Boolean(
      findThreadRow(threadId)?.querySelector(
        '[data-thread-colors-indicator]',
      ),
    ),
  );
  const blueThreadIndicator = findThreadRow(threadId)?.querySelector(
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
    Boolean(
      blueThreadIndicator?.closest(
        '[data-cgptx-thread-list-leading-views]',
      ),
    ) &&
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
      findThreadRow(threadId)?.querySelector(
        '[data-thread-colors-indicator]',
      ) === null,
  );
  check(
    Object.keys(headerAppearance.getProperties()).length === 0 &&
      root.style.getPropertyValue('--header-background-color') === '' &&
      root.style.getPropertyValue('--header-foreground-color') === '',
    'selecting Default restores ChatGPT native header CSS',
  );
  check(
    findThreadRow(threadId)?.querySelector(
      '[data-thread-colors-indicator]',
    ) === null,
    'selecting Default removes the thread indicator',
  );
  markProgress('thread-menu');

  check(
    typeof globalThis.__CGPTX_RUNTIME__?.request === 'function',
    'version-independent runtime preload is available',
  );

  if (noProfile) {
    markProgress('complete');
    return checks;
  }

  let column = await openProfile();
  if (!column) throw new Error('Profile menu did not open');
  check(
    globalThis.__CGPTX_HOST__?._debug.authenticationReady() === true,
    'native post-authentication refresh callback is captured',
  );
  check(
    globalThis.__CGPTX_HOST__?._debug.authenticationScopeReady() === true,
    'native application scope is captured from the profile boundary',
  );
  check(
    globalThis.__CGPTX_HOST__?._debug.nativeSignInStartCount() >= 1,
    'public startSignIn used ChatGPT native login',
  );
  check(
    globalThis.__CGPTX_HOST__?._debug.nativeSignInUsedApplicationScope() ===
      true,
    'public startSignIn passed the captured application scope to ChatGPT native login',
  );
  check(
    globalThis.__CGPTX_HOST__?._debug.authenticationRefreshCount() >= 1,
    'public credential replacement used ChatGPT post-auth refresh',
  );
  check(
    globalThis.__CGPTX_HOST__?._debug.authenticationAccountInfoResetCount() >= 1,
    'public credential replacement clears the native account-info query',
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
      'https://api.openai.com/auth': {
        chatgpt_account_id: 'synthetic-account',
        user_id: 'synthetic-user',
      },
      'https://api.openai.com/profile': {
        name: 'Shared Name',
        email: 'unique@example.com',
      },
    }),
  )
    .replaceAll('+', '-')
    .replaceAll('/', '_')
    .replaceAll('=', '');
  const syntheticIdentity = globalThis.__CGPTX_HOST__._debug.inspectAuthentication(
    JSON.stringify({ tokens: { access_token: `header.${syntheticClaims}.signature` } }),
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
    block.querySelector('.h-\\[1px\\][class*="bg-border"]'),
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
  const nativeNestedStyle = nativeNestedItem
    ? (() => {
        const style = getComputedStyle(nativeNestedItem);
        return {
          paddingLeft: style.paddingLeft,
          paddingRight: style.paddingRight,
          color: style.color,
          fontSize: style.fontSize,
          lineHeight: style.lineHeight,
          borderRadius: style.borderRadius,
        };
      })()
    : undefined;
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
  const childStyle = child
    ? (() => {
        const style = getComputedStyle(child);
        return {
          paddingLeft: style.paddingLeft,
          paddingRight: style.paddingRight,
          color: style.color,
          fontSize: style.fontSize,
          lineHeight: style.lineHeight,
          borderRadius: style.borderRadius,
        };
      })()
    : undefined;
  const movedId = globalThis.__CGPTX_VISUAL_MOVED_ID__;
  const moved = reopenedWrapper?.querySelector('[data-cgptx-id="' + movedId + '"]');
  check(
    reopenedWrapper?.getAttribute('data-state') === 'open' &&
      Boolean(child && moved),
    'submenu expands in place with children',
  );
  check(
    Boolean(childStyle) &&
      JSON.stringify(childStyle) === JSON.stringify(nativeNestedStyle),
    'contributed submenu child uses the native nested Item presentation',
    {
      nativeNestedItemClassName,
      childClassName: child?.className,
      nativeNestedStyle,
      childStyle,
    },
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
  let profileNavigationRegistration;
  globalThis.__CGPTX_HOST__.registerExtension(
    'profile-navigation-fixture',
    {
      activate(api) {
        profileNavigationRegistration = api.menus.profile.transformItems((items) => {
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
                  icon: 'person',
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
  check(
    profile
      ?.querySelector('svg[viewBox="0 0 20 20"] > path')
      ?.getAttribute('d')
      ?.startsWith('M16.585 10C16.585 6.3632'),
    'person icon reuses ChatGPT Profile artwork',
  );
  const profileNavigationAttemptsBefore =
    globalThis.__CGPTX_HOST__?._debug.profileNavigationAttemptCount();
  const profileClickStartedAt = performance.now();
  let profileDomTransitionAfterMs = null;
  const profileTransitionObserver = new MutationObserver(() => {
    if (
      profileDomTransitionAfterMs === null &&
      Array.from(document.querySelectorAll('[aria-current="page"]')).some(
        (element) => element.textContent?.trim() === 'Profile',
      )
    ) {
      profileDomTransitionAfterMs = Math.round(
        performance.now() - profileClickStartedAt,
      );
    }
  });
  profileTransitionObserver.observe(document.body, {
    attributes: true,
    attributeFilter: ['aria-current'],
    childList: true,
    subtree: true,
  });
  profile?.click();
  const profileNavigationDeadline = performance.now() + 10_000;
  let profileIsCurrent = false;
  while (performance.now() < profileNavigationDeadline) {
    profileIsCurrent = Array.from(
      document.querySelectorAll('[aria-current="page"]'),
    ).some((element) => element.textContent?.trim() === 'Profile');
    if (profileIsCurrent) break;
    await sleep(50);
  }
  profileTransitionObserver.disconnect();
  const profileNavigationAttemptsAfter =
    globalThis.__CGPTX_HOST__?._debug.profileNavigationAttemptCount();
  const profileNavigationLastRequestedPath =
    globalThis.__CGPTX_HOST__?._debug.profileNavigationLastRequestedPath();
  check(
    Boolean(account && profile) &&
      !profileWasCurrent &&
      profileIsCurrent &&
      profileNavigationAttemptsAfter === profileNavigationAttemptsBefore + 1 &&
      profileNavigationLastRequestedPath === '/settings/profile',
    'account submenu Profile child opens native Profile settings',
    {
      profileWasCurrent,
      profileIsCurrent,
      foundAccount: Boolean(account),
      foundProfile: Boolean(profile),
      profileNavigationAttemptsBefore,
      profileNavigationAttemptsAfter,
      profileNavigationLastRequestedPath,
      profileDomTransitionAfterMs,
      currentPageLabels: Array.from(
        document.querySelectorAll('[aria-current="page"]'),
      ).map((element) => element.textContent?.trim()),
    },
  );
  profileNavigationRegistration.dispose();
  markProgress('profile-menu');

  markProgress('settings');
  const settingsFixtureId = 'settings-ui-fixture';
  const settingsPaneId = `${settingsFixtureId}.pane`;
  const settingsGroupId = `${settingsFixtureId}.group`;
  const settingsDuplicateGroupId = `${settingsFixtureId}.duplicate-group`;
  const settingsSnapshotPaneId = `${settingsFixtureId}.snapshot-pane`;
  const settingsSecondPaneId = `${settingsFixtureId}.second-pane`;
  const settingsSecondGroupId = `${settingsFixtureId}.second-group`;
  const settingsSecondItemId = `${settingsFixtureId}.second-item`;
  const settingsAppearanceGroupId = `${settingsFixtureId}.appearance-group`;
  const settingsAppearanceItemId = `${settingsFixtureId}.appearance-item`;
  const settingsToggleId = `${settingsFixtureId}.toggle`;
  const settingsAlignedToggleId = `${settingsFixtureId}.aligned-toggle`;
  const settingsSelectId = `${settingsFixtureId}.select`;
  const settingsButtonId = `${settingsFixtureId}.button`;
  const settingsTextFieldId = `${settingsFixtureId}.text-field`;
  const settingsInlineId = `${settingsFixtureId}.inline`;
  const settingsBuiltInGroupId = `${settingsFixtureId}.built-in-group`;
  const settingsBuiltInItemId = `${settingsFixtureId}.built-in-item`;
  const settingsProfileGroupId = `${settingsFixtureId}.profile-group`;
  const settingsProfileItemId = `${settingsFixtureId}.profile-item`;
  const settingsObserverId = 'settings-observer-fixture';
  const settingsObserverReplayId = `${settingsObserverId}.replay`;
  let settingsApi;
  let settingsToggleChecked = false;
  let settingsAlignedToggleChecked = false;
  let settingsSelectedValue = 'first';
  let settingsTextValue = 'Initial value';
  let settingsButtonClicks = 0;
  let settingsBuiltInOverrideItemId;
  let settingsBuiltInOverrideClicks = 0;
  let settingsItemRegistration;
  globalThis.__CGPTX_HOST__.registerExtensionSettings(settingsFixtureId, {
    activate(api) {
      settingsApi = api.settings;
      const settingsBuiltInOverrideControl = settingsApi.ui.button({
        label: 'Run built-in override',
        onClick() {
          settingsBuiltInOverrideClicks += 1;
        },
      });
      settingsApi.transformCategories((categories) =>
        categories.map((category) =>
          category.id === 'integrations'
            ? {
                ...category,
                keywords: [
                  ...(category.keywords ?? []),
                  'settings-category-marker',
                ],
                panes: [
                  ...category.panes,
                  {
                    id: settingsPaneId,
                    label: 'Settings UI Fixture',
                    title: 'Settings UI Fixture',
                    description: 'settings-pane-marker',
                  },
                  {
                    id: settingsSecondPaneId,
                    label: 'Second Settings UI Fixture',
                  },
                  {
                    id: settingsSnapshotPaneId,
                    label: 'Settings Snapshot Fixture',
                  },
                ],
              }
            : category,
        ),
      );
      settingsApi.transformGroups((groups, pane) => {
        if (pane.id === settingsPaneId) {
          return [
            ...groups,
            {
              id: settingsGroupId,
              title: 'Settings fixture group',
              description: 'settings-group-marker',
              footer: 'Settings fixture footer',
              items: [],
            },
            {
              id: settingsDuplicateGroupId,
              title: 'Duplicate item fixture group',
              items: [
                {
                  id: settingsToggleId,
                  label: 'Duplicate settings fixture toggle',
                },
              ],
            },
          ];
        }
        if (pane.id === settingsSecondPaneId) {
          return [
            ...groups,
            {
              id: settingsSecondGroupId,
              items: [],
            },
          ];
        }
        if (pane.id === 'codex.settings.appearance') {
          return [
            ...groups,
            {
              id: settingsAppearanceGroupId,
              items: [
                {
                  id: settingsAppearanceItemId,
                  label: 'Appearance host fixture',
                },
              ],
            },
          ];
        }
        if (pane.id === 'codex.settings.general-settings') {
          return [
            ...groups,
            {
              id: settingsBuiltInGroupId,
              title: 'Built-in pane fixture',
              items: [],
            },
          ];
        }
        if (pane.id === 'codex.settings.profile') {
          return [
            ...groups,
            {
              id: settingsProfileGroupId,
              title: 'Profile pane fixture',
              items: [
                {
                  id: settingsProfileItemId,
                  label: 'Profile pane item',
                },
              ],
            },
          ];
        }
        return groups;
      });
      settingsItemRegistration = settingsApi.transformItems(
        (items, context) => {
          if (
            context.pane.id === 'codex.settings.general-settings' &&
            context.group.origin === 'app'
          ) {
            settingsBuiltInOverrideItemId ??= items.find(
              (item) => item.origin === 'app' && typeof item.id === 'string',
            )?.id;
            return items.map((item) =>
              item.id === settingsBuiltInOverrideItemId
                ? { ...item, control: settingsBuiltInOverrideControl }
                : item,
            );
          }
          if (context.group.id === settingsSecondGroupId) {
            return [
              ...items,
              {
                id: settingsToggleId,
                label: 'Second custom pane shared item',
              },
              {
                id: settingsSecondItemId,
                label: 'Second custom pane item',
              },
            ];
          }
          if (context.group.id === settingsBuiltInGroupId) {
            return [
              ...items,
              {
                id: settingsBuiltInItemId,
                label: 'Built-in pane item',
              },
            ];
          }
          if (context.group.id !== settingsGroupId) return items;
          return [
            ...items,
            {
              id: settingsToggleId,
              label: 'Settings fixture toggle',
              description: 'settings-item-marker',
              destination: {
                paneId: settingsSecondPaneId,
                itemId: settingsSecondItemId,
              },
              control: settingsApi.ui.toggle({
                checked: settingsToggleChecked,
                onChange(checked) {
                  settingsToggleChecked = checked;
                  settingsItemRegistration.invalidate();
                },
              }),
            },
            {
              id: settingsAlignedToggleId,
              label: 'Settings aligned toggle',
              control: settingsApi.ui.toggle({
                checked: settingsAlignedToggleChecked,
                onChange(checked) {
                  settingsAlignedToggleChecked = checked;
                  settingsItemRegistration.invalidate();
                },
              }),
            },
            {
              id: settingsSelectId,
              label: 'Settings fixture select',
              control: settingsApi.ui.select({
                value: settingsSelectedValue,
                options: [
                  { value: '', label: 'Default/None' },
                  { value: 'first', label: 'First choice' },
                  { value: 'second', label: 'Second choice' },
                ],
                onChange(value) {
                  settingsSelectedValue = value;
                  settingsItemRegistration.invalidate();
                },
              }),
            },
            {
              id: settingsButtonId,
              label: 'Settings fixture action',
              control: settingsApi.ui.button({
                label: 'Run fixture',
                onClick() {
                  settingsButtonClicks += 1;
                },
              }),
            },
            {
              id: settingsTextFieldId,
              label: 'Settings fixture text',
              keywords: ['settings-text-field-marker'],
              control: settingsApi.ui.textField({
                value: settingsTextValue,
                placeholder: 'Type a fixture value',
                onChange(value) {
                  settingsTextValue = value;
                  settingsItemRegistration.invalidate();
                },
              }),
            },
            {
              id: settingsInlineId,
              label: 'Settings fixture inline controls',
              control: settingsApi.ui.inline([
                settingsApi.ui.textField({
                  value: settingsTextValue,
                  placeholder: 'Inline fixture value',
                  onChange(value) {
                    settingsTextValue = value;
                    settingsItemRegistration.invalidate();
                  },
                }),
                settingsApi.ui.button({
                  label: 'Reset fixture',
                  onClick() {
                    settingsTextValue = 'Reset value';
                    settingsItemRegistration.invalidate();
                  },
                }),
              ]),
            },
          ];
        },
      );
    },
  }, settingsSecondPaneId);

  let settingsObserverFoundControl = false;
  let settingsObserverHandlerCount = -1;
  let settingsObserverInvokedOwner = false;
  globalThis.__CGPTX_HOST__.registerExtension(settingsObserverId, {
    activate(api) {
      const control = api.settings
        .getGroups(settingsPaneId)
        .flatMap((group) => group.items)
        .find((item) => item.id === settingsToggleId)?.control;
      settingsObserverFoundControl = Boolean(control);
      const exposedHandlers = Reflect.ownKeys(control ?? {})
        .map((key) => control[key])
        .filter((value) => typeof value === 'function');
      settingsObserverHandlerCount = exposedHandlers.length;
      for (const handler of exposedHandlers) handler(true);
      settingsObserverInvokedOwner = settingsToggleChecked;
      api.settings.transformItems((items, context) => {
        if (
          context.pane.id === 'codex.settings.general-settings' &&
          settingsBuiltInOverrideItemId
        ) {
          return items.map((item) =>
            item.id === settingsBuiltInOverrideItemId
              ? { ...item, origin: settingsObserverId }
              : item,
          );
        }
        return context.group.id === settingsGroupId && control
          ? [
              ...items,
              {
                id: settingsObserverReplayId,
                label: 'Foreign settings control replay',
                control,
              },
            ]
          : items;
      });
    },
  });
  if (settingsObserverInvokedOwner) {
    settingsToggleChecked = false;
    settingsItemRegistration.invalidate();
  }
  check(
    settingsObserverFoundControl &&
      settingsObserverHandlerCount === 0 &&
      !settingsObserverInvokedOwner,
    "one extension cannot obtain or invoke another extension's settings handler",
    {
      foundControl: settingsObserverFoundControl,
      exposedHandlerCount: settingsObserverHandlerCount,
      invokedOwner: settingsObserverInvokedOwner,
    },
  );

  const untouchedPersonalizationOpened = await settingsApi.open(
    'codex.settings.personalization',
  );
  await sleep(100);
  const untouchedPersonalizationRenderCount =
    globalThis.__CGPTX_HOST__._debug.settingsState()
      .contentBoundaryRenderCount;
  await sleep(250);
  const untouchedPersonalizationState =
    globalThis.__CGPTX_HOST__._debug.settingsState();
  check(
    untouchedPersonalizationOpened &&
      untouchedPersonalizationState.currentPaneId ===
        'codex.settings.personalization' &&
      untouchedPersonalizationState.contentBoundaryRenderCount ===
        untouchedPersonalizationRenderCount,
    'an untouched native settings pane settles without a render or memory loop',
    {
      before: untouchedPersonalizationRenderCount,
      after: untouchedPersonalizationState.contentBoundaryRenderCount,
      state: untouchedPersonalizationState,
    },
  );

  const appOwnerId = 'app';
  const appObserverId = 'app-owner-observer';
  const appCategoryId = `${appOwnerId}.category`;
  const appPaneId = `${appOwnerId}.pane`;
  const appGroupId = `${appOwnerId}.group`;
  const appItemId = `${appOwnerId}.item`;
  const appOwnerRegistrations = [];
  let appOwnerSettingsApi;
  let appOwnerControl;
  let appOwnerClicks = 0;
  let appObserverClicks = 0;
  globalThis.__CGPTX_HOST__.registerExtension(appOwnerId, {
    activate(api) {
      appOwnerSettingsApi = api.settings;
      appOwnerControl = api.settings.ui.button({
        label: 'Run app owner',
        onClick() {
          appOwnerClicks += 1;
        },
      });
      appOwnerRegistrations.push(
        api.settings.transformCategories((categories) => [
          ...categories,
          {
            id: appCategoryId,
            label: 'App owner category',
            panes: [{ id: appPaneId, label: 'App owner pane' }],
          },
        ]),
        api.settings.transformGroups((groups, pane) =>
          pane.id === appPaneId
            ? [
                ...groups,
                {
                  id: appGroupId,
                  title: 'App owner group',
                  items: [],
                },
              ]
            : groups,
        ),
        api.settings.transformItems((items, context) =>
          context.group.id === appGroupId
            ? [
                ...items,
                {
                  id: appItemId,
                  label: 'App owner item',
                  control: appOwnerControl,
                },
              ]
            : items,
        ),
      );
    },
  });
  globalThis.__CGPTX_HOST__.registerExtension(appObserverId, {
    activate(api) {
      const observerControl = api.settings.ui.button({
        label: 'Run observer',
        onClick() {
          appObserverClicks += 1;
        },
      });
      appOwnerRegistrations.push(
        api.settings.transformCategories((categories) =>
          categories.map((category) =>
            category.id === appCategoryId
              ? {
                  ...category,
                  label: 'Observer category',
                  panes: category.panes.map((pane) =>
                    pane.id === appPaneId
                      ? { ...pane, label: 'Observer pane' }
                      : pane,
                  ),
                }
              : category,
          ),
        ),
        api.settings.transformGroups((groups, pane) =>
          pane.id === appPaneId
            ? groups.map((group) =>
                group.id === appGroupId
                  ? { ...group, title: 'Observer group' }
                  : group,
              )
            : groups,
        ),
        api.settings.transformItems((items, context) =>
          context.group.id === appGroupId
            ? items.map((item) =>
                item.id === appItemId
                  ? {
                      ...item,
                      label: 'Observer item',
                      control: observerControl,
                    }
                  : item,
              )
            : items,
        ),
      );
    },
  });
  const appOwnerCategory = appOwnerSettingsApi
    .getCategories()
    .find((category) => category.id === appCategoryId);
  const appOwnerPane = appOwnerCategory?.panes.find(
    (pane) => pane.id === appPaneId,
  );
  const appOwnerGroup = appOwnerSettingsApi
    .getGroups(appPaneId)
    .find((group) => group.id === appGroupId);
  const appOwnerItem = appOwnerGroup?.items.find(
    (item) => item.id === appItemId,
  );
  check(
    appOwnerCategory?.label === 'App owner category' &&
      appOwnerCategory.origin === appOwnerId &&
      appOwnerPane?.label === 'App owner pane' &&
      appOwnerPane.origin === appOwnerId &&
      appOwnerGroup?.title === 'App owner group' &&
      appOwnerGroup.origin === appOwnerId &&
      appOwnerItem?.label === 'App owner item' &&
      appOwnerItem.origin === appOwnerId &&
      appOwnerItem.control === appOwnerControl,
    "an extension whose exact id is app retains ownership of its settings descriptors and control",
  );
  const appOwnerPaneOpened = await appOwnerSettingsApi.open(appPaneId, {
    itemId: appItemId,
  });
  await waitUntil(() => document.getElementById(appItemId) != null);
  const appOwnerButton = Array.from(
    document.getElementById(appItemId)?.querySelectorAll('button') ?? [],
  ).find((button) => button.textContent?.trim() === 'Run app owner');
  if (appOwnerButton) invokeNativeButton(appOwnerButton);
  const appOwnerSidebarRow = document.querySelector(
    `button[data-settings-panel-slug="${appPaneId}"]`,
  );
  if (appOwnerSidebarRow) invokeNativeButton(appOwnerSidebarRow);
  await waitUntil(() => {
    const state = globalThis.__CGPTX_HOST__._debug.settingsState();
    return (
      state.activePaneId === appPaneId &&
      state.activeCustomPaneId === appPaneId
    );
  });
  const appOwnerPaneState =
    globalThis.__CGPTX_HOST__._debug.settingsState();
  check(
    appOwnerPaneOpened &&
      Boolean(appOwnerButton) &&
      Boolean(appOwnerSidebarRow) &&
      appOwnerClicks === 1 &&
      appObserverClicks === 0 &&
      appOwnerPaneState.activePaneId === appPaneId &&
      appOwnerPaneState.activeCustomPaneId === appPaneId,
    "an extension whose exact id is app renders only its own native settings control",
    appOwnerPaneState,
  );
  for (const registration of appOwnerRegistrations.reverse()) {
    registration.dispose();
  }

  const codexOwnerId = 'codex';
  const codexCustomPaneId = 'codex.settings.custom';
  const codexCustomGroupId = 'codex.custom-group';
  const codexCustomItemId = 'codex.custom-item';
  const codexOwnerRegistrations = [];
  let codexOwnerSettingsApi;
  globalThis.__CGPTX_HOST__.registerExtension(codexOwnerId, {
    activate(api) {
      codexOwnerSettingsApi = api.settings;
      codexOwnerRegistrations.push(
        api.settings.transformCategories((categories) => [
          ...categories,
          {
            id: 'codex.category',
            label: 'Codex extension category',
            panes: [
              {
                id: codexCustomPaneId,
                label: 'Codex extension custom pane',
              },
            ],
          },
        ]),
        api.settings.transformGroups((groups, pane) =>
          pane.id === codexCustomPaneId
            ? [
                ...groups,
                {
                  id: codexCustomGroupId,
                  items: [
                    {
                      id: codexCustomItemId,
                      label: 'Codex extension custom item',
                    },
                  ],
                },
              ]
            : groups,
        ),
      );
    },
  });
  const codexCustomPaneOpened = await codexOwnerSettingsApi.open(
    codexCustomPaneId,
    { itemId: codexCustomItemId },
  );
  await waitUntil(() => document.getElementById(codexCustomItemId) != null);
  const codexCustomPaneState =
    globalThis.__CGPTX_HOST__._debug.settingsState();
  const codexCustomSidebarRow = document.querySelector(
    `button[data-settings-panel-slug="${codexCustomPaneId}"]`,
  );
  check(
    codexCustomPaneOpened &&
      codexCustomPaneState.activePaneId === codexCustomPaneId &&
      codexCustomPaneState.activeCustomPaneId === codexCustomPaneId &&
      Boolean(codexCustomSidebarRow) &&
      document.getElementById(codexCustomItemId) != null,
    'an extension-owned codex.settings pane id uses the custom native host',
    codexCustomPaneState,
  );
  for (const registration of codexOwnerRegistrations.reverse()) {
    registration.dispose();
  }

  const shortOwnerId = 'foo';
  const dottedOwnerId = 'foo.bar';
  const ownershipOverrideCategoryId = `${dottedOwnerId}.override-category`;
  const ownershipOmittedCategoryId = `${dottedOwnerId}.omitted-category`;
  const ownershipOverridePaneId = `${dottedOwnerId}.override-pane`;
  const ownershipOmittedPaneId = `${dottedOwnerId}.omitted-pane`;
  const ownershipMovedPaneId = `${dottedOwnerId}.moved-pane`;
  const dottedOwnPaneId = `${dottedOwnerId}.own-pane`;
  const ownershipOverrideGroupId = `${dottedOwnerId}.override-group`;
  const ownershipOmittedGroupId = `${dottedOwnerId}.omitted-group`;
  const dottedOwnGroupId = `${dottedOwnerId}.own-group`;
  const ownershipOverrideItemId = `${dottedOwnerId}.override-item`;
  const ownershipOmittedItemId = `${dottedOwnerId}.omitted-item`;
  const dottedOwnItemId = `${dottedOwnerId}.own-item`;
  const ownershipRegistrations = [];
  let ownershipSettingsApi;
  let capturedOverrideCategory;
  let capturedOmittedCategory;
  let capturedOverridePane;
  let capturedOmittedPane;
  let capturedMovedPane;
  let capturedOverrideGroup;
  let capturedOmittedGroup;
  let capturedOverrideItem;
  let capturedOmittedItem;
  let categoryOwnershipIdentityPreserved = false;
  let paneOwnershipIdentityPreserved = false;
  let groupOwnershipIdentityPreserved = false;
  let itemOwnershipIdentityPreserved = false;
  globalThis.__CGPTX_HOST__.registerExtension(shortOwnerId, {
    activate(api) {
      ownershipSettingsApi = api.settings;
      ownershipRegistrations.push(
        api.settings.transformCategories((categories) => [
          ...categories.map((category) =>
            category.id === 'integrations'
              ? {
                  ...category,
                  panes: [
                    ...category.panes,
                    {
                      id: ownershipOverridePaneId,
                      label: 'Short owner override pane',
                    },
                    {
                      id: ownershipOmittedPaneId,
                      label: 'Short owner omitted pane',
                    },
                  ],
                }
              : category,
          ),
          {
            id: ownershipOverrideCategoryId,
            label: 'Short owner override category',
            panes: [],
          },
          {
            id: ownershipOmittedCategoryId,
            label: 'Short owner omitted category',
            panes: [
              {
                id: ownershipMovedPaneId,
                label: 'Short owner moved pane',
              },
            ],
          },
        ]),
        api.settings.transformGroups((groups, pane) =>
          pane.id === ownershipOverridePaneId
            ? [
                ...groups,
                {
                  id: ownershipOverrideGroupId,
                  title: 'Short owner override group',
                  items: [],
                },
                {
                  id: ownershipOmittedGroupId,
                  title: 'Short owner omitted group',
                  items: [],
                },
              ]
            : groups,
        ),
        api.settings.transformItems((items, context) =>
          context.group.id === ownershipOverrideGroupId
            ? [
                ...items,
                {
                  id: ownershipOverrideItemId,
                  label: 'Short owner override item',
                },
                {
                  id: ownershipOmittedItemId,
                  label: 'Short owner omitted item',
                },
              ]
            : items,
        ),
      );
    },
  });
  globalThis.__CGPTX_HOST__.registerExtension(dottedOwnerId, {
    activate(api) {
      ownershipRegistrations.push(
        api.settings.transformCategories((categories) => {
          capturedOverrideCategory = categories.find(
            (category) => category.id === ownershipOverrideCategoryId,
          );
          capturedOmittedCategory = categories.find(
            (category) => category.id === ownershipOmittedCategoryId,
          );
          const panes = categories.flatMap((category) => category.panes);
          capturedOverridePane = panes.find(
            (pane) => pane.id === ownershipOverridePaneId,
          );
          capturedOmittedPane = panes.find(
            (pane) => pane.id === ownershipOmittedPaneId,
          );
          capturedMovedPane = panes.find(
            (pane) => pane.id === ownershipMovedPaneId,
          );
          return categories;
        }),
        api.settings.transformCategories((categories) =>
          categories.flatMap((category) =>
            category.id === ownershipOmittedCategoryId
              ? []
              : category.id === ownershipOverrideCategoryId
                ? [
                    {
                      ...category,
                      label: 'Dotted owner category override',
                    },
                  ]
                : category.id === 'integrations'
                  ? [
                      {
                        ...category,
                        panes: [
                          ...category.panes.flatMap((pane) =>
                            pane.id === ownershipOmittedPaneId
                              ? []
                              : [
                                  pane.id === ownershipOverridePaneId
                                    ? {
                                        ...pane,
                                        label: 'Dotted owner pane override',
                                      }
                                    : pane,
                                ],
                          ),
                          { id: dottedOwnPaneId, label: 'Dotted owner pane' },
                          capturedMovedPane,
                        ],
                      },
                    ]
                  : [category],
          ),
        ),
        api.settings.transformCategories((categories) => {
          categoryOwnershipIdentityPreserved =
            capturedOverrideCategory !== undefined &&
            capturedOmittedCategory !== undefined &&
            categories.find(
              (category) => category.id === ownershipOverrideCategoryId,
            ) === capturedOverrideCategory &&
            categories.find(
              (category) => category.id === ownershipOmittedCategoryId,
            ) === capturedOmittedCategory;
          const panes = categories.flatMap((category) => category.panes);
          paneOwnershipIdentityPreserved =
            capturedOverridePane !== undefined &&
            capturedOmittedPane !== undefined &&
            capturedMovedPane !== undefined &&
            panes.find((pane) => pane.id === ownershipOverridePaneId) ===
              capturedOverridePane &&
            panes.find((pane) => pane.id === ownershipOmittedPaneId) ===
              capturedOmittedPane &&
            panes.find((pane) => pane.id === ownershipMovedPaneId) ===
              capturedMovedPane;
          return categories;
        }),
        api.settings.transformGroups((groups, pane) => {
          if (pane.id === ownershipOverridePaneId) {
            capturedOverrideGroup = groups.find(
              (group) => group.id === ownershipOverrideGroupId,
            );
            capturedOmittedGroup = groups.find(
              (group) => group.id === ownershipOmittedGroupId,
            );
          }
          return groups;
        }),
        api.settings.transformGroups((groups, pane) =>
          pane.id === ownershipOverridePaneId
            ? groups.flatMap((group) =>
                group.id === ownershipOmittedGroupId
                  ? []
                  : [
                      group.id === ownershipOverrideGroupId
                        ? { ...group, title: 'Dotted owner group override' }
                        : group,
                    ],
              )
            : pane.id === dottedOwnPaneId
              ? [...groups, { id: dottedOwnGroupId, items: [] }]
              : groups,
        ),
        api.settings.transformGroups((groups, pane) => {
          if (pane.id === ownershipOverridePaneId) {
            groupOwnershipIdentityPreserved =
              capturedOverrideGroup !== undefined &&
              capturedOmittedGroup !== undefined &&
              groups.find(
                (group) => group.id === ownershipOverrideGroupId,
              ) === capturedOverrideGroup &&
              groups.find(
                (group) => group.id === ownershipOmittedGroupId,
              ) === capturedOmittedGroup;
          }
          return groups;
        }),
        api.settings.transformItems((items, context) => {
          if (context.group.id === ownershipOverrideGroupId) {
            capturedOverrideItem = items.find(
              (item) => item.id === ownershipOverrideItemId,
            );
            capturedOmittedItem = items.find(
              (item) => item.id === ownershipOmittedItemId,
            );
          }
          return items;
        }),
        api.settings.transformItems((items, context) =>
          context.group.id === ownershipOverrideGroupId
            ? items.flatMap((item) =>
                item.id === ownershipOmittedItemId
                  ? []
                  : [
                      item.id === ownershipOverrideItemId
                        ? { ...item, label: 'Dotted owner item override' }
                        : item,
                    ],
              )
            : context.group.id === dottedOwnGroupId
              ? [...items, { id: dottedOwnItemId, label: 'Dotted owner item' }]
              : items,
        ),
        api.settings.transformItems((items, context) => {
          if (context.group.id === ownershipOverrideGroupId) {
            itemOwnershipIdentityPreserved =
              capturedOverrideItem !== undefined &&
              capturedOmittedItem !== undefined &&
              items.find((item) => item.id === ownershipOverrideItemId) ===
                capturedOverrideItem &&
              items.find((item) => item.id === ownershipOmittedItemId) ===
                capturedOmittedItem;
          }
          return items;
        }),
      );
    },
  });
  const ownershipCategories = ownershipSettingsApi.getCategories();
  const ownershipOverrideCategory = ownershipCategories.find(
    (category) => category.id === ownershipOverrideCategoryId,
  );
  const ownershipOmittedCategory = ownershipCategories.find(
    (category) => category.id === ownershipOmittedCategoryId,
  );
  check(
    categoryOwnershipIdentityPreserved &&
      ownershipOverrideCategory?.label === 'Short owner override category' &&
      ownershipOverrideCategory.origin === shortOwnerId &&
      ownershipOmittedCategory?.label === 'Short owner omitted category' &&
      ownershipOmittedCategory.origin === shortOwnerId &&
      ownershipCategories.indexOf(ownershipOverrideCategory) + 1 ===
        ownershipCategories.indexOf(ownershipOmittedCategory),
    'dotted extension ids cannot override or omit foreign settings categories',
  );
  const ownershipPanes = ownershipCategories.flatMap(
    (category) => category.panes,
  );
  const ownershipOverridePane = ownershipPanes.find(
    (pane) => pane.id === ownershipOverridePaneId,
  );
  const ownershipOmittedPane = ownershipPanes.find(
    (pane) => pane.id === ownershipOmittedPaneId,
  );
  const ownershipMovedPanes = ownershipPanes.filter(
    (pane) => pane.id === ownershipMovedPaneId,
  );
  const ownershipMovedPaneParent = ownershipCategories.find((category) =>
    category.panes.some((pane) => pane.id === ownershipMovedPaneId),
  );
  check(
    paneOwnershipIdentityPreserved &&
      ownershipOverridePane?.label === 'Short owner override pane' &&
      ownershipOverridePane.origin === shortOwnerId &&
      ownershipOmittedPane?.label === 'Short owner omitted pane' &&
      ownershipOmittedPane.origin === shortOwnerId &&
      ownershipPanes.indexOf(ownershipOverridePane) + 1 ===
        ownershipPanes.indexOf(ownershipOmittedPane) &&
      ownershipMovedPanes.length === 1 &&
      ownershipMovedPanes[0] === capturedMovedPane &&
      ownershipMovedPaneParent?.id === ownershipOmittedCategoryId,
    'dotted extension ids cannot override, omit, or move foreign settings panes',
  );
  const ownershipGroups = ownershipSettingsApi.getGroups(
    ownershipOverridePaneId,
  );
  const ownershipOverrideGroup = ownershipGroups.find(
    (group) => group.id === ownershipOverrideGroupId,
  );
  const ownershipOmittedGroup = ownershipGroups.find(
    (group) => group.id === ownershipOmittedGroupId,
  );
  check(
    groupOwnershipIdentityPreserved &&
      ownershipOverrideGroup?.title === 'Short owner override group' &&
      ownershipOverrideGroup.origin === shortOwnerId &&
      ownershipOmittedGroup?.title === 'Short owner omitted group' &&
      ownershipOmittedGroup.origin === shortOwnerId &&
      ownershipGroups.indexOf(ownershipOverrideGroup) + 1 ===
        ownershipGroups.indexOf(ownershipOmittedGroup),
    'dotted extension ids cannot override or omit foreign settings groups',
  );
  const ownershipItems = ownershipOverrideGroup?.items ?? [];
  const ownershipOverrideItem = ownershipItems.find(
    (item) => item.id === ownershipOverrideItemId,
  );
  const ownershipOmittedItem = ownershipItems.find(
    (item) => item.id === ownershipOmittedItemId,
  );
  check(
    itemOwnershipIdentityPreserved &&
      ownershipOverrideItem?.label === 'Short owner override item' &&
      ownershipOverrideItem.origin === shortOwnerId &&
      ownershipOmittedItem?.label === 'Short owner omitted item' &&
      ownershipOmittedItem.origin === shortOwnerId &&
      ownershipItems.indexOf(ownershipOverrideItem) + 1 ===
        ownershipItems.indexOf(ownershipOmittedItem),
    'dotted extension ids cannot override or omit foreign settings items',
  );
  const dottedOwnPane = ownershipPanes.find(
    (pane) => pane.id === dottedOwnPaneId,
  );
  const dottedOwnGroup = ownershipSettingsApi
    .getGroups(dottedOwnPaneId)
    .find((group) => group.id === dottedOwnGroupId);
  check(
    dottedOwnPane?.origin === dottedOwnerId &&
      dottedOwnGroup?.origin === dottedOwnerId &&
      dottedOwnGroup.items.find((item) => item.id === dottedOwnItemId)
        ?.origin === dottedOwnerId,
    'both prefix-overlapping extensions retain distinct owned contributions',
  );
  for (const registration of ownershipRegistrations) registration.dispose();

  const snapshotFirstGroupId = `${settingsFixtureId}.snapshot-first`;
  const snapshotRemovedGroupId = `${settingsFixtureId}.snapshot-removed`;
  const snapshotLastGroupId = `${settingsFixtureId}.snapshot-last`;
  const snapshotPaneOpened = await settingsApi.open(settingsSnapshotPaneId);
  const initialSnapshotCommitCount =
    globalThis.__CGPTX_HOST__._debug.settingsSnapshotCommitCount();
  const initialSettingsGroupSnapshot =
    globalThis.__CGPTX_HOST__._debug.replaceSettingsGroupSnapshot(
      settingsSnapshotPaneId,
      [snapshotFirstGroupId, snapshotRemovedGroupId, snapshotLastGroupId],
    );
  await waitUntil(
    () =>
      globalThis.__CGPTX_HOST__._debug.settingsSnapshotCommitCount() >
        initialSnapshotCommitCount &&
      document.getElementById(`${snapshotRemovedGroupId}.item`) != null &&
      document.getElementById(`${snapshotLastGroupId}.item`) != null,
  );
  const replacementSnapshotCommitCount =
    globalThis.__CGPTX_HOST__._debug.settingsSnapshotCommitCount();
  const replacementSettingsGroupSnapshot =
    globalThis.__CGPTX_HOST__._debug.replaceSettingsGroupSnapshot(
      settingsSnapshotPaneId,
      [snapshotLastGroupId, snapshotFirstGroupId],
    );
  await waitUntil(
    () =>
      globalThis.__CGPTX_HOST__._debug.settingsSnapshotCommitCount() >
        replacementSnapshotCommitCount &&
      document.getElementById(`${snapshotRemovedGroupId}.item`) == null &&
      document.getElementById(`${snapshotFirstGroupId}.item`) != null,
  );
  const snapshotLastItem = document.getElementById(
    `${snapshotLastGroupId}.item`,
  );
  const snapshotFirstItem = document.getElementById(
    `${snapshotFirstGroupId}.item`,
  );
  const effectiveSnapshotGroupIds = settingsApi
    .getGroups(settingsSnapshotPaneId)
    .map((group) => group.id);
  check(
    snapshotPaneOpened &&
      initialSettingsGroupSnapshot.join(',') ===
        [
          snapshotFirstGroupId,
          snapshotRemovedGroupId,
          snapshotLastGroupId,
        ].join(',') &&
      replacementSettingsGroupSnapshot.join(',') ===
        [snapshotLastGroupId, snapshotFirstGroupId].join(',') &&
      effectiveSnapshotGroupIds.join(',') ===
        [snapshotLastGroupId, snapshotFirstGroupId].join(',') &&
      snapshotLastItem != null &&
      snapshotFirstItem != null &&
      Boolean(
        snapshotLastItem.compareDocumentPosition(snapshotFirstItem) &
          Node.DOCUMENT_POSITION_FOLLOWING,
      ),
    'the settings page boundary commits a full snapshot and updates model and DOM order',
  );

  const customPaneOpened = await settingsApi.open(settingsPaneId, {
    itemId: settingsToggleId,
  });
  await waitUntil(() => document.getElementById(settingsToggleId) != null);
  const settingsToggleRow = document.getElementById(settingsToggleId);
  const settingsToggle = settingsToggleRow?.querySelector('[role="switch"]');
  const settingsAlignedToggle = document
    .getElementById(settingsAlignedToggleId)
    ?.querySelector('[role="switch"]');
  const settingsSelect = document
    .getElementById(settingsSelectId)
    ?.querySelector('button');
  const settingsButton = Array.from(
    document.getElementById(settingsButtonId)?.querySelectorAll('button') ?? [],
  ).find((button) => button.textContent?.trim() === 'Run fixture');
  const settingsTextField = document
    .getElementById(settingsTextFieldId)
    ?.querySelector('input');
  const settingsInlineRow = document.getElementById(settingsInlineId);
  const settingsInlineControls = settingsInlineRow?.querySelector(
    '[data-cgptx-settings-inline="true"]',
  );
  const settingsInlineTextField = settingsInlineControls?.querySelector('input');
  const settingsInlineButton = Array.from(
    settingsInlineControls?.querySelectorAll('button') ?? [],
  ).find((button) => button.textContent?.trim() === 'Reset fixture');
  const settingsDisclosure = settingsToggleRow?.querySelector(
    '[data-cgptx-settings-disclosure="true"]',
  );
  const settingsDisclosurePlaceholder = document
    .getElementById(settingsAlignedToggleId)
    ?.querySelector('[data-cgptx-settings-disclosure-placeholder="true"]');
  const settingsDestinationLabel = settingsToggleRow?.querySelector(
    '[data-cgptx-settings-destination-text="label"]',
  );
  const settingsDestinationDescription = settingsToggleRow?.querySelector(
    '[data-cgptx-settings-destination-text="description"]',
  );
  const settingsObserverReplay = document
    .getElementById(settingsObserverReplayId)
    ?.querySelector('[role="switch"]');
  check(
    customPaneOpened &&
      document.getElementById(settingsToggleId) != null &&
      settingsApi
        .getGroups(settingsPaneId)
        .flatMap((group) => group.items)
        .filter((item) => item.id === settingsToggleId).length === 1 &&
      Array.from(document.querySelectorAll('[id]')).filter(
        (element) => element.id === settingsToggleId,
      ).length === 1 &&
      document.body.textContent?.includes('Settings UI Fixture'),
    'custom settings pane uses the native host page and item deep link',
  );
  check(
    settingsToggle?.getAttribute('aria-checked') === 'false' &&
      settingsAlignedToggle?.getAttribute('aria-checked') === 'false' &&
      Boolean(settingsSelect) &&
      Boolean(settingsButton) &&
      settingsTextField?.value === 'Initial value' &&
      settingsTextField.placeholder === 'Type a fixture value' &&
      settingsInlineTextField?.value === 'Initial value' &&
      Boolean(settingsInlineButton) &&
      settingsInlineTextField
        ?.closest('span')
        ?.nextElementSibling?.contains(settingsInlineButton) === true,
    'custom settings rows render native controls and preserve inline control order',
  );
  check(
    Boolean(settingsDisclosure) &&
      Boolean(settingsDisclosurePlaceholder) &&
      settingsDestinationLabel?.className.includes('cursor-interaction') &&
      settingsDestinationDescription?.className.includes('cursor-interaction') &&
      settingsDisclosurePlaceholder?.tagName === 'BUTTON' &&
      settingsDisclosurePlaceholder.querySelector('svg') !== null &&
      getComputedStyle(settingsDisclosurePlaceholder).opacity === '0' &&
      Math.abs(
        (settingsDisclosure?.getBoundingClientRect().width ?? 0) -
          (settingsDisclosurePlaceholder?.getBoundingClientRect().width ?? 1),
      ) < 1 &&
      Math.abs(
        (settingsToggle?.getBoundingClientRect().x ?? 0) -
          (settingsAlignedToggle?.getBoundingClientRect().x ?? 1),
      ) < 1,
    'an invisible native disclosure reserves exact sibling width and aligns controls',
  );
  check(
    document.getElementById(settingsObserverReplayId) != null &&
      !settingsObserverReplay &&
      !settingsToggleChecked,
    "one extension cannot replay another extension's opaque settings control",
  );
  activateButton(settingsToggle);
  await waitUntil(
    () => settingsToggleRow?.querySelector('[role="switch"]')?.getAttribute('aria-checked') === 'true',
  );
  activateButton(settingsSelect);
  let settingsSelectMenu;
  await waitUntil(() => {
    settingsSelectMenu = Array.from(
      document.querySelectorAll('[role="menu"]'),
    ).find((menu) =>
      menuRows(menu).some(
        (row) => threadRowLabel(row) === 'Default/None',
      ),
    );
    return Boolean(settingsSelectMenu);
  });
  const emptyValueOption = menuRows(settingsSelectMenu).find(
    (row) => threadRowLabel(row) === 'Default/None',
  );
  activateButton(emptyValueOption);
  await waitUntil(
    () =>
      settingsSelectedValue === '' &&
      document
        .getElementById(settingsSelectId)
        ?.querySelector('button')
        ?.textContent?.trim() === 'Default/None',
  );
  invokeNativeButton(settingsButton);
  const textValueSetter = Object.getOwnPropertyDescriptor(
    HTMLInputElement.prototype,
    'value',
  )?.set;
  textValueSetter.call(settingsTextField, 'Updated value');
  settingsTextField.dispatchEvent(new InputEvent('input', { bubbles: true }));
  await waitUntil(() => settingsTextValue === 'Updated value');
  check(
    settingsToggleChecked &&
      settingsSelectedValue === '' &&
      emptyValueOption != null &&
      settingsButtonClicks === 1 &&
      document
        .getElementById(settingsTextFieldId)
        ?.querySelector('input')?.value === 'Updated value',
    'native settings controls accept input values, call handlers, and invalidate state',
  );
  invokeNativeButton(settingsInlineButton);
  await waitUntil(
    () =>
      document
        .getElementById(settingsInlineId)
        ?.querySelector('input')?.value === 'Reset value',
  );
  check(
    settingsTextValue === 'Reset value',
    'a native control inside an inline group calls its owner handler',
  );

  settingsDestinationLabel.dispatchEvent(
    new MouseEvent('click', { bubbles: true }),
  );
  await waitUntil(
    () => document.getElementById(settingsSecondItemId) != null,
  );
  check(
    document.getElementById(settingsSecondItemId)?.textContent?.includes(
      'Second custom pane item',
    ) === true,
    'settings title text uses the app cursor preference and opens its destination',
  );

  const secondCustomPaneOpened = await settingsApi.open(settingsSecondPaneId, {
    itemId: settingsSecondItemId,
  });
  const firstCustomSidebarRow = document.querySelector(
    `button[data-settings-panel-slug="${settingsPaneId}"]`,
  );
  const secondCustomSidebarRow = document.querySelector(
    `button[data-settings-panel-slug="${settingsSecondPaneId}"]`,
  );
  const extensionsSidebarRow = document.querySelector(
    'button[data-settings-panel-slug="extensions.installed"]',
  );
  const extensionSettingsBreadcrumb = document.querySelector(
    'nav[aria-label="Breadcrumb"]',
  );
  check(
    secondCustomPaneOpened &&
      document.getElementById(settingsSecondItemId)?.textContent?.includes(
        'Second custom pane item',
      ) &&
      secondCustomSidebarRow === null &&
      extensionsSidebarRow?.getAttribute('aria-current') === 'page' &&
      extensionSettingsBreadcrumb?.textContent?.includes('Extensions') &&
      extensionSettingsBreadcrumb?.textContent?.includes(
        'Second Settings UI Fixture',
      ) &&
      firstCustomSidebarRow?.getAttribute('aria-current') !== 'page',
    'an extension settings deep link hides its sidebar row, selects Extensions, and shows the native breadcrumb',
  );
  const extensionSettingsBackButton = Array.from(
    extensionSettingsBreadcrumb?.querySelectorAll('button') ?? [],
  ).find((button) => button.textContent?.includes('Extensions'));
  extensionSettingsBackButton?.click();
  await waitUntil(
    () =>
      extensionsSidebarRow?.getAttribute('aria-current') === 'page' &&
      document.body.textContent?.includes(
        'Shows installed extensions and controls whether they load at ChatGPT startup.',
      ),
  );
  check(
    Boolean(extensionSettingsBackButton),
    'the native extension settings breadcrumb returns to Extensions',
  );
  const sharedPaneScrolls = [];
  const sharedPaneScrollIntoView = Element.prototype.scrollIntoView;
  let staleFirstPaneTarget;
  let firstSharedPaneOpened = false;
  let secondSharedPaneOpened = false;
  Element.prototype.scrollIntoView = function scrollSharedPaneItemIntoView(
    options,
  ) {
    if (this.id === settingsToggleId && options?.block === 'center') {
      sharedPaneScrolls.push({
        paneId:
          globalThis.__CGPTX_HOST__._debug.settingsState().currentPaneId,
        text: this.textContent?.trim(),
      });
    }
    return sharedPaneScrollIntoView?.call(this, options);
  };
  try {
    firstSharedPaneOpened = await settingsApi.open(settingsPaneId, {
      itemId: settingsToggleId,
    });
    const firstPaneTarget = document.getElementById(settingsToggleId);
    staleFirstPaneTarget = firstPaneTarget?.cloneNode(true);
    if (staleFirstPaneTarget) {
      staleFirstPaneTarget.hidden = true;
      document.body.prepend(staleFirstPaneTarget);
    }
    secondSharedPaneOpened = await settingsApi.open(settingsSecondPaneId, {
      itemId: settingsToggleId,
    });
  } finally {
    staleFirstPaneTarget?.remove();
    Element.prototype.scrollIntoView = sharedPaneScrollIntoView;
  }
  const firstSharedPaneScroll = sharedPaneScrolls.at(-2);
  const secondSharedPaneScroll = sharedPaneScrolls.at(-1);
  check(
    Boolean(staleFirstPaneTarget) &&
      firstSharedPaneOpened &&
      secondSharedPaneOpened &&
      settingsApi
        .getGroups(settingsPaneId)
        .some((group) =>
          group.items.some((item) => item.id === settingsToggleId),
        ) &&
      settingsApi
        .getGroups(settingsSecondPaneId)
        .some((group) =>
          group.items.some((item) => item.id === settingsToggleId),
        ) &&
      firstSharedPaneScroll?.paneId === settingsPaneId &&
      firstSharedPaneScroll.text?.includes('Settings fixture toggle') &&
      secondSharedPaneScroll?.paneId === settingsSecondPaneId &&
      secondSharedPaneScroll.text?.includes('Second custom pane shared item'),
    'item deep links scope a shared item id to the requested settings pane',
    { scrolls: sharedPaneScrolls },
  );
  const appearanceOpenedFromCustom = await settingsApi.open(
    'codex.settings.appearance',
    { itemId: settingsAppearanceItemId },
  );
  await waitUntil(() => document.body.textContent?.includes('Light theme'));
  const appearanceSidebarRow = document.querySelector(
    'button[data-settings-panel-slug="appearance"]',
  );
  check(
    appearanceOpenedFromCustom &&
      document.getElementById(settingsAppearanceItemId) != null &&
      settingsApi
        .getGroups('codex.settings.appearance')
        .some((group) => group.origin === 'app') &&
      appearanceSidebarRow?.getAttribute('aria-current') === 'page' &&
      secondCustomSidebarRow?.getAttribute('aria-current') !== 'page',
    'the native Appearance pane restores groups and sidebar selection after a custom pane',
  );
  const appearanceGroupsBeforeRecapture = settingsApi.getGroups(
    'codex.settings.appearance',
  );
  const removableAppearanceGroup = appearanceGroupsBeforeRecapture.find(
    (group) =>
      group.origin === 'app' &&
      typeof (group.id ?? group.title) === 'string',
  );
  const removableAppearanceGroupId =
    removableAppearanceGroup?.id ?? removableAppearanceGroup?.title;
  const replacementAppearanceGroupId =
    `${settingsFixtureId}.updated-native-group`;
  const appearanceGroupKeysBeforeRecapture = appearanceGroupsBeforeRecapture.map(
    (group, index) => group.id ?? group.title ?? String(index),
  );
  const survivingAppearanceItemIds = appearanceGroupsBeforeRecapture
    .filter((group) => group !== removableAppearanceGroup)
    .flatMap((group) => group.items)
    .map((item) => item.id)
    .filter((id) => typeof id === 'string' && document.getElementById(id));
  const removedAppearanceItemIds = (removableAppearanceGroup?.items ?? [])
    .map((item) => item.id)
    .filter((id) => typeof id === 'string');
  const appearanceRenderCountBeforeRecapture =
    globalThis.__CGPTX_HOST__._debug.settingsPaneRenderCount(
      'codex.settings.appearance',
    );
  const appearanceCaptureUpdated =
    globalThis.__CGPTX_HOST__._debug.updateSettingsGroupCapture(
      'codex.settings.appearance',
      removableAppearanceGroupId,
      replacementAppearanceGroupId,
    );
  await waitUntil(
    () =>
      globalThis.__CGPTX_HOST__._debug.settingsPaneRenderCount(
        'codex.settings.appearance',
      ) > appearanceRenderCountBeforeRecapture &&
      document.getElementById(`${replacementAppearanceGroupId}.item`) != null &&
      survivingAppearanceItemIds.every(
        (id) => document.querySelectorAll(`#${CSS.escape(id)}`).length === 1,
      ),
  );
  const appearanceGroupKeysAfterRecapture = settingsApi
    .getGroups('codex.settings.appearance')
    .map((group, index) => group.id ?? group.title ?? String(index));
  const expectedAppearanceGroupKeys = appearanceGroupKeysBeforeRecapture.map(
    (key) =>
      key === removableAppearanceGroupId ? replacementAppearanceGroupId : key,
  );
  check(
    appearanceGroupsBeforeRecapture.length > 1 &&
      appearanceCaptureUpdated &&
      appearanceGroupKeysAfterRecapture.join(',') ===
        expectedAppearanceGroupKeys.join(',') &&
      survivingAppearanceItemIds.length > 0 &&
      survivingAppearanceItemIds.every(
        (id) => document.querySelectorAll(`#${CSS.escape(id)}`).length === 1,
      ) &&
      removedAppearanceItemIds.every(
        (id) => document.getElementById(id) === null,
      ) &&
      document.getElementById(`${replacementAppearanceGroupId}.item`) != null,
    'updating one capture causes a full page recapture that preserves sibling order and DOM uniqueness',
    {
      removed: removableAppearanceGroupId,
      before: appearanceGroupKeysBeforeRecapture,
      after: appearanceGroupKeysAfterRecapture,
    },
  );
  invokeNativeButton(appearanceSidebarRow);
  await sleep(100);
  const repeatedAppearanceState =
    globalThis.__CGPTX_HOST__._debug.settingsState();
  check(
    repeatedAppearanceState.activePaneId === 'codex.settings.appearance' &&
      repeatedAppearanceState.activeCustomPaneId === null &&
      repeatedAppearanceState.pendingNativePaneId === null &&
      appearanceSidebarRow?.getAttribute('aria-current') === 'page',
    'clicking the active native settings row does not leave a pending navigation',
    repeatedAppearanceState,
  );

  const staleTargetPaneId = 'codex.settings.general-settings';
  const loadingTargetCommitEligible =
    globalThis.__CGPTX_HOST__._debug.settingsPageCommitIsEligible(
      staleTargetPaneId,
      {
        loading: true,
      },
    );
  const realTargetCommitEligible =
    globalThis.__CGPTX_HOST__._debug.settingsPageCommitIsEligible(
      staleTargetPaneId,
    );
  check(
    !loadingTargetCommitEligible && realTargetCommitEligible,
    'the exact native loading fallback cannot confirm a matching pane',
  );
  const staleTargetRenderCount =
    globalThis.__CGPTX_HOST__._debug.settingsPaneRenderCount(
      staleTargetPaneId,
    );
  const staleSnapshotCommitCount =
    globalThis.__CGPTX_HOST__._debug.settingsSnapshotCommitCount();
  const navigationHeld =
    globalThis.__CGPTX_HOST__._debug.holdNextSettingsNavigation();
  const heldTargetOpen = settingsApi.open(staleTargetPaneId, {
    itemId: settingsBuiltInItemId,
  });
  await waitUntil(() => {
    const state = globalThis.__CGPTX_HOST__._debug.settingsState();
    return (
      state.activePaneId === staleTargetPaneId &&
      state.pendingNativePaneId === staleTargetPaneId &&
      state.confirmedNativePaneId === 'codex.settings.appearance'
    );
  });
  const targetRowConfirmed =
    globalThis.__CGPTX_HOST__._debug.confirmNativeSettingsPane(
      staleTargetPaneId,
    );
  globalThis.__CGPTX_HOST__._debug.replaceSettingsGroupSnapshot(
    'codex.settings.appearance',
    [`${settingsFixtureId}.stale-appearance-group`],
  );
  await waitUntil(
    () =>
      globalThis.__CGPTX_HOST__._debug.settingsSnapshotCommitCount() >
      staleSnapshotCommitCount,
  );
  const staleCommitState =
    globalThis.__CGPTX_HOST__._debug.settingsState();
  const staleCommitKeptPending =
    staleCommitState.pendingNativePaneId === staleTargetPaneId &&
    staleCommitState.confirmedNativePaneId === staleTargetPaneId &&
    globalThis.__CGPTX_HOST__._debug.settingsPaneRenderCount(
      staleTargetPaneId,
    ) === staleTargetRenderCount;
  const targetConfirmationReset =
    globalThis.__CGPTX_HOST__._debug.confirmNativeSettingsPane(
      'codex.settings.appearance',
    );
  const heldNavigationReleased =
    globalThis.__CGPTX_HOST__._debug.releaseSettingsNavigation();
  const heldTargetOpened = await heldTargetOpen;
  check(
    navigationHeld &&
      targetRowConfirmed &&
      staleCommitKeptPending &&
      targetConfirmationReset &&
      heldNavigationReleased &&
      heldTargetOpened,
    'an old page commit cannot confirm a target after its native row becomes active',
    staleCommitState,
  );

  const resolvedEmptyOrNonstandardPane = settingsApi
    .getCategories()
    .flatMap((category) => category.panes)
    .filter((pane) => pane.origin === 'app' && pane.disabled !== true)
    .find((pane) => pane.id === 'codex.settings.profile');
  let profileItemScrolled = false;
  const profileScrollIntoView = Element.prototype.scrollIntoView;
  Element.prototype.scrollIntoView = function scrollProfileItemIntoView(
    options,
  ) {
    if (this.id === settingsProfileItemId && options?.block === 'center') {
      profileItemScrolled = true;
    }
    return profileScrollIntoView?.call(this, options);
  };
  let resolvedEmptyOrNonstandardPaneOpened = false;
  try {
    if (resolvedEmptyOrNonstandardPane) {
      resolvedEmptyOrNonstandardPaneOpened = await settingsApi.open(
        resolvedEmptyOrNonstandardPane.id,
        { itemId: settingsProfileItemId },
      );
    }
  } finally {
    Element.prototype.scrollIntoView = profileScrollIntoView;
  }
  const resolvedEmptyOrNonstandardState =
    globalThis.__CGPTX_HOST__._debug.settingsState();
  const profileGroups = settingsApi.getGroups('codex.settings.profile');
  check(
    Boolean(resolvedEmptyOrNonstandardPane) &&
      resolvedEmptyOrNonstandardPaneOpened &&
      profileItemScrolled &&
      profileGroups.some(
        (group) =>
          group.id === settingsProfileGroupId &&
          group.items.some((item) => item.id === settingsProfileItemId),
      ) &&
      document.querySelectorAll(`#${CSS.escape(settingsProfileItemId)}`)
        .length === 1 &&
      resolvedEmptyOrNonstandardState.activePaneId ===
        resolvedEmptyOrNonstandardPane.id &&
      resolvedEmptyOrNonstandardState.pendingNativePaneId === null,
    'the titleless Profile page renders and scrolls one extension row without a native group anchor',
    {
      paneId: resolvedEmptyOrNonstandardPane?.id,
      scrolled: profileItemScrolled,
      state: resolvedEmptyOrNonstandardState,
    },
  );

  const unvisitedNativePanes = settingsApi
    .getCategories()
    .flatMap((category) => category.panes)
    .filter(
      (pane) =>
        pane.origin === 'app' &&
        pane.disabled !== true &&
        pane.id !== 'codex.settings.general-settings' &&
        pane.id !== 'codex.settings.appearance' &&
        pane.id !== resolvedEmptyOrNonstandardPane?.id &&
        settingsApi.getGroups(pane.id).length === 0,
    );
  const unvisitedNativePane =
    unvisitedNativePanes.find(
      (pane) => pane.id === 'codex.settings.notifications',
    ) ?? unvisitedNativePanes[0];
  const unvisitedGroupId = `${settingsFixtureId}.unvisited-group`;
  const unvisitedItemId = `${settingsFixtureId}.unvisited-item`;
  const unvisitedRegistration = settingsApi.transformGroups((groups, pane) =>
    pane.id === unvisitedNativePane?.id && groups.length > 0
      ? [
          ...groups,
          {
            id: unvisitedGroupId,
            title: 'Unvisited pane fixture',
            items: [
              {
                id: unvisitedItemId,
                label: 'Unvisited pane item',
              },
            ],
          },
        ]
      : groups,
  );
  let unvisitedItemScrolled = false;
  const nativeScrollIntoView = Element.prototype.scrollIntoView;
  Element.prototype.scrollIntoView = function scrollIntoView(options) {
    if (this.id === unvisitedItemId && options?.block === 'center') {
      unvisitedItemScrolled = true;
    }
    return nativeScrollIntoView?.call(this, options);
  };
  let unvisitedPaneOpened = false;
  try {
    if (unvisitedNativePane) {
      unvisitedPaneOpened = await settingsApi.open(unvisitedNativePane.id, {
        itemId: unvisitedItemId,
      });
    }
  } finally {
    Element.prototype.scrollIntoView = nativeScrollIntoView;
  }
  check(
    Boolean(unvisitedNativePane) &&
      unvisitedPaneOpened &&
      unvisitedItemScrolled &&
      document.getElementById(unvisitedItemId)?.textContent?.includes(
        'Unvisited pane item',
      ),
    'a deep link waits for a previously unvisited native pane and scrolls its extension row',
    {
      paneId: unvisitedNativePane?.id,
      opened: unvisitedPaneOpened,
      scrolled: unvisitedItemScrolled,
    },
  );
  unvisitedRegistration.dispose();

  const builtInPaneOpened = await settingsApi.open(
    'codex.settings.general-settings',
    { itemId: settingsBuiltInItemId },
  );
  await waitUntil(() => document.getElementById(settingsBuiltInItemId) != null);
  check(
    builtInPaneOpened &&
      document.getElementById(settingsBuiltInItemId)?.textContent?.includes(
        'Built-in pane item',
      ),
    'an extension row renders inside the stable General settings pane',
  );
  const builtInSettingsGroups = settingsApi.getGroups(
    'codex.settings.general-settings',
  );
  const builtInSettingsItems = builtInSettingsGroups.flatMap(
    (group) => group.items,
  );
  const settingsBuiltInOverrideItem = builtInSettingsItems.find(
    (item) => item.id === settingsBuiltInOverrideItemId,
  );
  const settingsBuiltInOverrideButton = Array.from(
    document
      .getElementById(settingsBuiltInOverrideItemId)
      ?.querySelectorAll('button') ?? [],
  ).find((button) => button.textContent?.trim() === 'Run built-in override');
  if (settingsBuiltInOverrideButton) {
    activateButton(settingsBuiltInOverrideButton);
    await waitUntil(() => settingsBuiltInOverrideClicks === 1);
  }
  check(
    settingsBuiltInOverrideItem?.origin === 'app' &&
      Boolean(settingsBuiltInOverrideButton) &&
      settingsBuiltInOverrideClicks === 1,
    'a transformed built-in settings row renders the assigning extension control after foreign pass-through',
    {
      itemId: settingsBuiltInOverrideItemId,
      origin: settingsBuiltInOverrideItem?.origin,
      clicks: settingsBuiltInOverrideClicks,
    },
  );
  const builtInSettingsControl = builtInSettingsItems
    .find(
      (item) => item.origin === 'app' && item.control?.kind === 'native',
    )?.control;
  const builtInControlDetails = Reflect.ownKeys(builtInSettingsControl ?? {})
    .filter((key) => key !== 'kind');
  check(
    builtInSettingsControl?.kind === 'native' &&
      builtInControlDetails.length === 0,
    "built-in settings controls do not expose React elements or callbacks",
    { exposedKeys: builtInControlDetails.map(String) },
  );
  const exposesPrivateSettingsValue = (value, seen = new Set()) => {
    if (typeof value === 'function') return true;
    if (value == null || typeof value !== 'object') return false;
    if (typeof value.$$typeof === 'symbol') return true;
    if (seen.has(value)) return false;
    seen.add(value);
    return Reflect.ownKeys(value).some((key) =>
      exposesPrivateSettingsValue(value[key], seen),
    );
  };
  const nativeSettingsTextShape = (item) => {
    const row = document.getElementById(item.id);
    const fiberKey = row
      ? Object.keys(row).find((key) => key.startsWith('__reactFiber$'))
      : undefined;
    let fiber = fiberKey ? row[fiberKey] : null;
    for (let hops = 0; fiber && hops < 40; hops += 1) {
      const props = fiber.memoizedProps;
      if (
        props?.['data-settings-target-id'] === item.id &&
        Object.hasOwn(props, 'label')
      ) {
        return {
          labelIsElement: typeof props.label?.$$typeof === 'symbol',
          descriptionIsElement:
            typeof props.description?.$$typeof === 'symbol',
          controlIsRendered: props.control !== undefined,
        };
      }
      fiber = fiber.return;
    }
    return null;
  };
  const semanticNativeSettingsItems = builtInSettingsItems.filter(
    (item) =>
      item.origin === 'app' &&
      typeof item.id === 'string' &&
      document.getElementById(item.id),
  );
  const nativeSettingsTextShapes = semanticNativeSettingsItems.map(
    nativeSettingsTextShape,
  );
  const renderedNativeControl = semanticNativeSettingsItems.some(
    (item, index) =>
      item.control?.kind === 'native' &&
      nativeSettingsTextShapes[index]?.controlIsRendered,
  );
  check(
    semanticNativeSettingsItems.length > 0 &&
      nativeSettingsTextShapes.every((shape) => shape?.labelIsElement) &&
      renderedNativeControl,
    'unchanged native settings rows retain localized React content and controls',
    { shapes: nativeSettingsTextShapes },
  );
  check(
    !exposesPrivateSettingsValue(builtInSettingsGroups),
    'the public settings model excludes React elements and callbacks',
  );

  const nativeCollisionGroup = builtInSettingsGroups.find((group) =>
    typeof group.id === 'string' &&
    group.items.includes(settingsBuiltInOverrideItem),
  );
  const nativeCollisionItem = nativeCollisionGroup?.items.find(
    (item) => item === settingsBuiltInOverrideItem,
  );
  const nativeCollisionNamespaceEnd =
    nativeCollisionItem?.id?.lastIndexOf('.');
  const nativeCollisionOwnerId =
    typeof nativeCollisionNamespaceEnd === 'number' &&
    nativeCollisionNamespaceEnd > 0
      ? nativeCollisionItem.id.slice(0, nativeCollisionNamespaceEnd)
      : undefined;
  const nativeCollisionGroupId = `${nativeCollisionOwnerId}.native-id-collision-group`;
  const nativeCollisionLabel = 'Extension row with native item ID';
  let nativeCollisionRegistration;
  if (
    nativeCollisionItem &&
    typeof nativeCollisionItem.id === 'string' &&
    typeof nativeCollisionGroup?.id === 'string' &&
    nativeCollisionOwnerId
  ) {
    globalThis.__CGPTX_HOST__.registerExtension(nativeCollisionOwnerId, {
      activate(api) {
        nativeCollisionRegistration = api.settings.transformGroups(
          (groups, pane) =>
            pane.id === 'codex.settings.general-settings'
              ? [
                  {
                    id: nativeCollisionGroupId,
                    title: 'Native item ID collision',
                    items: [
                      {
                        id: nativeCollisionItem.id,
                        label: nativeCollisionLabel,
                      },
                    ],
                  },
                  ...groups,
                ]
              : groups,
        );
      },
    });
  }
  const nativeCollisionOpened = nativeCollisionRegistration
    ? await settingsApi.open('codex.settings.general-settings', {
        itemId: nativeCollisionItem.id,
      })
    : false;
  if (nativeCollisionRegistration) {
    await waitUntil(
      () =>
        document
          .getElementById(nativeCollisionItem.id)
          ?.textContent?.includes(nativeCollisionLabel) === true &&
        document.querySelectorAll(
          `#${CSS.escape(nativeCollisionItem.id)}`,
        ).length === 1 &&
        settingsApi
          .getGroups('codex.settings.general-settings')
          .some(
            (group) =>
              group.id === nativeCollisionGroup?.id &&
              group.items.some(
                (item) =>
                  item.id === undefined &&
                  item.origin === 'app' &&
                  item.label === nativeCollisionItem.label,
              ),
          ),
    );
  }
  const nativeCollisionGroups = settingsApi.getGroups(
    'codex.settings.general-settings',
  );
  const nativeCollisionIds = nativeCollisionGroups
    .flatMap((group) => group.items)
    .filter((item) => item.id === nativeCollisionItem?.id);
  const anonymizedNativeCollisionGroup = nativeCollisionGroups.find(
    (group) => group.id === nativeCollisionGroup?.id,
  );
  const anonymizedNativeCollisionItem =
    anonymizedNativeCollisionGroup?.items.find(
      (item) =>
        item.id === undefined &&
        item.origin === 'app' &&
        item.label === nativeCollisionItem?.label &&
        item.control?.kind === nativeCollisionItem?.control?.kind,
    );
  const nativeCollisionDomCount = nativeCollisionItem
    ? document.querySelectorAll(`#${CSS.escape(nativeCollisionItem.id)}`).length
    : 0;
  const nativeCollisionTargetText = nativeCollisionItem
    ? document.getElementById(nativeCollisionItem.id)?.textContent
    : undefined;
  const preservedNativeCollisionButton = Array.from(
    document.querySelectorAll('button'),
  ).find((button) => button.textContent?.trim() === 'Run built-in override');
  if (preservedNativeCollisionButton) {
    activateButton(preservedNativeCollisionButton);
    await waitUntil(() => settingsBuiltInOverrideClicks === 2);
  }
  nativeCollisionRegistration?.dispose();
  if (nativeCollisionItem) {
    await waitUntil(
      () =>
        document
          .getElementById(nativeCollisionItem.id)
          ?.textContent?.includes(nativeCollisionItem.label) === true,
    );
  }
  const restoredNativeCollisionItem = settingsApi
    .getGroups('codex.settings.general-settings')
    .find((group) => group.id === nativeCollisionGroup?.id)
    ?.items.find((item) => item.id === nativeCollisionItem?.id);
  check(
    nativeCollisionOpened &&
      nativeCollisionIds.length === 1 &&
      nativeCollisionIds[0]?.label === nativeCollisionLabel &&
      nativeCollisionDomCount === 1 &&
      nativeCollisionTargetText?.includes(nativeCollisionLabel) &&
      anonymizedNativeCollisionGroup?.items.length ===
        nativeCollisionGroup?.items.length &&
      anonymizedNativeCollisionItem?.description ===
        nativeCollisionItem?.description &&
      Boolean(preservedNativeCollisionButton) &&
      settingsBuiltInOverrideClicks === 2 &&
      restoredNativeCollisionItem?.origin === 'app' &&
      restoredNativeCollisionItem?.label === nativeCollisionItem?.label &&
      restoredNativeCollisionItem?.control?.kind ===
        nativeCollisionItem?.control?.kind,
    'a later native item with a duplicate pane ID stays visible without the ambiguous ID',
    {
      nativeItemId: nativeCollisionItem?.id,
      nativeGroupId: nativeCollisionGroup?.id,
      idCount: nativeCollisionIds.length,
      domCount: nativeCollisionDomCount,
      anonymized: Boolean(anonymizedNativeCollisionItem),
      preservedControlClicks: settingsBuiltInOverrideClicks,
    },
  );

  const settingsNavigationTitleShape = (expectedString) => {
    const containsPaneButton = (value) => {
      if (Array.isArray(value)) return value.some(containsPaneButton);
      if (value == null || typeof value !== 'object') return false;
      if (
        value.props?.['data-settings-panel-slug'] === settingsPaneId
      ) {
        return true;
      }
      return containsPaneButton(value.props?.children);
    };
    const paneButton = document.querySelector(
      `button[data-settings-panel-slug="${settingsPaneId}"]`,
    );
    const fiberKey = paneButton
      ? Object.keys(paneButton).find((key) =>
          key.startsWith('__reactFiber$'),
        )
      : undefined;
    let fiber = fiberKey ? paneButton[fiberKey] : null;
    for (let hops = 0; fiber && hops < 60; hops += 1) {
      for (const branch of [fiber, fiber.alternate]) {
        const title = branch?.memoizedProps?.title;
        if (
          containsPaneButton(branch?.memoizedProps?.children) &&
          (expectedString === undefined
            ? typeof title?.$$typeof === 'symbol'
            : title === expectedString)
        ) {
          return {
            titleIsElement: typeof title?.$$typeof === 'symbol',
            titleIsString: typeof title === 'string',
            titleText: typeof title === 'string' ? title : undefined,
          };
        }
      }
      fiber = fiber.return;
    }
    return null;
  };
  const builtInMetadataCategory = settingsApi
    .getCategories()
    .find((category) => category.id === 'integrations');
  const originalBuiltInCategoryLabel = builtInMetadataCategory?.label ?? '';
  const unchangedBuiltInCategoryTitleShape =
    settingsNavigationTitleShape();
  const transformedBuiltInCategoryLabel =
    'Transformed built-in category title';
  const builtInCategoryMetadataRegistration =
    settingsApi.transformCategories((categories) =>
      categories.map((category) =>
        category.id === builtInMetadataCategory?.id
          ? { ...category, label: transformedBuiltInCategoryLabel }
          : category,
      ),
    );
  await waitUntil(
    () =>
      settingsNavigationTitleShape(transformedBuiltInCategoryLabel)
        ?.titleIsString === true &&
      document.body.textContent?.includes(transformedBuiltInCategoryLabel),
  );
  const transformedBuiltInCategory = settingsApi
    .getCategories()
    .find((category) => category.id === builtInMetadataCategory?.id);
  const transformedBuiltInCategoryTitleShape =
    settingsNavigationTitleShape(transformedBuiltInCategoryLabel);
  builtInCategoryMetadataRegistration.dispose();
  await waitUntil(
    () =>
      !document.body.textContent?.includes(transformedBuiltInCategoryLabel) &&
      settingsNavigationTitleShape()?.titleIsElement === true,
  );
  const restoredBuiltInCategory = settingsApi
    .getCategories()
    .find((category) => category.id === builtInMetadataCategory?.id);
  const restoredBuiltInCategoryTitleShape =
    settingsNavigationTitleShape();

  const builtInMetadataGroup = builtInSettingsGroups.find(
    (group) =>
      group.origin === 'app' &&
      typeof group.id === 'string' &&
      typeof group.title === 'string' &&
      group.title.length > 0,
  );
  const builtInMetadataGroupId =
    builtInMetadataGroup?.id ?? 'missing-built-in-metadata-group';
  const originalBuiltInTitle = builtInMetadataGroup?.title ?? '';
  const originalBuiltInDescription = builtInMetadataGroup?.description;
  const originalBuiltInFooter = builtInMetadataGroup?.footer;
  const originalBuiltInKeywords = builtInMetadataGroup?.keywords;
  const nativeSettingsGroupHeaderShape = (description, expectedTitle) => {
    const textElement = Array.from(document.querySelectorAll('*')).find(
      (element) =>
        element.textContent?.includes(description) &&
        !Array.from(element.children).some((child) =>
          child.textContent?.includes(description),
        ),
    );
    const fiberKey = textElement
      ? Object.keys(textElement).find((key) => key.startsWith('__reactFiber$'))
      : undefined;
    let fiber = fiberKey ? textElement[fiberKey] : null;
    for (let hops = 0; fiber && hops < 40; hops += 1) {
      for (const branch of [fiber, fiber.alternate]) {
        const props = branch?.memoizedProps;
        const titleMatches =
          expectedTitle === undefined
            ? typeof props?.title?.$$typeof === 'symbol'
            : props?.title === expectedTitle;
        if (props?.subtitle === description && titleMatches) {
          return {
            titleIsElement: typeof props.title?.$$typeof === 'symbol',
            titleText: typeof props.title === 'string' ? props.title : undefined,
          };
        }
      }
      fiber = fiber.return;
    }
    return null;
  };
  let effectiveBuiltInTitle = originalBuiltInTitle;
  let clearBuiltInMetadata = false;
  const builtInMetadataRegistration = settingsApi.transformGroups(
    (groups, pane) =>
      pane.id === 'codex.settings.general-settings'
        ? groups.map((group) =>
            group.id === builtInMetadataGroupId
              ? clearBuiltInMetadata
                ? {
                    ...group,
                    title: undefined,
                    description: undefined,
                    footer: undefined,
                    keywords: undefined,
                  }
                : {
                    ...group,
                    title: effectiveBuiltInTitle,
                    description: 'Transformed built-in description',
                    footer: 'Transformed built-in footer',
                    keywords: ['transformed-built-in-keyword'],
                  }
              : group,
          )
        : groups,
  );
  const builtInMetadataPassThroughRegistration =
    settingsApi.transformGroups((groups) => groups);
  await waitUntil(
    () =>
      document.body.textContent?.includes(originalBuiltInTitle) &&
      document.body.textContent?.includes(
        'Transformed built-in description',
      ) &&
      document.body.textContent?.includes('Transformed built-in footer'),
  );
  const unchangedBuiltInTitleRendered = document.body.textContent?.includes(
    originalBuiltInTitle,
  );
  const unchangedBuiltInHeaderShape = nativeSettingsGroupHeaderShape(
    'Transformed built-in description',
  );
  effectiveBuiltInTitle = 'Transformed built-in title';
  builtInMetadataRegistration.invalidate();
  await waitUntil(
    () =>
      document.body.textContent?.includes('Transformed built-in title') &&
      document.body.textContent?.includes(
        'Transformed built-in description',
      ) &&
      document.body.textContent?.includes('Transformed built-in footer'),
  );
  const transformedBuiltInGroup = settingsApi
    .getGroups('codex.settings.general-settings')
    .find((group) => group.id === builtInMetadataGroupId);
  const transformedBuiltInHeaderShape = nativeSettingsGroupHeaderShape(
    'Transformed built-in description',
    'Transformed built-in title',
  );
  clearBuiltInMetadata = true;
  builtInMetadataRegistration.invalidate();
  await waitUntil(
    () =>
      !document.body.textContent?.includes('Transformed built-in title') &&
      !document.body.textContent?.includes(
        'Transformed built-in description',
      ) &&
      !document.body.textContent?.includes('Transformed built-in footer'),
  );
  const clearedBuiltInGroup = settingsApi
    .getGroups('codex.settings.general-settings')
    .find((group) => group.id === builtInMetadataGroupId);
  const clearedBuiltInMetadataIsAbsent =
    !document.body.textContent?.includes('Transformed built-in title') &&
    !document.body.textContent?.includes('Transformed built-in description') &&
    !document.body.textContent?.includes('Transformed built-in footer');
  builtInMetadataPassThroughRegistration.dispose();
  builtInMetadataRegistration.dispose();
  await waitUntil(() => {
    const restored = settingsApi
      .getGroups('codex.settings.general-settings')
      .find((group) => group.id === builtInMetadataGroupId);
    return (
      restored?.title === originalBuiltInTitle &&
      document.body.textContent?.includes(originalBuiltInTitle)
    );
  });
  const restoredBuiltInGroup = settingsApi
    .getGroups('codex.settings.general-settings')
    .find((group) => group.id === builtInMetadataGroupId);
  check(
    builtInMetadataCategory?.id !== undefined &&
      unchangedBuiltInCategoryTitleShape?.titleIsElement === true &&
      transformedBuiltInCategory?.label ===
        transformedBuiltInCategoryLabel &&
      transformedBuiltInCategoryTitleShape?.titleIsString === true &&
      transformedBuiltInCategoryTitleShape.titleText ===
        transformedBuiltInCategoryLabel &&
      restoredBuiltInCategory?.label === originalBuiltInCategoryLabel &&
      restoredBuiltInCategoryTitleShape?.titleIsElement === true &&
      builtInMetadataGroup?.id !== undefined &&
      unchangedBuiltInTitleRendered &&
      unchangedBuiltInHeaderShape?.titleIsElement === true &&
      transformedBuiltInGroup?.title === 'Transformed built-in title' &&
      transformedBuiltInGroup.description ===
        'Transformed built-in description' &&
      transformedBuiltInGroup.footer === 'Transformed built-in footer' &&
      transformedBuiltInGroup.keywords?.includes(
        'transformed-built-in-keyword',
      ) &&
      transformedBuiltInHeaderShape?.titleText ===
        'Transformed built-in title' &&
      clearedBuiltInGroup !== undefined &&
      clearedBuiltInGroup.title === undefined &&
      clearedBuiltInGroup.description === undefined &&
      clearedBuiltInGroup.footer === undefined &&
      clearedBuiltInGroup.keywords === undefined &&
      clearedBuiltInMetadataIsAbsent &&
      restoredBuiltInGroup?.title === originalBuiltInTitle &&
      restoredBuiltInGroup.description === originalBuiltInDescription &&
      restoredBuiltInGroup.footer === originalBuiltInFooter &&
      JSON.stringify(restoredBuiltInGroup.keywords) ===
        JSON.stringify(originalBuiltInKeywords),
    'transformed built-in settings metadata renders through native owners',
    {
      unchangedCategory: unchangedBuiltInCategoryTitleShape,
      transformedCategory: transformedBuiltInCategoryTitleShape,
      restoredCategory: restoredBuiltInCategoryTitleShape,
      unchangedHeader: unchangedBuiltInHeaderShape,
      transformedHeader: transformedBuiltInHeaderShape,
      clearedGroup: clearedBuiltInGroup,
      restoredGroup: restoredBuiltInGroup,
    },
  );

  await settingsApi.open('codex.settings.appearance');
  await waitUntil(() => document.body.textContent?.includes('Light theme'));
  const customSidebarRow = document.querySelector(
    `button[data-settings-panel-slug="${settingsPaneId}"]`,
  );
  customSidebarRow?.click();
  await waitUntil(
    () => document.getElementById(settingsToggleId) != null,
  );
  check(
    Boolean(customSidebarRow),
    'a contributed settings pane has a native sidebar row',
  );
  check(
    document.body.textContent?.includes('Settings UI Fixture'),
    'selecting a contributed sidebar row opens its settings pane',
  );

  const setSettingsSearch = async (query) => {
    const input = document.querySelector('input#settings-search');
    if (!input) throw new Error('Native settings search input missing');
    const valueSetter = Object.getOwnPropertyDescriptor(
      HTMLInputElement.prototype,
      'value',
    )?.set;
    valueSetter.call(input, query);
    input.dispatchEvent(new InputEvent('input', { bubbles: true }));
    await waitUntil(
      () =>
        document.querySelector('input#settings-search')?.value === query &&
        document.querySelectorAll('[data-list-navigation-item]').length > 0,
    );
  };
  const settingsSearchResult = (panelLabel) =>
    Array.from(
      document.querySelectorAll('button[data-list-navigation-item]'),
    ).find((button) =>
      button.getAttribute('aria-label')?.endsWith(`, ${panelLabel}`),
    );
  const searchMarkers = [
    'settings-category-marker',
    'settings-pane-marker',
    'settings-group-marker',
    'settings-item-marker',
    'settings-text-field-marker',
  ];
  const searchableLevels = [];
  for (const marker of searchMarkers) {
    await setSettingsSearch(marker);
    searchableLevels.push(Boolean(settingsSearchResult('Settings UI Fixture')));
  }
  check(
    searchableLevels.every(Boolean),
    'settings search indexes contributed category, pane, group, and item text',
    { searchableLevels },
  );

  await setSettingsSearch('Multiple Accounts');
  const extensionTitleResult = settingsSearchResult('Extensions');
  await setSettingsSearch('saved-account');
  const extensionDescriptionResult = settingsSearchResult('Extensions');
  check(
    Boolean(extensionTitleResult) && Boolean(extensionDescriptionResult),
    'Extensions settings search indexes installed package titles and descriptions',
  );

  await setSettingsSearch('Reaction emojis');
  const reactionSettingsResult = settingsSearchResult('Reactions');
  check(
    Boolean(reactionSettingsResult),
    'settings search finds the Reactions extension settings',
  );
  reactionSettingsResult?.click();
  await waitUntil(() =>
    Array.from(document.querySelectorAll('input')).some(
      (input) => input.id !== 'settings-search' && input.value === '👍👎🤔🤬',
    ),
  );
  check(
    document.body.textContent?.includes('Reset to defaults') &&
      document.body.textContent?.includes('Choose the reactions shown for selected text.'),
    'the Reactions search result opens its native field and reset action',
  );

  await setSettingsSearch('settings-item-marker');
  settingsSearchResult('Settings UI Fixture')?.click();
  await waitUntil(
    () =>
      document.querySelector('input#settings-search')?.value === '',
  );
  check(
    document.getElementById(settingsToggleId) != null,
    'selecting a contributed search result opens its owning settings pane',
  );
  markProgress('complete');
  return checks;
}

async function threadSelectionSnapshot(selector) {
  return evaluate(
    `(() => {
      const row = document.querySelector(${JSON.stringify(selector)});
      const settingsBack = (${findSettingsBackLink.toString()})();
      const trigger = row?.querySelector("[data-thread-title-trigger]");
      const rect = row?.getBoundingClientRect();
      const reactPropsKey = row
        ? Object.keys(row).find((key) => key.startsWith("__reactProps$"))
        : undefined;
      return {
        href: location.href,
        currentThreadId:
          globalThis.__CGPTX_UI_TEST_THREADS__?.getCurrent()?.threadId ?? null,
        fixtureReady: globalThis.__CGPTX_BINDING_FIXTURE_READY__ === true,
        nativeReady: globalThis.__CGPTX_HOST__?._debug.nativeReady() === true,
        settingsBack: settingsBack
          ? {
              connected: settingsBack.isConnected,
              role: settingsBack.getAttribute("role"),
              messageId: "settings.nav.back",
            }
          : null,
        threadRows: Array.from(
          document.querySelectorAll("[data-app-action-sidebar-thread-row]"),
        ).map((candidate) => ({
          id: candidate.getAttribute("data-app-action-sidebar-thread-id"),
          kind: candidate.getAttribute("data-app-action-sidebar-thread-kind"),
          height: candidate.getBoundingClientRect().height,
        })),
        row: row
          ? {
              connected: row.isConnected,
              ariaCurrent: row.getAttribute("aria-current"),
              ariaSelected: row.getAttribute("aria-selected"),
              dataState: row.getAttribute("data-state"),
              className: row.className,
              width: rect?.width ?? 0,
              height: rect?.height ?? 0,
              hasReactOnClick:
                typeof row[reactPropsKey]?.onClick === "function",
            }
          : null,
        trigger: trigger
          ? {
              tagName: trigger.tagName,
              ariaCurrent: trigger.getAttribute("aria-current"),
              ariaSelected: trigger.getAttribute("aria-selected"),
              dataState: trigger.getAttribute("data-state"),
              pointerEvents: getComputedStyle(trigger).pointerEvents,
            }
          : null,
      };
    })()`,
  );
}

async function returnFromSettingsForThreadSelection(selector) {
  const clicked = await evaluate(
    `(() => {
      if (document.querySelector(${JSON.stringify(selector)})) return false;
      const settingsBack = (${findSettingsBackLink.toString()})();
      if (!settingsBack) return false;
      settingsBack.click();
      return true;
    })()`,
  );
  if (!clicked) return;
  try {
    await waitFor(
      `Boolean(document.querySelector(${JSON.stringify(selector)}))`,
      20000,
    );
  } catch (error) {
    const state = await threadSelectionSnapshot(selector);
    throw new Error(
      `${error.message}; Settings Back did not restore the requested thread row: ${JSON.stringify(state)}`,
    );
  }
}

async function activateThreadRow(
  selector,
  expectedThreadId,
  waitForCurrent = true,
) {
  let selection;
  try {
    selection = await evaluate(
      `(async () => {
      const deadline = Date.now() + 60000;
      let row;
      let reactPropsKey;
      while (Date.now() < deadline) {
        row = document.querySelector(${JSON.stringify(selector)});
        reactPropsKey = row
          ? Object.keys(row).find((key) => key.startsWith("__reactProps$"))
          : undefined;
        if (
          row &&
          typeof row[reactPropsKey]?.onClick === "function" &&
          globalThis.__CGPTX_HOST__?._debug.nativeReady() === true
        ) {
          break;
        }
        await new Promise((resolve) => setTimeout(resolve, 100));
      }
      if (!row) throw new Error('Selected native thread row missing');
      if (typeof row[reactPropsKey]?.onClick !== "function") {
        throw new Error('Selected native thread row never became interactive');
      }
      if (!globalThis.__CGPTX_UI_TEST_THREADS__) {
        globalThis.__CGPTX_HOST__.registerExtension("ui-test-thread-selection", {
          activate(api) {
            globalThis.__CGPTX_UI_TEST_THREADS__ = api.threads;
          },
        });
      }
      const scopedId = row.getAttribute('data-app-action-sidebar-thread-id');
      const threadId =
        ${JSON.stringify(expectedThreadId)} ??
        scopedId.slice(scopedId.lastIndexOf(':') + 1);
      const trigger = row.querySelector("[data-thread-title-trigger]");
      const rect = row.getBoundingClientRect();
      const before = {
        href: location.href,
        currentThreadId:
          globalThis.__CGPTX_UI_TEST_THREADS__?.getCurrent()?.threadId ?? null,
        fixtureReady: globalThis.__CGPTX_BINDING_FIXTURE_READY__ === true,
        nativeReady: globalThis.__CGPTX_HOST__?._debug.nativeReady() === true,
        row: {
          connected: row.isConnected,
          ariaCurrent: row.getAttribute("aria-current"),
          ariaSelected: row.getAttribute("aria-selected"),
          dataState: row.getAttribute("data-state"),
          className: row.className,
          width: rect.width,
          height: rect.height,
          hasReactOnClick: true,
        },
        trigger: trigger
          ? {
              tagName: trigger.tagName,
              ariaCurrent: trigger.getAttribute("aria-current"),
              ariaSelected: trigger.getAttribute("aria-selected"),
              dataState: trigger.getAttribute("data-state"),
              pointerEvents: getComputedStyle(trigger).pointerEvents,
            }
          : null,
      };
      row.click();
      return { before, threadId };
    })()`,
    );
  } catch (error) {
    const state = await threadSelectionSnapshot(selector);
    throw new Error(
      `${error.message}; thread selection state: ${JSON.stringify(state)}`,
    );
  }
  if (!waitForCurrent) return selection.threadId;
  try {
    await waitFor(
      `globalThis.__CGPTX_UI_TEST_THREADS__?.getCurrent()?.threadId === ${JSON.stringify(selection.threadId)}`,
      60000,
    );
  } catch (error) {
    const after = await threadSelectionSnapshot(selector);
    throw new Error(
      `${error.message}; thread selection state: ${JSON.stringify({ before: selection.before, after })}`,
    );
  }
  return selection.threadId;
}

async function selectThread(threadId, waitForCurrent = true) {
  const selector =
    '[data-app-action-sidebar-thread-id$=":' + threadId + '"]';
  await activateThreadRow(selector, threadId, waitForCurrent);
}

async function selectThreadByKind(kind, waitForCurrent = true) {
  return activateThreadRow(
    '[data-app-action-sidebar-thread-kind="remote"]',
    undefined,
    waitForCurrent,
  );
}

async function waitForSelectedThreadMenu(selector, threadId) {
  try {
    await waitFor(
      `globalThis.__CGPTX_UI_TEST_THREADS__?.getCurrent()?.threadId === ${JSON.stringify(threadId)} &&
        globalThis.__CGPTX_HOST__?._debug
          .computeEffectiveThreadItems(${JSON.stringify(threadId)})
          .some((item) => item.origin === "app")`,
      60000,
    );
  } catch (error) {
    const selection = await threadSelectionSnapshot(selector);
    const binding = await evaluate(`({
      boundaryRenders:
        globalThis.__CGPTX_HOST__?._debug.threadMenuBoundaryRenderCount(),
      adapterRenders:
        globalThis.__CGPTX_HOST__?._debug.threadMenuAdapterRenderCount(),
      items: globalThis.__CGPTX_HOST__?._debug
        .computeEffectiveThreadItems(${JSON.stringify(threadId)})
        .map((item) => ({ id: item.id, origin: item.origin })),
      nativeBindingError:
        globalThis.__CGPTX_HOST__?._debug.nativeBindingError(),
    })`);
    throw new Error(
      `${error.message}; selected thread menu was not published: ${JSON.stringify({ selection, binding })}`,
    );
  }
}

let selectedThreadId = selectThreadId;
if (selectThreadKind) {
  selectedThreadId = await selectThreadByKind(selectThreadKind);
  await waitForSelectedThreadMenu(
    '[data-app-action-sidebar-thread-kind="remote"]',
    selectedThreadId,
  );
} else if (selectedThreadId) {
  const selector =
    '[data-app-action-sidebar-thread-id$=":' + selectedThreadId + '"]';
  await returnFromSettingsForThreadSelection(selector);
  await selectThread(selectedThreadId);
  await waitForSelectedThreadMenu(selector, selectedThreadId);
}
if (noProfile) {
  await waitFor(
    'globalThis.__CGPTX_HOST__?._debug.nativeReady() === true',
  );
  const preProfileSettingsState = await evaluate(`({
    profileBoundaryReady:
      globalThis.__CGPTX_HOST__?._debug.authenticationReady() === true,
    settingsNavigationReady:
      globalThis.__CGPTX_HOST__?._debug.settingsNavigationReady?.() === true,
  })`);
  if (
    preProfileSettingsState.profileBoundaryReady ||
    !preProfileSettingsState.settingsNavigationReady
  ) {
    throw new Error(
      'Native Settings navigation is unavailable before the lazy profile menu mounts: ' +
        JSON.stringify(preProfileSettingsState),
    );
  }
}
await waitFor(
  'globalThis.__CGPTX_ASSISTANT_SELECTION_REQUESTED__ === true || Array.isArray(globalThis.__CGPTX_TEST_RESULTS__)',
  90000,
);
if (!Array.isArray(await evaluate('globalThis.__CGPTX_TEST_RESULTS__'))) {
  await selectAssistantResponseText();
}
await waitFor(
  `globalThis.__CGPTX_BINDING_FIXTURE_READY__ === true ||
    Array.isArray(globalThis.__CGPTX_TEST_RESULTS__)`,
  90000,
);
const semanticResults = await evaluate('globalThis.__CGPTX_TEST_RESULTS__');
const failedSemantic = semanticResults.filter((result) => !result.pass);
if (failedSemantic.length > 0) {
  throw new Error('Public API suite failed: ' + JSON.stringify(failedSemantic));
}
if (publicAPIOnly) {
  socket.close();
  console.log(
    JSON.stringify(
      {
        passed: semanticResults.length,
        total: semanticResults.length,
        checks: semanticResults,
      },
      null,
      2,
    ),
  );
  process.exit(0);
}
if (selectedThreadId) {
  const selector =
    '[data-app-action-sidebar-thread-id$=":' + selectedThreadId + '"]';
  await returnFromSettingsForThreadSelection(selector);
  await selectThread(selectedThreadId);
  await waitForSelectedThreadMenu(selector, selectedThreadId);
}
await selectAssistantResponseText();

const report = await evaluate(
  '(' +
    validateUi.toString() +
    ')(' +
    JSON.stringify(expectNativeProfileCallbackMissing) +
    ',' +
    JSON.stringify(noProfile) +
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
process.exit(failed.length > 0 ? 1 : 0);
