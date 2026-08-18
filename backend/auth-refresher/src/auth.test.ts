import { afterEach, describe, expect, it, vi } from "vitest";
import {
  accessTokenExpiry,
  externalAuthDocument,
  refreshAuth,
  validateAccessToken,
} from "./auth";
import type { AuthDocument } from "./types";
import { jwtAt } from "./test-helpers";

const current: AuthDocument = {
  auth_mode: "chatgpt",
  profile: { retained: true },
  tokens: {
    access_token: jwtAt("2026-08-14T10:00:00.000Z"),
    refresh_token: "old-refresh",
    id_token: "old-id",
    account_id: "account-1",
  },
};

afterEach(() => {
  vi.restoreAllMocks();
});

describe("Codex auth refresh", () => {
  it("rotates returned fields and preserves omitted fields", async () => {
    const newAccess = jwtAt("2026-08-16T10:00:00.000Z");
    const fetchMock = vi.fn().mockResolvedValue(
      Response.json({
        access_token: newAccess,
        refresh_token: "new-refresh",
      }),
    );

    const refreshed = await refreshAuth(
      current,
      new Date("2026-08-14T08:00:00.000Z"),
      fetchMock,
    );

    expect(refreshed).toMatchObject({
      auth_mode: "chatgpt",
      profile: { retained: true },
      last_refresh: "2026-08-14T08:00:00.000Z",
      tokens: {
        access_token: newAccess,
        refresh_token: "new-refresh",
        id_token: "old-id",
        account_id: "account-1",
      },
    });
    const request = fetchMock.mock.calls[0][1] as RequestInit;
    expect(JSON.parse(request.body as string)).toEqual({
      client_id: "app_EMoamEEZ73f0CkXaXp7hrann",
      grant_type: "refresh_token",
      refresh_token: "old-refresh",
    });
    expect(current.tokens.refresh_token).toBe("old-refresh");
  });

  it("does not include a remote response body in an error", async () => {
    const fetchMock = vi.fn().mockResolvedValue(
      Response.json(
        { error: { code: "refresh_token_reused", secret: "do-not-log" } },
        { status: 401 },
      ),
    );

    await expect(
      refreshAuth(current, new Date(), fetchMock),
    ).rejects.toThrow(
      "The OpenAI token refresh failed with HTTP 401 (refresh_token_reused)",
    );
    await expect(
      refreshAuth(current, new Date(), fetchMock),
    ).rejects.not.toThrow(/do-not-log/);
  });
});

describe("access token handling", () => {
  it("reads valid-until from the JWT expiry", () => {
    expect(accessTokenExpiry(jwtAt("2026-08-16T10:00:00.000Z"))).toEqual(
      new Date("2026-08-16T10:00:00.000Z"),
    );
  });

  it("validates access with the OpenAI user information endpoint", async () => {
    const fetchMock = vi.fn().mockResolvedValue(Response.json({ models: [] }));
    await validateAccessToken(current, fetchMock);
    expect(fetchMock).toHaveBeenCalledWith(
      "https://auth.openai.com/api/accounts/oauth/userinfo",
      expect.objectContaining({
        headers: expect.objectContaining({
          Authorization: expect.stringMatching(/^Bearer /),
          "User-Agent": "chatgptx-codex-auth-refresher",
        }),
      }),
    );
  });

  it("creates an access-only external auth document", () => {
    const mirror = externalAuthDocument(
      current,
      new Date("2026-08-14T08:00:00.000Z"),
    );
    expect(mirror).toEqual({
      auth_mode: "chatgptAuthTokens",
      OPENAI_API_KEY: null,
      tokens: {
        id_token: current.tokens.access_token,
        access_token: current.tokens.access_token,
        refresh_token: "",
        account_id: "account-1",
      },
      last_refresh: "2026-08-14T08:00:00.000Z",
    });
    expect(JSON.stringify(mirror)).not.toContain("old-refresh");
  });
});
