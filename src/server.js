import http from "node:http";
import express from "express";
import { OKXFacilitatorClient } from "@okxweb3/x402-core";
import { ExactEvmScheme } from "@okxweb3/x402-evm/exact/server";
import { paymentMiddleware, x402ResourceServer } from "@okxweb3/x402-express";
import { analyzeDocument } from "./analyze.js";

export function buildRuntimeConfig(env = process.env) {
  const port = Number.parseInt(env.PORT || "8787", 10);
  const host = env.HOST || "127.0.0.1";
  const serviceBaseUrl = env.SERVICE_BASE_URL || `http://${host}:${port}`;

  return {
    port,
    host,
    serviceBaseUrl,
    apiKey: env.CORTEX_API_KEY || "",
    maxBodySize: env.CORTEX_MAX_BODY_SIZE || "10mb",
    rateLimitWindowMs: Number.parseInt(env.RATE_LIMIT_WINDOW_MS || "60000", 10),
    rateLimitMaxRequests: Number.parseInt(env.RATE_LIMIT_MAX_REQUESTS || "60", 10),
    ocr: {
      provider: env.CORTEX_OCR_PROVIDER || "",
      providerUrl: env.CORTEX_OCR_PROVIDER_URL || "",
      apiKey: env.CORTEX_OCR_API_KEY || "",
      authHeader: env.CORTEX_OCR_AUTH_HEADER || "authorization",
      model: env.CORTEX_OCR_MODEL || "",
      endpoint: env.CORTEX_OCR_ENDPOINT || "",
      language: env.CORTEX_OCR_LANGUAGE || "eng",
      engine: env.CORTEX_OCR_ENGINE || "",
      isTable: env.CORTEX_OCR_IS_TABLE === "true",
      detectOrientation: env.CORTEX_OCR_DETECT_ORIENTATION === "true",
      scale: env.CORTEX_OCR_SCALE === "true",
    },
    x402: {
      enabled: env.CORTEX_X402_ENABLED === "true",
      network: env.CORTEX_X402_NETWORK || "eip155:196",
      price: env.CORTEX_X402_PRICE || "$0.01",
      payTo: env.CORTEX_X402_PAY_TO || env.PAY_TO_ADDRESS || "",
      okxApiKey: env.OKX_API_KEY || "",
      okxSecretKey: env.OKX_SECRET_KEY || "",
      okxPassphrase: env.OKX_PASSPHRASE || "",
      baseUrl: env.OKX_BASE_URL || "",
    },
  };
}

const rateLimitStore = new Map();

function normalizeHeaders(headers = {}) {
  return Object.fromEntries(Object.entries(headers).map(([key, value]) => [key.toLowerCase(), value]));
}

function x402Configured(config) {
  return Boolean(config.x402.enabled);
}

function buildServiceDescriptor(config) {
  return {
    name: "cortex",
    provider_type: "Agent Service Provider",
    ecosystem: "X Layer",
    description: "Document Intelligence ASP that transforms unstructured documents into structured, agent-consumable intelligence.",
    service_type: "A2MCP",
    payment_mode: x402Configured(config) ? "x402" : "free",
    classification: {
      primary: "A2MCP",
      rationale: "Cortex exposes a standardized API endpoint with deterministic machine-readable output. It does not negotiate scope or escrow delivery per task.",
      optional_secondary: "A2A can be added later for bespoke document-review engagements.",
    },
    endpoints: {
      health: `${config.serviceBaseUrl}/health`,
      analyze: `${config.serviceBaseUrl}/v1/intelligence`,
      openapi: `${config.serviceBaseUrl}/openapi.json`,
    },
    auth: config.apiKey ? "bearer" : "none",
    rate_limit: {
      window_ms: config.rateLimitWindowMs,
      max_requests: config.rateLimitMaxRequests,
    },
    output_schema: {
      document_type: "string",
      summary: "string",
      provenance: "object",
      entities: "object",
      obligations: "array",
      deadlines: "array",
      decisions: "array",
      risks: "array",
      action_items: "array",
      missing_information: "array",
      confidence_score: "number",
    },
  };
}

