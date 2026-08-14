import sodium from "libsodium-wrappers";
import { describe, expect, it, vi } from "vitest";
import { fromBase64, toBase64 } from "./crypto";
import { publishEnvironmentSecret } from "./github";
import type { Env } from "./types";

describe("GitHub environment secret publication", () => {
  it("uses an installation token and a sealed-box environment secret", async () => {
    await sodium.ready;
    const githubKey = sodium.crypto_box_keypair();
    const privateKey = await rsaPrivateKeyPem();
    let encryptedValue: string | undefined;
    let keyId: string | undefined;
    const fetchMock = vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
      const url = String(input);
      if (url.endsWith("/app/installations/22/access_tokens")) {
        expect(new Headers(init?.headers).get("Authorization")).toMatch(
          /^Bearer [^.]+\.[^.]+\.[^.]+$/,
        );
        return Response.json({ token: "installation-token" });
      }
      if (url.endsWith("/environments/codex-agent/secrets/public-key")) {
        expect(new Headers(init?.headers).get("Authorization")).toBe(
          "Bearer installation-token",
        );
        return Response.json({
          key: toBase64(githubKey.publicKey),
          key_id: "key-1",
        });
      }
      const updateBody = JSON.parse(init?.body as string) as {
        encrypted_value?: unknown;
        key_id?: unknown;
      };
      encryptedValue = updateBody.encrypted_value as string;
      keyId = updateBody.key_id as string;
      return new Response(null, { status: 204 });
    }) as typeof fetch;

    await publishEnvironmentSecret(
      {
        DB: {} as D1Database,
        AUTH_ENCRYPTION_KEY: "unused",
        GITHUB_APP_PRIVATE_KEY: privateKey,
        GITHUB_APP_ID: "11",
        GITHUB_INSTALLATION_ID: "22",
        GITHUB_OWNER: "zats",
        GITHUB_REPO: "chat-gpt-x",
        GITHUB_ENVIRONMENT: "codex-agent",
        GITHUB_SECRET_NAME: "CODEX_AGENT_AUTH_JSON",
      } satisfies Env,
      "access-only-auth",
      fetchMock,
    );

    expect(fetchMock).toHaveBeenCalledTimes(3);
    expect(keyId).toBe("key-1");
    const plaintext = sodium.crypto_box_seal_open(
      fromBase64(encryptedValue as string),
      githubKey.publicKey,
      githubKey.privateKey,
    );
    expect(new TextDecoder().decode(plaintext)).toBe("access-only-auth");
  });
});

async function rsaPrivateKeyPem(): Promise<string> {
  const pair = (await crypto.subtle.generateKey(
    {
      name: "RSASSA-PKCS1-v1_5",
      modulusLength: 2048,
      publicExponent: new Uint8Array([1, 0, 1]),
      hash: "SHA-256",
    },
    true,
    ["sign", "verify"],
  )) as CryptoKeyPair;
  const pkcs8 = new Uint8Array(
    (await crypto.subtle.exportKey("pkcs8", pair.privateKey)) as ArrayBuffer,
  );
  const encoded = toBase64(pkcs8).match(/.{1,64}/g)?.join("\n");
  return `-----BEGIN PRIVATE KEY-----\n${encoded}\n-----END PRIVATE KEY-----`;
}
