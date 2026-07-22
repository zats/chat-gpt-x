import type {
  AppearanceColorScheme,
  ColorPickerSession,
  Disposable,
  HeaderCssProperties,
  HeaderCssPropertiesRegistration,
  HeaderThemeColor,
  PlatformApi,
  ThreadContext,
  ThreadMenuActionItem,
  ThreadMenuItem,
} from "../../platform/types";
import {
  createExtensionStorage,
  type ExtensionStorage,
} from "../../platform/utilities/extension-storage.ts";

const EXTENSION_ID = "thread-colors";
const STORAGE_FILE = "settings.json";

export const COLOR_ITEM_ID = `${EXTENSION_ID}.color`;
export const CUSTOM_COLOR_ITEM_ID = `${EXTENSION_ID}.custom`;
export const PALETTE_ICON_SVG = `<svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.75" stroke-linecap="round" stroke-linejoin="round" class="lucide lucide-palette-icon lucide-palette"><path d="M12 22a1 1 0 0 1 0-20 10 9 0 0 1 10 9 5 5 0 0 1-5 5h-2.25a1.75 1.75 0 0 0-1.4 2.8l.3.4a1.75 1.75 0 0 1-1.4 2.8z"/><circle cx="13.5" cy="6.5" r=".5" fill="currentColor"/><circle cx="17.5" cy="10.5" r=".5" fill="currentColor"/><circle cx="6.5" cy="12.5" r=".5" fill="currentColor"/><circle cx="8.5" cy="7.5" r=".5" fill="currentColor"/></svg>`;
export interface ThreadColorPreset {
  readonly id: string;
  readonly label: string;
  readonly icon: { kind: "color"; light: string; dark: string };
  readonly properties: HeaderCssProperties;
}

function channels(color: string): readonly [number, number, number] {
  const match = /^#([0-9a-f]{6})$/i.exec(color);
  if (!match) throw new TypeError(`Expected a six-digit hex color: ${color}`);
  return [
    Number.parseInt(match[1].slice(0, 2), 16),
    Number.parseInt(match[1].slice(2, 4), 16),
    Number.parseInt(match[1].slice(4, 6), 16),
  ];
}

function normalizedHexColor(color: string): `#${string}` {
  channels(color);
  return color.toUpperCase() as `#${string}`;
}

function srgbToLinear(channel: number): number {
  const value = channel / 255;
  return value <= 0.04045
    ? value / 12.92
    : ((value + 0.055) / 1.055) ** 2.4;
}

function linearToSrgb(channel: number): number {
  const value =
    channel <= 0.0031308
      ? 12.92 * channel
      : 1.055 * channel ** (1 / 2.4) - 0.055;
  return Math.round(value * 255);
}

interface OklchColor {
  readonly lightness: number;
  readonly chroma: number;
  readonly hue: number;
}

function hexToOklch(color: string): OklchColor {
  const [redChannel, greenChannel, blueChannel] = channels(color);
  const red = srgbToLinear(redChannel);
  const green = srgbToLinear(greenChannel);
  const blue = srgbToLinear(blueChannel);
  const long = Math.cbrt(
    0.4122214708 * red + 0.5363325363 * green + 0.0514459929 * blue,
  );
  const medium = Math.cbrt(
    0.2119034982 * red + 0.6806995451 * green + 0.1073969566 * blue,
  );
  const short = Math.cbrt(
    0.0883024619 * red + 0.2817188376 * green + 0.6299787005 * blue,
  );
  const lightness =
    0.2104542553 * long + 0.793617785 * medium - 0.0040720468 * short;
  const a =
    1.9779984951 * long - 2.428592205 * medium + 0.4505937099 * short;
  const b =
    0.0259040371 * long + 0.7827717662 * medium - 0.808675766 * short;
  return {
    lightness,
    chroma: Math.hypot(a, b),
    hue: Math.atan2(b, a),
  };
}

function oklchToHex(
  lightness: number,
  chroma: number,
  hue: number,
): `#${string}` | undefined {
  const a = chroma * Math.cos(hue);
  const b = chroma * Math.sin(hue);
  const long = (lightness + 0.3963377774 * a + 0.2158037573 * b) ** 3;
  const medium = (lightness - 0.1055613458 * a - 0.0638541728 * b) ** 3;
  const short = (lightness - 0.0894841775 * a - 1.291485548 * b) ** 3;
  const linear = [
    4.0767416621 * long - 3.3077115913 * medium + 0.2309699292 * short,
    -1.2684380046 * long + 2.6097574011 * medium - 0.3413193965 * short,
    -0.0041960863 * long - 0.7034186147 * medium + 1.707614701 * short,
  ] as const;
  if (linear.some((channel) => channel < 0 || channel > 1)) return undefined;
  return `#${linear
    .map((channel) => linearToSrgb(channel).toString(16).padStart(2, "0"))
    .join("")}`.toUpperCase() as `#${string}`;
}