function buildOpenApi(config) {
  return {
    openapi: "3.1.0",
    info: {
      title: "Cortex Document Intelligence ASP",
      version: "0.3.0",
      description: "Deterministic document intelligence extraction for autonomous agents and X Layer workflows.",
    },
    servers: [{ url: config.serviceBaseUrl }],
    paths: {
      "/": {
        get: { summary: "Service discovery", responses: { "200": { description: "Cortex service overview" } } },
      },
      "/health": {
        get: { summary: "Service health check", responses: { "200": { description: "Service is healthy" } } },
      },
      "/.well-known/asp.json": {
        get: { summary: "ASP service descriptor", responses: { "200": { description: "Cortex ASP metadata" } } },
      },
      "/openapi.json": {
        get: { summary: "OpenAPI document", responses: { "200": { description: "OpenAPI schema" } } },
      },
      "/v1/intelligence": {
        post: {
          summary: "Extract structured document intelligence",
          requestBody: {
            required: true,
            content: {
              "application/json": {
                schema: {
                  type: "object",
                  properties: {
                    text: { type: "string", minLength: 1 },
                    document: {
                      type: "object",
                      properties: {
                        filename: { type: "string" },
                        content_type: { type: "string" },
                        content_base64: { type: "string" },
                      },
                    },
                    metadata: { type: "object" },
                  },
                  anyOf: [{ required: ["text"] }, { required: ["document"] }],
                },
              },
            },
          },
          responses: {
            "200": { description: "Structured document intelligence" },
            "400": { description: "Invalid request payload" },
            "401": { description: "Missing or invalid bearer token" },
            "402": { description: x402Configured(config) ? "Payment required via x402" : "Unused in free mode" },
            "429": { description: "Rate limit exceeded" },
          },
        },
      },
    },
  };
}

function sendJson(statusCode, body, extraHeaders = {}) {
  return {
    statusCode,
    headers: {
      "content-type": "application/json; charset=utf-8",
      "cache-control": "no-store",
      ...extraHeaders,
    },
    body: JSON.stringify(body, null, 2),
  };
}

async function readJsonBody(body) {
  if (!body) return {};
  if (typeof body === "string") return JSON.parse(body);
  if (Buffer.isBuffer(body)) return JSON.parse(body.toString("utf8"));
  if (typeof body === "object") return body;
  throw new TypeError("Unsupported request body format");
}

function checkRateLimit(config, clientId) {
  if (!Number.isFinite(config.rateLimitMaxRequests) || config.rateLimitMaxRequests <= 0) return null;

  const now = Date.now();
  const windowStart = now - config.rateLimitWindowMs;
  const bucket = rateLimitStore.get(clientId) || [];
  const active = bucket.filter((timestamp) => timestamp > windowStart);

  if (active.length >= config.rateLimitMaxRequests) {
    rateLimitStore.set(clientId, active);
    return sendJson(429, { error: "Rate limit exceeded" }, { "retry-after": String(Math.ceil(config.rateLimitWindowMs / 1000)) });
  }

  active.push(now);
  rateLimitStore.set(clientId, active);
  return null;
}

function requireAuth(config, pathname, headers) {
  if (!config.apiKey || pathname === "/" || pathname === "/health" || pathname === "/.well-known/asp.json" || pathname === "/openapi.json") {
    return null;
  }

  const authorization = headers.authorization || "";
  if (authorization === `Bearer ${config.apiKey}`) return null;

  return sendJson(401, { error: "Missing or invalid bearer token" }, { "www-authenticate": 'Bearer realm="cortex"' });
}

function validateX402Config(config) {
  if (!x402Configured(config)) return;

  const missing = [];
  if (!config.x402.payTo) missing.push("CORTEX_X402_PAY_TO or PAY_TO_ADDRESS");
  if (!config.x402.okxApiKey) missing.push("OKX_API_KEY");
  if (!config.x402.okxSecretKey) missing.push("OKX_SECRET_KEY");
  if (!config.x402.okxPassphrase) missing.push("OKX_PASSPHRASE");

  if (missing.length > 0) {
    throw new Error(`x402 mode is enabled, but required configuration is missing: ${missing.join(", ")}`);
  }
}

