---
name: rebind-chatgpt-version
description: Create and validate a version-pinned binding for an updated ChatGPT desktop (Codex Electron) build, or correct an existing binding for the same build. Use when the installed app version or app.asar hash changes, the launcher reports an unsupported version, or a user asks to upgrade, rebind, or correct `src/platform/bindings`. Covers exact-build extraction, fast anchor-based rebinding, same-build binding version increments, stock-versus-injected behavior comparison, deterministic public and native UI testing, derivation documentation, packaging checks, and cleanup.
---

# Rebind ChatGPT Version

Create a binding for a new build or correct the binding for an existing build. Prove the existing public API against the real app. Optimize for the common case where internal module paths and exports moved while product behavior stayed the same.

## Load the source workflow

Read these files completely before editing:

1. `../manage-platform-api/SKILL.md`
2. `../manage-platform-api/references/app-facts.md`
3. `../manage-platform-api/references/anchor-heuristics.md`
4. The newest prior binding's `DERIVATION.md`

Use `manage-platform-api` as the authority for platform invariants and research mechanics. This skill supplies the rebinding fast path.

## Set the binding mode

Use `new` mode when the target build has no binding directory. Create `src/platform/bindings/<new-version>/` at version `1.0.0`. Keep every existing binding directory unchanged.

Use `correction` mode when the target build already has a binding directory. Edit only that binding directory and increment its patch version by exactly one. Keep every other binding directory and all extension manifests unchanged.

In both modes, keep `src/platform/types.d.ts`, `src/extensions/api-test-suite/`, extension source, unrelated files, and user state unchanged. Do not add compatibility paths, fallback bindings, machine-specific paths, account names, or profile data.

If the current build makes the API impossible to implement, report that fact instead of changing the API.

## Fast workflow

### 1. Pin the exact installed build

1. Inspect repository status and preserve unrelated work.
2. Read `CFBundleShortVersionString`, the Electron version, and the SHA-256 of the installed `app.asar`.
3. Identify the target binding for correction mode or the newest completed prior binding for new mode.
4. Run the extraction script from `manage-platform-api` with `--expect-version <new-version>`. Work only in the returned temp directory.
5. Stop if the version or hash changes during the task.

Record the version, hash, exact Sparkle enclosure URL, and current ChatGPT API version immediately. They define the target directory, binding manifest identity, and current CI pin.

### 2. Prepare the target binding

In `new` mode, copy the prior binding into the new version directory. Update only the new copy:

- manifest `version` to `1.0.0`, `chatgpt` to the new app version, `chatgptApi` to the unchanged API version, plus the app.asar hash, Electron version, and binding date;
- version constants and usage text in the host and native UI test;
- version-specific module paths, exports, locators, and derivation findings.

In `correction` mode, retain the target directory identity, increment its binding patch version by exactly one, and update its implementation and derivation. Preserve its `chatgpt` and `chatgptApi` values.

Run syntax and manifest checks early. Verify the immutable paths still have no diff before continuing.

### 3. Re-derive changed internals narrowly

Treat every old chunk filename and minified export as a hypothesis.

1. Start from the prior `DERIVATION.md` behavioral anchors.
2. Search the extracted current build by FormatJS ids and protocol strings.
3. Follow current ESM imports to the app's menu components, shared React/JSX runtime, icons, and other required native components.
4. Verify export identities from their behavior and prop contracts. Matching minified letters are insufficient evidence.
5. Update the new host with the verified current paths and exports.

Avoid broad reverse engineering until an anchor fails. Static inspection produces candidates; live behavior confirms them.

### 4. Capture a stock behavioral baseline

Before testing the binding, run the stock app with an isolated authenticated profile and a CDP port. Observe the profile menu without injection.

Inventory every safe built-in affordance relevant to the API:

- rows with chevrons or expanding content;
- disabled and informational rows;
- shortcuts, subtext, icons, and dynamic labels;
- safe navigation actions and focus/keyboard behavior.

