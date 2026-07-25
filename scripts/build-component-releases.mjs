import { execFileSync } from "node:child_process";
import {
  cpSync,
  existsSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  readdirSync,
  rmSync,
  statSync,
  utimesSync,
  writeFileSync,
} from "node:fs";
import { createHash } from "node:crypto";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";

const repositoryRoot = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  "..",
);
const normalizedTimestamp = new Date("1980-01-01T00:00:00Z");
const requiredBunVersion = "1.3.14";

function run() {
  const [
    planPathArgument,
    outputPathArgument,
    writeIndexFlag,
    indexPathArgument,
  ] = process.argv.slice(2);
  const writesIndex = writeIndexFlag === "--write-index";
  if (
    !planPathArgument ||
    !outputPathArgument ||
    (writeIndexFlag && !writesIndex) ||
    (writesIndex && !indexPathArgument)
  ) {
    throw new Error(
      "usage: node scripts/build-component-releases.mjs <plan.json> <output-directory> [--write-index <latest.json>]",
    );
  }

  const planPath = path.resolve(planPathArgument);
  const outputPath = path.resolve(outputPathArgument);
  const indexPath = writesIndex ? path.resolve(indexPathArgument) : null;
  if (existsSync(outputPath) && readdirSync(outputPath).length > 0) {
    throw new Error(`Output directory must be empty: ${outputPath}`);
  }
  mkdirSync(outputPath, { recursive: true });

  const plan = JSON.parse(readFileSync(planPath, "utf8"));
  const temporaryRoot = mkdtempSync(
    path.join(os.tmpdir(), "chatgptx-component-releases."),
  );
  const artifacts = [];

  try {
    if (plan.extensions.length > 0) {
      const bunVersion = execFileSync("bun", ["--version"], {
        encoding: "utf8",
      }).trim();
      if (bunVersion !== requiredBunVersion) {
        throw new Error(
          `bun ${requiredBunVersion} is required; received ${bunVersion}`,
        );
      }
    }
    if (plan.chatgptApi) {
      const stage = createStage(temporaryRoot, plan.chatgptApi.release);
      cpSync(
        path.join(repositoryRoot, "src/platform/manifest.json"),
        path.join(stage, "manifest.json"),
      );
      cpSync(
        path.join(repositoryRoot, "src/platform/types.d.ts"),
        path.join(stage, "types.d.ts"),
      );
      cpSync(
        path.join(repositoryRoot, "src/platform/bridge"),
        path.join(stage, "bridge"),
        { recursive: true },
      );
      cpSync(
        path.join(repositoryRoot, "src/platform/runtime"),
        path.join(stage, "runtime"),
        { recursive: true },
      );
      artifacts.push(
        archive(stage, outputPath, plan.chatgptApi, { writesIndex }),
      );
    }

    for (const binding of plan.bindings) {
      const stage = createStage(temporaryRoot, binding.release);
      cpSync(
        path.join(
          repositoryRoot,
          "src/platform/bindings",
          binding.chatgpt,
        ),
        stage,
        { recursive: true },
      );
      artifacts.push(archive(stage, outputPath, binding, { writesIndex }));
    }

    for (const extension of plan.extensions) {
      const stage = createStage(temporaryRoot, extension.release);
      const sourceRoot = path.join(
        repositoryRoot,
        "src/extensions",
        extension.id,
      );
      const contents = path.join(stage, "contents");
      mkdirSync(contents, { recursive: true });
      cpSync(
        path.join(sourceRoot, "package.json"),
        path.join(stage, "package.json"),
      );
      execFileSync(
        "bun",
        [
          "build",
          path.join(sourceRoot, `${extension.id}.ts`),
          "--target=browser",
          "--format=cjs",
          `--outfile=${path.join(contents, "main.js")}`,
        ],
        { cwd: repositoryRoot, stdio: "inherit" },
      );
      artifacts.push(archive(stage, outputPath, extension, { writesIndex }));
    }
  } finally {
    rmSync(temporaryRoot, { recursive: true, force: true });
  }

  if (indexPath) writeIndexHashes(indexPath, artifacts);
  writeFileSync(
    path.join(outputPath, "artifacts.json"),
    `${JSON.stringify({ schemaVersion: 1, artifacts }, null, 2)}\n`,
  );
}

function createStage(root, release) {
  const stage = path.join(root, release);
  mkdirSync(stage);
  return stage;
}

function archive(stage, outputPath, component, { writesIndex }) {
  normalizeTimestamps(stage);
  const archiveName = `${component.release}.zip`;
  const archivePath = path.join(outputPath, archiveName);
  const files = listFiles(stage);
  execFileSync("zip", ["-X", "-q", archivePath, "-@"], {
    cwd: stage,
    input: `${files.join("\n")}\n`,
  });

  const digest = createHash("sha256")
    .update(readFileSync(archivePath))
    .digest("hex");
  if (!writesIndex && component.sha256 !== digest) {
    throw new Error(
      `${component.release} sha256 must be ${digest}; received ${component.sha256}`,
    );
  }
  const checksumPath = `${archivePath}.sha256`;
  writeFileSync(checksumPath, `${digest}  ${archiveName}\n`);

  return {
    ...component,
    sha256: digest,
    archivePath,
    checksumPath,
  };
}

function writeIndexHashes(indexPath, artifacts) {
  const index = JSON.parse(readFileSync(indexPath, "utf8"));
  applyIndexHashes(index, artifacts);
  writeFileSync(indexPath, `${JSON.stringify(index, null, 2)}\n`);
}

export function applyIndexHashes(index, artifacts) {
  for (const artifact of artifacts) {
    let entry;
    if (artifact.kind === "chatgptApi") {
      entry = index.chatgptApis?.[artifact.version];
    } else if (artifact.kind === "binding") {
      entry = index.bindings?.[artifact.chatgpt];
    } else if (artifact.kind === "extension") {
      entry = index.extensions?.[artifact.id];
    }
    if (!entry || entry.release !== artifact.release) {
      throw new Error(
        `updates/latest.json has no matching entry for ${artifact.release}`,
      );
    }
    entry.sha256 = artifact.sha256;
  }
  return index;
}

function listFiles(root) {
  const files = [];
  walk(root, "", (relativePath, absolutePath) => {
    if (statSync(absolutePath).isFile()) files.push(relativePath);
  });
  return files.sort();
}

function normalizeTimestamps(root) {
  const paths = [];
  walk(root, "", (_relativePath, absolutePath) => {
    paths.push(absolutePath);
  });
  paths.sort((left, right) => right.length - left.length);
  for (const entryPath of paths) {
    utimesSync(entryPath, normalizedTimestamp, normalizedTimestamp);
  }
  utimesSync(root, normalizedTimestamp, normalizedTimestamp);
}

function walk(root, relativeRoot, visit) {
  const absoluteRoot = path.join(root, relativeRoot);
  for (const entry of readdirSync(absoluteRoot, { withFileTypes: true })) {
    const relativePath = path.join(relativeRoot, entry.name);
    const absolutePath = path.join(root, relativePath);
    visit(relativePath, absolutePath);
    if (entry.isDirectory()) walk(root, relativePath, visit);
  }
}

if (
  process.argv[1] &&
  path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)
) {
  try {
    run();
  } catch (error) {
    process.stderr.write(`${error.message}\n`);
    process.exitCode = 1;
  }
}