export function complementaryColor(
  color: string,
  targetScheme: AppearanceColorScheme,
): `#${string}` {
  const source = hexToOklch(color);
  const mirroredLightness = 1 - source.lightness;
  const lightness =
    targetScheme === "light"
      ? Math.max(mirroredLightness, 0.75)
      : Math.min(mirroredLightness, 0.35);
  let minimum = 0;
  let maximum = source.chroma;
  let result = oklchToHex(lightness, 0, source.hue)!;
  for (let attempt = 0; attempt < 24; attempt += 1) {
    const chroma = (minimum + maximum) / 2;
    const candidate = oklchToHex(lightness, chroma, source.hue);
    if (candidate) {
      minimum = chroma;
      result = candidate;
    } else {
      maximum = chroma;
    }
  }
  return result;
}

export function customThemeColors(
  color: string,
  scheme: AppearanceColorScheme,
): HeaderThemeColor {
  const selected = normalizedHexColor(color);
  const complementary = complementaryColor(
    selected,
    scheme === "light" ? "dark" : "light",
  );
  return scheme === "light"
    ? { light: selected, dark: complementary }
    : { light: complementary, dark: selected };
}

function apcaLuminance(color: string): number {
  const [redChannel, greenChannel, blueChannel] = channels(color);
  const red = (redChannel / 255) ** 2.4;
  const green = (greenChannel / 255) ** 2.4;
  const blue = (blueChannel / 255) ** 2.4;
  return 0.2126729 * red + 0.7151522 * green + 0.072175 * blue;
}

// APCA 0.0.98G-4g: polarity-aware perceptual contrast for display content.
export function apcaContrast(foreground: string, background: string): number {
  const clampBlack = (luminance: number) =>
    luminance > 0.022
      ? luminance
      : luminance + (0.022 - luminance) ** 1.414;
  const foregroundLuminance = clampBlack(apcaLuminance(foreground));
  const backgroundLuminance = clampBlack(apcaLuminance(background));

  if (Math.abs(backgroundLuminance - foregroundLuminance) < 0.0005) {
    return 0;
  }

  if (backgroundLuminance > foregroundLuminance) {
    const contrast =
      (backgroundLuminance ** 0.56 - foregroundLuminance ** 0.57) * 1.14;
    return contrast < 0.1 ? 0 : (contrast - 0.027) * 100;
  }

  const contrast =
    (backgroundLuminance ** 0.65 - foregroundLuminance ** 0.62) * 1.14;
  return contrast > -0.1 ? 0 : (contrast + 0.027) * 100;
}

export function foregroundForBackground(
  background: string,
): "#000000" | "#FFFFFF" {
  return Math.abs(apcaContrast("#000000", background)) >=
    Math.abs(apcaContrast("#FFFFFF", background))
    ? "#000000"
    : "#FFFFFF";
}

function colorPreset(
  id: string,
  label: string,
  light: string,
  dark = light,
): ThreadColorPreset {
  const background = { light, dark };
  return {
    id,
    label,
    icon: { kind: "color", light, dark },
    properties: propertiesForBackground(background),
  };
}

function propertiesForBackground(
  background: HeaderThemeColor,
): HeaderCssProperties {
  return {
    "--header-background-color": background,
    "--header-foreground-color": {
      light: foregroundForBackground(background.light),
      dark: foregroundForBackground(background.dark),
    },
  };
}

export const THREAD_COLORS: readonly ThreadColorPreset[] = [
  {
    id: "default",
    label: "Default",
    icon: { kind: "color", light: "#9B9B9B", dark: "#9B9B9B" },
    properties: {},
  },
  colorPreset("blue", "Blue", "#3A83F7"),
  colorPreset("green", "Green", "#53B559"),
  colorPreset("yellow", "Yellow", "#F6C543"),
  colorPreset("pink", "Pink", "#F077AF"),
  colorPreset("orange", "Orange", "#EE7C37"),
  colorPreset("purple", "Purple", "#A67DE2"),
  colorPreset("black", "Black", "#000000", "#FFFFFF"),
];

const COLORS_BY_ID = new Map(THREAD_COLORS.map((color) => [color.id, color]));

