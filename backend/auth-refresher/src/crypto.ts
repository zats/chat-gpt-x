const additionalData = new TextEncoder().encode(
  "chatgptx-codex-agent-auth-v1",
);

export interface EncryptedValue {
  ciphertext: string;
  iv: string;
}

export async function encryptJson(
  value: unknown,
  encodedKey: string,
): Promise<EncryptedValue> {
  const key = await importKey(encodedKey);
  const iv = crypto.getRandomValues(new Uint8Array(12));
  const plaintext = new TextEncoder().encode(JSON.stringify(value));
  const ciphertext = await crypto.subtle.encrypt(
    { name: "AES-GCM", iv, additionalData },
    key,
    plaintext,
  );
  return {
    ciphertext: toBase64(new Uint8Array(ciphertext)),
    iv: toBase64(iv),
  };
}

export async function decryptJson<T>(
  encrypted: EncryptedValue,
  encodedKey: string,
): Promise<T> {
  const key = await importKey(encodedKey);
  const plaintext = await crypto.subtle.decrypt(
    {
      name: "AES-GCM",
      iv: fromBase64(encrypted.iv),
      additionalData,
    },
    key,
    fromBase64(encrypted.ciphertext),
  );
  return JSON.parse(new TextDecoder().decode(plaintext)) as T;
}

async function importKey(encodedKey: string): Promise<CryptoKey> {
  const key = fromBase64(encodedKey);
  if (key.byteLength !== 32) {
    throw new Error("AUTH_ENCRYPTION_KEY must contain exactly 32 bytes");
  }
  return crypto.subtle.importKey("raw", key, "AES-GCM", false, [
    "encrypt",
    "decrypt",
  ]);
}

export function toBase64(value: Uint8Array): string {
  let binary = "";
  for (const byte of value) binary += String.fromCharCode(byte);
  return btoa(binary);
}

export function fromBase64(value: string): Uint8Array<ArrayBuffer> {
  const binary = atob(value);
  const result = new Uint8Array(binary.length);
  for (let index = 0; index < binary.length; index += 1) {
    result[index] = binary.charCodeAt(index);
  }
  return result;
}
