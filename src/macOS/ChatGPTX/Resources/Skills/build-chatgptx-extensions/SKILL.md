---
name: build-chatgptx-extensions
description: Create, update, package, and test local ChatGPTX extensions with the exact active stable API declarations and components, without a ChatGPTX source checkout or GitHub workflow. Use for custom ChatGPTX extensions or plugins. Do not use for changing ChatGPTX itself or its public API.
---

# Build ChatGPTX extensions

Build a launch-scoped local extension. Do not open a pull request, publish a
release, or modify the installed ChatGPT or ChatGPTX app bundle.

The workflow requires these items on the same Mac:

- installed stock ChatGPT and ChatGPTX apps;
- an active ChatGPTX component set with an exact binding for the installed
  ChatGPT build;
- a signed-in primary ChatGPT profile with `auth.json`;
- the primary ChatGPT app started once so its Computer Use service is
  available.

Accessibility permission is optional. It is required only for the preferred
native UI probe. In the commands below, `<skill-directory>` is the absolute
directory that contains this `SKILL.md` file.

## Required workflow

1. For a new extension, run:

   ```sh
   /bin/bash "<skill-directory>/scripts/create-extension.sh" \
     "/absolute/project-directory" "extension-id" "Extension Name"
   ```

   The command copies the exact active ChatGPTX API declarations from the
   installed component store. It does not use the repository API snapshot.
   The project path is the final project directory. It must not exist. The
   script never replaces an existing directory.

2. Read [references/authoring-guide.md](references/authoring-guide.md). Search
   the generated `chatgptx.d.ts` for each API that the extension needs. Read
   only those declarations and examples.

3. Keep all ChatGPT integration on `PlatformApi`. Production extension code
   must not inspect ChatGPT DOM structure, Electron objects, minified names,
   bindings, `window.__CGPTX_HOST__`, or CDP. Use native API controls when the
   stable API supplies them. Pass only the extension's own manifest ID to the
   storage utility. Storage IDs are namespaces, not authenticated caller
   identities.

4. Package the extension and start its isolated test in one shell:

   ```sh
   build_directory="$(/bin/bash \
     "<skill-directory>/scripts/build-extension.sh" \
     "/absolute/project-directory")" &&
   start_output="$(/bin/bash \
     "<skill-directory>/scripts/test-extension.sh" \
     start "$build_directory")" &&
   printf '%s\n' "$start_output" &&
   session="$(printf '%s\n' "$start_output" | \
     /usr/bin/sed -n 's/^Session: //p')" &&
   [[ "$session" == /* && "$session" != *$'\n'* ]]
   ```

   This command refreshes the project API declaration, generated SDK files, and
   compatibility range from the exact active component store. It validates the
   package, checks its JavaScript syntax, and starts from the printed build
   directory. JavaScript syntax validation is not static API type checking.
   Confirm every API use in `chatgptx.d.ts` and complete the live checks below.

   This is mandatory when Codex runs inside ChatGPT. The script creates a new
   Electron profile and a temporary Codex home. It copies the exact active
   ChatGPTX component set, copies `auth.json`, and reuses the primary Computer
   Use service. It does not run the component updater in this session. Never
   start a normal local override from the active ChatGPT process because that
   path can quit the process that hosts the task.

   Test only code that you created or fully reviewed. The extension runs with
   the signed-in account and can read its authentication through the stable
   authentication API. A manifest capability list is not a permission boundary.

5. Confirm that the start output contains `Source injection: passed` and
   `Synchronous activation: passed` for the extension ID. It instruments only a
   temporary package copy; it does not change the project build. Then verify the
   requested behavior in the isolated ChatGPT window. Activation does not prove
   that the feature works.

   Use this command to check the exact session:

   ```sh
   /bin/bash "<skill-directory>/scripts/test-extension.sh" status "$session"
   ```

   For an exact native UI check, use the session-bound probe. It targets only
   the active window of the current isolated process and refuses the primary
   ChatGPT process. For example:

   ```sh
   /bin/bash "<skill-directory>/scripts/test-extension.sh" \
     ui press-wait "$session" AXPopUpButton "Open profile menu" \
       '*' "My menu item" 10
   ```

   Use `press-wait` for transient menus so one exact-session process performs
   the action and observes its result. Use `ui wait "$session" <role> <label>
   [timeout]` for an observe-only check. Use `ui press "$session" <role>
   <label>` only when the result is not transient. `*` is a role wildcard, but
   the label must still have one unique match. An ambiguous match fails.

   Each successful operation prints redacted JSON. Record its process ID,
   operation, result, and matched labels in the task result. Do not use
   diagnostics or authentication as test evidence. The probe
   preflights Accessibility access and never requests or changes permission. If
   access is unavailable, use a live stable API read method whose contract
   reports the effective displayed state. Do not let Computer Use reconnect to the
   primary ChatGPT window as substitute evidence. Do not enable remote
   debugging for this signed-in test profile. Do not change the global Computer
   Use forbidden-target preference without explicit user authorization.
   For a visible feature, native UI evidence takes precedence over a model read.
   If the read passes but the isolated UI does not show the result, report a
   binding or API regression and do not report the extension as complete.

6. After each test, stop the isolated app and delete its complete test session:

   ```sh
   /bin/bash "<skill-directory>/scripts/test-extension.sh" stop "$session"
   ```

   Rebuild and start a new isolated session after each source change. There is
   no hot reload. A same-login safety lease tracks each exact isolated process
   group, stops an abandoned test, and removes its complete session after 30
   minutes. Do not wait for the lease, and always
   run `stop` before logout or restart. If a process does not stop after a hard
   kill, the command removes its private test data at once and leaves the
   watchdog active until the process exits. Completion still requires a
   successful `stop` result. If `stop` reports a live process, keep the session
   path, run `status`, and retry `stop`. Report the test as blocked until `stop`
   confirms that it removed the session.

## Completion gate

Report completion only when all of these facts are true:

- the package was built with the exact active API declaration and version;
- the isolated bridge log contains the extension ID in an `injected` event;
- the temporary harness reported successful synchronous activation;
- the requested behavior was observed, not inferred from source or load logs;
- the isolated ChatGPT process was stopped;
- the temporary test session that contained copied authentication was cleaned.

The build directory is a separate temporary package without authentication.
`stop` removes the authenticated test copy and session, not that build
directory. State this distinction if the user asks for all temporary build
artifacts to be removed.

If functional verification is blocked, report the exact blocker and keep the
claim at “built” or “loaded,” not “working.”

## References

- Read [references/authoring-guide.md](references/authoring-guide.md) for the
  package contract, lifecycle, settings, storage, and troubleshooting.
- [references/platform-api.d.ts](references/platform-api.d.ts) is the API
  snapshot bundled with this launcher. Generated projects use the exact active
  installed copy instead.
