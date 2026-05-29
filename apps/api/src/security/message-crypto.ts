import { createCipheriv, createDecipheriv, randomBytes } from "node:crypto";

const algorithm = "aes-256-gcm";
const envelopePrefix = "enc:v1";
const aad = Buffer.from("guestos:message:v1", "utf8");

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

export function encryptMessageBody(body: string, rawKey = process.env.MESSAGE_ENCRYPTION_KEY, options: CryptoOptions = {}) {
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

export function decryptMessageBody(body: string, rawKey = process.env.MESSAGE_ENCRYPTION_KEY) {
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

  const decipher = createDecipheriv(algorithm, key, Buffer.from(ivText, "base64url"));
  decipher.setAAD(aad);
  decipher.setAuthTag(Buffer.from(tagText, "base64url"));

  return Buffer.concat([
    decipher.update(Buffer.from(ciphertextText, "base64url")),
    decipher.final()
  ]).toString("utf8");
}

export function encryptMessageCreateData<T extends MessageCreateData>(data: T): T {
  return {
    ...data,
    body: encryptMessageBody(data.body, process.env.MESSAGE_ENCRYPTION_KEY, {
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

function resolveMessageKey(rawKey: string | undefined, options: CryptoOptions) {
  if (!rawKey) {
    if (options.requireKey) {
      throw new Error("MESSAGE_ENCRYPTION_KEY is required to encrypt/decrypt message bodies");
    }
    return null;
  }

  const trimmed = rawKey.trim();
  const decoded = decodeKey(trimmed);

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