function makeColorItem(
  selectColor: (color: ThreadColorPreset) => void,
  selectCustomColor: () => void,
  customColor?: HeaderThemeColor,
): ThreadMenuActionItem {
  return {
    kind: "action",
    id: COLOR_ITEM_ID,
    label: "Color",
    icon: { kind: "svg", source: PALETTE_ICON_SVG },
    items: [
      ...THREAD_COLORS.map((color) => ({
        kind: "action" as const,
        id: `${EXTENSION_ID}.${color.id}`,
        label: color.label,
        icon: color.icon,
        onClick: () => selectColor(color),
      })),
      {
        kind: "action",
        id: CUSTOM_COLOR_ITEM_ID,
        label: "Custom",
        icon: {
          kind: "color",
          light: customColor?.light ?? "#9B9B9B",
          dark: customColor?.dark ?? "#9B9B9B",
        },
        onClick: selectCustomColor,
      },
    ],
  };
}

export function transformThreadMenuItems(
  items: readonly ThreadMenuItem[],
  selectColor: (color: ThreadColorPreset) => void,
  selectCustomColor: () => void,
  customColor?: HeaderThemeColor,
): readonly ThreadMenuItem[] {
  const separatorIndex = items.findIndex((item) => item.kind === "separator");
  const insertionIndex = separatorIndex < 0 ? items.length : separatorIndex;
  return [
    ...items.slice(0, insertionIndex),
    makeColorItem(selectColor, selectCustomColor, customColor),
    ...items.slice(insertionIndex),
  ];
}

let menuRegistration: Disposable | undefined;
let appearanceRegistration: HeaderCssPropertiesRegistration | undefined;
let currentThreadRegistration: Disposable | undefined;
let activeState: ThreadColorState | undefined;
let activationGeneration = 0;

interface ThreadColorState {
  readonly generation: number;
  readonly storage: ExtensionStorage;
  selections: Map<string, ThreadColorSelection>;
  currentThread: ThreadContext | undefined;
  picker:
    | {
        readonly threadId: string;
        readonly session: ColorPickerSession;
      }
    | undefined;
  loaded: boolean;
  write: Promise<void>;
}

type ThreadColorSelection =
  | { readonly kind: "preset"; readonly preset: string }
  | { readonly kind: "custom"; readonly colors: HeaderThemeColor };

async function readSelections(
  storage: ExtensionStorage,
): Promise<Map<string, ThreadColorSelection>> {
  const contents = await storage.readTextFile(STORAGE_FILE);
  if (contents === undefined) return new Map();
  const parsed: unknown = JSON.parse(contents);
  if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) {
    throw new TypeError("thread color settings must be an object");
  }
  const colors = (parsed as Record<string, unknown>).colors;
  if (!colors || typeof colors !== "object" || Array.isArray(colors)) {
    throw new TypeError("thread color settings must contain a colors object");
  }
  const selections = new Map<string, ThreadColorSelection>();
  for (const [threadId, storedColor] of Object.entries(colors)) {
    if (
      threadId.length === 0 ||
      !storedColor ||
      typeof storedColor !== "object" ||
      Array.isArray(storedColor)
    ) {
      throw new TypeError("thread color storage contains an invalid selection");
    }
    const stored = storedColor as Record<string, unknown>;
    if (
      stored.type === "preset" &&
      typeof stored.id === "string" &&
      stored.id !== "default" &&
      COLORS_BY_ID.has(stored.id)
    ) {
      selections.set(threadId, { kind: "preset", preset: stored.id });
      continue;
    }
    if (
      stored.type === "custom" &&
      typeof stored.light === "string" &&
      typeof stored.dark === "string"
    ) {
      const light = normalizedHexColor(stored.light);
      const dark = normalizedHexColor(stored.dark);
      selections.set(threadId, { kind: "custom", colors: { light, dark } });
      continue;
    }
    throw new TypeError("thread color storage contains an invalid selection");
  }
  return selections;
}

function serializedSelections(
  selections: Map<string, ThreadColorSelection>,
): string {
  return JSON.stringify(
    {
      colors: Object.fromEntries(
        [...selections.entries()]
          .sort(([left], [right]) => left.localeCompare(right))
          .map(([threadId, selection]) => [
            threadId,
            selection.kind === "preset"
              ? { type: "preset", id: selection.preset }
              : { type: "custom", ...selection.colors },
          ]),
      ),
    },
  );
}

function propertiesForSelection(
  selection: ThreadColorSelection | undefined,
): HeaderCssProperties {
  if (!selection) return {};
  return selection.kind === "preset"
    ? COLORS_BY_ID.get(selection.preset)!.properties
    : propertiesForBackground(selection.colors);
}

function applyCurrentThreadColor(state: ThreadColorState): void {
  if (!state.loaded) return;
  const selection = state.currentThread
    ? state.selections.get(state.currentThread.threadId)
    : undefined;
  appearanceRegistration?.update(propertiesForSelection(selection));
}

