#!/usr/bin/env node

import {
  chmod,
  mkdir,
  readFile,
  rename,
  stat,
  writeFile,
} from "node:fs/promises";
import path from "node:path";
import { pathToFileURL } from "node:url";

const optionalProductUiState = Object.freeze({
  "browser-sidebar-comment-mode-coachmark-dismissed": true,
  "chatgpt-migration-announcement-completed-v1": true,
  "chatgpt-update-downloaded-announcement-seen-v1": true,
  "electron:onboarding-hide-first-new-thread-promos": true,
  "electron:onboarding-override": "app",
  "electron:onboarding-projectless-completed": true,
  "electron:onboarding-welcome-pending": false,
  "has-accepted-appshot-intro": true,
  "has-dismissed-priority-filter-coachmark-v1": true,
  "has-seen-browser-profile-import-nux-v1": true,
  "has-seen-fast-mode-announcement": true,
  "has-seen-gift-credits-home-banner": true,
  "has-seen-realtime-voice-nux-v1": true,
  "presentation-annotations-cursor-onboarding-completed-v1": true,
  "presentation-annotations-onboarding-completed-v1": true,
});

export async function suppressOptionalProductUi(codexHome) {
  const statePath = path.join(codexHome, ".codex-global-state.json");
  let stateObject = {};
  let mode = 0o600;

  await mkdir(codexHome, { recursive: true, mode: 0o700 });
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
  Object.assign(atomState, optionalProductUiState);
  stateObject["electron-persisted-atom-state"] = atomState;

  const temporaryPath = `${statePath}.${process.pid}.tmp`;
  await writeFile(temporaryPath, `${JSON.stringify(stateObject)}\n`, { mode });
  await rename(temporaryPath, statePath);
  await chmod(statePath, mode);
}

if (
  process.argv[1] &&
  import.meta.url === pathToFileURL(path.resolve(process.argv[1])).href
) {
  if (process.argv.length !== 3) {
    throw new Error("usage: scripts/suppress-optional-product-ui.mjs <codex-home>");
  }
  await suppressOptionalProductUi(path.resolve(process.argv[2]));
}
