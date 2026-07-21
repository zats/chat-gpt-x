"use strict";

const { contextBridge, ipcRenderer } = require("electron");

contextBridge.exposeInMainWorld(
  "__CGPTX_RUNTIME__",
  Object.freeze({
    request(method, parameters) {
      return ipcRenderer.invoke("chatgptx:runtime", { method, parameters });
    },
  }),
);
