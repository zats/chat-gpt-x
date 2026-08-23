---
name: manage-platform-api
description: Process for evolving the extension platform for the ChatGPT desktop (Electron) app — adding, modifying, or removing public extension APIs in src/platform/types.d.ts, updating the mechanical api-test-suite extension, and researching + implementing version-specific bindings under src/platform/bindings/ against the extracted app. Use whenever the user wants to add a new extension API or capability, change/remove an existing public API, or rebind the APIs to a new version of the app.
---

# Manage Platform API

The platform exposes a **stable public API** (`src/platform/types.d.ts`) whose semantic version lives in `src/platform/manifest.json`. App-version-specific **bindings** (`src/platform/bindings/<version>/`) bridge the current Electron build's minified internals to one exact API version. This skill is the process for evolving both.

Layout conventions (paths, manifests, runtime settings): read `references/file-layout.md` first if the repo structure is unfamiliar.

## Hard rules

- Modify the public API **only on explicit user request** ("add X API", "change Y", "remove Z"). Never invent API changes on your own initiative.
- If the request's intent or semantics are unclear, **clarify with the user before editing**. Safe assumptions are allowed — record them in the API docs and in your summary.
- **Tests define "working".** A binding is not done until the deterministic test suite passes against the real app.
- Document **only the final working approach**. Intermediate failed attempts are noise; the derivation doc records what works and how it was found.
- **No backward compatibility.** APIs change in place, one way — no deprecation shims, aliases, legacy paths, or parallel old/new variants. Remove the old way in the same change that introduces the new one.
- **APIs land only as complete vertical slices.** A public API change increments its semantic version and lands with its updated pinned-app binding, mechanical test extension, and green live suite. Never leave `types.d.ts` ahead of working, validated bindings.

## Core design principle: every API has N consumers

Design every API assuming multiple extensions use it simultaneously. Never let extensions address, detect, or depend on each other — the platform defines composition. Apply these patterns:

- **State-shaping APIs → transformer pattern.** The extension receives the full current state and returns the new state. Example: a profile-menu API hands the extension the list of menu items; it returns items to keep, add, remove, or reorder — the extension controls placement. Transformers chain in extension load order, each seeing the previous one's output. This makes N extensions deterministic by construction.
- **Notification APIs → registration pattern.** Extensions register callbacks (e.g. "assistant turn completed"); invocation order equals extension load order, which the loader defines — never negotiated between extensions. Isolate callbacks: one throwing must not affect the others.
- State the chosen semantics explicitly in the API's TSDoc: ordering guarantees, isolation behavior, what happens on conflicting changes.

## Reuse the app's own components

Extensions built on our APIs must look and behave as if written by the app's own engineers. Achieve this by reusing the app's existing components — especially visual ones — never by replicating them.

Priority order when designing or implementing an API:

1. Find the app's existing component/behavior that does what the user describes.
2. If it is already exposed through our API, reuse it.
3. If it exists but is not exposed, expose it: the binding wraps, renders, or clones the app's own component.
4. Replicate an existing control ONLY as a last resort, and record the justification in DERIVATION.md.

Rationale: reusing the real component preserves not just styling but behavior — keyboard navigation, focus management, states, animations, accessibility — and tracks the app's design-system changes for free. Example: menu items are produced by cloning or wrapping the app's own menu-item component (inheriting hover, disabled, chevron, and submenu semantics), never hand-built markup.

## Process

Follow the phases in order. Do not skip the tests-first step.

### 1. Scope and design the change

Restate what the user asked for: which API, added/modified/removed, intended behavior. Resolve ambiguity with the user now. Apply the N-consumers principle above to pick the API shape.

### 2. Update the public API

Edit `src/platform/types.d.ts`. Every API gets exhaustive TSDoc: intent, exactly when it fires / what it reads / what it mutates, parameter and ordering semantics, multi-consumer behavior, and a usage example. This documentation is what binding-generating agents (human or AI) use to locate the behavior in the app — write it as behavioral description, not just types.

Increment `src/platform/manifest.json` using semantic versioning: major for breaking changes, minor for compatible additions, patch for behavior-preserving fixes. Update the `chatgptApi` value in the pinned binding manifest to that exact version.

### 3. Write tests first

Update the mechanical test extension at `src/extensions/api-test-suite` so **every public API path** — including the new/changed one — is exercised deterministically. Increment its extension version and update its ChatGPTX API compatibility range. Tests must not depend on agent judgment at runtime: they call the API and assert.