function buildX402Middleware(config) {
  validateX402Config(config);

  const facilitatorClient = new OKXFacilitatorClient({
    apiKey: config.x402.okxApiKey,
    secretKey: config.x402.okxSecretKey,
    passphrase: config.x402.okxPassphrase,
    ...(config.x402.baseUrl ? { baseUrl: config.x402.baseUrl } : {}),
  });

  const resourceServer = new x402ResourceServer(facilitatorClient).register(config.x402.network, new ExactEvmScheme());

  return paymentMiddleware(
    {
      "POST /v1/intelligence": {
        accepts: [
          {
            scheme: "exact",
            network: config.x402.network,
            payTo: config.x402.payTo,
            price: config.x402.price,
          },
        ],
        description: "Cortex document intelligence extraction",
        mimeType: "application/json",
      },
    },
    resourceServer,
    undefined,
    undefined,
    false
  );
}

export async function handleHttpRequest(requestLike, runtimeConfig = buildRuntimeConfig()) {
  const config = runtimeConfig;
  const method = requestLike.method || "GET";
  const url = new URL(requestLike.url || "/", config.serviceBaseUrl);
  const headers = normalizeHeaders(requestLike.headers);
  const authError = requireAuth(config, url.pathname, headers);
  if (authError) return authError;

  const clientId = requestLike.remoteAddress || headers["x-forwarded-for"] || "local";
  const rateLimitError = checkRateLimit(config, `${clientId}:${url.pathname}`);
  if (rateLimitError) return rateLimitError;

  if (method === "GET" && url.pathname === "/") {
    return sendJson(200, {
      name: "cortex",
      status: "ok",
      service_type: "A2MCP",
      description: "Document Intelligence ASP for X Layer.",
      payment_mode: x402Configured(config) ? "x402" : "free",
      docs: {
        health: `${config.serviceBaseUrl}/health`,
        asp_metadata: `${config.serviceBaseUrl}/.well-known/asp.json`,
        openapi: `${config.serviceBaseUrl}/openapi.json`,
        analyze: `${config.serviceBaseUrl}/v1/intelligence`,
      },
    });
  }

  if (method === "GET" && url.pathname === "/health") {
    return sendJson(200, { status: "ok", service: "cortex", payment_mode: x402Configured(config) ? "x402" : "free" });
  }

  if (method === "GET" && url.pathname === "/.well-known/asp.json") {
    return sendJson(200, buildServiceDescriptor(config));
  }

  if (method === "GET" && url.pathname === "/openapi.json") {
    return sendJson(200, buildOpenApi(config));
  }

  if (method === "POST" && url.pathname === "/v1/intelligence") {
    try {
      const payload = await readJsonBody(requestLike.body);
      const result = await analyzeDocument(payload, { ingestion: { ocr: config.ocr } });
      return sendJson(200, result);
    } catch (error) {
      const message = error instanceof SyntaxError ? "Request body must be valid JSON" : error.message;
      return sendJson(400, { error: message });
    }
  }

  return sendJson(404, { error: "Not found" });
}

export function resetRateLimitStore() {
  rateLimitStore.clear();
}

export function createExpressApp(runtimeConfig = buildRuntimeConfig()) {
  const config = runtimeConfig;
  const app = express();
  app.disable("x-powered-by");
  app.use(express.json({ limit: config.maxBodySize }));

  app.use((error, _req, res, next) => {
    if (!error) return next();
    res.status(400).set({ "content-type": "application/json; charset=utf-8" }).send(JSON.stringify({ error: "Request body must be valid JSON" }, null, 2));
  });

  if (x402Configured(config)) {
    app.use(buildX402Middleware(config));
  }

  app.use(async (req, res) => {
    const result = await handleHttpRequest(
      {
        method: req.method,
        url: req.originalUrl || req.url,
        headers: req.headers,
        body: req.body,
        remoteAddress: req.ip,
      },
      config
    ).catch((error) => sendJson(500, { error: "Internal server error", detail: error.message }));

    res.set(result.headers).status(result.statusCode).send(result.body);
  });

  return app;
}

export function createServer(runtimeConfig = buildRuntimeConfig()) {
  return http.createServer(createExpressApp(runtimeConfig));
}

export default createExpressApp(buildRuntimeConfig());

if (import.meta.url === `file://${process.argv[1]}`) {
  const config = buildRuntimeConfig();
  createExpressApp(config).listen(config.port, config.host, () => {
    console.log(`cortex ASP listening on ${config.serviceBaseUrl}`);
  });
}