function selectThreadColor(
  state: ThreadColorState,
  threadId: string,
  color: ThreadColorPreset,
): void {
  if (state.generation !== activationGeneration) return;
  if (color.id === "default") state.selections.delete(threadId);
  else state.selections.set(threadId, { kind: "preset", preset: color.id });
  if (state.currentThread?.threadId === threadId) applyCurrentThreadColor(state);
  persistSelections(state);
}

function persistSelections(state: ThreadColorState): void {
  const contents = serializedSelections(state.selections);
  state.write = state.write.then(() =>
    state.storage.writeTextFile(STORAGE_FILE, contents),
  );
  void state.write.catch((error) =>
    console.error(`[${EXTENSION_ID}] failed to save thread colors`, error),
  );
}

function cancelPicker(state: ThreadColorState): void {
  const picker = state.picker;
  if (!picker) return;
  state.picker = undefined;
  picker.session.dispose();
}

function initialPickerColor(
  state: ThreadColorState,
  threadId: string,
  scheme: AppearanceColorScheme,
): `#${string}` {
  const selection = state.selections.get(threadId);
  if (selection?.kind === "custom") {
    return selection.colors[scheme] as `#${string}`;
  }
  if (selection?.kind === "preset") {
    const background = COLORS_BY_ID.get(selection.preset)?.properties[
      "--header-background-color"
    ];
    if (background) return normalizedHexColor(background[scheme]);
  }
  return scheme === "light" ? "#FFFFFF" : "#000000";
}

async function selectCustomThreadColor(
  api: PlatformApi,
  state: ThreadColorState,
  threadId: string,
): Promise<void> {
  if (
    state.generation !== activationGeneration ||
    state.currentThread?.threadId !== threadId
  ) {
    return;
  }
  cancelPicker(state);
  const scheme = api.appearance.getColorScheme();
  const session = api.appearance.openColorPicker({
    initialColor: initialPickerColor(state, threadId, scheme),
    title: "Custom thread color",
    onChange(color) {
      if (
        state.generation !== activationGeneration ||
        state.currentThread?.threadId !== threadId
      ) {
        return;
      }
      appearanceRegistration?.update(
        propertiesForBackground(customThemeColors(color, scheme)),
      );
    },
  });
  state.picker = { threadId, session };
  const confirmed = await session.result;
  if (
    state.generation !== activationGeneration ||
    state.picker?.session !== session
  ) {
    return;
  }
  state.picker = undefined;
  if (confirmed === undefined) {
    applyCurrentThreadColor(state);
    return;
  }
  state.selections.set(threadId, {
    kind: "custom",
    colors: customThemeColors(confirmed, scheme),
  });
  applyCurrentThreadColor(state);
  persistSelections(state);
}

async function initialize(api: PlatformApi, state: ThreadColorState): Promise<void> {
  const selections = await readSelections(state.storage);
  if (state.generation !== activationGeneration) return;
  state.selections = selections;
  state.loaded = true;
  applyCurrentThreadColor(state);
  menuRegistration = api.menus.thread.transformItems((items, context) => {
    const selection = state.selections.get(context.threadId);
    return transformThreadMenuItems(
      items,
      (color) => selectThreadColor(state, context.threadId, color),
      () => {
        void selectCustomThreadColor(api, state, context.threadId).catch(
          (error) =>
            console.error(
              `[${EXTENSION_ID}] failed to select a custom color`,
              error,
            ),
        );
      },
      selection?.kind === "custom" ? selection.colors : undefined,
    );
  });
}

export function activate(api: PlatformApi): void {
  const generation = ++activationGeneration;
  const state: ThreadColorState = {
    generation,
    storage: createExtensionStorage(EXTENSION_ID),
    selections: new Map(),
    currentThread: api.threads.getCurrent(),
    picker: undefined,
    loaded: false,
    write: Promise.resolve(),
  };
  activeState = state;
  const header = api.appearance.header.registerProperties({});
  appearanceRegistration = header;
  currentThreadRegistration = api.threads.subscribe((thread) => {
    if (state.picker && state.picker.threadId !== thread?.threadId) {
      cancelPicker(state);
    }
    state.currentThread = thread;
    applyCurrentThreadColor(state);
  });
  void initialize(api, state).catch((error) =>
    console.error(`[${EXTENSION_ID}] activation failed`, error),
  );
}

export function deactivate(): void {
  activationGeneration += 1;
  if (activeState) cancelPicker(activeState);
  activeState = undefined;
  menuRegistration?.dispose();
  menuRegistration = undefined;
  currentThreadRegistration?.dispose();
  currentThreadRegistration = undefined;
  appearanceRegistration?.dispose();
  appearanceRegistration = undefined;
}
