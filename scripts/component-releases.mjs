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
  return (
    !plannerExisted ||
    previousLatest === null ||
    typeof previousLatest.chatgptApi?.release !== "string"
  );
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
  const hasComponentChanges =
    affected.chatgptApi ||
    affected.bindings.size > 0 ||
    affected.extensions.size > 0;

  validateGeneration({
    affected: hasComponentChanges,
    bootstrap,
    changedPaths,
    latest,
    previousLatest,
  });

  const platform = readJson(root, "src/platform/manifest.json");
  requireVersion(platform.version, "src/platform/manifest.json version");
  validateLatestApi(latest, platform.version);

  if (affected.chatgptApi && !bootstrap) {
    const previous = readJsonAtRevision(
      root,
      base,
      "src/platform/manifest.json",
    );
    requireVersion(previous?.version, "previous ChatGPT API version");
    requireIncrement(previous.version, platform.version, "ChatGPT API");
  }

  const bindingManifests = readBindingManifests(root);
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
        release: releaseTag({
          kind: "binding",
          chatgpt,
          version: manifest.version,
        }),
      };
    });

  validateLatestBinding(latest, bindingManifests, bindings);

  const extensionManifests = readExtensionManifests(root);
  validateLatestExtensions(latest, extensionManifests);
  const extensions = [...affected.extensions].sort().map((id) => {
    const manifest = extensionManifests.get(id);
    if (!manifest) throw new Error(`Missing extension ${id}`);
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
    return {
      kind: "extension",
      id,
      version: manifest.version,
      release: releaseTag({
        kind: "extension",
        id,
        version: manifest.version,
      }),
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
    schemaVersion: 1,
    generation: latest.generation,
    base,
    head,
    changedPaths,
    chatgptApi: affected.chatgptApi
      ? {
          kind: "chatgptApi",
          version: platform.version,
          release: releaseTag({
            kind: "chatgptApi",
            version: platform.version,
          }),
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
  let utilitiesChanged = false;

  for (const filePath of changedPaths) {
    const component = classifyPath(filePath);
    if (!component) continue;
    if (component.kind === "chatgptApi") affected.chatgptApi = true;
    else if (component.kind === "binding") {
      affected.bindings.add(component.chatgpt);
    } else if (component.kind === "extension") {
      affected.extensions.add(component.id);
    } else if (component.kind === "utilities") {
      utilitiesChanged = true;
    }
  }

  if (utilitiesChanged) {
    for (const id of findUtilityConsumers(root)) {
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

function findUtilityConsumers(root) {
  const extensionsRoot = path.join(root, "src/extensions");
  return readdirSync(extensionsRoot, { withFileTypes: true })
    .filter((entry) => entry.isDirectory())
    .filter((entry) => {
      const directory = path.join(extensionsRoot, entry.name);
      return walkFiles(directory).some((filePath) => {
        if (!/\.[cm]?[jt]sx?$/.test(filePath)) return false;
        return readFileSync(filePath, "utf8").includes("platform/utilities/");
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
  latest,
  previousLatest,
}) {
  if (!Number.isSafeInteger(latest.generation) || latest.generation < 1) {
    throw new Error("updates/latest.json generation must be a positive integer");
  }
  const latestChanged = changedPaths.includes("updates/latest.json");
  if (affected && !latestChanged && !bootstrap) {
    throw new Error("Component changes must update updates/latest.json");
  }
  if (!affected && latestChanged) {
    throw new Error(
      "updates/latest.json changed without an API, binding, or extension change",
    );
  }
  if (affected && !bootstrap) {
    const expected = previousLatest.generation + 1;
    if (latest.generation !== expected) {
      throw new Error(
        `updates/latest.json generation must increase to ${expected}`,
      );
    }
  }
}

function validateLatestApi(latest, version) {
  const expected = {
    version,
    release: releaseTag({ kind: "chatgptApi", version }),
  };
  requireExactObject(latest.chatgptApi, expected, "latest ChatGPT API");
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

function validateLatestBinding(latest, manifests, affected) {
  const entry = latest.binding;
  requireVersion(entry?.version, "latest binding version");
  requireChatGPT(entry?.chatgpt, "latest binding ChatGPT version");
  requireVersion(entry?.chatgptApi, "latest binding ChatGPT API version");
  const manifest = manifests.get(entry.chatgpt);
  if (
    !manifest ||
    manifest.version !== entry.version ||
    manifest.chatgptApi !== entry.chatgptApi
  ) {
    throw new Error("updates/latest.json binding does not match its manifest");
  }
  const expectedRelease = releaseTag({
    kind: "binding",
    chatgpt: entry.chatgpt,
    version: entry.version,
  });
  if (entry.release !== expectedRelease) {
    throw new Error(
      `updates/latest.json binding release must be ${expectedRelease}`,
    );
  }
  if (
    affected.length > 0 &&
    !affected.some(
      (binding) =>
        binding.chatgpt === entry.chatgpt &&
        binding.version === entry.version,
    )
  ) {
    throw new Error(
      "updates/latest.json binding must identify an affected binding",
    );
  }
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

function validateLatestExtensions(latest, manifests) {
  const entries = latest.extensions;
  if (!entries || typeof entries !== "object" || Array.isArray(entries)) {
    throw new Error("updates/latest.json extensions must be an object");
  }
  const expectedIds = [...manifests.keys()].sort();
  const actualIds = Object.keys(entries).sort();
  if (JSON.stringify(actualIds) !== JSON.stringify(expectedIds)) {
    throw new Error(
      "updates/latest.json extensions must contain every extension exactly once",
    );
  }
  for (const id of expectedIds) {
    const version = manifests.get(id).version;
    requireExactObject(
      entries[id],
      {
        version,
        release: releaseTag({ kind: "extension", id, version }),
      },
      `latest extension ${id}`,
    );
  }
}

function requireExactObject(actual, expected, label) {
  if (
    !actual ||
    typeof actual !== "object" ||
    Array.isArray(actual) ||
    JSON.stringify(Object.keys(actual).sort()) !==
      JSON.stringify(Object.keys(expected).sort())
  ) {
    throw new Error(`${label} has unexpected fields`);
  }
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
