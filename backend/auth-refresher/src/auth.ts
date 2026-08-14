import type { AuthDocument, TokenFields } from "./types";

const refreshUrl = "https://auth.openai.com/oauth/token";
const userinfoUrl = "https://auth.openai.com/api/accounts/oauth/userinfo";
const clientId = "app_EMoamEEZ73f0CkXaXp7hrann";

export class AuthOperationError extends Error {
  constructor(
    readonly code: string,
    message: string,
  ) {
    super(message);
    this.name = "AuthOperationError";
  }
}

export function parseAuthDocument(value: unknown): AuthDocument {
  if (!isRecord(value) || !isRecord(value.tokens)) {
    throw new AuthOperationError(
      "invalid_auth_document",
      "The stored auth document has no token object",
    );
  }
  const tokens = value.tokens;
  if (
    typeof tokens.access_token !== "string" ||
    tokens.access_token.length === 0 ||
    typeof tokens.refresh_token !== "string" ||
    tokens.refresh_token.length === 0
  ) {
    throw new AuthOperationError(
      "invalid_auth_document",
      "The stored auth document has no usable access or refresh token",
    );
  }
  return value as AuthDocument;
}

export async function refreshAuth(
  current: AuthDocument,
  now: Date,
  fetchImpl: typeof fetch = fetch,
): Promise<AuthDocument> {
  const response = await fetchImpl(refreshUrl, {
    method: "POST",
    headers: {
      Accept: "application/json",
      "Content-Type": "application/json",
      "User-Agent": "chatgptx-codex-auth-refresher",
    },
    body: JSON.stringify({
      client_id: clientId,
      grant_type: "refresh_token",
      refresh_token: current.tokens.refresh_token,
    }),
    signal: AbortSignal.timeout(15_000),
  });

  if (!response.ok) {
    const remoteCode = await readRemoteErrorCode(response);
    const suffix = remoteCode ? ` (${remoteCode})` : "";
    throw new AuthOperationError(
      "refresh_failed",
      `The OpenAI token refresh failed with HTTP ${response.status}${suffix}`,
    );
  }

  const body = await readJsonRecord(response, "refresh_response_invalid");
  const next = structuredClone(current);
  const nextTokens = next.tokens;
  mergeOptionalToken(body, nextTokens, "id_token");
  mergeOptionalToken(body, nextTokens, "access_token");
  mergeOptionalToken(body, nextTokens, "refresh_token");
  next.last_refresh = now.toISOString();
  return parseAuthDocument(next);
}

export function accessTokenExpiry(accessToken: string): Date {
  const parts = accessToken.split(".");
  if (parts.length !== 3) {
    throw new AuthOperationError(
      "access_token_expiry_missing",
      "The refreshed access token has no JWT expiry",
    );
  }

  let payload: unknown;
  try {
    const normalized = parts[1].replace(/-/g, "+").replace(/_/g, "/");
    const padded = normalized.padEnd(
      normalized.length + ((4 - (normalized.length % 4)) % 4),
      "=",
    );
    payload = JSON.parse(atob(padded));
  } catch {
    throw new AuthOperationError(
      "access_token_expiry_invalid",
      "The refreshed access token has an invalid JWT payload",
    );
  }

  if (
    !isRecord(payload) ||
    typeof payload.exp !== "number" ||
    !Number.isSafeInteger(payload.exp) ||
    payload.exp <= 0
  ) {
    throw new AuthOperationError(
      "access_token_expiry_missing",
      "The refreshed access token has no valid expiry",
    );
  }
  return new Date(payload.exp * 1000);
}

export async function validateAccessToken(
  auth: AuthDocument,
  fetchImpl: typeof fetch = fetch,
): Promise<void> {
  const response = await fetchImpl(userinfoUrl, {
    headers: {
      Accept: "application/json",
      Authorization: `Bearer ${auth.tokens.access_token}`,
      "User-Agent": "chatgptx-codex-auth-refresher",
    },
    signal: AbortSignal.timeout(15_000),
  });
  if (!response.ok) {
    throw new AuthOperationError(
      "access_token_validation_failed",
      `The OpenAI user information request failed with HTTP ${response.status}`,
    );
  }
}

export function externalAuthDocument(
  auth: AuthDocument,
  now: Date,
): Record<string, unknown> {
  const accountId = accountIdFrom(auth.tokens);
  return {
    auth_mode: "chatgptAuthTokens",
    OPENAI_API_KEY: null,
    tokens: {
      id_token: auth.tokens.access_token,
      access_token: auth.tokens.access_token,
      refresh_token: "",
      account_id: accountId,
    },
    last_refresh: now.toISOString(),
  };
}

function accountIdFrom(tokens: TokenFields): string {
  if (typeof tokens.account_id !== "string" || tokens.account_id.length === 0) {
    throw new AuthOperationError(
      "account_id_missing",
      "The refreshed auth document has no account ID",
    );
  }
  return tokens.account_id;
}

function mergeOptionalToken(
  source: Record<string, unknown>,
  target: TokenFields,
  key: "id_token" | "access_token" | "refresh_token",
): void {
  const value = source[key];
  if (value === undefined || value === null) return;
  if (typeof value !== "string" || value.length === 0) {
    throw new AuthOperationError(
      "refresh_response_invalid",
      `The refresh response has an invalid ${key}`,
    );
  }
  target[key] = value;
}

async function readRemoteErrorCode(response: Response): Promise<string | null> {
  try {
    const body = await response.json<unknown>();
    if (!isRecord(body)) return null;
    const code = body.code ?? (isRecord(body.error) ? body.error.code : null);
    return typeof code === "string" && /^[a-z0-9_-]{1,80}$/i.test(code)
      ? code
      : null;
  } catch {
    return null;
  }
}

async function readJsonRecord(
  response: Response,
  code: string,
): Promise<Record<string, unknown>> {
  try {
    const body = await response.json<unknown>();
    if (isRecord(body)) return body;
  } catch {
    // Report only the safe local error below.
  }
  throw new AuthOperationError(code, "The refresh response is not JSON data");
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}
