import { execFileSync } from "node:child_process";
import {
  existsSync,
  readFileSync,
  readdirSync,
  statSync,
} from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { isDeepStrictEqual } from "node:util";

const repositoryRoot = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  "..",
);
const versionPattern = /^(0|[1-9]\d*)\.(0|[1-9]\d*)\.(0|[1-9]\d*)$/;
const chatgptPattern = /^\d+(?:\.\d+)+$/;
const minimumRemoteAPIVersion = "1.0.3";
const unpublishedSchema2Manager = {
  id: "extensions",
  version: "0.1.0",
  chatgptApi: "^1.1.0",
  release: "extension-extensions-v0.1.0",
  sha256: "45ae6c2ac40a8792d95a33d7d74ef293427f3d2e17d5724f52548a09a950802c",
};

export function compareVersions(left, right) {
  const leftParts = parseVersion(left);
  const rightParts = parseVersion(right);
  for (let index = 0; index < leftParts.length; index += 1) {
    if (leftParts[index] !== rightParts[index]) {
      return leftParts[index] - rightParts[index];
    }
  }
  return 0;
}

export function releaseTag(component) {
  switch (component.kind) {
    case "chatgptApi":
      return `chatgpt-api-v${component.version}`;
    case "binding":
      return `binding-${component.chatgpt}-v${component.version}`;
    case "extension":
      return `extension-${component.id}-v${component.version}`;
    default:
      throw new Error(`Unknown component kind: ${component.kind}`);
  }
}

export function isBootstrap(previousLatest, plannerExisted) {
  return !plannerExisted || previousLatest === null;
}

export function classifyPath(filePath) {
  if (
    filePath === "src/platform/manifest.json" ||
    filePath === "src/platform/types.d.ts" ||
    filePath.startsWith("src/platform/bridge/") ||
    filePath.startsWith("src/platform/runtime/")
  ) {
    return { kind: "chatgptApi" };
  }

  const binding = /^src\/platform\/bindings\/(\d+(?:\.\d+)+)\//.exec(
    filePath,
  );
  if (binding) return { kind: "binding", chatgpt: binding[1] };

  const extension = /^src\/extensions\/([^/]+)\//.exec(filePath);
  if (extension) return { kind: "extension", id: extension[1] };

  if (filePath.startsWith("src/platform/utilities/")) {
    return { kind: "utilities" };
  }

  return null;
}

