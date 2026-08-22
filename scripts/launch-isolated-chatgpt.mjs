#!/usr/bin/env node

import { spawnSync, execFileSync } from "node:child_process";
import {
  access,
  chmod,
  constants,
  mkdir,
  mkdtemp,
  readFile,
  rename,
  stat,
  writeFile,
} from "node:fs/promises";
import os from "node:os";
import path from "node:path";

const help = `Usage: scripts/launch-isolated-chatgpt.mjs [options] [-- ChatGPT arguments]

Launch a stock ChatGPT instance with separate Electron and Codex data.

Options:
  --electron-user-data-dir <directory>  Use this Electron profile directory.
  --codex-home <directory>              Use this Codex home directory.
  --skip-onboarding                     Skip optional onboarding and interstitials.
  -h, --help                            Show this help.

The script creates a temporary directory for each unspecified directory.`;

const clearedEnvironmentVariables = [
  "CHATGPTX_LAUNCH_CONFIGURATION",
  "CHATGPTX_VERSIONS_LOCK",
  "DYLD_FRAMEWORK_PATH",
  "DYLD_INSERT_LIBRARIES",
  "DYLD_LIBRARY_PATH",
  "ELECTRON_NO_ASAR",
  "ELECTRON_RUN_AS_NODE",
  "NODE_OPTIONS",
  "NODE_PATH",
];

function readValue(arguments_, index, option) {
  const value = arguments_[index + 1];
  if (!value || value.startsWith("--")) {
    throw new Error(`${option} requires a directory`);
  }
  return value;
}

function parseArguments(arguments_) {
  let electronUserDataDir;
  let codexHome;
  let skipOnboarding = false;
  let chatGptArguments = [];

  for (let index = 0; index < arguments_.length; index += 1) {
    const argument = arguments_[index];
    if (argument === "--") {
      chatGptArguments = arguments_.slice(index + 1);
      break;
    }
    if (argument === "-h" || argument === "--help") {
      console.log(help);
      process.exit(0);
    }
    if (argument === "--skip-onboarding") {
      skipOnboarding = true;
      continue;
    }
    if (argument === "--electron-user-data-dir") {
      if (electronUserDataDir) {
        throw new Error(`${argument} can be specified only once`);
      }
      electronUserDataDir = readValue(arguments_, index, argument);
      index += 1;
      continue;
    }
    if (argument === "--codex-home") {
      if (codexHome) throw new Error(`${argument} can be specified only once`);
      codexHome = readValue(arguments_, index, argument);
      index += 1;
      continue;
    }
    throw new Error(`unknown option: ${argument}`);
  }

  return {
    chatGptArguments,
    codexHome,
    electronUserDataDir,
    skipOnboarding,
  };
}

async function directoryFor(value, prefix) {
  if (value) {
    const directory = path.resolve(value);
    await mkdir(directory, { recursive: true, mode: 0o700 });
    return directory;
  }
  return mkdtemp(path.join(os.tmpdir(), prefix));
}

function listProcesses() {
  const output = execFileSync(
    "/bin/ps",
    ["-axo", "pid=,ppid=,rss=,etime=,command="],
    { encoding: "utf8" },
  );
  return output
    .split("\n")
    .map((line) =>
      line.match(/^\s*(\d+)\s+(\d+)\s+(\d+)\s+(\S+)\s+(.*)$/),
    )
    .filter(Boolean)
    .map((match) => ({
      command: match[5],
      elapsed: match[4],
      parentPid: Number(match[2]),
      pid: Number(match[1]),
      rssKb: Number(match[3]),
    }));
}

async function isExecutable(filePath) {
  try {
    await access(filePath, constants.X_OK);
    return true;
  } catch {
    return false;
  }
}

async function findComputerUseApp() {
  const appName = "Codex Computer Use.app";
  const candidates = [];
  if (process.env.SKY_CUA_SERVICE_PATH) {
    candidates.push(process.env.SKY_CUA_SERVICE_PATH);
  }
  if (process.env.CODEX_HOME) {
    candidates.push(path.join(process.env.CODEX_HOME, "computer-use", appName));
  }
  candidates.push(path.join(os.homedir(), ".codex", "computer-use", appName));

  const serviceSuffix = "/Contents/MacOS/SkyComputerUseService";
  for (const process_ of listProcesses()) {
    const suffixIndex = process_.command.indexOf(serviceSuffix);
    if (suffixIndex > 0) {
      candidates.push(process_.command.slice(0, suffixIndex));
    }
  }

  for (const candidate of [
    ...new Set(candidates.map((value) => path.resolve(value))),
  ]) {
    if (await isExecutable(path.join(candidate, serviceSuffix))) {
      return candidate;
    }
  }

  throw new Error(
    "the primary Computer Use service was not found; start the primary ChatGPT app once, then try again",
  );
}

