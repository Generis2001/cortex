import http from "node:http";
import { analyzeDocument } from "./analyze.js";

const PORT = Number.parseInt(process.env.PORT || "8787", 10);
const HOST = process.env.HOST || "127.0.0.1";
const SERVICE_BASE_URL = process.env.SERVICE_BASE_URL || `http://${HOST}:${PORT}`;

const serviceDescriptor = {
  name: "cortex",
  provider_type: "Agent Service Provider",
  ecosystem: "X Layer",
  description: "Document Intelligence ASP that transforms unstructured documents into structured, agent-consumable intelligence.",
  service_type: "A2MCP",
  payment_mode: "free",
  endpoints: {
    health: `${SERVICE_BASE_URL}/health`,
    analyze: `${SERVICE_BASE_URL}/v1/intelligence`,
    openapi: `${SERVICE_BASE_URL}/openapi.json`,
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

const openApi = {
  openapi: "3.1.0",
  info: {
    title: "Cortex Document Intelligence ASP",
    version: "0.1.0",
    description: serviceDescriptor.description,
  },
  servers: [{ url: SERVICE_BASE_URL }],
  paths: {
    "/health": {
      get: {
        summary: "Service health check",
        responses: {
          "200": {
            description: "Service is healthy",
          },
        },
      },
    },
    "/.well-known/asp.json": {
      get: {
        summary: "ASP service descriptor",
        responses: {
          "200": {
            description: "Cortex ASP metadata",
          },
        },
      },
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
                required: ["text"],
                properties: {
                  text: { type: "string", minLength: 1 },
                  metadata: { type: "object" },
                },
              },
            },
          },
        },
        responses: {
          "200": {
            description: "Structured document intelligence",
          },
          "400": {
            description: "Invalid request payload",
          },
        },
      },
    },
  },
};

function sendJson(response, statusCode, body) {
  response.writeHead(statusCode, {
    "content-type": "application/json; charset=utf-8",
    "cache-control": "no-store",
  });
  response.end(JSON.stringify(body, null, 2));
}

async function readJson(request) {
  const chunks = [];
  for await (const chunk of request) {
    chunks.push(chunk);
  }

  const raw = Buffer.concat(chunks).toString("utf8");
  if (!raw.trim()) return {};
  return JSON.parse(raw);
}

async function handleRequest(request, response) {
  const url = new URL(request.url || "/", SERVICE_BASE_URL);

  if (request.method === "GET" && url.pathname === "/health") {
    sendJson(response, 200, { status: "ok", service: "cortex" });
    return;
  }

  if (request.method === "GET" && url.pathname === "/.well-known/asp.json") {
    sendJson(response, 200, serviceDescriptor);
    return;
  }

  if (request.method === "GET" && url.pathname === "/openapi.json") {
    sendJson(response, 200, openApi);
    return;
  }

  if (request.method === "POST" && url.pathname === "/v1/intelligence") {
    try {
      const payload = await readJson(request);
      const result = analyzeDocument(payload);
      sendJson(response, 200, result);
    } catch (error) {
      const message = error instanceof SyntaxError ? "Request body must be valid JSON" : error.message;
      sendJson(response, 400, { error: message });
    }
    return;
  }

  sendJson(response, 404, { error: "Not found" });
}

export function createServer() {
  return http.createServer((request, response) => {
    handleRequest(request, response).catch((error) => {
      sendJson(response, 500, { error: "Internal server error", detail: error.message });
    });
  });
}

if (import.meta.url === `file://${process.argv[1]}`) {
  createServer().listen(PORT, HOST, () => {
    console.log(`cortex ASP listening on ${SERVICE_BASE_URL}`);
  });
}
