import { cryptoBoxSeal } from "@serenity-kit/noble-sodium";
import { fromBase64, toBase64 } from "./crypto";
import type { Env } from "./types";

const githubApi = "https://api.github.com";

export class GitHubOperationError extends Error {
  readonly code = "github_secret_update_failed";

  constructor(message: string) {
    super(message);
    this.name = "GitHubOperationError";
  }
}

export async function publishEnvironmentSecret(
  env: Env,
  value: string,
  fetchImpl: typeof fetch = fetch,
): Promise<void> {
  const appJwt = await createAppJwt(env.GITHUB_APP_ID, env.GITHUB_APP_PRIVATE_KEY);
  const installation = await githubJson<{ token?: unknown }>(
    `/app/installations/${encodeURIComponent(env.GITHUB_INSTALLATION_ID)}/access_tokens`,
    {
      method: "POST",
      headers: { Authorization: `Bearer ${appJwt}` },
    },
    fetchImpl,
  );
  if (typeof installation.token !== "string" || installation.token.length === 0) {
    throw new GitHubOperationError(
      "GitHub did not return an installation access token",
    );
  }

  const repository =
    `/repos/${encodeURIComponent(env.GITHUB_OWNER)}` +
    `/${encodeURIComponent(env.GITHUB_REPO)}`;
  const environment = encodeURIComponent(env.GITHUB_ENVIRONMENT);
  const auth = { Authorization: `Bearer ${installation.token}` };
  const publicKey = await githubJson<{ key?: unknown; key_id?: unknown }>(
    `${repository}/environments/${environment}/secrets/public-key`,
    { headers: auth },
    fetchImpl,
  );
  if (
    typeof publicKey.key !== "string" ||
    typeof publicKey.key_id !== "string"
  ) {
    throw new GitHubOperationError(
      "GitHub did not return an environment public key",
    );
  }

  const encrypted = cryptoBoxSeal({
    message: new TextEncoder().encode(value),
    publicKey: fromBase64(publicKey.key),
  });
  await githubJson(
    `${repository}/environments/${environment}/secrets/${encodeURIComponent(env.GITHUB_SECRET_NAME)}`,
    {
      method: "PUT",
      headers: auth,
      body: JSON.stringify({
        encrypted_value: toBase64(encrypted),
        key_id: publicKey.key_id,
      }),
    },
    fetchImpl,
  );
}

async function createAppJwt(appId: string, privateKey: string): Promise<string> {
  const now = Math.floor(Date.now() / 1000);
  const header = encodeJwtPart({ alg: "RS256", typ: "JWT" });
  const payload = encodeJwtPart({ iat: now - 60, exp: now + 540, iss: appId });
  const unsigned = `${header}.${payload}`;
  let key: CryptoKey;
  try {
    key = await crypto.subtle.importKey(
      "pkcs8",
      pemContents(privateKey),
      { name: "RSASSA-PKCS1-v1_5", hash: "SHA-256" },
      false,
      ["sign"],
    );
  } catch {
    throw new GitHubOperationError(
      "GITHUB_APP_PRIVATE_KEY must be a PKCS#8 RSA private key",
    );
  }
  const signature = await crypto.subtle.sign(
    "RSASSA-PKCS1-v1_5",
    key,
    new TextEncoder().encode(unsigned),
  );
  return `${unsigned}.${toBase64Url(new Uint8Array(signature))}`;
}

async function githubJson<T = Record<string, unknown>>(
  path: string,
  init: RequestInit,
  fetchImpl: typeof fetch,
): Promise<T> {
  const headers = new Headers(init.headers);
  headers.set("Accept", "application/vnd.github+json");
  headers.set("Content-Type", "application/json");
  headers.set("User-Agent", "chatgptx-codex-auth-refresher");
  headers.set("X-GitHub-Api-Version", "2022-11-28");

  let response: Response | null = null;
  for (let attempt = 0; attempt < 3; attempt += 1) {
    try {
      response = await fetchImpl(`${githubApi}${path}`, {
        ...init,
        headers,
        signal: init.signal ?? AbortSignal.timeout(15_000),
      });
    } catch {
      response = null;
    }
    if (response && response.ok) {
      if (response.status === 204) return {} as T;
      return (await response.json()) as T;
    }
    if (response && response.status < 500 && response.status !== 429) break;
    if (attempt < 2) await delay(250 * 3 ** attempt);
  }

  const status = response ? `HTTP ${response.status}` : "a network error";
  throw new GitHubOperationError(`The GitHub API request failed with ${status}`);
}

function encodeJwtPart(value: unknown): string {
  return toBase64Url(new TextEncoder().encode(JSON.stringify(value)));
}

function toBase64Url(value: Uint8Array): string {
  return toBase64(value)
    .replace(/\+/g, "-")
    .replace(/\//g, "_")
    .replace(/=+$/g, "");
}

function pemContents(pem: string): Uint8Array<ArrayBuffer> {
  const encoded = pem
    .replace(/-----BEGIN PRIVATE KEY-----/g, "")
    .replace(/-----END PRIVATE KEY-----/g, "")
    .replace(/\s/g, "");
  if (encoded.length === 0) throw new Error("empty PEM");
  return fromBase64(encoded);
}

function delay(milliseconds: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, milliseconds));
}
