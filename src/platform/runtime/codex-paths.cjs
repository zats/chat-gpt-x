"use strict";

const os = require("node:os");
const path = require("node:path");

function resolveCodexHome({
  environment = process.env,
  homeDirectory = os.homedir(),
} = {}) {
  return environment.CODEX_HOME || path.join(homeDirectory, ".codex");
}

function resolveExtensionsDirectory(options) {
  return path.join(resolveCodexHome(options), "extensions");
}

module.exports = {
  resolveCodexHome,
  resolveExtensionsDirectory,
};

if (require.main === module) {
  const target = process.argv[2];
  if (target === "home") process.stdout.write(resolveCodexHome());
  else if (target === "extensions") {
    process.stdout.write(resolveExtensionsDirectory());
  } else {
    throw new Error("Expected path target: home or extensions");
  }
}
