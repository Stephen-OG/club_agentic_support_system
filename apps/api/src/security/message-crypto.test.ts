import assert from "node:assert/strict";
import { randomBytes } from "node:crypto";
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

  it("requires a production encryption key before writing messages", () => {
    assert.throws(() => encryptMessageBody("sensitive text", undefined, { requireKey: true }), /MESSAGE_ENCRYPTION_KEY/);
  });
});
