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

function sendHtml(statusCode, body, extraHeaders = {}) {
  return {
    statusCode,
    headers: {
      "content-type": "text/html; charset=utf-8",
      "cache-control": "no-store",
      ...extraHeaders,
    },
    body,
  };
}

function prefersHtml(headers) {
  const accept = headers.accept || "";
  return accept.includes("text/html") && !accept.includes("application/json");
}

function buildLandingPage(config) {
  const paymentMode = x402Configured(config) ? "x402" : "free";
  const serviceDescriptorUrl = `${config.serviceBaseUrl}/.well-known/asp.json`;
  const openApiUrl = `${config.serviceBaseUrl}/openapi.json`;
  const analyzeUrl = `${config.serviceBaseUrl}/v1/intelligence`;
  const healthUrl = `${config.serviceBaseUrl}/health`;

  return `<!doctype html>
<html lang="en">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <title>Cortex | Document Intelligence ASP</title>
  <style>
    :root {
      --bg: #f3efe4;
      --panel: rgba(250, 247, 240, 0.88);
      --panel-strong: #fffaf0;
      --text: #1f1f1c;
      --muted: #5c594f;
      --accent: #bc5a45;
      --accent-deep: #7f2d1f;
      --line: rgba(31, 31, 28, 0.12);
      --shadow: 0 22px 60px rgba(72, 44, 27, 0.16);
      --radius: 24px;
    }
    * { box-sizing: border-box; }
    body {
      margin: 0;
      min-height: 100vh;
      color: var(--text);
      background:
        radial-gradient(circle at top left, rgba(188, 90, 69, 0.22), transparent 38%),
        radial-gradient(circle at top right, rgba(18, 93, 86, 0.15), transparent 34%),
        linear-gradient(180deg, #f8f2e7 0%, var(--bg) 58%, #efe6d6 100%);
      font-family: "Avenir Next", "Gill Sans", "Trebuchet MS", sans-serif;
    }
    a { color: inherit; }
    .shell {
      width: min(1120px, calc(100% - 32px));
      margin: 0 auto;
      padding: 32px 0 48px;
    }
    .hero,
    .grid-card,
    .terminal,
    .surface-card {
      background: var(--panel);
      backdrop-filter: blur(12px);
      border: 1px solid rgba(255, 255, 255, 0.72);
      box-shadow: var(--shadow);
    }
    .hero {
      position: relative;
      overflow: hidden;
      border-radius: calc(var(--radius) + 6px);
      padding: 32px;
    }
    .hero::after {
      content: "";
      position: absolute;
      inset: auto -8% -42% 36%;
      height: 320px;
      background: radial-gradient(circle, rgba(188, 90, 69, 0.34), transparent 58%);
      pointer-events: none;
    }
    .eyebrow {
      display: inline-flex;
      gap: 10px;
      align-items: center;
      padding: 8px 12px;
      border-radius: 999px;
      border: 1px solid var(--line);
      color: var(--muted);
      background: rgba(255, 255, 255, 0.56);
      font-size: 12px;
      letter-spacing: 0.16em;
      text-transform: uppercase;
    }
    h1, h2, h3 {
      margin: 0;
      font-family: "Iowan Old Style", "Palatino Linotype", "Book Antiqua", Palatino, serif;
      font-weight: 700;
      line-height: 0.96;
    }
    h1 {
      margin-top: 22px;
      max-width: 10ch;
      font-size: clamp(3.2rem, 7vw, 6.4rem);
      letter-spacing: -0.05em;
    }
    .hero-copy {
      margin: 18px 0 0;
      max-width: 59ch;
      color: var(--muted);
      font-size: 1.08rem;
      line-height: 1.65;
    }
    .hero-actions {
      display: flex;
      flex-wrap: wrap;
      gap: 12px;
      margin-top: 28px;
    }
    .button {
      display: inline-flex;
      align-items: center;
      justify-content: center;
      padding: 14px 18px;
      border-radius: 999px;
      text-decoration: none;
      font-weight: 700;
      border: 1px solid var(--line);
      transition: transform 180ms ease, background 180ms ease;
    }
    .button:hover { transform: translateY(-1px); }
    .button-primary {
      background: linear-gradient(135deg, var(--accent), var(--accent-deep));
      color: #fff7f0;
      border-color: transparent;
    }
    .button-secondary {
      background: rgba(255, 255, 255, 0.68);
    }
    .stats {
      display: grid;
      grid-template-columns: repeat(4, minmax(0, 1fr));
      gap: 14px;
      margin-top: 28px;
      position: relative;
      z-index: 1;
    }
    .stat {
      padding: 18px;
      border-radius: 20px;
      background: rgba(255, 250, 240, 0.92);
      border: 1px solid var(--line);
    }
    .stat strong {
      display: block;
      margin-bottom: 8px;
      font-size: 1.55rem;
      font-family: "Iowan Old Style", "Palatino Linotype", serif;
    }
    .stat span {
      display: block;
      color: var(--muted);
      line-height: 1.45;
      font-size: 0.96rem;
    }
    .grid {
      display: grid;
      grid-template-columns: 1.1fr 0.9fr;
      gap: 18px;
      margin-top: 18px;
    }
    .grid-card,
    .surface-card {
      border-radius: var(--radius);
      padding: 24px;
    }
    .section-label {
      display: block;
      margin-bottom: 12px;
      color: var(--muted);
      letter-spacing: 0.14em;
      text-transform: uppercase;
      font-size: 0.76rem;
    }
    .feature-list,
    .surface-list {
      display: grid;
      gap: 14px;
      margin-top: 18px;
    }
    .feature {
      padding: 16px 18px;
      border-radius: 18px;
      background: rgba(255, 255, 255, 0.58);
      border: 1px solid var(--line);
    }
    .feature strong,
    .surface-list strong {
      display: block;
      margin-bottom: 6px;
      font-size: 1rem;
    }
    .feature span,
    .surface-list span {
      display: block;
      color: var(--muted);
      line-height: 1.55;
    }
    .surface-list a {
      text-decoration: none;
      word-break: break-all;
    }
    .surface-list > div {
      padding: 16px 18px;
      border-radius: 18px;
      background: rgba(255, 255, 255, 0.62);
      border: 1px solid var(--line);
    }
    .terminal {
      margin-top: 18px;
      border-radius: var(--radius);
      overflow: hidden;
    }
    .terminal-bar {
      display: flex;
      gap: 8px;
      align-items: center;
      padding: 14px 18px;
      border-bottom: 1px solid var(--line);
      background: rgba(41, 33, 27, 0.92);
      color: #f5eadb;
      font-size: 0.82rem;
      letter-spacing: 0.12em;
      text-transform: uppercase;
    }
    .dot {
      width: 10px;
      height: 10px;
      border-radius: 999px;
      background: #f3b43f;
      box-shadow: 16px 0 0 #df6a57, 32px 0 0 #4f9c88;
      margin-right: 28px;
    }
    pre {
      margin: 0;
      padding: 24px;
      overflow: auto;
      color: #f7f1e8;
      background:
        linear-gradient(180deg, rgba(19, 19, 18, 0.96), rgba(39, 33, 31, 0.98));
      font: 0.94rem/1.75 "IBM Plex Mono", "SFMono-Regular", Consolas, monospace;
    }
    .footer-note {
      margin-top: 18px;
      color: var(--muted);
      font-size: 0.94rem;
      line-height: 1.6;
    }
    @media (max-width: 900px) {
      .stats,
      .grid {
        grid-template-columns: 1fr;
      }
      h1 {
        max-width: none;
      }
    }
  </style>
</head>
<body>
  <main class="shell">
    <section class="hero">
      <div class="eyebrow">Cortex <span>Document Intelligence ASP</span></div>
      <h1>Structured document intelligence for agents.</h1>
      <p class="hero-copy">
        Cortex converts raw documents into machine-readable intelligence for autonomous agents, contracts,
        apps, and workflows on X Layer. The browser view is human-facing; the production surface remains a
        deterministic A2MCP API.
      </p>
      <div class="hero-actions">
        <a class="button button-primary" href="${analyzeUrl}">Analyze Endpoint</a>
        <a class="button button-secondary" href="${openApiUrl}">OpenAPI Schema</a>
        <a class="button button-secondary" href="${serviceDescriptorUrl}">ASP Metadata</a>
      </div>
      <div class="stats">
        <div class="stat">
          <strong>A2MCP</strong>
          <span>Standardized API surface for OKX.AI and downstream agents.</span>
        </div>
        <div class="stat">
          <strong>${paymentMode}</strong>
          <span>Current payment mode exposed by the production runtime.</span>
        </div>
        <div class="stat">
          <strong>JSON</strong>
          <span>Schema-aligned output for entities, obligations, risks, and deadlines.</span>
        </div>
        <div class="stat">
          <strong>X Layer</strong>
          <span>Structured for onchain workflows, automation, and verification steps.</span>
        </div>
      </div>
    </section>

    <section class="grid">
      <article class="grid-card">
        <span class="section-label">Extraction Surface</span>
        <h2>What Cortex emits</h2>
        <div class="feature-list">
          <div class="feature">
            <strong>Typed document classification</strong>
            <span>Invoice, contract, receipt, technical docs, reports, proposals, and other structured classes.</span>
          </div>
          <div class="feature">
            <strong>Traceable entities and spans</strong>
            <span>People, organizations, dates, monetary values, IDs, digital identifiers, and evidence offsets.</span>
          </div>
          <div class="feature">
            <strong>Agent-ready execution data</strong>
            <span>Obligations, decisions, deadlines, explicit and inferred risks, next actions, and missing information.</span>
          </div>
        </div>
      </article>

      <aside class="surface-card">
        <span class="section-label">Machine Surface</span>
        <h2>Production endpoints</h2>
        <div class="surface-list">
          <div>
            <strong>Health</strong>
            <span><a href="${healthUrl}">${healthUrl}</a></span>
          </div>
          <div>
            <strong>ASP metadata</strong>
            <span><a href="${serviceDescriptorUrl}">${serviceDescriptorUrl}</a></span>
          </div>
          <div>
            <strong>OpenAPI</strong>
            <span><a href="${openApiUrl}">${openApiUrl}</a></span>
          </div>
          <div>
            <strong>Analyze</strong>
            <span><a href="${analyzeUrl}">${analyzeUrl}</a></span>
          </div>
        </div>
      </aside>
    </section>

    <section class="terminal">
      <div class="terminal-bar"><span class="dot"></span>Live request example</div>
      <pre>curl ${analyzeUrl} \\
  -H 'content-type: application/json' \\
  -d '{
    "text": "Invoice INV-42. Acme Corp must pay USD 1250 by August 15, 2026. Late payment incurs a 5% penalty."
  }'</pre>
    </section>

    <p class="footer-note">
      API clients can continue using <code>/</code> as a JSON discovery route by sending
      <code>Accept: application/json</code>. Browsers receive this landing page by default.
    </p>
  </main>
</body>
</html>`;
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
    if (prefersHtml(headers)) {
      return sendHtml(200, buildLandingPage(config));
    }
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
