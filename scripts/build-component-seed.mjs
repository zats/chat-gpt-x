import { execFileSync } from "node:child_process";
import {
  cpSync,
  existsSync,
  mkdirSync,
  readFileSync,
  readdirSync,
  rmSync,
  writeFileSync,
} from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const repositoryRoot = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  "..",
);
const requiredBunVersion = "1.3.14";

function readJson(relativePath) {
  return JSON.parse(
    readFileSync(path.join(repositoryRoot, relativePath), "utf8"),
  );
}

function requireEmptyDirectory(directory) {
  if (existsSync(directory)) {
    if (readdirSync(directory).length > 0) {
      throw new Error(`Output directory must be empty: ${directory}`);
    }
  } else {
    mkdirSync(directory, { recursive: true });
  }
}

function componentPath(...parts) {
  return path.posix.join("components", ...parts);
}

function buildExtension(
  extensionId,
  version,
  targetRoot,
  { allowPrivate = false } = {},
) {
  const sourceRoot = path.join(
    repositoryRoot,
    "src/extensions",
    extensionId,
  );
  const manifest = readJson(`src/extensions/${extensionId}/package.json`);
  if (manifest.private === true && !allowPrivate) {
    throw new Error(`Private extension cannot enter the seed: ${extensionId}`);
  }
  if (
    manifest.id !== extensionId ||
    manifest.version !== version ||
    manifest.main !== "contents/main.js"
  ) {
    throw new Error(`Invalid seed extension manifest: ${extensionId}`);
  }

  mkdirSync(path.join(targetRoot, "contents"), { recursive: true });
  cpSync(
    path.join(sourceRoot, "package.json"),
    path.join(targetRoot, "package.json"),
  );
  execFileSync(
    "bun",
    [
      "build",
      path.join(sourceRoot, `${extensionId}.ts`),
      "--target=browser",
      "--format=cjs",
      `--outfile=${path.join(targetRoot, "contents/main.js")}`,
    ],
    { cwd: repositoryRoot, stdio: "inherit" },
  );
  return manifest;
}

function run() {
  const [outputArgument] = process.argv.slice(2);
  if (!outputArgument) {
    throw new Error(
      "usage: node scripts/build-component-seed.mjs <output-directory>",
    );
  }

  const output = path.resolve(outputArgument);
  requireEmptyDirectory(output);
  outputPrepared = output;

  const latest = readJson("updates/latest.json");
  if (latest.schemaVersion !== 2) {
    throw new Error("updates/latest.json schemaVersion must be 2");
  }

  const platform = readJson("src/platform/manifest.json");
  const pinned = readJson("src/platform/bindings/manifest.json");
  const binding = readJson(
    `src/platform/bindings/${pinned.chatgpt}/manifest.json`,
  );
  const apiRelease = latest.chatgptApis?.[platform.version];
  const bindingRelease = latest.bindings?.[pinned.chatgpt];
  if (!apiRelease) {
    throw new Error(`Missing ChatGPT API ${platform.version} in update index`);
  }
  if (
    !bindingRelease ||
    bindingRelease.version !== binding.version ||
    bindingRelease.chatgptApi !== platform.version
  ) {
    throw new Error(`Pinned binding ${pinned.chatgpt} is stale in update index`);
  }

  const bunVersion = execFileSync("bun", ["--version"], {
    encoding: "utf8",
  }).trim();
  if (bunVersion !== requiredBunVersion) {
    throw new Error(
      `bun ${requiredBunVersion} is required; received ${bunVersion}`,
    );
  }

  const components = path.join(output, "components");
  const apiPath = componentPath("chatgpt-api", platform.version);
  const apiRoot = path.join(output, apiPath);
  mkdirSync(apiRoot, { recursive: true });
  cpSync(
    path.join(repositoryRoot, "src/platform/manifest.json"),
    path.join(apiRoot, "manifest.json"),
  );
  cpSync(
    path.join(repositoryRoot, "src/platform/types.d.ts"),
    path.join(apiRoot, "types.d.ts"),
  );
  cpSync(
    path.join(repositoryRoot, "src/platform/bridge"),
    path.join(apiRoot, "bridge"),
    { recursive: true },
  );
  cpSync(
    path.join(repositoryRoot, "src/platform/runtime"),
    path.join(apiRoot, "runtime"),
    { recursive: true },
  );

  const bindingPath = componentPath(
    "bindings",
    pinned.chatgpt,
    binding.version,
  );
  mkdirSync(path.dirname(path.join(output, bindingPath)), {
    recursive: true,
  });
  cpSync(
    path.join(repositoryRoot, "src/platform/bindings", pinned.chatgpt),
    path.join(output, bindingPath),
    { recursive: true },
  );

  const extensionRoot = path.join(components, "extensions");
  const extensions = Object.entries(latest.extensions)
    .sort(([left], [right]) => left.localeCompare(right))
    .map(([id, release]) => {
      const manifest = buildExtension(
        id,
        release.version,
        path.join(extensionRoot, id),
      );
      return manifest;
    });

  const apiTestManifest = readJson(
    "src/extensions/api-test-suite/package.json",
  );
  buildExtension(
    "api-test-suite",
    apiTestManifest.version,
    path.join(output, "api-test-suite"),
    { allowPrivate: true },
  );

  const versions = {
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
  };

  writeFileSync(
    path.join(output, "versions-lock.json"),
    `${JSON.stringify(versions, null, 2)}\n`,
  );
  writeFileSync(
    path.join(output, "settings.json"),
    `${JSON.stringify(
      {
        schemaVersion: 1,
        extensions: Object.fromEntries(
          extensions.map((extension) => [
            extension.id,
            { enabled: true },
          ]),
        ),
      },
      null,
      2,
    )}\n`,
  );
}

let outputPrepared = null;
try {
  run();
} catch (error) {
  if (outputPrepared) {
    rmSync(outputPrepared, { recursive: true, force: true });
  }
  process.stderr.write(`${error.message}\n`);
  process.exitCode = 1;
}
