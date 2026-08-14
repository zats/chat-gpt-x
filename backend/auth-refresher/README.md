# Codex auth refresher

This Cloudflare Worker owns the renewable Codex OAuth credential for the
`codex-agent` GitHub environment. It runs at `04:17 UTC` once each day.

The worker does these operations in order:

1. It gets a D1 lease.
2. It decrypts the full OAuth document.
3. It refreshes the OAuth tokens.
4. It immediately saves the rotated tokens to D1.
5. It validates the access token with OpenAI's OAuth user information endpoint.
6. It writes an access-only auth document to the GitHub environment secret.
7. It compares the JWT `exp` value with the next daily scheduled time.

The Worker logs an error and reports unhealthy status if the access token will
expire no later than the next run. It still publishes the token if validation
succeeds and the token is currently valid.

## Security boundary

- D1 stores one AES-256-GCM encrypted auth document.
- `AUTH_ENCRYPTION_KEY` is a Worker secret. It is not in D1.
- GitHub receives the current access token and account ID only.
- GitHub never receives the refresh token.
- A repository-scoped GitHub App writes the environment secret. Its only
  repository permission is `Environments: read and write`.
- The Worker has no HTTP refresh or credential bootstrap route.
- `GET /health` returns only timestamps, status, and safe error metadata.

If OpenAI rejects the renewable credential permanently, the job fails closed.
An operator must complete a new OpenAI sign-in and explicitly replace the
encrypted D1 row. There is no alternate runtime credential.

## Cloudflare configuration

Apply the D1 migration:

```sh
pnpm wrangler d1 migrations apply chatgptx-codex-auth --remote
```

Configure these Worker secrets:

```sh
pnpm wrangler secret put AUTH_ENCRYPTION_KEY
pnpm wrangler secret put GITHUB_APP_PRIVATE_KEY
```

`AUTH_ENCRYPTION_KEY` is 32 random bytes in standard Base64. The GitHub App key
must use PKCS#8 PEM format. Convert a GitHub PKCS#1 key before upload:

```sh
openssl pkcs8 -topk8 -nocrypt -in downloaded-key.pem -out private-key.pk8.pem
```

Set the GitHub App ID and installation ID in `wrangler.toml`, and then deploy:

```sh
pnpm test
pnpm typecheck
pnpm deploy
```

Provisioning is a separate operator action. Encrypt the complete Codex
`auth.json` with the same AES-GCM format and insert the single `codex-agent`
row. Do not add a runtime bootstrap endpoint.
