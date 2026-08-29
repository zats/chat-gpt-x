ObjC.import("Foundation");

function run(arguments) {
  if (arguments.length === 0) {
    throw new Error("At least one JavaScript file is required.");
  }

  for (const path of arguments) {
    const error = Ref();
    const source = $.NSString.stringWithContentsOfFileEncodingError(
      path,
      $.NSUTF8StringEncoding,
      error,
    );
    if (source.isNil()) {
      throw new Error(`Could not read ${path}: ${error[0].localizedDescription.js}`);
    }
    try {
      new Function(ObjC.unwrap(source));
    } catch (exception) {
      throw new Error(`${path}: ${exception.message}`);
    }
  }
}
