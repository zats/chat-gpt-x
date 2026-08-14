import { describe, expect, it } from "vitest";
import { decryptJson, encryptJson, toBase64 } from "./crypto";

describe("encrypted D1 auth", () => {
  it("round-trips JSON with AES-GCM", async () => {
    const key = toBase64(crypto.getRandomValues(new Uint8Array(32)));
    const value = { tokens: { access_token: "access", refresh_token: "refresh" } };
    const encrypted = await encryptJson(value, key);

    expect(encrypted.ciphertext).not.toContain("access");
    await expect(decryptJson(encrypted, key)).resolves.toEqual(value);
  });

  it("rejects a wrong encryption key", async () => {
    const key = toBase64(crypto.getRandomValues(new Uint8Array(32)));
    const wrongKey = toBase64(crypto.getRandomValues(new Uint8Array(32)));
    const encrypted = await encryptJson({ value: "secret" }, key);
    await expect(decryptJson(encrypted, wrongKey)).rejects.toThrow();
  });
});