async function setFirstRunState(codexHome) {
  const statePath = path.join(codexHome, ".codex-global-state.json");
  let stateObject = {};
  let mode = 0o600;

  try {
    stateObject = JSON.parse(await readFile(statePath, "utf8"));
    mode = (await stat(statePath)).mode & 0o777;
  } catch (error) {
    if (error.code !== "ENOENT") throw error;
  }
  if (
    stateObject === null ||
    Array.isArray(stateObject) ||
    typeof stateObject !== "object"
  ) {
    throw new Error(`${statePath} must contain a JSON object`);
  }

  const atomState = stateObject["electron-persisted-atom-state"] ?? {};
  if (
    atomState === null ||
    Array.isArray(atomState) ||
    typeof atomState !== "object"
  ) {
    throw new Error(
      `${statePath} has an invalid electron-persisted-atom-state value`,
    );
  }
  Object.assign(atomState, {
    "browser-sidebar-comment-mode-coachmark-dismissed": true,
    "chatgpt-migration-announcement-completed-v1": true,
    "chatgpt-update-downloaded-announcement-seen-v1": true,
    "electron:onboarding-hide-first-new-thread-promos": true,
    "electron:onboarding-override": "app",
    "electron:onboarding-projectless-completed": true,
    "has-accepted-appshot-intro": true,
    "has-dismissed-priority-filter-coachmark-v1": true,
    "has-seen-browser-profile-import-nux-v1": true,
    "has-seen-fast-mode-announcement": true,
    "has-seen-gift-credits-home-banner": true,
    "has-seen-realtime-voice-nux-v1": true,
    "presentation-annotations-cursor-onboarding-completed-v1": true,
    "presentation-annotations-onboarding-completed-v1": true,
  });
  stateObject["electron-persisted-atom-state"] = atomState;

  const temporaryPath = `${statePath}.${process.pid}.tmp`;
  await writeFile(temporaryPath, `${JSON.stringify(stateObject)}\n`, { mode });
  await rename(temporaryPath, statePath);
  await chmod(statePath, mode);
}

function launchChatGpt({
  chatGptArguments,
  codexHome,
  computerUseApp,
  electronUserDataDir,
  stderrPath,
  stdoutPath,
}) {
  const environment = { ...process.env };
  for (const name of clearedEnvironmentVariables) {
    delete environment[name];
  }

  const result = spawnSync(
    "/usr/bin/open",
    [
      "-n",
      "-F",
      "-a",
      "ChatGPT",
      "--stdout",
      stdoutPath,
      "--stderr",
      stderrPath,
      "--env",
      `CODEX_HOME=${codexHome}`,
      ...clearedEnvironmentVariables.flatMap((name) => ["--env", `${name}=`]),
      "--env",
      `SKY_CUA_SERVICE_PATH=${computerUseApp}`,
      "--env",
      "CODEX_ELECTRON_SKIP_COMPUTER_USE_CANONICAL_REFRESH=1",
      "--args",
      `--user-data-dir=${electronUserDataDir}`,
      ...chatGptArguments,
    ],
    { encoding: "utf8", env: environment },
  );
  if (result.status !== 0) {
    throw new Error(
      result.stderr.trim() || result.stdout.trim() || "open failed",
    );
  }
}

function sleep(milliseconds) {
  return new Promise((resolve) => setTimeout(resolve, milliseconds));
}

async function fileContains(filePath, text) {
  try {
    return (await readFile(filePath, "utf8")).includes(text);
  } catch (error) {
    if (error.code === "ENOENT") return false;
    throw error;
  }
}

async function waitForMainProcess(electronUserDataDir) {
  const profileArgument = `--user-data-dir=${electronUserDataDir}`;
  const deadline = Date.now() + 10_000;
  while (Date.now() < deadline) {
    const process_ = listProcesses().find(
      (candidate) =>
        candidate.command.includes("ChatGPT.app/Contents/MacOS/ChatGPT") &&
        candidate.command.includes(profileArgument),
    );
    if (process_) return process_;
    await sleep(200);
  }
  throw new Error("the isolated ChatGPT process did not start within 10 seconds");
}

if (process.platform !== "darwin") {
  throw new Error("this launcher requires macOS");
}

const options = parseArguments(process.argv.slice(2));
const electronUserDataDir = await directoryFor(
  options.electronUserDataDir,
  "chatgpt-isolated-electron.",
);
const codexHome = await directoryFor(
  options.codexHome,
  "chatgpt-isolated-codex.",
);
if (electronUserDataDir === codexHome) {
  throw new Error("the Electron profile and Codex home must be different");
}

const existingProcess = listProcesses().find((process_) =>
  process_.command.includes(`--user-data-dir=${electronUserDataDir}`),
);
if (existingProcess) {
  throw new Error(
    `the Electron profile is already used by process ${existingProcess.pid}`,
  );
}

const computerUseApp = await findComputerUseApp();
if (options.skipOnboarding) await setFirstRunState(codexHome);

const stdoutPath = path.join(codexHome, "chatgpt.stdout.log");
const stderrPath = path.join(codexHome, "chatgpt.stderr.log");
launchChatGpt({
  chatGptArguments: options.chatGptArguments,
  codexHome,
  computerUseApp,
  electronUserDataDir,
  stderrPath,
  stdoutPath,
});

const mainProcess = await waitForMainProcess(electronUserDataDir);
await sleep(3_000);
const currentProcesses = listProcesses();
if (!currentProcesses.some((process_) => process_.pid === mainProcess.pid)) {
  throw new Error(`the isolated ChatGPT process exited; see ${stderrPath}`);
}
const helperChildren = currentProcesses.filter(
  (process_) =>
    process_.parentPid === mainProcess.pid &&
    process_.command.includes("/SkyComputerUseService"),
);
const sandboxExtensionFailed =
  (await fileContains(stdoutPath, "sandbox_extension_issue_file_to_process")) ||
  (await fileContains(stderrPath, "sandbox_extension_issue_file_to_process"));
if (helperChildren.length > 1 || sandboxExtensionFailed) {
  process.kill(mainProcess.pid, "SIGTERM");
  throw new Error(
    `the Computer Use service entered a retry loop; the failed instance was stopped; see ${stderrPath}`,
  );
}

console.log(`Electron profile: ${electronUserDataDir}`);
console.log(`Codex home: ${codexHome}`);
console.log(`Standard output: ${stdoutPath}`);
console.log(`Standard error: ${stderrPath}`);
console.log(`Process ID: ${mainProcess.pid}`);
