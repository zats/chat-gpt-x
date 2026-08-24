interface RuntimeBridge {
  request(method: string, parameters: Record<string, unknown>): Promise<unknown>;
}

declare global {
  var __CGPTX_RUNTIME__: RuntimeBridge | undefined;
}

export interface InstalledExtension {
  readonly id: string;
  readonly name: string;
  readonly description: string;
  readonly version: string;
  readonly enabled: boolean;
  readonly required: boolean;
  readonly settingsPaneId?: string;
}

export interface ExtensionManagement {
  list(): Promise<readonly InstalledExtension[]>;
  setEnabled(id: string, enabled: boolean): Promise<readonly InstalledExtension[]>;
}

const extensionIdPattern = /^[a-z0-9][a-z0-9._-]*$/i;

function runtime(): RuntimeBridge {
  if (!globalThis.__CGPTX_RUNTIME__) {
    throw new Error("ChatGPTX runtime is unavailable");
  }
  return globalThis.__CGPTX_RUNTIME__;
}

function normalizeExtensions(value: unknown): readonly InstalledExtension[] {
  if (!Array.isArray(value)) {
    throw new TypeError("Invalid installed extension listing");
  }
  const ids = new Set<string>();
  return Object.freeze(
    value.map((entry): InstalledExtension => {
      if (
        !entry ||
        typeof entry !== "object" ||
        !("id" in entry) ||
        typeof entry.id !== "string" ||
        !extensionIdPattern.test(entry.id) ||
        ids.has(entry.id) ||
        !("name" in entry) ||
        typeof entry.name !== "string" ||
        !("description" in entry) ||
        typeof entry.description !== "string" ||
        !("version" in entry) ||
        typeof entry.version !== "string" ||
        !("enabled" in entry) ||
        typeof entry.enabled !== "boolean" ||
        !("required" in entry) ||
        typeof entry.required !== "boolean" ||
        ("settingsPaneId" in entry &&
          entry.settingsPaneId !== undefined &&
          (typeof entry.settingsPaneId !== "string" ||
            !entry.settingsPaneId.startsWith(`${entry.id}.`)))
      ) {
        throw new TypeError("Invalid installed extension listing");
      }
      ids.add(entry.id);
      return Object.freeze({
        id: entry.id,
        name: entry.name,
        description: entry.description,
        version: entry.version,
        enabled: entry.enabled,
        required: entry.required,
        settingsPaneId:
          "settingsPaneId" in entry ? entry.settingsPaneId : undefined,
      });
    }),
  );
}

export function createExtensionManagement(
  authorization: string,
): ExtensionManagement {
  if (typeof authorization !== "string" || authorization.length === 0) {
    throw new TypeError("Extension manager authorization is required");
  }
  const runtimeBridge = runtime();
  return Object.freeze({
    async list(): Promise<readonly InstalledExtension[]> {
      return normalizeExtensions(
        await runtimeBridge.request("extensions.list", { authorization }),
      );
    },

    async setEnabled(
      id: string,
      enabled: boolean,
    ): Promise<readonly InstalledExtension[]> {
      if (!extensionIdPattern.test(id)) {
        throw new TypeError("Invalid extension id");
      }
      if (typeof enabled !== "boolean") {
        throw new TypeError("Extension enablement must be boolean");
      }
      return normalizeExtensions(
        await runtimeBridge.request("extensions.set-enabled", {
          authorization,
          extensionId: id,
          enabled,
        }),
      );
    },
  });
}