export function createReleasePlan({
  base,
  head,
  root = repositoryRoot,
}) {
  const changedPaths = readChangedPaths(base, head, root);
  const affected = classifyChanges(changedPaths, root);
  const latest = readJson(root, "updates/latest.json");
  const previousLatest = readJsonAtRevision(
    root,
    base,
    "updates/latest.json",
  );
  const bootstrap = isBootstrap(
    previousLatest,
    revisionHasPath(root, base, "scripts/component-releases.mjs"),
  );
  if (bootstrap) markAllComponentsAffected(affected, root);

  const platform = readJson(root, "src/platform/manifest.json");
  requireVersion(platform.version, "src/platform/manifest.json version");
  const bindingManifests = readBindingManifests(root);
  const extensionManifests = readExtensionManifests(root);
  for (const chatgpt of [...affected.bindings]) {
    if (bindingManifests.has(chatgpt)) continue;
    const previous = readJsonAtRevision(
      root,
      base,
      `src/platform/bindings/${chatgpt}/manifest.json`,
    );
    if (
      previous?.chatgptApi &&
      compareVersions(previous.chatgptApi, minimumRemoteAPIVersion) < 0
    ) {
      affected.bindings.delete(chatgpt);
    }
  }
  validateUpdateIndex(latest, {
    platform,
    bindingManifests,
    extensionManifests,
  });
  if (!bootstrap) {
    validateCatalogHistory(latest, previousLatest, affected.bindings);
  }

  const publicAffectedExtensionIds = [...affected.extensions]
    .filter((id) => {
      const manifest = extensionManifests.get(id);
      if (manifest) return manifest.private !== true;
      const previous = readJsonAtRevision(
        root,
        base,
        `src/extensions/${id}/package.json`,
      );
      return previous?.private !== true;
    })
    .sort();
  const hasPublishedComponentChanges =
    affected.chatgptApi ||
    affected.bindings.size > 0 ||
    publicAffectedExtensionIds.length > 0;
  const indexMigration =
    !bootstrap && previousLatest?.schemaVersion !== latest.schemaVersion;

  validateGeneration({
    affected: hasPublishedComponentChanges,
    bootstrap,
    changedPaths,
    indexMigration,
    latest,
    previousLatest,
  });

  if (affected.chatgptApi && !bootstrap) {
    const previous = readJsonAtRevision(
      root,
      base,
      "src/platform/manifest.json",
    );
    requireVersion(previous?.version, "previous ChatGPT API version");
    requireIncrement(previous.version, platform.version, "ChatGPT API");
  }

  const pinned = readJson(root, "src/platform/bindings/manifest.json");
  requireChatGPT(pinned.chatgpt, "pinned ChatGPT version");
  const pinnedBinding = bindingManifests.get(pinned.chatgpt);
  if (!pinnedBinding) {
    throw new Error(`Missing pinned binding ${pinned.chatgpt}`);
  }
  if (pinnedBinding.chatgptApi !== platform.version) {
    throw new Error(
      `Pinned binding ${pinned.chatgpt} must use ChatGPT API ${platform.version}`,
    );
  }

  const bindings = [...affected.bindings]
    .sort(compareChatGPTVersions)
    .map((chatgpt) => {
      const manifest = bindingManifests.get(chatgpt);
      if (!manifest) throw new Error(`Missing binding ${chatgpt}`);
      if (!bootstrap) {
        const previous = readJsonAtRevision(
          root,
          base,
          `src/platform/bindings/${chatgpt}/manifest.json`,
        );
        if (previous) {
          requireVersion(
            previous.version,
            `previous binding ${chatgpt} version`,
          );
          requireIncrement(
            previous.version,
            manifest.version,
            `Binding ${chatgpt}`,
          );
        }
      }
      return {
        kind: "binding",
        chatgpt,
        version: manifest.version,
        chatgptApi: manifest.chatgptApi,
        asarSha256: manifest.asarSha256,
        ...latest.bindings[chatgpt],
      };
    });

  for (const id of [...affected.extensions].sort()) {
    const manifest = extensionManifests.get(id);
    if (!manifest) {
      const previous = readJsonAtRevision(
        root,
        base,
        `src/extensions/${id}/package.json`,
      );
      if (previous?.private === true) continue;
      throw new Error(`Missing extension ${id}`);
    }
    if (!bootstrap) {
      const previous = readJsonAtRevision(
        root,
        base,
        `src/extensions/${id}/package.json`,
      );
      if (previous) {
        requireVersion(previous.version, `previous extension ${id} version`);
        requireIncrement(
          previous.version,
          manifest.version,
          `Extension ${id}`,
        );
      }
    }
  }

  const extensions = publicAffectedExtensionIds.map((id) => {
    const manifest = extensionManifests.get(id);
    return {
      kind: "extension",
      id,
      version: manifest.version,
      ...latest.extensions[id].versions[manifest.version],
    };
  });

  if (affected.chatgptApi && !bootstrap) {
    if (!affected.bindings.has(pinned.chatgpt)) {
      throw new Error(
        `ChatGPT API changes must update binding ${pinned.chatgpt}`,
      );
    }
    if (!affected.extensions.has("api-test-suite")) {
      throw new Error(
        "ChatGPT API changes must update the api-test-suite extension",
      );
    }
  }

  return {
    schemaVersion: 3,
    generation: latest.generation,
    base,
    head,
    changedPaths,
    chatgptApi: affected.chatgptApi
      ? {
          kind: "chatgptApi",
          version: platform.version,
          ...latest.chatgptApis[platform.version],
        }
      : null,
    bindings,
    extensions,
  };
}

