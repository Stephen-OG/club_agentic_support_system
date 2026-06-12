import { createCipheriv, createDecipheriv, randomBytes } from "node:crypto";

const algorithm = "aes-256-gcm";
const envelopePrefix = "enc:v1";
const aad = Buffer.from("madupe:message:v1", "utf8");
const legacyAads = [Buffer.from("guestos:message:v1", "utf8")];

let cachedEncryptionKey: { raw: string; key: Buffer } | null = null;

function getEncryptionKey(): Buffer | null {
  const raw = process.env.MESSAGE_ENCRYPTION_KEY;
  if (!raw) {
    cachedEncryptionKey = null;
    return null;
  }
  if (cachedEncryptionKey && cachedEncryptionKey.raw === raw) {
    return cachedEncryptionKey.key;
  }
  cachedEncryptionKey = { raw, key: resolveMessageKey(raw, {}) as Buffer };
  return cachedEncryptionKey.key;
}

type CryptoOptions = {
  requireKey?: boolean;
};

type MessageWithBody = {
  body?: unknown;
};

type MessageCreateData = {
  body: string;
};

export function isEncryptedMessageBody(body: string) {
  return body.startsWith(`${envelopePrefix}:`);
}

export function encryptMessageBody(body: string, rawKey: Buffer | string | null | undefined = getEncryptionKey(), options: CryptoOptions = {}) {
  const key = resolveMessageKey(rawKey, options);

  if (!key) {
    return body;
  }

  const iv = randomBytes(12);
  const cipher = createCipheriv(algorithm, key, iv);
  cipher.setAAD(aad);
  const ciphertext = Buffer.concat([cipher.update(body, "utf8"), cipher.final()]);
  const tag = cipher.getAuthTag();

  return [
    envelopePrefix,
    iv.toString("base64url"),
    tag.toString("base64url"),
    ciphertext.toString("base64url")
  ].join(":");
}

export function decryptMessageBody(body: string, rawKey: Buffer | string | null | undefined = getEncryptionKey()) {
  if (!isEncryptedMessageBody(body)) {
    return body;
  }

  const key = resolveMessageKey(rawKey, { requireKey: true });
  if (!key) {
    throw new Error("MESSAGE_ENCRYPTION_KEY is required to encrypt/decrypt message bodies");
  }
  const [, , ivText, tagText, ciphertextText] = body.split(":");

  if (!ivText || !tagText || !ciphertextText) {
    throw new Error("Encrypted message body is malformed");
  }

  const iv = Buffer.from(ivText, "base64url");
  const tag = Buffer.from(tagText, "base64url");
  const ciphertext = Buffer.from(ciphertextText, "base64url");

  return decryptWithAad(ciphertext, key, iv, tag, [aad, ...legacyAads]);
}

export function encryptMessageCreateData<T extends MessageCreateData>(data: T): T {
  return {
    ...data,
    body: encryptMessageBody(data.body, getEncryptionKey(), {
      requireKey: process.env.NODE_ENV === "production"
    })
  };
}

export function decryptMessageRecord<T extends MessageWithBody>(message: T): T {
  if (typeof message.body !== "string") {
    return message;
  }

  return {
    ...message,
    body: decryptMessageBody(message.body)
  };
}

export function decryptMessageRecords<T extends MessageWithBody>(messages: T[]): T[] {
  return messages.map(decryptMessageRecord);
}

function resolveMessageKey(rawKey: Buffer | string | null | undefined, options: CryptoOptions) {
  if (!rawKey) {
    if (options.requireKey) {
      throw new Error("MESSAGE_ENCRYPTION_KEY is required to encrypt/decrypt message bodies");
    }
    return null;
  }

  const decoded = Buffer.isBuffer(rawKey) ? rawKey : decodeKey(rawKey.trim());

  if (decoded.length !== 32) {
    throw new Error("MESSAGE_ENCRYPTION_KEY must decode to 32 bytes for AES-256-GCM");
  }

  return decoded;
}

function decodeKey(value: string) {
  if (/^[a-f0-9]{64}$/i.test(value)) {
    return Buffer.from(value, "hex");
  }

  return Buffer.from(value, "base64");
}

function decryptWithAad(ciphertext: Buffer, key: Buffer, iv: Buffer, tag: Buffer, aads: Buffer[]) {
  let lastError: unknown;

  for (const aad of aads) {
    try {
      const decipher = createDecipheriv(algorithm, key, iv);
      decipher.setAAD(aad);
      decipher.setAuthTag(tag);

      return Buffer.concat([
        decipher.update(ciphertext),
        decipher.final()
      ]).toString("utf8");
    } catch (error) {
      lastError = error;
    }
  }

  throw lastError;
}
