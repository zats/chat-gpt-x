import { readFile } from "node:fs/promises";

import {
  CdpTransportError,
  closeCdpSocket,
  connectCdpPage,
  sendCdpCommand,
} from "./cdp-client.mjs";

const port = process.argv[2] ?? "9451";
const timeoutMs = Number(process.argv[3] ?? "90000");
const authenticationPath = process.argv[4];
const noProfile = process.env.CHATGPTX_TEST_NO_PROFILE === "1";

if (!Number.isFinite(timeoutMs) || timeoutMs <= 0) {
  throw new Error("timeout-ms must be a positive number");
}

const authenticationJson = authenticationPath
  ? await readFile(authenticationPath, "utf8")
  : undefined;
const deadline = Date.now() + timeoutMs;
let nextId = 0;
let lastTransportError;

while (Date.now() < deadline) {
  let socket;
  try {
    socket = await connectCdpPage(port, "app://-/index.html", deadline);
    while (Date.now() < deadline) {
      const result = await sendCdpCommand(
        socket,
        ++nextId,
        "Runtime.evaluate",
        {
          expression: `(async () => {
            if (!globalThis.__CGPTX_LOCAL_CI_API__) {
              const host = globalThis.__CGPTX_HOST__;
              if (!host) return false;
              host.registerExtension("local-ci-readiness", {
                activate(api) {
                  globalThis.__CGPTX_LOCAL_CI_API__ = api;
                },
              });
            }
            const api = globalThis.__CGPTX_LOCAL_CI_API__;
            if (!api) return false;
            if (${JSON.stringify(noProfile)}) return { noProfile: true };
            const current = await api.authentication.getCurrent();
            if (
              !current ||
              !api.menus.profile.getItems().some((item) => item.origin === "app")
            ) {
              return false;
            }
            const inspected = ${
              authenticationJson === undefined
                ? "undefined"
                : `await api.authentication.inspect(${JSON.stringify(authenticationJson)})`
            };
            return {
              currentUserId: current.userId,
              inspectedUserId: inspected?.userId,
            };
          })()`,
          awaitPromise: true,
          returnByValue: true,
        },
        deadline,
      );
      if (result.exceptionDetails) {
        throw new Error(
          result.exceptionDetails.exception?.description ??
            result.exceptionDetails.text ??
            "Renderer evaluation failed",
        );
      }
      const ready = result.result.value;
      if (ready) {
        console.log(JSON.stringify(ready));
        process.exit(0);
      }
      await new Promise((resolve) => setTimeout(resolve, 100));
    }
  } catch (error) {
    if (!(error instanceof CdpTransportError)) throw error;
    lastTransportError = error;
  } finally {
    closeCdpSocket(socket);
  }
  await new Promise((resolve) => setTimeout(resolve, 100));
}

const transportDetail = lastTransportError
  ? ` Last CDP error: ${lastTransportError.message}.`
  : "";
throw new Error(
  `Authenticated profile was not ready within ${timeoutMs}ms.${transportDetail}`,
);
