# Codex Version Watch Cloudflare Worker

This Worker checks the Codex Sparkle feed every five minutes, records unsupported versions in `updates/chatgpt.json`, and opens one issue for each app version that does not have bindings. Applying the `pending` label starts the binding workflow.

## What It Does

1. Reads `https://persistent.oaistatic.com/codex-app-prod/appcast.xml`.
2. Reads `src/platform/bindings/manifest.json` and fails if its binding folder is missing.
3. Stops when the manifest pins the latest Sparkle version.
4. Updates `updates/chatgpt.json` to report the new version as unsupported.
5. Stops when an issue named `ChatGPT <version> available` already exists.
6. Opens an issue with versioned JSON metadata and applies `pending`.
7. GitHub starts `Rebind ChatGPT` when `pending` is applied.

The binding folder and issue are the durable deduplication records.
Repository CI enforces the same manifest and folder invariant.

## Setup

Create a fine-grained GitHub token for `zats/chat-gpt-x` with:

- Contents: read/write
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

## Configuration

Defaults live in `wrangler.toml`:

- `GITHUB_OWNER`: GitHub owner.
- `GITHUB_REPO`: GitHub repository.
- `GITHUB_BRANCH`: branch containing bindings.

The cron schedule also lives in `wrangler.toml`.
