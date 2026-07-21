/**
 * Binding-specific live UI validation for menus.profile.
 *
 * This intentionally inspects version-specific renderer state. The stable
 * api-test-suite remains limited to src/platform/types.d.ts.
 *
 * Usage: node src/platform/bindings/26.715.70719/ui-test.mjs [port]
 */

const port = process.argv[2] ?? '9222';
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

async function validateUi() {
  const checks = [];
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
  const idOf = (node) =>
    node?.getAttribute('data-cgptx-id') ?? node?.getAttribute('data-cgptx');
  const idOfBlock = (block) =>
    idOf(block) ?? idOf(block.querySelector(':scope > [data-cgptx-id]'));
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
  const account = globalThis.__CGPTX_HOST__
    ?._debug.getCache()
    .find((item) => item.id === 'codex.profileDropdown.account');
  let accountActivationThrew = false;
  try {
    account?.onClick?.();
  } catch {
    accountActivationThrew = true;
  }
  check(
    typeof account?.onClick === 'function' && !accountActivationThrew,
    'account identity public action accepts zero arguments',
    { accountActivationThrew },
  );

  return checks;
}

await waitFor('globalThis.__CGPTX_BINDING_FIXTURE_READY__ === true');
const semanticResults = await evaluate('globalThis.__CGPTX_TEST_RESULTS__');
const failedSemantic = semanticResults.filter((result) => !result.pass);
if (failedSemantic.length > 0) {
  throw new Error('Public API suite failed: ' + JSON.stringify(failedSemantic));
}

const report = await evaluate('(' + validateUi.toString() + ')()');
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
