import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";

const TEST_DATA_DIR = fs.mkdtempSync(path.join(os.tmpdir(), "omniroute-ghe-device-route-"));
process.env.DATA_DIR = TEST_DATA_DIR;

const core = await import("../../src/lib/db/core.ts");
const settingsDb = await import("../../src/lib/db/settings.ts");
const route = await import("../../src/app/api/oauth/[provider]/[action]/route.ts");

const originalFetch = globalThis.fetch;

test.before(async () => {
  await settingsDb.updateSettings({ requireLogin: false });
});

test.afterEach(() => {
  globalThis.fetch = originalFetch;
});

test.after(() => {
  core.closeDbInstance();
  core.resetDbInstance();
  fs.rmSync(TEST_DATA_DIR, { recursive: true, force: true });
});

test("ghe-copilot device-code response preserves gheUrl context", async () => {
  const gheUrl = "https://ghe.company.com";
  const fetchCalls: string[] = [];
  globalThis.fetch = (async (input) => {
    fetchCalls.push(String(input));
    return new Response(
      JSON.stringify({
        device_code: "ghe-device-code",
        user_code: "GHE-USER",
        verification_uri: `${gheUrl}/login/device`,
        expires_in: 5,
        interval: 5,
      }),
      { status: 200, headers: { "Content-Type": "application/json" } }
    );
  }) as typeof fetch;

  const request = new Request(
    `http://localhost:20128/api/oauth/ghe-copilot/device-code?gheUrl=${encodeURIComponent(gheUrl)}`
  );
  const response = await route.GET(request, {
    params: Promise.resolve({ provider: "ghe-copilot", action: "device-code" }),
  });
  const body = (await response.json()) as Record<string, unknown>;

  assert.equal(response.status, 200);
  assert.equal(body.gheUrl, gheUrl);
  assert.equal(fetchCalls[0], `${gheUrl}/login/device/code`);
});

test("ghe-copilot poll treats non-2xx authorization_pending as pending", async () => {
  const gheUrl = "https://ghe.company.com";
  const fetchCalls: string[] = [];
  globalThis.fetch = (async (input) => {
    fetchCalls.push(String(input));
    return new Response(
      JSON.stringify({
        error: "authorization_pending",
        error_description: "Waiting for user authorization",
      }),
      { status: 400, headers: { "Content-Type": "application/json" } }
    );
  }) as typeof fetch;

  const request = new Request("http://localhost:20128/api/oauth/ghe-copilot/poll", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      deviceCode: "ghe-device-code",
      extraData: { gheUrl },
    }),
  });

  const response = await route.POST(request, {
    params: Promise.resolve({ provider: "ghe-copilot", action: "poll" }),
  });
  const body = (await response.json()) as Record<string, unknown>;

  assert.equal(response.status, 200);
  assert.equal(body.success, false);
  assert.equal(body.pending, true);
  assert.equal(body.error, "authorization_pending");
  assert.equal(fetchCalls[0], `${gheUrl}/login/oauth/access_token`);
});

test("ghe-copilot poll threads gheUrl into token exchange post-processing", async () => {
  const gheUrl = "https://ghe.company.com";
  const fetchCalls: string[] = [];
  let callIndex = 0;
  globalThis.fetch = (async (input) => {
    fetchCalls.push(String(input));
    if (callIndex === 0) {
      callIndex += 1;
      return new Response(
        JSON.stringify({
          access_token: "ghe-access",
          refresh_token: "ghe-refresh",
          expires_in: 3600,
        }),
        { status: 200, headers: { "Content-Type": "application/json" } }
      );
    }
    if (callIndex === 1) {
      callIndex += 1;
      return new Response(
        JSON.stringify({
          token: "copilot-token",
          expires_at: "2030-01-01T00:00:00.000Z",
          endpoints: {
            api: `${gheUrl}/api/v3/copilot_internal/v2/chat/completions`,
            proxy: `${gheUrl}/api/v3/copilot_proxy`,
          },
        }),
        { status: 200, headers: { "Content-Type": "application/json" } }
      );
    }
    return new Response(
      JSON.stringify({
        id: 7,
        login: "octocat",
        name: "Octo Cat",
        email: "octo@example.com",
      }),
      { status: 200, headers: { "Content-Type": "application/json" } }
    );
  }) as typeof fetch;

  const request = new Request("http://localhost:20128/api/oauth/ghe-copilot/poll", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      deviceCode: "ghe-device-code",
      extraData: { gheUrl },
    }),
  });
  const response = await route.POST(request, {
    params: Promise.resolve({ provider: "ghe-copilot", action: "poll" }),
  });
  const body = (await response.json()) as Record<string, unknown>;

  assert.equal(response.status, 200);
  assert.equal(body.success, true);
  assert.ok(fetchCalls.includes(`${gheUrl}/login/oauth/access_token`));
  assert.ok(fetchCalls.includes(`${gheUrl}/api/v3/copilot_internal/v2/token`));
  assert.ok(fetchCalls.includes(`${gheUrl}/api/v3/user`));
});
