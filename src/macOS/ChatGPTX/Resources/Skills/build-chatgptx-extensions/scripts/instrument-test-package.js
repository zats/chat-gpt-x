ObjC.import("Foundation");

function readUTF8(path) {
  const error = Ref();
  const value = $.NSString.stringWithContentsOfFileEncodingError(
    path,
    $.NSUTF8StringEncoding,
    error,
  );
  if (value.isNil()) {
    throw new Error(`Could not read ${path}: ${error[0].localizedDescription.js}`);
  }
  return ObjC.unwrap(value);
}

function writeUTF8(path, value) {
  const error = Ref();
  const output = $.NSString.stringWithString(value);
  const wrote = output.writeToFileAtomicallyEncodingError(
    path,
    true,
    $.NSUTF8StringEncoding,
    error,
  );
  if (!wrote) {
    throw new Error(`Could not write ${path}: ${error[0].localizedDescription.js}`);
  }
}

function run(arguments) {
  if (arguments.length !== 4) {
    throw new Error(
      "An entry point, extension ID, phase, and marker path are required.",
    );
  }

  const [entryPath, extensionId, phase, markerPath] = arguments;
  if (!/^[a-z0-9][a-z0-9._-]*$/i.test(extensionId)) {
    throw new Error("The extension ID is invalid.");
  }
  if (phase !== "main" && phase !== "settings") {
    throw new Error("The activation phase is invalid.");
  }

  const source = readUTF8(entryPath);
  if (source.includes("__CGPTX_TEST_INSTRUMENTATION__")) {
    throw new Error("The entry point is already instrumented.");
  }
  const harness = `
;(() => {
  const __CGPTX_TEST_INSTRUMENTATION__ = true;
  const report = (status, error) => {
    const runtime = globalThis.__CGPTX_RUNTIME__;
    if (!runtime || typeof runtime.request !== "function") return;
    void runtime.request("extension-storage.write-text", {
      extensionId: "extensions",
      path: ${JSON.stringify(markerPath)},
      contents: JSON.stringify({ phase: ${JSON.stringify(phase)}, status, error }),
    }).catch(() => {});
  };
  const extensionModule = module.exports;
  const originalActivate = extensionModule?.activate;
  if (typeof originalActivate !== "function") {
    report("missing-activate", null);
    return;
  }
  const instrumentedModule = Object.create(extensionModule);
  Object.defineProperty(instrumentedModule, "activate", {
    configurable: false,
    enumerable: true,
    writable: false,
    value(...args) {
      try {
        const result = Reflect.apply(originalActivate, extensionModule, args);
        if (result && typeof result.then === "function") {
          report("invalid-async-activate", null);
        } else {
          report("activated", null);
        }
        return result;
      } catch (error) {
        report("activation-failed", String(error));
        throw error;
      }
    },
  });
  module.exports = instrumentedModule;
})();
`;
  writeUTF8(entryPath, `${source}${harness}`);
}
