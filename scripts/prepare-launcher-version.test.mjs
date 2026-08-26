import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { spawnSync } from "node:child_process";
import test from "node:test";

const sourceScript = path.resolve(import.meta.dirname, "prepare-launcher-version.mjs");

function runVersionPreparation({ declaredVersion, declaredBuild, releasedVersion, releasedBuild }) {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "chatgptx-launcher-version-"));
  fs.mkdirSync(path.join(root, "scripts"));
  fs.mkdirSync(path.join(root, "src/macOS"), { recursive: true });
  fs.copyFileSync(sourceScript, path.join(root, "scripts/prepare-launcher-version.mjs"));
  fs.writeFileSync(
    path.join(root, "src/macOS/project.yaml"),
    `settings:\n  base:\n    MARKETING_VERSION: ${declaredVersion}\n    CURRENT_PROJECT_VERSION: ${declaredBuild}\n`,
  );
  fs.writeFileSync(
    path.join(root, "appcast.xml"),
    `<rss><channel><item><sparkle:version>${releasedBuild}</sparkle:version><sparkle:shortVersionString>${releasedVersion}</sparkle:shortVersionString></item></channel></rss>`,
  );

  const result = spawnSync(
    process.execPath,
    [path.join(root, "scripts/prepare-launcher-version.mjs"), "--write"],
    { encoding: "utf8" },
  );
  return { root, result };
}

test("increments the patch in the current release series", (context) => {
  const { root, result } = runVersionPreparation({
    declaredVersion: "1.2.0",
    declaredBuild: 2,
    releasedVersion: "1.2.0",
    releasedBuild: 2,
  });
  context.after(() => fs.rmSync(root, { recursive: true, force: true }));
  assert.equal(result.status, 0, result.stderr);
  assert.deepEqual(JSON.parse(result.stdout), {
    previousVersion: "1.2.0",
    previousBuild: 2,
    version: "1.2.1",
    build: 3,
    manuallyChangedSeries: false,
  });
  const project = fs.readFileSync(path.join(root, "src/macOS/project.yaml"), "utf8");
  assert.match(project, /MARKETING_VERSION: 1\.2\.1/);
  assert.match(project, /CURRENT_PROJECT_VERSION: 3/);
});

test("preserves a manual minor-version change", (context) => {
  const { root, result } = runVersionPreparation({
    declaredVersion: "1.3.0",
    declaredBuild: 2,
    releasedVersion: "1.2.9",
    releasedBuild: 12,
  });
  context.after(() => fs.rmSync(root, { recursive: true, force: true }));
  assert.equal(result.status, 0, result.stderr);
  assert.deepEqual(JSON.parse(result.stdout), {
    previousVersion: "1.2.9",
    previousBuild: 12,
    version: "1.3.0",
    build: 13,
    manuallyChangedSeries: true,
  });
});

test("preserves a manual major-version change", (context) => {
  const { root, result } = runVersionPreparation({
    declaredVersion: "2.0.0",
    declaredBuild: 1,
    releasedVersion: "1.9.8",
    releasedBuild: 42,
  });
  context.after(() => fs.rmSync(root, { recursive: true, force: true }));
  assert.equal(result.status, 0, result.stderr);
  assert.equal(JSON.parse(result.stdout).version, "2.0.0");
  assert.equal(JSON.parse(result.stdout).build, 43);
});

test("rejects a manual series regression", (context) => {
  const { root, result } = runVersionPreparation({
    declaredVersion: "1.1.9",
    declaredBuild: 20,
    releasedVersion: "1.2.0",
    releasedBuild: 21,
  });
  context.after(() => fs.rmSync(root, { recursive: true, force: true }));
  assert.notEqual(result.status, 0);
  assert.match(result.stderr, /older than released series/);
});