function parseVersion(value) {
  const match = versionPattern.exec(value ?? "");
  if (!match) throw new Error(`Invalid semantic version: ${value}`);
  return match.slice(1).map(Number);
}

function requireVersion(value, label) {
  if (!versionPattern.test(value ?? "")) {
    throw new Error(`${label} must be major.minor.patch`);
  }
}

function requireChatGPT(value, label) {
  if (!chatgptPattern.test(value ?? "")) {
    throw new Error(`${label} must contain numeric dot-separated components`);
  }
}

function requireIncrement(previous, current, label) {
  if (compareVersions(current, previous) <= 0) {
    throw new Error(
      `${label} version must increase from ${previous}; received ${current}`,
    );
  }
}

function compareChatGPTVersions(left, right) {
  const leftParts = left.split(".").map(Number);
  const rightParts = right.split(".").map(Number);
  const count = Math.max(leftParts.length, rightParts.length);
  for (let index = 0; index < count; index += 1) {
    const difference = (leftParts[index] ?? 0) - (rightParts[index] ?? 0);
    if (difference !== 0) return difference;
  }
  return 0;
}

function readChangedPaths(base, head, root) {
  const paths =
    head === "--worktree"
      ? [
          ...gitLines(root, [
            "diff",
            "--name-only",
            "--diff-filter=ACDMRTUXB",
            base,
          ]),
          ...gitLines(root, ["ls-files", "--others", "--exclude-standard"]),
        ]
      : gitLines(root, [
          "diff",
          "--name-only",
          "--diff-filter=ACDMRTUXB",
          base,
          head,
        ]);
  return [...new Set(paths)].sort();
}

function gitLines(root, arguments_) {
  const output = execFileSync("git", arguments_, {
    cwd: root,
    encoding: "utf8",
  });
  return output.split("\n").filter(Boolean);
}

function classifyChanges(changedPaths, root) {
  const affected = {
    chatgptApi: false,
    bindings: new Set(),
    extensions: new Set(),
  };
  const changedUtilities = new Set();

  for (const filePath of changedPaths) {
    const component = classifyPath(filePath);
    if (!component) continue;
    if (component.kind === "chatgptApi") affected.chatgptApi = true;
    else if (component.kind === "binding") {
      affected.bindings.add(component.chatgpt);
    } else if (component.kind === "extension") {
      affected.extensions.add(component.id);
    } else if (component.kind === "utilities") {
      changedUtilities.add(filePath);
    }
  }

  if (changedUtilities.size > 0) {
    for (const id of findUtilityConsumers(root, changedUtilities)) {
      affected.extensions.add(id);
    }
  }

  return affected;
}

function markAllComponentsAffected(affected, root) {
  affected.chatgptApi = true;

  for (const entry of readdirSync(
    path.join(root, "src/platform/bindings"),
    { withFileTypes: true },
  )) {
    if (entry.isDirectory() && chatgptPattern.test(entry.name)) {
      affected.bindings.add(entry.name);
    }
  }

  for (const entry of readdirSync(path.join(root, "src/extensions"), {
    withFileTypes: true,
  })) {
    if (
      entry.isDirectory() &&
      existsSync(path.join(root, "src/extensions", entry.name, "package.json"))
    ) {
      affected.extensions.add(entry.name);
    }
  }
}

