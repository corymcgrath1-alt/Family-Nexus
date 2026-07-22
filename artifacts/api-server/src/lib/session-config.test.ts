import assert from "node:assert/strict";
import test from "node:test";

import { resolveSessionSecret } from "./session-config";

test("production fails closed when SESSION_SECRET is missing", () => {
  assert.throws(() => resolveSessionSecret({ NODE_ENV: "production" }), /SESSION_SECRET is required/);
});

test("production rejects weak and known placeholder secrets", () => {
  for (const secret of [
    "too-short",
    "aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa",
    "dev-secret-change-in-production",
    "replace-with-a-local-random-secret",
  ]) {
    assert.throws(() => resolveSessionSecret({ NODE_ENV: "production", SESSION_SECRET: secret }), /non-placeholder production secret/);
  }
});

test("production accepts an explicitly configured strong secret", () => {
  const secret = "r7V!q2Lm#9Px$4Za^8Nc&1Ws*6Jk@3Hd";
  assert.equal(resolveSessionSecret({ NODE_ENV: "production", SESSION_SECRET: secret }), secret);
});

test("development and test require an explicit bounded secret", () => {
  assert.throws(() => resolveSessionSecret({ NODE_ENV: "test" }), /SESSION_SECRET is required/);
  assert.throws(() => resolveSessionSecret({ NODE_ENV: "development", SESSION_SECRET: "short" }), /at least 16 bytes/);
  assert.equal(
    resolveSessionSecret({ NODE_ENV: "test", SESSION_SECRET: "explicit-test-secret" }),
    "explicit-test-secret",
  );
});
