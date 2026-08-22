# Codex Version Watch Cloudflare Worker

This Worker checks the Codex Sparkle feed every five minutes and opens an issue when the latest app version does not have a binding. Applying the `pending` label starts the binding workflow. If the workflow fails, an authorized repository collaborator can comment `retry` on the failed issue to start the same workflow again from the current `main` branch. The retry stops before download if a newer version issue is known.

## What It Does

1. Reads `https://persistent.oaistatic.com/codex-app-prod/appcast.xml`.
2. Reads `src/platform/bindings/manifest.json` and fails if its binding folder is missing.
3. Stops when the latest Sparkle version has an exact binding folder.
4. Stops when an issue named `ChatGPT <version> available` already exists.
5. Opens an issue with versioned JSON metadata and applies `pending`.
6. GitHub starts `Rebind ChatGPT` when `pending` is applied.
7. On failure, GitHub leaves the issue open with `failed`. An owner, member, or collaborator can comment exactly `retry` after the fix is on `main`. GitHub rejects the retry if a newer version issue exists.
8. The same workflow removes `failed`, applies `in-progress`, creates and validates the binding, merges it, publishes its releases, applies `success`, and closes the issue.

The binding folder and issue are the durable deduplication records.
Repository CI enforces the same manifest and folder invariant.

## Setup

Create a fine-grained GitHub token for `zats/chat-gpt-x` with:

- Contents: read
- Issues: read/write

Then configure Cloudflare:

```fish
cd backend/version-watcher
pnpm install
pnpm exec wrangler secret put GITHUB_TOKEN
pnpm exec wrangler deploy
```

## Manual Test

After deployment:

```fish
curl https://codex-version-watch.<your-subdomain>.workers.dev/check
```

The response identifies whether a binding or issue already handles the version, or a new issue was created.

## Local Trigger

Run the complete production issue flow from the repository root:

```fish
scripts/trigger-chatgpt-rebind.mjs
```

The script uses the latest Sparkle item and reads the repository default branch through GitHub. It stops when the binding or an exact version issue exists. Otherwise, it creates the same metadata issue as the Worker and applies `pending`. The existing issue workflow then reports progress, creates and validates the binding pull request, merges it, runs post-merge CI, publishes releases, and updates the issue.

Force a fresh run even when the issue or binding exists:

```fish
scripts/trigger-chatgpt-rebind.mjs --force
```

For an existing binding, force mode requests a same-build correction and requires one binding patch-version increment. It creates a new issue so every progress comment and workflow update has a distinct durable record.

The script requires an authenticated GitHub CLI session with Contents read and Issues read/write access. It uses the current repository and its default branch. `CHATGPTX_GITHUB_REPOSITORY` and `CHATGPTX_GITHUB_BRANCH` can select a different target.

## Configuration

Defaults live in `wrangler.toml`:

- `GITHUB_OWNER`: GitHub owner.
- `GITHUB_REPO`: GitHub repository.
- `GITHUB_BRANCH`: branch containing bindings.

The cron schedule also lives in `wrangler.toml`.