Do not activate destructive actions such as Log out. Use renderer state and console output alongside screenshots.

Compare component ownership across the fiber/element tree. The visible Item often owns only presentation. A parent such as SubmenuItem may own expansion, state, event handlers, and children. Preserve the native wrapper and its children when that is where behavior lives; retaining a chevron prop alone can produce a row that looks interactive and does nothing.

### 5. Implement the binding

Reuse the app's current native components and keep the stable transformer and registration semantics intact. Confirm multiple extensions still compose in load order and remain isolated.

When a built-in component is reconstructed:

- capture the complete native behavior boundary, including owning ancestors;
- preserve current app children and handlers unless an extension explicitly replaces them through the public API;
- keep `getItems()` and `activateItem()` aligned with what is rendered;
- recapture dynamic app state on each relevant mount.

### 6. Test against the real app

Use a throwaway `--user-data-dir` and an authenticated profile copy as described in `app-facts.md`. Keep the stock app bundle untouched.

Validate in this order:

1. Reproduce any discovered behavioral mismatch with a failing version-specific `ui-test.mjs` check.
2. Build the packaged launcher and run its executable with `--test-api`; require every unchanged public `api-test-suite` test to pass. This mode restarts ChatGPT with only the suite enabled and does not modify persistent extension settings.
3. Run the new version's native UI suite; require every check to pass.
4. Run the API test extension together with representative shipped extensions to catch composition failures.
5. Disable the test extension, then verify the normal shipped-extension flow.
6. When producing a launcher artifact, build Release, verify its signature, compare the packaged binding files with source, and repeat the critical interaction through the packaged bridge.
7. After the binding passes, update `src/platform/bindings/manifest.json` to the target version and exact Sparkle enclosure URL when needed. In `new` mode, expand `compatibility.chatgpt` and increment the version of every public extension validated on the new build; keep its source unchanged. In `correction` mode, keep all extension manifests unchanged. Increment `updates/latest.json` generation once, preserve its existing schema-v2 maps, and add or replace the target binding entry. Set changed `sha256` values to 64 zeroes, then run `scripts/refresh-update-index-hashes.sh <base-sha>` and `node scripts/validate-pinned-chatgpt.mjs`.

Treat a result file as current only when the bridge log from the test PID and timestamp records that exact result. Missing, partial, stale, or unauthenticated results fail the run. Never weaken an assertion to obtain green tests.

Restore extension settings exactly after testing. Stop only the throwaway processes and send all temp profiles, extractions, and logs to Trash.

### 7. Record the final derivation

Write `src/platform/bindings/<target-version>/DERIVATION.md` with only the final working approach:

- pinned version, hash, and Electron version;
- semantic anchors and current extracted-build locations;
- verified component exports and ownership boundaries;
- binding behavior and meaningful failure signatures;
- exact public-suite and native-suite commands and results.

Keep version-specific facts in this derivation. Do not copy them into this skill or the durable `manage-platform-api` references.

## Completion gate

Finish only when all conditions hold:

- In `new` mode, the new directory and manifest declare binding version `1.0.0`. In `correction` mode, the target manifest increments its prior patch version by exactly one.
- The target manifest matches the tested ChatGPT version, API version, and app.asar.
- The current bindings manifest points to the target version and exact download URL, and its validator passes.
- `updates/latest.json` preserves schema v2, identifies the target binding release by ChatGPT version, contains the deterministic archive hash, and the component release plan passes.
- Every referenced current-build module exists and its export was verified.
- The public API and extension source are unchanged. Non-target binding directories are unchanged.
- In `new` mode, every validated extension manifest includes the new ChatGPT version and has an incremented version. In `correction` mode, all extension manifests are unchanged.
- The unchanged public suite passes against the live app.
- The target native UI suite passes, including every stock interactive affordance observed in the baseline.
- Representative shipped extensions work together.
- The packaged artifact matches source when packaging is in scope.
- `DERIVATION.md` describes the final current solution.
- User settings are restored and all throwaway artifacts and processes are cleaned up.
