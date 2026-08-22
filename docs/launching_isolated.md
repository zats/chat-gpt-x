# Launch an isolated stock ChatGPT instance

Use the repository script to start a second stock ChatGPT instance with
separate application data. The script does not load ChatGPTX or another
Node.js injection.

## Isolation boundaries

The launch uses two separate directories:

- `--user-data-dir` isolates the Electron profile. This includes cookies,
  local storage, caches, and window state.
- `CODEX_HOME` isolates Codex configuration, plugins, task data, and logs.

The launch clears ChatGPTX, Node.js, Electron, and `DYLD` injection environment
variables. Thus, a parent process cannot add a ChatGPTX bridge or another
environment-based injection to the new instance.

The current ChatGPT app cannot run two independent Computer Use services in
one macOS login session. The script points the second instance to the primary
instance's native Computer Use application. This prevents a process retry loop
that first stops click handling and then causes a JavaScript heap crash. The
Electron and Codex data directories stay separate.

Persistent Computer Use app approvals belong to that shared service. Thus, an
existing approval that lets Computer Use control ChatGPT also applies to the
isolated instance. The launcher does not change app approvals or the Computer
Use forbidden-target policy.

This procedure isolates application data in the current macOS account. It does
not isolate the Computer Use service, Keychain, or system permissions. Use a
separate macOS account or a virtual machine for OS-level isolation.

## Launch

Run:

```sh
node scripts/launch-isolated-chatgpt.mjs
```

By default, the script creates both directories under the macOS per-user
temporary directory. It prints both paths, the log paths, and the process ID.
The directories remain after the app stops so that you can inspect or reuse
them.

To skip optional first-run onboarding and product interstitials, use:

```sh
node scripts/launch-isolated-chatgpt.mjs --skip-onboarding
```

This option writes a fixed allowlist of UI-state values in the selected Codex
home. They skip the onboarding routes and the current build's known optional
announcements, NUX screens, coachmarks, banners, and intro prompts. This
includes the "Codex is now the ChatGPT app" migration interstitial. The option
does not copy the primary Codex state or Electron profile. It does not skip
login, security warnings, permission requests, or errors.

To select persistent directories, use:

```sh
node scripts/launch-isolated-chatgpt.mjs \
  --electron-user-data-dir /absolute/path/to/electron-profile \
  --codex-home /absolute/path/to/codex-home \
  --skip-onboarding
```

The script creates a selected directory if it does not exist. Use directories
that are not active in another ChatGPT process. Arguments after `--` are passed
to ChatGPT. For example:

```sh
node scripts/launch-isolated-chatgpt.mjs --skip-onboarding -- \
  --remote-debugging-port=9337
```

`open -n` asks macOS Launch Services to create a new application instance.
The instance is not a child of the shell after launch. `-F` prevents macOS
from restoring windows from another launch.

Do not start the executable as a background child of a short-lived command
runner. The runner can stop the child when the command ends, even if the
command uses `nohup`.

Do not use the ChatGPTX launcher for this procedure. The ChatGPTX launcher
loads the extension platform through `NODE_OPTIONS`. Its `--test-api` mode also
loads the platform and requires an exact binding for the installed ChatGPT
build.

## Verify the instance

Use the process ID printed by the script and confirm the profile argument:

```sh
ps -p <process-id> -o pid=,ppid=,etime=,command=
```

The main process must use the new `--user-data-dir`. A Launch Services process
normally has process ID `1` as its parent after launch.

Confirm only the isolation-related environment values:

```sh
ps eww -p <process-id> \
  | tr ' ' '\n' \
  | rg '^(CODEX_HOME|NODE_OPTIONS|DYLD_INSERT_LIBRARIES|CHATGPTX_LAUNCH_CONFIGURATION|CHATGPTX_VERSIONS_LOCK|SKY_CUA_SERVICE_PATH)='
```

The output must show the new `CODEX_HOME`. The injection variables must be
empty. `SKY_CUA_SERVICE_PATH` must point to the primary native helper
application. Files created under both selected directories give a second
check that the instance uses the isolated state.

If clicks stop working, close that instance before it exhausts its heap. Check
its standard error log for repeated
`sandbox_extension_issue_file_to_process` messages. The canonical script
checks for this retry loop during startup and stops a failed instance.
