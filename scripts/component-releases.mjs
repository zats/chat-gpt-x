import { execFileSync } from "node:child_process";
import {
  existsSync,
  readFileSync,
  readdirSync,
  statSync,
} from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const repositoryRoot = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  "..",
);
const versionPattern = /^(0|[1-9]\d*)\.(0|[1-9]\d*)\.(0|[1-9]\d*)$/;
const chatgptPattern = /^\d+(?:\.\d+)+$/;

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
  validateUpdateIndex(latest, {
    platform,
    bindingManifests,
    extensionManifests,
  });

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
      ...latest.extensions[id],
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
    schemaVersion: 2,
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
    if (
      typeof manifest.compatibility?.chatgpt !== "string" ||
      typeof manifest.compatibility?.chatgptApi !== "string"
    ) {
      throw new Error(
        `Extension ${entry.name} must declare chatgpt and chatgptApi compatibility`,
      );
    }
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
      "releaseBaseURL",
      "chatgptApis",
      "bindings",
      "extensions",
    ],
    "updates/latest.json",
  );
  if (latest.schemaVersion !== 2) {
    throw new Error("updates/latest.json schemaVersion must be 2");
  }
  if (
    latest.releaseBaseURL !==
    "https://github.com/zats/chat-gpt-x/releases/download"
  ) {
    throw new Error("updates/latest.json releaseBaseURL is invalid");
  }

  const requiredApiVersions = new Set([platform.version]);
  for (const manifest of bindingManifests.values()) {
    requiredApiVersions.add(manifest.chatgptApi);
  }
  requireExactIds(
    latest.chatgptApis,
    [...requiredApiVersions],
    "ChatGPT API",
  );
  for (const version of requiredApiVersions) {
    requireVersion(version, `ChatGPT API ${version} version`);
    validateReleaseEntry(
      latest.chatgptApis[version],
      releaseTag({ kind: "chatgptApi", version }),
      `ChatGPT API ${version}`,
    );
  }

  requireExactIds(
    latest.bindings,
    [...bindingManifests.keys()],
    "binding",
  );
  for (const [chatgpt, manifest] of bindingManifests) {
    const entry = latest.bindings[chatgpt];
    requireExactKeys(
      entry,
      ["version", "chatgptApi", "release", "sha256"],
      `binding ${chatgpt}`,
    );
    if (
      entry.version !== manifest.version ||
      entry.chatgptApi !== manifest.chatgptApi
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
  for (const [id, manifest] of publicExtensions) {
    const entry = latest.extensions[id];
    requireExactKeys(
      entry,
      ["version", "compatibility", "release", "sha256"],
      `extension ${id}`,
    );
    if (entry.version !== manifest.version) {
      throw new Error(`updates/latest.json extension ${id} is stale`);
    }
    requireExactObject(
      entry.compatibility,
      manifest.compatibility,
      `extension ${id} compatibility`,
    );
    validateReleaseEntry(
      entry,
      releaseTag({ kind: "extension", id, version: manifest.version }),
      `extension ${id}`,
      false,
    );
  }
}

function validateReleaseEntry(entry, expectedRelease, label, exact = true) {
  if (exact) {
    requireExactKeys(entry, ["release", "sha256"], label);
  }
  if (entry.release !== expectedRelease) {
    throw new Error(`${label} release must be ${expectedRelease}`);
  }
  if (!/^[0-9a-f]{64}$/.test(entry.sha256 ?? "")) {
    throw new Error(`${label} sha256 must be 64 lowercase hexadecimal digits`);
  }
}

function requireExactIds(actual, expectedIds, label) {
  if (!actual || typeof actual !== "object" || Array.isArray(actual)) {
    throw new Error(`updates/latest.json ${label} entries must be an object`);
  }
  const actualIds = Object.keys(actual).sort();
  const sortedExpectedIds = [...expectedIds].sort();
  if (JSON.stringify(actualIds) !== JSON.stringify(sortedExpectedIds)) {
    throw new Error(
      `updates/latest.json must contain every ${label} exactly once`,
    );
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
