import type {
  Disposable,
  PlatformApi,
  SettingsControl,
} from "../../platform/types";
import {
  DEFAULT_REACTION_TEXT,
  parseReactionText,
  sharedReactionSettings,
  type ReactionSettings,
} from "./reaction-settings";

const EXTENSION_ID = "reactions";
export const REACTIONS_SETTINGS_PANE_ID = `${EXTENSION_ID}.settings`;
const GROUP_ID = `${EXTENSION_ID}.settings.emojis`;
const EMOJIS_ITEM_ID = `${EXTENSION_ID}.settings.emojis.value`;

export async function activateReactionSettings(
  api: PlatformApi,
  settings: ReactionSettings,
): Promise<readonly Disposable[]> {
  let draft = settings.text;
  let items: ReturnType<PlatformApi["settings"]["transformItems"]>;

  const navigation = api.settings.transformCategories((categories) =>
    categories.map((category) =>
      category.id === "integrations"
        ? {
            ...category,
            panes: [
              ...category.panes,
              {
                id: REACTIONS_SETTINGS_PANE_ID,
                label: "Reactions",
                title: "Reactions",
                description: "Customize assistant text reactions.",
                keywords: ["reaction", "emoji", "assistant text"],
              },
            ],
          }
        : category,
    ),
  );
  const groups = api.settings.transformGroups((current, pane) =>
    pane.id === REACTIONS_SETTINGS_PANE_ID
      ? [
          ...current,
          {
            id: GROUP_ID,
            title: "Reaction emojis",
            description: "Choose the reactions shown for selected text.",
            keywords: ["reaction", "emoji", "emojis"],
            items: [],
          },
        ]
      : current,
  );
  items = api.settings.transformItems((current, context) => {
    if (context.group.id !== GROUP_ID) return current;
    const valid = parseReactionText(draft) !== undefined;
    const controls: SettingsControl[] = [api.settings.ui.textField({
      value: draft,
      placeholder: DEFAULT_REACTION_TEXT,
      onChange(value) {
        draft = value;
        items.invalidate();
        if (!parseReactionText(value)) return;
        return settings.setText(value).catch((error: unknown) => {
          draft = settings.text;
          items.invalidate();
          console.error(`[${EXTENSION_ID}] settings update failed`, error);
        });
      },
    })];
    if (draft !== DEFAULT_REACTION_TEXT) {
      controls.push(
        api.settings.ui.button({
          label: "Reset",
          onClick() {
            return settings
              .reset()
              .then(() => {
                draft = settings.text;
                items.invalidate();
              })
              .catch((error: unknown) => {
                console.error(
                  `[${EXTENSION_ID}] settings reset failed`,
                  error,
                );
              });
          },
        }),
      );
    }
    return [
      ...current,
      {
        id: EMOJIS_ITEM_ID,
        label: "Emojis",
        description: valid
          ? "Enter one or more emoji."
          : "Enter emoji only.",
        keywords: ["reaction", "emoji", "emojis", "reset", "default"],
        control: api.settings.ui.inline(controls),
      },
    ];
  });
  const subscription = settings.subscribe((text) => {
    draft = text;
    items.invalidate();
  });
  await settings.load();
  return Object.freeze([navigation, groups, items, subscription]);
}

export function activate(api: PlatformApi): void {
  void activateReactionSettings(api, sharedReactionSettings()).catch(
    (error: unknown) => {
      console.error(`[${EXTENSION_ID}] settings activation failed`, error);
    },
  );
}
