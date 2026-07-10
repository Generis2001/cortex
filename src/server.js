import http from "node:http";
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
    rateLimitWindowMs: Number.parseInt(env.RATE_LIMIT_WINDOW_MS || "60000", 10),
    rateLimitMaxRequests: Number.parseInt(env.RATE_LIMIT_MAX_REQUESTS || "60", 10),
  };
}

const rateLimitStore = new Map();

function normalizeHeaders(headers = {}) {
  return Object.fromEntries(Object.entries(headers).map(([key, value]) => [key.toLowerCase(), value]));
}

function buildServiceDescriptor(config) {
  return {
    name: "cortex",
    provider_type: "Agent Service Provider",
    ecosystem: "X Layer",
    description: "Document Intelligence ASP that transforms unstructured documents into structured, agent-consumable intelligence.",
    service_type: "A2MCP",
    payment_mode: "free",
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
      version: "0.2.0",
      description: "Deterministic document intelligence extraction for autonomous agents and X Layer workflows.",
    },
    servers: [{ url: config.serviceBaseUrl }],
    paths: {
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
  if (!config.apiKey || pathname === "/health" || pathname === "/.well-known/asp.json" || pathname === "/openapi.json") {
    return null;
  }

  const authorization = headers.authorization || "";
  if (authorization === `Bearer ${config.apiKey}`) return null;

  return sendJson(401, { error: "Missing or invalid bearer token" }, { "www-authenticate": 'Bearer realm="cortex"' });
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

  if (method === "GET" && url.pathname === "/health") {
    return sendJson(200, { status: "ok", service: "cortex" });
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
      const result = analyzeDocument(payload);
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

export function createServer(runtimeConfig = buildRuntimeConfig()) {
  return http.createServer(async (request, response) => {
    const chunks = [];
    for await (const chunk of request) chunks.push(chunk);

    const result = await handleHttpRequest(
      {
        method: request.method,
        url: request.url,
        headers: request.headers,
        body: chunks.length > 0 ? Buffer.concat(chunks) : undefined,
        remoteAddress: request.socket?.remoteAddress,
      },
      runtimeConfig
    ).catch((error) => sendJson(500, { error: "Internal server error", detail: error.message }));

    response.writeHead(result.statusCode, result.headers);
    response.end(result.body);
  });
}

if (import.meta.url === `file://${process.argv[1]}`) {
  const config = buildRuntimeConfig();
  createServer(config).listen(config.port, config.host, () => {
    console.log(`cortex ASP listening on ${config.serviceBaseUrl}`);
  });
}
