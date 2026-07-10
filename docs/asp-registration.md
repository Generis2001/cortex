# Cortex ASP Registration Notes

Cortex is positioned as a Document Intelligence Agent Service Provider for X Layer, the official OKX blockchain.

## Service Type

Current primary registration target: A2MCP.

Reason: Cortex exposes a standardized document-intelligence API. It returns deterministic JSON for each call, which matches OKX's A2MCP model for standardized MCP/API services.

A2A is optional and separate. If you later offer bespoke document review, negotiated scope, or escrow-based delivery, that custom service should be listed as A2A while the core API remains A2MCP.

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
- Provenance hashing for stronger auditability
- PDF text-layer ingestion
- OCR-backed ingestion for scanned inputs

Default pricing:

- Free while the endpoint is not protected by x402.
- Paid A2MCP once `CORTEX_X402_ENABLED=true` and OKX Payment SDK credentials are configured.
- For A2A, use fixed or negotiated pricing for high-touch document review, verification, and custom workflow packaging.

## Zero-Cost Submission Recommendation

For the initial marketplace submission:

- Deploy in free mode
- Use Vercel Hobby as the no-cost demo environment
- Leave x402 disabled until you have verified OKX credentials
- Leave OCR disabled unless you have a concrete OCR key or endpoint

This reduces review friction and keeps the submission zero-cost while preserving the A2MCP classification.

## Constraint Handling

The development sandbox used for this scaffold blocks opening a listening socket. As a substitute, the HTTP contract is verified with in-process request-handler tests rather than live local `curl` requests.

## x402 Notes

Cortex now includes optional x402 integration using the official Node packages:

- `express`
- `@okxweb3/x402-express`
- `@okxweb3/x402-core`
- `@okxweb3/x402-evm`

Required env vars for paid A2MCP mode:

- `CORTEX_X402_ENABLED=true`
- `CORTEX_X402_PAY_TO=<seller wallet>`
- `OKX_API_KEY`
- `OKX_SECRET_KEY`
- `OKX_PASSPHRASE`

Optional:

- `CORTEX_X402_PRICE`, default `$0.01`
- `CORTEX_X402_NETWORK`, default `eip155:196`
- `OKX_BASE_URL`

## Onchain OS Flow

Run these from an agent session with network access:

```bash
npx skills add okx/onchainos-skills --yes -g
```

Then open a fresh agent session and use:

```text
Log in to Agentic Wallet on Onchain OS with my email
```

Register the A2MCP service:

```text
Help me register an A2MCP ASP on OKX.AI using OKX Agent Identity from Onchain OS
```

List the ASP:

```text
Help me list my ASP on OKX.AI using Onchain OS and follow the steps.
```

## Remaining Production Gaps

- Validate a concrete OCR provider with your own scanned sample corpus.
- Add model-backed extraction with higher-recall citation logic if deterministic heuristics are insufficient.
- Move API-key auth and in-memory rate limiting to production-grade gateway controls.
- Add persistent storage only if downstream workflows require auditable document records.
