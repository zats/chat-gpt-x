#!/usr/bin/env node

import { spawn } from "node:child_process";

const [timeoutArgument, command, ...arguments_] = process.argv.slice(2);
const timeoutSeconds = Number(timeoutArgument);
if (
  !Number.isFinite(timeoutSeconds) ||
  timeoutSeconds <= 0 ||
  !command
) {
  throw new Error(
    "usage: scripts/run-with-timeout.mjs <timeout-seconds> <command> [arguments...]",
  );
}

const stdio = ["inherit", "inherit", "inherit"];
const progressFd = Number(process.env.CHATGPTX_PROGRESS_FD ?? "0");
if (Number.isSafeInteger(progressFd) && progressFd >= 3) {
  while (stdio.length <= progressFd) stdio.push("ignore");
  stdio[progressFd] = progressFd;
}

const child = spawn(command, arguments_, {
  detached: true,
  env: process.env,
  stdio,
});
let timedOut = false;
let forceTimer;

function signalGroup(signal) {
  try {
    process.kill(-child.pid, signal);
  } catch (error) {
    if (error.code !== "ESRCH") throw error;
  }
}

const timeoutTimer = setTimeout(() => {
  timedOut = true;
  process.stderr.write(
    `${command} did not finish within ${timeoutSeconds}s; stopping its process group.\n`,
  );
  signalGroup("SIGTERM");
  forceTimer = setTimeout(() => signalGroup("SIGKILL"), 5_000);
}, timeoutSeconds * 1_000);

child.on("error", (error) => {
  clearTimeout(timeoutTimer);
  clearTimeout(forceTimer);
  throw error;
});

child.on("close", (code, signal) => {
  clearTimeout(timeoutTimer);
  clearTimeout(forceTimer);
  if (timedOut) {
    process.exitCode = 75;
  } else if (signal) {
    process.stderr.write(`${command} stopped with ${signal}.\n`);
    process.exitCode = 1;
  } else {
    process.exitCode = code ?? 1;
  }
});
