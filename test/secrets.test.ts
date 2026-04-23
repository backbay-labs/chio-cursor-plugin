import { test } from "node:test";
import * as assert from "node:assert/strict";
import { detectSecrets } from "../src/chio/secrets.ts";

// ---- Positive matches (must detect) ----

test("detects AWS access key id", () => {
  const found = detectSecrets("const key = \"AKIAIOSFODNN7EXAMPLE\"");
  assert.equal(found.length, 1);
  assert.equal(found[0]!.kind, "aws.access_key");
});

test("detects GitHub PAT (ghp_ prefix)", () => {
  const pat = "ghp_" + "A".repeat(36);
  const found = detectSecrets(`token: ${pat}`);
  // generic.credential may also match, but at least the github.token rule must hit
  assert.ok(found.some((f) => f.kind === "github.token"));
});

test("detects Stripe live key", () => {
  const found = detectSecrets("stripe: sk_live_" + "a1b2c3d4e5f6g7h8i9j0klmn");
  assert.ok(found.some((f) => f.kind === "stripe.key"));
});

test("detects JWT-shaped tokens", () => {
  const jwt =
    "eyJhbGciOiJIUzI1NiJ9.eyJzdWIiOiIxMjM0NTY3ODkwIn0.4c9DRK2lKFBl7xQ1qgFkNlJqZ8";
  const found = detectSecrets(`Authorization: Bearer ${jwt}`);
  assert.ok(found.some((f) => f.kind === "jwt"));
});

test("detects PEM private key block", () => {
  const pem = "-----BEGIN RSA PRIVATE KEY-----\nMIIE...\n-----END RSA PRIVATE KEY-----";
  const found = detectSecrets(pem);
  assert.ok(found.some((f) => f.kind === "pem.private_key"));
});

test("detects generic password literal with entropy", () => {
  const found = detectSecrets('password = "Xy9zWvQ2aBc7dEf8GhI0"');
  assert.ok(found.some((f) => f.kind === "generic.credential"));
});

test("detects Google API key", () => {
  const key = "AIza" + "a".repeat(35);
  // lower entropy is fine for the fixed pattern; but to avoid static scanners
  // flagging this test file, we build it dynamically.
  const found = detectSecrets(`apiKey: ${key}`);
  assert.ok(found.some((f) => f.kind === "google.api_key"));
});

test("detects Slack bot token", () => {
  const found = detectSecrets("slackBotToken=xoxb-123456789012-abcdefghijkl");
  assert.ok(found.some((f) => f.kind === "slack.token"));
});

// ---- Near-miss negatives (must NOT flag) ----

test("does not flag placeholder password values", () => {
  const found = detectSecrets('password = "<REDACTED>"');
  assert.equal(
    found.filter((f) => f.kind === "generic.credential").length,
    0,
  );
});

test("does not flag low-entropy all-same-char value", () => {
  const found = detectSecrets('password = "xxxxxxxxxxxxxxxx"');
  assert.equal(
    found.filter((f) => f.kind === "generic.credential").length,
    0,
  );
});

// ---- Obvious negatives ----

test("empty string returns empty list", () => {
  assert.deepEqual(detectSecrets(""), []);
});

test("ordinary prose returns empty list", () => {
  const prose = "The quick brown fox jumps over the lazy dog. 1234567890.";
  assert.deepEqual(detectSecrets(prose), []);
});
