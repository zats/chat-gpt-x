"use strict";

if (
  process.type === "browser" &&
  /[/\\]ChatGPT(?:\.exe)?$/.test(process.execPath) &&
  require("node:worker_threads").isMainThread
) {
  const recorder = process.env.CHATGPTX_EXTENSION_TEST_RECORDER;
  const session = process.env.CHATGPTX_EXTENSION_TEST_ROOT;
  if (recorder !== undefined || session !== undefined) {
    if (
      typeof recorder !== "string" ||
      !recorder.startsWith("/") ||
      typeof session !== "string" ||
      !session.startsWith("/")
    ) {
      throw new Error("The ChatGPTX extension test recorder is invalid.");
    }
    const { spawnSync } = require("node:child_process");
    const result = spawnSync(
      recorder,
      [
        "--extension-test-process",
        "record",
        session,
        String(process.pid),
      ],
      {
        env: process.env,
        stdio: "ignore",
        timeout: 5_000,
      },
    );
    if (result.error || result.status !== 0 || result.signal) {
      throw new Error("ChatGPTX could not record the isolated process.");
    }
  }
}
