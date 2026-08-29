import assert from "node:assert/strict";
import { lstat, readFile, readdir, stat } from "node:fs/promises";
import { createRequire } from "node:module";
import path from "node:path";
import test from "node:test";
import vm from "node:vm";

const repositoryRoot = path.resolve(import.meta.dirname, "..");
const require = createRequire(import.meta.url);
const skillRoot = path.join(
  repositoryRoot,
  "src/macOS/ChatGPTX/Resources/Skills/build-chatgptx-extensions",
);

async function text(relativePath) {
  return readFile(path.join(skillRoot, relativePath), "utf8");
}

async function walk(directory) {
  const entries = await readdir(directory, { withFileTypes: true });
  const files = [];
  for (const entry of entries) {
    const entryPath = path.join(directory, entry.name);
    if (entry.isDirectory()) files.push(...(await walk(entryPath)));
    else files.push(entryPath);
  }
  return files;
}

test("bundled API snapshot matches the stable API source", async () => {
  const [source, snapshot] = await Promise.all([
    readFile(path.join(repositoryRoot, "src/platform/types.d.ts"), "utf8"),
    text("references/platform-api.d.ts"),
  ]);
  assert.equal(snapshot, source);
});

test("skill is self-contained and has no symbolic links", async () => {
  const required = [
    "SKILL.md",
    "agents/openai.yaml",
    "references/authoring-guide.md",
    "references/platform-api.d.ts",
    "assets/test-codex-global-state.json",
    "assets/extension-template/package.json.template",
    "assets/extension-template/contents/main.js",
    "assets/extension-template/sdk/extension-storage.js",
    "assets/extension-template/sdk/extension-storage.d.ts",
    "scripts/build-extension.sh",
    "scripts/bundle-javascript.js",
    "scripts/check-javascript.js",
    "scripts/create-extension.sh",
    "scripts/instrument-test-package.js",
    "scripts/record-test-session.cjs",
    "scripts/resolve-active-api.sh",
    "scripts/seed-test-components.sh",
    "scripts/session-watchdog.sh",
    "scripts/test-extension.sh",
  ];
  for (const relativePath of required) {
    assert.equal((await stat(path.join(skillRoot, relativePath))).isFile(), true);
  }
  for (const file of await walk(skillRoot)) {
    assert.equal((await lstat(file)).isSymbolicLink(), false, file);
  }

  const allText = (
    await Promise.all(
      (await walk(skillRoot)).map(async (file) =>
        (await lstat(file)).isFile() ? readFile(file, "utf8") : "",
      ),
    )
  ).join("\n");
  assert.doesNotMatch(allText, /\/Users\//);
  assert.doesNotMatch(allText, /TODO|FIXME/);
});

test("scaffold manifest and entry bundle are valid", async () => {
  const manifest = JSON.parse(
    (await text("assets/extension-template/package.json.template"))
      .replaceAll("__EXTENSION_ID__", "sample-extension")
      .replaceAll("__EXTENSION_NAME__", "Sample Extension")
      .replaceAll("__CHATGPTX_API_VERSION__", "9.8.7"),
  );
  assert.deepEqual(manifest, {
    id: "sample-extension",
    name: "Sample Extension",
    version: "0.1.0",
    description: "A local ChatGPTX extension.",
    main: "contents/main.js",
    compatibility: { chatgptApi: "^9.8.7" },
    capabilities: [],
  });

  const storage = await text(
    "assets/extension-template/sdk/extension-storage.js",
  );
  const entry = await text("assets/extension-template/contents/main.js");
  assert.doesNotMatch(entry, /\brequire\s*\(/);
  const { makeBundle } = require(
    path.join(skillRoot, "scripts/bundle-javascript.js"),
  );
  const context = vm.createContext({ module: { exports: {} } });
  new vm.Script(makeBundle(storage, entry)).runInContext(context);
  assert.equal(typeof context.module.exports.activate, "function");

  const collisionEntry = `
const extensionIdPattern = "author value";
function activate() {
  return {
    extensionIdPattern,
    storageType: typeof createExtensionStorage,
    strict: this === undefined,
  };
}
module.exports = { activate };
`;
  const collisionContext = vm.createContext({ module: { exports: {} } });
  new vm.Script(makeBundle(storage, collisionEntry)).runInContext(
    collisionContext,
  );
  assert.deepEqual(
    JSON.parse(
      JSON.stringify(
        Reflect.apply(collisionContext.module.exports.activate, undefined, []),
      ),
    ),
    {
      extensionIdPattern: "author value",
      storageType: "function",
      strict: true,
    },
  );
});

test("storage utility sends scoped runtime requests", async () => {
  const calls = [];
  const context = vm.createContext({
    __CGPTX_RUNTIME__: {
      async request(method, parameters) {
        calls.push({ method, parameters });
        if (method === "extension-storage.list") return ["one.json"];
        if (method === "extension-storage.read-text") return "contents";
        return null;
      },
    },
  });
  const source = await text(
    "assets/extension-template/sdk/extension-storage.js",
  );
  new vm.Script(`${source}\n;globalThis.factory = createExtensionStorage;`)
    .runInContext(context);
  const storage = context.factory("sample-extension");
  assert.deepEqual(Array.from(await storage.listFiles()), ["one.json"]);
  assert.equal(await storage.readTextFile("one.json"), "contents");
  await storage.writeTextFile("two.json", "two");
  await storage.deleteFile("two.json");
  assert.deepEqual(JSON.parse(JSON.stringify(calls)), [
    {
      method: "extension-storage.list",
      parameters: { extensionId: "sample-extension" },
    },
    {
      method: "extension-storage.read-text",
      parameters: { extensionId: "sample-extension", path: "one.json" },
    },
    {
      method: "extension-storage.write-text",
      parameters: {
        extensionId: "sample-extension",
        path: "two.json",
        contents: "two",
      },
    },
    {
      method: "extension-storage.delete",
      parameters: { extensionId: "sample-extension", path: "two.json" },
    },
  ]);
});

test("test workflow enforces isolated launch and cleanup", async () => {
  const [skill, guide, buildScript, testScript, watchdogScript] =
    await Promise.all([
      text("SKILL.md"),
      text("references/authoring-guide.md"),
      text("scripts/build-extension.sh"),
      text("scripts/test-extension.sh"),
      text("scripts/session-watchdog.sh"),
    ]);
  assert.match(skill, /start its isolated test in one shell/i);
  assert.match(skill, /requested behavior was observed/i);
  assert.match(guide, /markers do not prove the feature/i);
  assert.match(testScript, /--test-extension/);
  assert.match(testScript, /--user-data-dir=/);
  assert.doesNotMatch(testScript, /--remote-debugging-port/);
  assert.match(testScript, /SKY_CUA_SERVICE_PATH/);
  assert.match(testScript, /CODEX_ELECTRON_SKIP_COMPUTER_USE_CANONICAL_REFRESH/);
  assert.match(testScript, /cleanup_failed_start/);
  assert.match(
    testScript,
    /cleanup_launcher_pid=""\n\s+wait "\$launcher_pid"\n\s+launcher_status=\$\?/,
  );
  assert.match(
    testScript,
    /stop_launcher_process "\$launcher_pid"\n\s+cleanup_launcher_pid=""\n\s+wait "\$launcher_pid"[^\n]*\n\s+launcher_pid=""/,
  );
  assert.match(testScript, /instrument-test-package\.js/);
  assert.match(testScript, /start_watchdog/);
  assert.match(testScript, /ui press-wait/);
  assert.match(testScript, /ui wait/);
  assert.match(testScript, /--extension-test-process list/);
  assert.match(testScript, /--extension-test-process record/);
  assert.match(testScript, /--extension-test-process signal/);
  assert.match(testScript, /--extension-test-process purge/);
  assert.match(testScript, /--extension-test-process remove/);
  assert.doesNotMatch(testScript, /-o command=/);
  assert.doesNotMatch(testScript, /-o lstart=/);
  assert.doesNotMatch(testScript, /rm -rf/);
  assert.doesNotMatch(testScript, /^\s*logs\)/m);
  assert.doesNotMatch(testScript, /show_logs|Bridge log:/);
  assert.doesNotMatch(testScript, /test-extension\.sh clean/);
  assert.match(buildScript, /-L "\$api_version_file"/);
  assert.match(buildScript, /mv -fh "\$api_version_temporary_file"/);
  assert.match(
    guide,
    /lease follows\s+the isolated Electron\s+profile across a ChatGPT relaunch/i,
  );
  assert.match(watchdogScript, /--extension-test-process list/);
  assert.match(watchdogScript, /--extension-test-process signal/);
  assert.match(watchdogScript, /--extension-test-process purge/);
  assert.match(watchdogScript, /--extension-test-process remove/);
  assert.match(watchdogScript, /launchctl remove/);
  assert.match(watchdogScript, /purge_session_private_data \|\| true/);
  assert.doesNotMatch(watchdogScript, /-o command=/);
  assert.doesNotMatch(watchdogScript, /-o lstart=/);
  assert.doesNotMatch(watchdogScript, /rm -rf/);
  assert.match(watchdogScript, /no_process_since/);
  assert.match(guide, /current `app\.pid`/i);
  assert.match(guide, /active window/i);
});

test("session recorder runs the native recorder synchronously", async () => {
  const recorder = await text("scripts/record-test-session.cjs");
  assert.match(recorder, /spawnSync/);
  assert.match(recorder, /--extension-test-process/);
  assert.match(recorder, /"record"/);
  assert.match(recorder, /process\.pid/);
});
