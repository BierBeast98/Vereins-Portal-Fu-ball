import { test } from "node:test";
import assert from "node:assert/strict";
import { scrypt } from "node:crypto";
import { hashPassword, verifyPassword, isPasswordHash, passwordVersion } from "./passwords";

test("new hashes are salted, versioned, and authenticate the original password only", async () => {
  const first = await hashPassword("test-password-äöü");
  const second = await hashPassword("test-password-äöü");
  assert.notEqual(first, second);
  assert.ok(first.startsWith("scrypt$v1$32768$8$3$"));
  assert.ok(isPasswordHash(first));
  assert.equal(first.includes("test-password"), false);
  assert.ok(await verifyPassword("test-password-äöü", first));
  assert.equal(await verifyPassword("wrong", first), false);
  assert.equal(passwordVersion(first), passwordVersion(first));
  assert.notEqual(passwordVersion(first), passwordVersion(second));
  assert.match(passwordVersion(first), /^[a-f0-9]{64}$/);
});

test("plaintext and absent hashes never authenticate", async () => {
  for (const encoded of [null, undefined, "", "plaintext-password"]) {
    assert.equal(await verifyPassword("plaintext-password", encoded), false);
  }
  assert.equal(isPasswordHash("plaintext-password"), false);
  const valid = `scrypt:${"a".repeat(32)}:${"b".repeat(128)}`;
  assert.equal(await verifyPassword("ü".repeat(513), valid), false);
});

test("malformed and excessive work parameters are rejected before deriving a key", async () => {
  const salt = "a".repeat(32), key = "b".repeat(128);
  const malformed = [
    `scrypt$v1$1073741824$8$3$${salt}$${key}`,
    `scrypt$v1$32768$800000$3$${salt}$${key}`,
    `scrypt$v1$32768$8$30000$${salt}$${key}`,
    `scrypt$v2$32768$8$3$${salt}$${key}`,
    `scrypt$v1$32768$8$3$${salt}$${key}:extra`,
    `scrypt:${salt}:${key}:extra`,
    `scrypt:${salt}:${key}\n`,
    `scrypt$v1$32768$8$3$${salt}$${key}\n`,
    `scrypt:${salt}:zz`,
    "scrypt:" + "a".repeat(10000),
  ];
  for (const value of malformed) {
    assert.equal(isPasswordHash(value), false);
    assert.equal(await verifyPassword("anything", value), false);
  }
});

test("existing organization hashes remain readable without plaintext fallback", async () => {
  const salt = "0123456789abcdef0123456789abcdef";
  const key = await new Promise<Buffer>((resolve, reject) => scrypt("legacy-test", salt, 64, (error, value) => error ? reject(error) : resolve(value)));
  const encoded = `scrypt:${salt}:${key.toString("hex")}`;
  assert.ok(isPasswordHash(encoded));
  assert.ok(await verifyPassword("legacy-test", encoded));
  assert.equal(await verifyPassword("wrong", encoded), false);
});
