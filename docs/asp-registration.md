# Cortex ASP Registration Notes

Cortex is positioned as a Document Intelligence Agent Service Provider for X Layer, the official OKX blockchain.

## Service Type

Initial registration target: A2MCP.

Reason: the first production surface is a standardized API endpoint that returns deterministic JSON for each document-analysis call. The current endpoint is free and returns results directly, which fits the free A2MCP compliance path.

Future paid mode: add an x402-compliant payment gate with the OKX Payment SDK before listing a paid endpoint.

## Public Service Metadata

Once deployed, expose these URLs:

- `GET /health`
- `GET /.well-known/asp.json`
- `GET /openapi.json`
- `POST /v1/intelligence`

## Suggested ASP Profile

Name: Cortex

Description: Cortex transforms unstructured documents into structured intelligence for autonomous AI agents, smart contracts, applications, and onchain workflows operating in the X Layer ecosystem.

Service list:

- Document type detection
- Entity extraction
- Obligation detection
- Deadline extraction
- Decision extraction
- Risk detection
- Missing-information detection
- Action-item generation for agent and X Layer workflow automation
- Source-span traceability for downstream verification
- PDF text-layer ingestion

Default pricing:

- Free while endpoint is unauthenticated or protected only by API key and does not enforce x402.
- For paid A2MCP, configure a fixed per-call price after x402 integration.
- For A2A, use fixed or negotiated pricing for high-touch document review, verification, and custom workflow packaging.

## Constraint Handling

The development sandbox used for this scaffold blocks opening a listening socket. As a substitute, the HTTP contract is verified with in-process request-handler tests rather than live local `curl` requests.

## Onchain OS Flow

Run these from an agent session with network access:

```bash
npx skills add okx/onchainos-skills --yes -g
```

Then open a fresh agent session and use:

```text
Log in to Agentic Wallet on Onchain OS with my email
```

Register the free A2MCP service:

```text
Help me register an A2MCP ASP on OKX.AI using OKX Agent Identity from Onchain OS
```

List the ASP:

```text
Help me list my ASP on OKX.AI using Onchain OS and follow the steps.
```

## Production Readiness Gaps

- Add a real OCR backend for scanned PDFs and images.
- Add model-backed extraction with citation spans for higher recall.
- Add document hashing and signature verification for stronger provenance.
- Add x402 payment enforcement for paid A2MCP.
- Move API-key auth and in-memory rate limiting to production-grade gateway controls.
- Add persistent storage only if downstream workflows require auditable document records.
