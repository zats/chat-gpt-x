# Codex Version Watch Cloudflare Worker

This Worker checks the Codex Sparkle feed every five minutes and opens one issue for each app version that does not have bindings.

## What It Does

1. Reads `https://persistent.oaistatic.com/codex-app-prod/appcast.xml`.
2. Stops when `src/platform/bindings/<version>/` already exists.
3. Stops when an issue named `ChatGPT <version> available` already exists.
4. Opens an issue for a new version.

The binding folder and issue are the durable deduplication records.

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

## Configuration

Defaults live in `wrangler.toml`:

- `GITHUB_OWNER`: GitHub owner.
- `GITHUB_REPO`: GitHub repository.
- `GITHUB_BRANCH`: branch containing bindings.

The cron schedule also lives in `wrangler.toml`.
