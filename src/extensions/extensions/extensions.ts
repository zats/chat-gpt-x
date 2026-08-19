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
  let items: ReturnType<PlatformApi["settings"]["transformItems"]>;
  items = api.settings.transformItems((current, context) =>
    context.group.id === GROUP_ID
      ? [
          ...current,
          ...createExtensionRows(
            installed,
            api.settings.ui,
            async (id, enabled) => {
              installed = await management.setEnabled(id, enabled);
              items.invalidate();
            },
          ),
        ]
      : current,
  );
  installed = await management.list();
  items.invalidate();
  return Object.freeze([navigation, groups, items]);
}

export function activate(api: PlatformApi, authorization: string): void {
  void activateExtensions(
    api,
    createExtensionManagement(authorization),
  ).catch((error) => {
    console.error(`[${EXTENSION_ID}] activation failed`, error);
  });
}
