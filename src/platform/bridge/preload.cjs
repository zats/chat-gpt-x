"use strict";

const { contextBridge, ipcRenderer, webFrame } = require("electron");

const RENDERER_BOOTSTRAP_CHANNEL = "chatgptx:renderer-bootstrap";
const RENDERER_BOOTSTRAP_ERROR_CHANNEL =
  "chatgptx:renderer-bootstrap-error";

contextBridge.exposeInMainWorld(
  "__CGPTX_RUNTIME__",
  Object.freeze({
    request(method, parameters) {
      return ipcRenderer.invoke("chatgptx:runtime", { method, parameters });
    },
  }),
);

if (process.isMainFrame) {
  const hostSource = ipcRenderer.sendSync(RENDERER_BOOTSTRAP_CHANNEL);
  if (typeof hostSource === "string" && hostSource.length > 0) {
    void webFrame.executeJavaScript(hostSource).catch((error) => {
      ipcRenderer.send(RENDERER_BOOTSTRAP_ERROR_CHANNEL, String(error));
    });
  }
}
