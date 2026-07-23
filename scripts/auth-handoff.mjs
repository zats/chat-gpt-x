#!/usr/bin/env node

import {
  createCipheriv,
  createDecipheriv,
  createPrivateKey,
  createPublicKey,
  diffieHellman,
  generateKeyPairSync,
  hkdfSync,
  randomBytes,
} from "node:crypto";
import {
  chmod,
  mkdir,
  readFile,
  rename,
  writeFile,
} from "node:fs/promises";
import path from "node:path";

const [operation, keyPath, inputRoot, outputRoot, ...requestedLabels] =
  process.argv.slice(2);
const labels =
  requestedLabels.length > 0 ? requestedLabels : ["primary", "secondary"];
const context = Buffer.from("chatgptx-ci-auth-handoff-v1");

if (
  !["encrypt", "decrypt"].includes(operation) ||
  !keyPath ||
  !inputRoot ||
  !outputRoot
) {
  throw new Error(
    "usage: auth-handoff.mjs <encrypt|decrypt> <key.pem> <input-root> <output-root> [label ...]",
  );
}
if (labels.some((label) => !/^[a-z][a-z0-9-]*$/.test(label))) {
  throw new Error("handoff labels must be lowercase identifiers");
}

function encode(value) {
  return Buffer.from(value).toString("base64");
}

function decode(value) {
  if (typeof value !== "string") throw new Error("invalid handoff envelope");
  return Buffer.from(value, "base64");
}

async function writePrivateFile(filePath, contents) {
  const temporaryPath = `${filePath}.${process.pid}.tmp`;
  await writeFile(temporaryPath, contents, { mode: 0o600 });
  await rename(temporaryPath, filePath);
  await chmod(filePath, 0o600);
}

await mkdir(outputRoot, { recursive: true, mode: 0o700 });
await chmod(outputRoot, 0o700);

if (operation === "encrypt") {
  const recipient = createPublicKey(await readFile(keyPath, "utf8"));
  if (recipient.asymmetricKeyType !== "x25519") {
    throw new Error("handoff public key must be X25519");
  }

  for (const label of labels) {
    const plaintext = await readFile(path.join(inputRoot, `${label}.json`));
    JSON.parse(plaintext);
    const { privateKey, publicKey } = generateKeyPairSync("x25519");
    const salt = randomBytes(32);
    const nonce = randomBytes(12);
    const sharedSecret = diffieHellman({ privateKey, publicKey: recipient });
    const key = hkdfSync("sha256", sharedSecret, salt, context, 32);
    const cipher = createCipheriv("aes-256-gcm", key, nonce);
    const ciphertext = Buffer.concat([
      cipher.update(plaintext),
      cipher.final(),
    ]);
    const envelope = {
      version: 1,
      ephemeralPublicKey: encode(
        publicKey.export({ format: "der", type: "spki" }),
      ),
      salt: encode(salt),
      nonce: encode(nonce),
      authenticationTag: encode(cipher.getAuthTag()),
      ciphertext: encode(ciphertext),
    };
    await writePrivateFile(
      path.join(outputRoot, `${label}.json`),
      `${JSON.stringify(envelope)}\n`,
    );
  }
} else {
  const recipient = createPrivateKey(await readFile(keyPath, "utf8"));
  if (recipient.asymmetricKeyType !== "x25519") {
    throw new Error("handoff private key must be X25519");
  }

  for (const label of labels) {
    const envelope = JSON.parse(
      await readFile(path.join(inputRoot, `${label}.json`), "utf8"),
    );
    if (envelope.version !== 1) throw new Error("invalid handoff version");
    const ephemeralPublicKey = createPublicKey({
      key: decode(envelope.ephemeralPublicKey),
      format: "der",
      type: "spki",
    });
    if (ephemeralPublicKey.asymmetricKeyType !== "x25519") {
      throw new Error("invalid handoff public key");
    }
    const sharedSecret = diffieHellman({
      privateKey: recipient,
      publicKey: ephemeralPublicKey,
    });
    const key = hkdfSync(
      "sha256",
      sharedSecret,
      decode(envelope.salt),
      context,
      32,
    );
    const decipher = createDecipheriv(
      "aes-256-gcm",
      key,
      decode(envelope.nonce),
    );
    decipher.setAuthTag(decode(envelope.authenticationTag));
    const plaintext = Buffer.concat([
      decipher.update(decode(envelope.ciphertext)),
      decipher.final(),
    ]);
    JSON.parse(plaintext);
    await writePrivateFile(
      path.join(outputRoot, `${label}.json`),
      plaintext,
    );
  }
}