**Tests observe behavior through the public API surface only** — never the app's DOM, markup, or internals. Those are the binding's version-specific domain; the suite must stay stable while `src/platform/bindings/<version>/` iterates. If a behavior cannot be observed through the public API, the API lacks observability — extend the API (a design signal), never reach into the app. Rendering correctness is guaranteed by the reuse-first binding strategy and validated once per binding version (recorded in DERIVATION.md), not re-asserted per run.

The suite fails closed: it must be impossible for it to pass without a working binding; a runner treats missing or partial results as failure. If an API cannot be exercised in an unauthenticated session, layer the test (see `references/app-facts.md` § Testing constraints).

### 4. Locate and extract the pinned app version

The API-development app version and stock download URL live in `src/platform/bindings/manifest.json`; that exact version must have a versioned binding directory and use the current ChatGPT API. It does not have to be the numerically newest binding because later app builds can remain on an older API.

When orchestration supplies an exact stock app path and prepared `app.asar` research tree, use only those inputs and confirm their supplied identity. Do not download, discover, or extract another app. Otherwise, verify that the exact version is installed on this machine and extract it to a temp dir:

```bash
scripts/extract-app.sh --expect-version <version>
```

(relative to this skill's directory)

The script prints JSON with `extractDir`. If the version or supplied identity mismatches, stop and report to the user — do not bind against the wrong build. Delete the temp dir when the work finishes.

### 5. Research the extracted build and implement the binding

Work against the extracted sources using the **cascading anchor heuristics** in `references/anchor-heuristics.md` (i18n message IDs → protocol/contract strings → library behavioral invariants → data-testid → display strings last). App architecture facts you will need (injection mechanics, CSP, window factory, React/Radix/rolldown specifics): `references/app-facts.md`.

For each API: find the in-app precedent of the behavior (e.g. existing profile menu items), understand what makes it tick, then implement the binding in `src/platform/bindings/<app-version>/` so the public API works through the real app. When the ChatGPT build is unchanged, edit that existing source directory but never reuse or overwrite its published binding version. A compatible public-API addition increments the binding minor version, a breaking API change increments its major version, and a binding-only correction that keeps the same `chatgptApi` increments its patch version. Keep `chatgpt` exact and set `chatgptApi` to the new API version. The new manifest version produces a new immutable `binding-<chatgpt>-v<version>` release; it does not create a binding-version source directory. Follow "Reuse the app's own components" above: the binding composes the app's own components — it does not re-create their look or behavior.

### 6. Validate against the live app

Build `api-test-suite`, then run the packaged launcher with `--test-api --extension <absolute-api-test-suite-package>` against the real app using a throwaway `--user-data-dir` profile (see `references/app-facts.md` § Injection). This mode restarts ChatGPT with only the explicit suite enabled and leaves persistent extension settings unchanged. Iterate on the binding until the suite is green. If a test cannot pass, the API design or the binding is wrong — fix the cause, not the assertion.

### 7. Document the derivation

Write/update `src/platform/bindings/<version>/DERIVATION.md`: for each API, which anchors located the behavior, where it lives in the build, what the binding does, and what failure signatures indicate a broken binding. This document — plus the public API docs, the heuristics, and the same deterministic tests — is the complete input a future agent needs to **rebind the same API to a new app version** without re-deriving intent.

Update the schema-3 catalog in `updates/latest.json`: increment `generation` once, keep every remotely loadable source binding and its API, preserve all published public-extension versions, and add the current API, exact binding identity, and changed public-extension versions with predictable release tags. Extension compatibility contains only `chatgptApi`. Internal extensions declare `"private": true` and stay out of the index. Set hashes for changed releases to 64 zeroes, then run `scripts/refresh-update-index-hashes.sh <base-sha>` to build deterministic archives, write their SHA-256 values, and validate the final release plan.

## Rebinding to a new app version

When the app updates: same process, new `src/platform/bindings/<new-version>/` directory with binding version `1.0.0`, exact `chatgpt`, exact `asarSha256`, and the `chatgptApi` from the API-development binding named by `src/platform/bindings/manifest.json`. Feed that binding's DERIVATION.md to the rebinding agent as heuristics (things may have changed — verify, don't assume), then confirm with the unchanged deterministic test source. Keep extension manifests unchanged because extensions target the stable ChatGPTX API, not a ChatGPT build. After validation, update `src/platform/bindings/manifest.json` and `updates/latest.json`; both validators must pass. If the new build makes the API impossible, escalate to the user instead of silently changing semantics.

After CI passes on `main`, the landing workflow detects affected public components, publishes version-addressed GitHub Release archives, downloads and verifies every release referenced by the index, and finally publishes `updates/latest.json` as the stable `updates` release asset. Versioned contents live in releases; source directories retain the latest implementation.