export function findUtilityConsumers(root, changedUtilities) {
  const importTokens = [...changedUtilities]
    .filter((filePath) => /\.[cm]?[jt]sx?$/.test(filePath))
    .map((filePath) =>
      filePath
        .replace(/^src\//, "")
        .replace(/\.[cm]?[jt]sx?$/, ""),
    );
  const extensionsRoot = path.join(root, "src/extensions");
  return readdirSync(extensionsRoot, { withFileTypes: true })
    .filter((entry) => entry.isDirectory())
    .filter((entry) => {
      const directory = path.join(extensionsRoot, entry.name);
      return walkFiles(directory).some((filePath) => {
        if (!/\.[cm]?[jt]sx?$/.test(filePath)) return false;
        const source = readFileSync(filePath, "utf8");
        return importTokens.some((token) => source.includes(token));
      });
    })
    .map((entry) => entry.name);
}

function walkFiles(directory) {
  const files = [];
  for (const entry of readdirSync(directory, { withFileTypes: true })) {
    const entryPath = path.join(directory, entry.name);
    if (entry.isDirectory()) files.push(...walkFiles(entryPath));
    else if (entry.isFile()) files.push(entryPath);
  }
  return files;
}

function validateGeneration({
  affected,
  bootstrap,
  changedPaths,
  indexMigration,
  latest,
  previousLatest,
}) {
  if (!Number.isSafeInteger(latest.generation) || latest.generation < 1) {
    throw new Error("updates/latest.json generation must be a positive integer");
  }
  const latestChanged = changedPaths.includes("updates/latest.json");
  const requiresIndexChange = affected || indexMigration;
  if (requiresIndexChange && !latestChanged && !bootstrap) {
    throw new Error("Component changes must update updates/latest.json");
  }
  if (!requiresIndexChange && latestChanged && !bootstrap) {
    throw new Error(
      "updates/latest.json changed without an API, binding, or extension change",
    );
  }
  if (requiresIndexChange && !bootstrap) {
    const expected = previousLatest.generation + 1;
    if (latest.generation !== expected) {
      throw new Error(
        `updates/latest.json generation must increase to ${expected}`,
      );
    }
  }
}

function readBindingManifests(root) {
  const bindingsRoot = path.join(root, "src/platform/bindings");
  const manifests = new Map();
  for (const entry of readdirSync(bindingsRoot, { withFileTypes: true })) {
    if (!entry.isDirectory() || !chatgptPattern.test(entry.name)) continue;
    const manifest = readJson(
      root,
      `src/platform/bindings/${entry.name}/manifest.json`,
    );
    requireVersion(manifest.version, `binding ${entry.name} version`);
    requireChatGPT(manifest.chatgpt, `binding ${entry.name} ChatGPT version`);
    requireVersion(
      manifest.chatgptApi,
      `binding ${entry.name} ChatGPT API version`,
    );
    requireSha256(
      manifest.asarSha256,
      `binding ${entry.name} app.asar sha256`,
    );
    if (manifest.chatgpt !== entry.name) {
      throw new Error(`Binding ${entry.name} manifest has wrong chatgpt value`);
    }
    manifests.set(entry.name, manifest);
  }
  return manifests;
}

function readExtensionManifests(root) {
  const extensionsRoot = path.join(root, "src/extensions");
  const manifests = new Map();
  for (const entry of readdirSync(extensionsRoot, { withFileTypes: true })) {
    if (!entry.isDirectory()) continue;
    const manifestPath = `src/extensions/${entry.name}/package.json`;
    if (!existsSync(path.join(root, manifestPath))) continue;
    const manifest = readJson(root, manifestPath);
    if (manifest.id !== entry.name) {
      throw new Error(`Extension ${entry.name} manifest has wrong id`);
    }
    requireVersion(manifest.version, `extension ${entry.name} version`);
    if (manifest.main !== "contents/main.js") {
      throw new Error(`Extension ${entry.name} main must be contents/main.js`);
    }
    validateExtensionCompatibility(
      manifest.compatibility,
      `extension ${entry.name}`,
    );
    manifests.set(entry.name, manifest);
  }
  return manifests;
}

export function validateUpdateIndex(
  latest,
  { platform, bindingManifests, extensionManifests },
) {
  requireExactKeys(
    latest,
    [
      "schemaVersion",
      "generation",
      "minimumLauncherVersion",
      "releaseBaseURL",
      "chatgptApis",
      "bindings",
      "extensions",
    ],
    "updates/latest.json",
  );
  if (latest.schemaVersion !== 3) {
    throw new Error("updates/latest.json schemaVersion must be 3");
  }
  requireVersion(
    latest.minimumLauncherVersion,
    "updates/latest.json minimumLauncherVersion",
  );
  if (
    latest.releaseBaseURL !==
    "https://github.com/zats/chat-gpt-x/releases/download"
  ) {
    throw new Error("updates/latest.json releaseBaseURL is invalid");
  }

  requireObject(latest.bindings, "binding entries");
  requireExactIds(
    latest.bindings,
    [...bindingManifests.keys()],
    "binding",
  );
  const requiredApiVersions = new Set([platform.version]);
  for (const entry of Object.values(latest.bindings)) {
    requiredApiVersions.add(entry.chatgptApi);
  }
  requireObject(latest.chatgptApis, "ChatGPT API entries");
  for (const version of requiredApiVersions) {
    if (!latest.chatgptApis[version]) {
      throw new Error(
        `updates/latest.json is missing ChatGPT API ${version}`,
      );
    }
  }
  for (const [version, entry] of Object.entries(latest.chatgptApis)) {
    requireVersion(version, `ChatGPT API ${version} version`);
    if (compareVersions(version, minimumRemoteAPIVersion) < 0) {
      throw new Error(
        `ChatGPT API ${version} cannot load remote binding packages`,
      );
    }
    validateReleaseEntry(
      entry,
      releaseTag({ kind: "chatgptApi", version }),
      `ChatGPT API ${version}`,
    );
  }

  for (const [chatgpt, entry] of Object.entries(latest.bindings)) {
    const manifest = bindingManifests.get(chatgpt);
    if (!manifest) {
      throw new Error(`updates/latest.json has unknown binding ${chatgpt}`);
    }
    requireExactKeys(
      entry,
      ["version", "chatgptApi", "asarSha256", "release", "sha256"],
      `binding ${chatgpt}`,
    );
    if (
      entry.version !== manifest.version ||
      entry.chatgptApi !== manifest.chatgptApi ||
      entry.asarSha256 !== manifest.asarSha256
    ) {
      throw new Error(`updates/latest.json binding ${chatgpt} is stale`);
    }
    validateReleaseEntry(
      entry,
      releaseTag({
        kind: "binding",
        chatgpt,
        version: manifest.version,
      }),
      `binding ${chatgpt}`,
      false,
    );
  }

  const publicExtensions = [...extensionManifests]
    .filter(([, manifest]) => manifest.private !== true)
    .sort(([left], [right]) => left.localeCompare(right));
  requireExactIds(
    latest.extensions,
    publicExtensions.map(([id]) => id),
    "public extension",
  );
  for (const [id, extension] of Object.entries(latest.extensions)) {
    requireExactKeys(extension, ["versions"], `extension ${id}`);
    requireObject(extension.versions, `extension ${id} versions`);
    const versions = Object.keys(extension.versions);
    if (versions.length === 0) {
      throw new Error(`extension ${id} must contain at least one version`);
    }
    for (const version of versions) {
      requireVersion(version, `extension ${id} version`);
      const entry = extension.versions[version];
      requireExactKeys(
        entry,
        ["compatibility", "release", "sha256"],
        `extension ${id} ${version}`,
      );
      validateExtensionCompatibility(
        entry.compatibility,
        `extension ${id} ${version}`,
      );
      validateReleaseEntry(
        entry,
        releaseTag({ kind: "extension", id, version }),
        `extension ${id} ${version}`,
        false,
      );
    }
  }
  for (const [id, manifest] of publicExtensions) {
    const versions = latest.extensions[id]?.versions;
    if (!versions) {
      throw new Error(
        `updates/latest.json is missing public extension ${id}`,
      );
    }
    const catalogVersions = Object.keys(versions).sort(compareVersions);
    const latestVersion = catalogVersions.at(-1);
    if (latestVersion !== manifest.version) {
      throw new Error(`updates/latest.json extension ${id} is stale`);
    }
    const entry = versions[manifest.version];
    requireExactObject(
      entry.compatibility,
      manifest.compatibility,
      `extension ${id} compatibility`,
    );
  }
}

export function validateCatalogHistory(
  latest,
  previousLatest,
  affectedBindings = new Set(),
) {
  if (!previousLatest || ![2, 3].includes(previousLatest.schemaVersion)) {
    throw new Error("previous updates/latest.json schemaVersion must be 2 or 3");
  }

  for (const [version, previousEntry] of Object.entries(
    previousLatest.chatgptApis ?? {},
  )) {
    if (compareVersions(version, minimumRemoteAPIVersion) < 0) continue;
    const currentEntry = latest.chatgptApis?.[version];
    if (!currentEntry) {
      throw new Error(
        `updates/latest.json must retain ChatGPT API ${version}`,
      );
    }
    if (!isDeepStrictEqual(currentEntry, previousEntry)) {
      throw new Error(
        `updates/latest.json must not change ChatGPT API ${version}`,
      );
    }
  }

  for (const [chatgpt, previousEntry] of Object.entries(
    previousLatest.bindings ?? {},
  )) {
    if (
      compareVersions(previousEntry.chatgptApi, minimumRemoteAPIVersion) < 0
    ) {
      continue;
    }
    const currentEntry = latest.bindings?.[chatgpt];
    if (!currentEntry) {
      throw new Error(
        `updates/latest.json must retain binding ${chatgpt}`,
      );
    }
    if (
      affectedBindings.has(chatgpt) &&
      compareVersions(currentEntry.version, previousEntry.version) > 0
    ) {
      continue;
    }
    const comparableCurrent =
      previousLatest.schemaVersion === 2
        ? {
            version: currentEntry.version,
            chatgptApi: currentEntry.chatgptApi,
            release: currentEntry.release,
            sha256: currentEntry.sha256,
          }
        : currentEntry;
    if (!isDeepStrictEqual(comparableCurrent, previousEntry)) {
      throw new Error(
        `updates/latest.json must not change binding ${chatgpt} without a version increment`,
      );
    }
  }

  for (const [id, previousExtension] of Object.entries(
    previousLatest.extensions ?? {},
  )) {
    const previousVersions =
      previousLatest.schemaVersion === 2
        ? {
            [previousExtension.version]: {
              compatibility: {
                chatgptApi: previousExtension.compatibility?.chatgptApi,
              },
              release: previousExtension.release,
              sha256: previousExtension.sha256,
            },
          }
        : previousExtension.versions;

    for (const [version, previousEntry] of Object.entries(
      previousVersions ?? {},
    )) {
      const currentEntry = latest.extensions?.[id]?.versions?.[version];
      if (
        !currentEntry &&
        previousLatest.schemaVersion === 2 &&
        latest.schemaVersion === 3 &&
        id === unpublishedSchema2Manager.id &&
        version === unpublishedSchema2Manager.version &&
        previousEntry.compatibility?.chatgptApi ===
          unpublishedSchema2Manager.chatgptApi &&
        previousEntry.release === unpublishedSchema2Manager.release &&
        previousEntry.sha256 === unpublishedSchema2Manager.sha256
      ) {
        continue;
      }
      if (!currentEntry) {
        throw new Error(
          `updates/latest.json must retain extension ${id} ${version}`,
        );
      }
      if (!isDeepStrictEqual(currentEntry, previousEntry)) {
        throw new Error(
          `updates/latest.json must not change extension ${id} ${version}`,
        );
      }
    }
  }
}

function validateReleaseEntry(entry, expectedRelease, label, exact = true) {
  if (exact) {
    requireExactKeys(entry, ["release", "sha256"], label);
  }
  if (entry.release !== expectedRelease) {
    throw new Error(`${label} release must be ${expectedRelease}`);
  }
  requireSha256(entry.sha256, `${label} sha256`);
}

function validateExtensionCompatibility(compatibility, label) {
  requireExactKeys(compatibility, ["chatgptApi"], `${label} compatibility`);
  if (!isSemverRange(compatibility.chatgptApi)) {
    throw new Error(`${label} must declare chatgptApi compatibility`);
  }
}

function isSemverRange(value) {
  if (
    typeof value !== "string" ||
    value.length === 0 ||
    value.trim() !== value
  ) {
    return false;
  }
  if (value.startsWith("^")) {
    return versionPattern.test(value.slice(1));
  }
  return value.split(/\s+/).every((condition) => {
    const version = condition.replace(/^(?:>=|<=|>|<)/, "");
    return versionPattern.test(version);
  });
}

function requireSha256(value, label) {
  if (!/^[0-9a-f]{64}$/.test(value ?? "")) {
    throw new Error(`${label} must be 64 lowercase hexadecimal digits`);
  }
}

function requireExactIds(actual, expectedIds, label) {
  requireObject(actual, `${label} entries`);
  const actualIds = Object.keys(actual).sort();
  const sortedExpectedIds = [...expectedIds].sort();
  if (JSON.stringify(actualIds) !== JSON.stringify(sortedExpectedIds)) {
    throw new Error(
      `updates/latest.json must contain every ${label} exactly once`,
    );
  }
}

function requireObject(actual, label) {
  if (!actual || typeof actual !== "object" || Array.isArray(actual)) {
    throw new Error(`updates/latest.json ${label} must be an object`);
  }
}

function requireExactKeys(actual, expectedKeys, label) {
  if (
    !actual ||
    typeof actual !== "object" ||
    Array.isArray(actual) ||
    JSON.stringify(Object.keys(actual).sort()) !==
      JSON.stringify([...expectedKeys].sort())
  ) {
    throw new Error(`${label} has unexpected fields`);
  }
}

function requireExactObject(actual, expected, label) {
  requireExactKeys(actual, Object.keys(expected), label);
  for (const [key, value] of Object.entries(expected)) {
    if (actual[key] !== value) {
      throw new Error(`${label} ${key} must be ${value}`);
    }
  }
}

function readJson(root, filePath) {
  const absolutePath = path.join(root, filePath);
  if (!existsSync(absolutePath) || !statSync(absolutePath).isFile()) {
    throw new Error(`Missing ${filePath}`);
  }
  return JSON.parse(readFileSync(absolutePath, "utf8"));
}

function readJsonAtRevision(root, revision, filePath) {
  try {
    const contents = execFileSync(
      "git",
      ["show", `${revision}:${filePath}`],
      {
        cwd: root,
        encoding: "utf8",
        stdio: ["ignore", "pipe", "ignore"],
      },
    );
    return JSON.parse(contents);
  } catch {
    return null;
  }
}

function revisionHasPath(root, revision, filePath) {
  try {
    execFileSync("git", ["cat-file", "-e", `${revision}:${filePath}`], {
      cwd: root,
      stdio: "ignore",
    });
    return true;
  } catch {
    return false;
  }
}

function run() {
  const [base, head] = process.argv.slice(2);
  if (!base || !head) {
    throw new Error(
      "usage: node scripts/component-releases.mjs <base-sha> <head-sha|--worktree>",
    );
  }
  process.stdout.write(
    `${JSON.stringify(createReleasePlan({ base, head }), null, 2)}\n`,
  );
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  try {
    run();
  } catch (error) {
    process.stderr.write(`${error.message}\n`);
    process.exitCode = 1;
  }
}
