import type {
  Disposable,
  PlatformApi,
  SettingsItem,
  SettingsUiApi,
} from "../../platform/types";
import {
  createExtensionManagement,
  type ExtensionManagement,
  type InstalledExtension,
} from "../../platform/utilities/extension-management.ts";

const EXTENSION_ID = "extensions";
const PANE_ID = `${EXTENSION_ID}.installed`;
const GROUP_ID = `${EXTENSION_ID}.installed`;

function sameInstalledExtensions(
  left: readonly InstalledExtension[],
  right: readonly InstalledExtension[],
): boolean {
  return (
    left.length === right.length &&
    left.every((extension, index) => {
      const candidate = right[index];
      return (
        candidate !== undefined &&
        extension.id === candidate.id &&
        extension.name === candidate.name &&
        extension.description === candidate.description &&
        extension.version === candidate.version &&
        extension.enabled === candidate.enabled &&
        extension.required === candidate.required
      );
    })
  );
}

export function createExtensionRows(
  extensions: readonly InstalledExtension[],
  ui: SettingsUiApi,
  setEnabled: (id: string, enabled: boolean) => void | Promise<void>,
): readonly SettingsItem[] {
  return extensions.map((extension) => ({
    id: `${EXTENSION_ID}.item.${extension.id}`,
    label: extension.name,
    description: extension.description,
    keywords: [extension.id, extension.version],
    control: ui.toggle({
      checked: extension.enabled,
      disabled: extension.required,
      onChange: (enabled) => setEnabled(extension.id, enabled),
    }),
  }));
}

export async function activateExtensions(
  api: PlatformApi,
  management: ExtensionManagement,
): Promise<readonly Disposable[]> {
  let installed: readonly InstalledExtension[] = [];
  let installedLoaded = false;
  let stateOperations: Promise<void> = Promise.resolve();
  let refreshOperation: Promise<void> | undefined;
  let trailingFocusRefresh = false;
  let items: ReturnType<PlatformApi["settings"]["transformItems"]>;

  const enqueueStateOperation = <T>(
    operation: () => Promise<T>,
  ): Promise<T> => {
    const result = stateOperations.then(operation);
    stateOperations = result.then(
      () => {},
      () => {},
    );
    return result;
  };
  const applyInstalled = (next: readonly InstalledExtension[]): void => {
    if (installedLoaded && sameInstalledExtensions(installed, next)) return;
    installed = next;
    installedLoaded = true;
    items.invalidate();
  };
  const refreshInstalled = (fromFocus = false): Promise<void> => {
    if (refreshOperation) {
      if (fromFocus) trailingFocusRefresh = true;
      return refreshOperation;
    }
    const request = async (): Promise<void> => {
      do {
        trailingFocusRefresh = false;
        applyInstalled(await enqueueStateOperation(() => management.list()));
      } while (trailingFocusRefresh);
    };
    const tracked = request().finally(() => {
      if (refreshOperation !== tracked) return;
      refreshOperation = undefined;
      trailingFocusRefresh = false;
    });
    refreshOperation = tracked;
    return tracked;
  };
  const requestRefresh = (fromFocus = false): void => {
    void refreshInstalled(fromFocus).catch((error) => {
      console.error(`[${EXTENSION_ID}] state refresh failed`, error);
    });
  };

  const navigation = api.settings.transformCategories((categories) =>
    categories.map((category) =>
      category.id === "integrations"
        ? {
            ...category,
            panes: [
              ...category.panes,
              {
                id: PANE_ID,
                label: "Extensions",
                title: "Extensions",
                description: "Manage installed extensions.",
                keywords: ["installed extensions", "enable", "disable"],
              },
            ],
          }
        : category,
    ),
  );
  const groups = api.settings.transformGroups((current, pane) =>
    pane.id === PANE_ID
      ? [
          ...current,
          {
            id: GROUP_ID,
            items: [],
            footer: "Changes apply after ChatGPT restarts.",
          },
        ]
      : current,
  );
  items = api.settings.transformItems((current, context) => {
    if (context.group.id !== GROUP_ID) return current;
    requestRefresh();
    return [
      ...current,
      ...createExtensionRows(
        installed,
        api.settings.ui,
        async (id, enabled) => {
          applyInstalled(
            await enqueueStateOperation(() =>
              management.setEnabled(id, enabled),
            ),
          );
        },
      ),
    ];
  });

  let focusRegistration: Disposable | undefined;
  if (
    typeof window !== "undefined" &&
    typeof window.addEventListener === "function" &&
    typeof window.removeEventListener === "function"
  ) {
    const focusTarget = window;
    const onFocus = (): void => requestRefresh(true);
    focusTarget.addEventListener("focus", onFocus);
    let disposed = false;
    focusRegistration = Object.freeze({
      dispose(): void {
        if (disposed) return;
        disposed = true;
        focusTarget.removeEventListener("focus", onFocus);
      },
    });
  }

  await refreshInstalled();
  return Object.freeze([
    navigation,
    groups,
    items,
    ...(focusRegistration ? [focusRegistration] : []),
  ]);
}

export function activate(api: PlatformApi, authorization: string): void {
  void activateExtensions(
    api,
    createExtensionManagement(authorization),
  ).catch((error) => {
    console.error(`[${EXTENSION_ID}] activation failed`, error);
  });
}
