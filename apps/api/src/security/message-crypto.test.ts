import assert from "node:assert/strict";
import { createCipheriv, randomBytes } from "node:crypto";
import { describe, it } from "node:test";
import { decryptMessageBody, encryptMessageBody, isEncryptedMessageBody } from "./message-crypto";

const key = randomBytes(32).toString("base64");

describe("message crypto", () => {
  it("encrypts message bodies at rest and decrypts them for API responses", () => {
    const encrypted = encryptMessageBody("Please bring water to table 4", key);

    assert.equal(isEncryptedMessageBody(encrypted), true);
    assert.notEqual(encrypted, "Please bring water to table 4");
    assert.equal(encrypted.includes("Please bring water"), false);
    assert.equal(decryptMessageBody(encrypted, key), "Please bring water to table 4");
  });

  it("keeps legacy plaintext messages readable during migration", () => {
    assert.equal(decryptMessageBody("legacy plaintext", key), "legacy plaintext");
  });

  it("decrypts pre-Madupe message bodies encrypted with the old GuestOS AAD", () => {
    const encrypted = encryptWithLegacyAad("Old message body", key);

    assert.equal(decryptMessageBody(encrypted, key), "Old message body");
  });

  it("requires a production encryption key before writing messages", () => {
    assert.throws(() => encryptMessageBody("sensitive text", undefined, { requireKey: true }), /MESSAGE_ENCRYPTION_KEY/);
  });
});

function encryptWithLegacyAad(body: string, rawKey: string) {
  const keyBytes = Buffer.from(rawKey, "base64");
  const iv = randomBytes(12);
  const cipher = createCipheriv("aes-256-gcm", keyBytes, iv);
  cipher.setAAD(Buffer.from("guestos:message:v1", "utf8"));
  const ciphertext = Buffer.concat([cipher.update(body, "utf8"), cipher.final()]);
  const tag = cipher.getAuthTag();

  return [
    "enc:v1",
    iv.toString("base64url"),
    tag.toString("base64url"),
    ciphertext.toString("base64url")
  ].join(":");
}
