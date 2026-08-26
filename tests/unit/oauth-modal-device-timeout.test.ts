import test from "node:test";
import assert from "node:assert/strict";

import { resolveDeviceFlowExpiresInSeconds } from "../../src/shared/components/OAuthModal";

test("ghe-copilot normalizes tiny expires_in values to avoid 5-second timeout", () => {
  const normalized = resolveDeviceFlowExpiresInSeconds("ghe-copilot", 5, 5);
  assert.equal(normalized, 300);
});

test("ghe-copilot keeps standard expires_in values when already in seconds", () => {
  const normalized = resolveDeviceFlowExpiresInSeconds("ghe-copilot", 900, 5);
  assert.equal(normalized, 900);
});

test("non-GHE providers keep existing expires_in behavior", () => {
  const normalized = resolveDeviceFlowExpiresInSeconds("github", 5, 5);
  assert.equal(normalized, 5);
});

test("ghe-copilot falls back to a practical minimum when expires_in is missing", () => {
  const normalized = resolveDeviceFlowExpiresInSeconds("ghe-copilot", undefined, 5);
  assert.equal(normalized, 300);
});
