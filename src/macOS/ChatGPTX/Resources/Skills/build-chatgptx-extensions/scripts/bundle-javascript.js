if (typeof ObjC !== "undefined") ObjC.import("Foundation");

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

function makeBundle(storageSource, entrySource) {
  return `;(() => {
"use strict";
const createExtensionStorage = (() => {
${storageSource}
return createExtensionStorage;
})();
(() => {
"use strict";
${entrySource}
})();
})();
`;
}

function run(arguments) {
  if (arguments.length !== 3) {
    throw new Error("An output, storage runtime, and JavaScript entry point are required.");
  }

  const outputPath = arguments[0];
  const source = makeBundle(readUTF8(arguments[1]), readUTF8(arguments[2]));
  const error = Ref();
  const output = $.NSString.stringWithString(source);
  const wrote = output.writeToFileAtomicallyEncodingError(
    outputPath,
    true,
    $.NSUTF8StringEncoding,
    error,
  );
  if (!wrote) {
    throw new Error(
      `Could not write ${outputPath}: ${error[0].localizedDescription.js}`,
    );
  }
}

if (typeof module !== "undefined") module.exports = { makeBundle };
