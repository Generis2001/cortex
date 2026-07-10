import test from "node:test";
import assert from "node:assert/strict";
import { buildRuntimeConfig, createExpressApp, handleHttpRequest, resetRateLimitStore } from "../src/server.js";

test("serves health and asp metadata without binding a socket", async () => {
  resetRateLimitStore();
  const config = buildRuntimeConfig({ HOST: "127.0.0.1", PORT: "8787" });

  const health = await handleHttpRequest({ method: "GET", url: "/health" }, config);
  const meta = await handleHttpRequest({ method: "GET", url: "/.well-known/asp.json" }, config);

  assert.equal(health.statusCode, 200);
  assert.equal(JSON.parse(health.body).status, "ok");
  assert.equal(meta.statusCode, 200);
  assert.equal(JSON.parse(meta.body).name, "cortex");
});

test("analyzes document payloads through the HTTP handler", async () => {
  resetRateLimitStore();
  const config = buildRuntimeConfig({ HOST: "127.0.0.1", PORT: "8787" });
  const response = await handleHttpRequest(
    {
      method: "POST",
      url: "/v1/intelligence",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ text: "Invoice #INV-1001. Acme Corp LLC must pay USD 500 by July 31, 2026. Late payment incurs a penalty." }),
    },
    config
  );

  assert.equal(response.statusCode, 200);
  const payload = JSON.parse(response.body);
  assert.equal(payload.document_type, "Invoice");
  assert.equal(typeof payload.provenance.normalized_text_sha256, "string");
  assert.ok(payload.risks.length >= 1);
});

test("supports bearer auth and rate limiting in-process", async () => {
  resetRateLimitStore();
  const config = buildRuntimeConfig({
    HOST: "127.0.0.1",
    PORT: "8787",
    CORTEX_API_KEY: "secret",
    RATE_LIMIT_MAX_REQUESTS: "1",
    RATE_LIMIT_WINDOW_MS: "60000",
  });

  const unauthorized = await handleHttpRequest({ method: "POST", url: "/v1/intelligence", body: JSON.stringify({ text: "Invoice #1" }) }, config);
  assert.equal(unauthorized.statusCode, 401);

  const first = await handleHttpRequest(
    {
      method: "POST",
      url: "/v1/intelligence",
      headers: { authorization: "Bearer secret" },
      body: JSON.stringify({ text: "Invoice #1. Acme Corp LLC must pay USD 50 by 2026-08-01." }),
      remoteAddress: "test-client",
    },
    config
  );
  const second = await handleHttpRequest(
    {
      method: "POST",
      url: "/v1/intelligence",
      headers: { authorization: "Bearer secret" },
      body: JSON.stringify({ text: "Invoice #2. Acme Corp LLC must pay USD 50 by 2026-08-01." }),
      remoteAddress: "test-client",
    },
    config
  );

  assert.equal(first.statusCode, 200);
  assert.equal(second.statusCode, 429);
});

test("reflects x402 payment mode when configured", async () => {
  resetRateLimitStore();
  const config = buildRuntimeConfig({
    HOST: "127.0.0.1",
    PORT: "8787",
    CORTEX_X402_ENABLED: "true",
    CORTEX_X402_PAY_TO: "0x000000000000000000000000000000000000dEaD",
    OKX_API_KEY: "api",
    OKX_SECRET_KEY: "secret",
    OKX_PASSPHRASE: "passphrase",
  });

  const response = await handleHttpRequest({ method: "GET", url: "/.well-known/asp.json" }, config);
  const payload = JSON.parse(response.body);

  assert.equal(payload.payment_mode, "x402");
  assert.equal(payload.classification.primary, "A2MCP");
});

test("builds an express app with x402 support when configured", () => {
  const config = buildRuntimeConfig({
    HOST: "127.0.0.1",
    PORT: "8787",
    CORTEX_X402_ENABLED: "true",
    CORTEX_X402_PAY_TO: "0x000000000000000000000000000000000000dEaD",
    OKX_API_KEY: "api",
    OKX_SECRET_KEY: "secret",
    OKX_PASSPHRASE: "passphrase",
  });

  const app = createExpressApp(config);
  assert.equal(typeof app, "function");
});
