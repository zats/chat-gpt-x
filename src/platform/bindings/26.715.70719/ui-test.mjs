/**
 * Binding-specific live UI validation for menus.profile.
 *
 * This intentionally inspects version-specific renderer state. The stable
 * api-test-suite remains limited to src/platform/types.d.ts.
 *
 * Usage: node src/platform/bindings/26.715.70719/ui-test.mjs [port]
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
  const activateButton = (button) => {
    for (const type of ['pointerdown', 'pointerup', 'click']) {
      button?.dispatchEvent(
        new PointerEvent(type, {
          bubbles: true,
          cancelable: true,
          isPrimary: true,
          button: 0,
          pointerType: 'mouse',
        }),
      );
    }
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
  globalThis.__CGPTX_HOST__.registerExtension(`header-appearance-ui-fixture-${Date.now()}`, {
    activate(api) {
      headerAppearance = api.appearance.header;
    },
  });
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
  const toggleSidePanel = Array.from(
    appHeader?.querySelectorAll('button[aria-label="Toggle side panel"]') ?? [],
  ).find((button) => button.getBoundingClientRect().x > innerWidth / 2);
  if (!toggleSidePanel) throw new Error('Side-panel toggle missing');
  const sidePanelWasOpen = Boolean(
    document.querySelector('aside[data-app-shell-focus-area="right-panel"]'),
  );
  if (!sidePanelWasOpen) {
    activateButton(toggleSidePanel);
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
  const emptyAppearanceRegistration = headerAppearance.registerProperties({});
  check(
    Object.keys(headerAppearance.getProperties()).length === 0 &&
      root.style.getPropertyValue('--header-background-color') === '' &&
      root.style.getPropertyValue('--header-foreground-color') === '' &&
      !root.hasAttribute('data-cgptx-header-background-color') &&
      !root.hasAttribute('data-cgptx-header-foreground-color'),
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
  const initialHeaderColors = headerColors[originalHeaderTheme];

  const sideHeaderButtons = [
    ...Array.from(tabToolbar?.querySelectorAll('button') ?? []),
    ...Array.from(appHeader?.querySelectorAll('button') ?? []).filter(
      (button) => button.getBoundingClientRect().x > innerWidth / 2,
    ),
  ].filter((button) => {
    const rect = button.getBoundingClientRect();
    return rect.width > 0 && rect.height > 0;
  });
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
  check(
    sideHeaderButtons.length >= 4 &&
      sideHeaderButtons.every((button) => {
        const rect = button.getBoundingClientRect();
        return (
          getComputedStyle(button).visibility === 'visible' &&
          getComputedStyle(button).opacity !== '0' &&
          document.elementFromPoint(
            rect.x + rect.width / 2,
            rect.y + rect.height / 2,
          )?.closest('button') === button
        );
      }),
    'side-panel tabs and header controls remain visible and hit-testable',
    {
      controls: sideHeaderButtons.map(
        (button) =>
          button.textContent?.trim() ||
          button.title ||
          button.getAttribute('aria-label'),
      ),
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
    root.style.getPropertyValue('--header-background-color') === '' &&
      root.style.getPropertyValue('--header-foreground-color') === '' &&
      !root.hasAttribute('data-cgptx-header-background-color') &&
      !root.hasAttribute('data-cgptx-header-foreground-color'),
    'disposing header appearance restores native property ownership',
  );
  if (!sidePanelWasOpen) {
    activateButton(toggleSidePanel);
    await sleep(300);
  }

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
