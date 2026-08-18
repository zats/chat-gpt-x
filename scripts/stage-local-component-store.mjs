import {
  cpSync,
  existsSync,
  mkdirSync,
  readFileSync,
  readdirSync,
  writeFileSync,
} from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import {
  compareVersions,
  validateUpdateIndex,
} from "./component-releases.mjs";

const repositoryRoot = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  "..",
);

function readJson(filePath) {
  return JSON.parse(readFileSync(filePath, "utf8"));
}

function readManifests(parent, includeDirectory) {
  return new Map(
    readdirSync(parent, { withFileTypes: true })
      .filter(
        (entry) =>
          entry.isDirectory() &&
          includeDirectory(entry.name) &&
          existsSync(path.join(parent, entry.name, "manifest.json")),
      )
      .map((entry) => [
        entry.name,
        readJson(path.join(parent, entry.name, "manifest.json")),
      ]),
  );
}

function readExtensionManifests() {
  const parent = path.join(repositoryRoot, "src/extensions");
  return new Map(
    readdirSync(parent, { withFileTypes: true })
      .filter(
        (entry) =>
          entry.isDirectory() &&
          existsSync(path.join(parent, entry.name, "package.json")),
      )
      .map((entry) => [
        entry.name,
        readJson(path.join(parent, entry.name, "package.json")),
      ]),
  );
}

function writeJson(filePath, value) {
  writeFileSync(filePath, `${JSON.stringify(value, null, 2)}\n`, {
    mode: 0o600,
  });
}

function matchesVersionRange(version, range) {
  if (range.startsWith("^")) {
    const lower = range.slice(1);
    const [major, minor, patch] = lower.split(".").map(Number);
    const upper =
      major > 0
        ? `${major + 1}.0.0`
        : minor > 0
          ? `0.${minor + 1}.0`
          : `0.0.${patch + 1}`;
    return (
      compareVersions(version, lower) >= 0 &&
      compareVersions(version, upper) < 0
    );
  }
  return range.split(/\s+/).every((condition) => {
    const match = /^(>=|<=|>|<)?(.+)$/.exec(condition);
    const comparison = compareVersions(version, match[2]);
    switch (match[1] ?? "=") {
      case ">=":
        return comparison >= 0;
      case "<=":
        return comparison <= 0;
      case ">":
        return comparison > 0;
      case "<":
        return comparison < 0;
      default:
        return comparison === 0;
    }
  });
}

function run() {
  const [outputArgument, extensionBuildArgument] = process.argv.slice(2);
  if (!outputArgument || !extensionBuildArgument) {
    throw new Error(
      "usage: node scripts/stage-local-component-store.mjs <empty-store-directory> <extension-build-directory>",
    );
  }

  const output = path.resolve(outputArgument);
  const extensionBuildRoot = path.resolve(extensionBuildArgument);
  if (existsSync(output) && readdirSync(output).length !== 0) {
    throw new Error(`Store directory must be empty: ${output}`);
  }
  mkdirSync(output, { recursive: true, mode: 0o700 });

  const latest = readJson(path.join(repositoryRoot, "updates/latest.json"));
  const platform = readJson(
    path.join(repositoryRoot, "src/platform/manifest.json"),
  );
  const bindingManifests = readManifests(
    path.join(repositoryRoot, "src/platform/bindings"),
    (name) => /^\d+(?:\.\d+)+$/.test(name),
  );
  const extensionManifests = readExtensionManifests();
  validateUpdateIndex(latest, {
    platform,
    bindingManifests,
    extensionManifests,
  });

  const pinned = readJson(
    path.join(repositoryRoot, "src/platform/bindings/manifest.json"),
  );
  const binding = bindingManifests.get(pinned.chatgpt);
  const apiRelease = latest.chatgptApis[platform.version];
  const bindingRelease = latest.bindings[pinned.chatgpt];
  if (!binding || !apiRelease || !bindingRelease) {
    throw new Error("The pinned component set is not in updates/latest.json");
  }
  if (
    binding.chatgptApi !== platform.version ||
    bindingRelease.version !== binding.version ||
    bindingRelease.chatgptApi !== binding.chatgptApi ||
    bindingRelease.asarSha256 !== binding.asarSha256
  ) {
    throw new Error(`Pinned binding ${pinned.chatgpt} is stale`);
  }

  const apiPath = `components/chatgpt-api/${platform.version}`;
  const apiRoot = path.join(output, apiPath);
  mkdirSync(apiRoot, { recursive: true, mode: 0o700 });
  for (const relativePath of ["manifest.json", "types.d.ts"]) {
    cpSync(
      path.join(repositoryRoot, "src/platform", relativePath),
      path.join(apiRoot, relativePath),
    );
  }
  for (const directory of ["bridge", "runtime"]) {
    cpSync(
      path.join(repositoryRoot, "src/platform", directory),
      path.join(apiRoot, directory),
      { recursive: true },
    );
  }

  const bindingPath =
    `components/bindings/${pinned.chatgpt}/${binding.version}`;
  mkdirSync(path.dirname(path.join(output, bindingPath)), {
    recursive: true,
    mode: 0o700,
  });
  cpSync(
    path.join(repositoryRoot, "src/platform/bindings", pinned.chatgpt),
    path.join(output, bindingPath),
    { recursive: true },
  );

  const extensions = [...extensionManifests]
    .filter(([, manifest]) => manifest.private !== true)
    .sort(([left], [right]) => left.localeCompare(right))
    .flatMap(([id, manifest]) => {
      const release = latest.extensions[id]?.versions?.[manifest.version];
      if (
        !release ||
        !matchesVersionRange(
          platform.version,
          release.compatibility.chatgptApi,
        )
      ) {
        return [];
      }
      const builtRoot = path.join(extensionBuildRoot, id);
      if (
        !existsSync(path.join(builtRoot, "package.json")) ||
        !existsSync(path.join(builtRoot, "contents/main.js"))
      ) {
        throw new Error(`Built extension ${id} ${manifest.version} is missing`);
      }
      const installedPath =
        `components/extensions/${id}/${manifest.version}`;
      mkdirSync(path.dirname(path.join(output, installedPath)), {
        recursive: true,
        mode: 0o700,
      });
      cpSync(builtRoot, path.join(output, installedPath), {
        recursive: true,
      });
      return [{
        id,
        name: manifest.name,
        description: manifest.description,
        version: manifest.version,
        enabled: true,
        required: manifest.required === true,
        compatibility: release.compatibility,
        release: release.release,
        sha256: release.sha256,
        path: installedPath,
      }];
    });

  mkdirSync(path.join(output, "state"), {
    recursive: true,
    mode: 0o700,
  });
  writeJson(path.join(output, "versions-lock.json"), {
    schemaVersion: 1,
    generation: latest.generation,
    chatgptApi: {
      version: platform.version,
      release: apiRelease.release,
      sha256: apiRelease.sha256,
      path: apiPath,
    },
    binding: {
      chatgpt: pinned.chatgpt,
      version: binding.version,
      chatgptApi: binding.chatgptApi,
      asarSha256: binding.asarSha256,
      release: bindingRelease.release,
      sha256: bindingRelease.sha256,
      path: bindingPath,
    },
    extensions,
  });
  writeJson(path.join(output, "settings.json"), {
    schemaVersion: 1,
    extensions: Object.fromEntries(
      extensions.map((extension) => [
        extension.id,
        { enabled: extension.enabled },
      ]),
    ),
  });
}

try {
  run();
} catch (error) {
  process.stderr.write(`${error.message}\n`);
  process.exitCode = 1;
}
