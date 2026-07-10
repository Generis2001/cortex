# Cortex

Cortex is a Document Intelligence Agent Service Provider (ASP) for X Layer, the official OKX blockchain. It transforms unstructured document text and documents into structured intelligence for autonomous agents, smart contracts, applications, and onchain workflows.

Cortex is not a summarization tool. It extracts actionable document intelligence using a deterministic JSON contract with source-span traceability and provenance fingerprints.

## Classification

Current service class: `A2MCP`

Reason: Cortex exposes a standardized API endpoint with deterministic request/response behavior. That fits OKX's A2MCP model. It does not currently negotiate scope, price, or delivery terms per task, so it is not operating as A2A.

Cortex can later add a separate A2A offering for bespoke document-review services while keeping this API as A2MCP.

## Output Schema

```json
{
  "document_type": "",
  "summary": "",
  "provenance": {},
  "entities": {},
  "obligations": [],
  "deadlines": [],
  "decisions": [],
  "risks": [],
  "action_items": [],
  "missing_information": [],
  "confidence_score": 0.0
}
```

## Supported Inputs

`POST /v1/intelligence` accepts either:

```json
{
  "text": "raw document text"
}
```

or:

```json
{
  "document": {
    "filename": "invoice.pdf",
    "content_type": "application/pdf",
    "content_base64": "..."
  }
}
```

Supported ingestion modes:
- Direct text
- Base64 text-like files: `text/plain`, `text/markdown`, `text/csv`, `application/json`, `application/xml`
- Base64 PDF with text-layer extraction
- Base64 images or scanned PDFs through a pluggable OCR provider

## OCR Provider Contract

When `CORTEX_OCR_PROVIDER_URL` is set, Cortex sends:

```json
{
  "filename": "receipt.png",
  "content_type": "image/png",
  "content_base64": "...",
  "metadata": {},
  "model": "optional"
}
```

Expected response:

```json
{
  "text": "extracted document text"
}
```

Optional OCR env vars:
- `CORTEX_OCR_PROVIDER=ocr_space` for OCR.space integration
- `CORTEX_OCR_PROVIDER_URL`
- `CORTEX_OCR_API_KEY`
- `CORTEX_OCR_AUTH_HEADER`
- `CORTEX_OCR_MODEL`
- `CORTEX_OCR_ENDPOINT`
- `CORTEX_OCR_LANGUAGE`
- `CORTEX_OCR_ENGINE`

## Payment Modes

Free mode:
- Default behavior
- Endpoint returns results directly

Paid A2MCP mode via x402:
- Set `CORTEX_X402_ENABLED=true`
- Set `CORTEX_X402_PAY_TO`
- Set `OKX_API_KEY`
- Set `OKX_SECRET_KEY`
- Set `OKX_PASSPHRASE`
- Optional: `CORTEX_X402_PRICE`, `CORTEX_X402_NETWORK`, `OKX_BASE_URL`

In x402 mode, Cortex protects `POST /v1/intelligence` with the official OKX Payment SDK middleware.

## Free Submission Strategy

Recommended for initial OKX submission:
- Deploy on Vercel Hobby
- Keep OCR off unless you have a real OCR provider key
- Keep x402 off unless you already have working OKX credentials

This keeps the service zero-cost and still fully valid as an A2MCP submission.

## Run Locally

```bash
npm test
npm start
```

The service listens on `http://127.0.0.1:8787` by default.

Optional runtime controls:
- `CORTEX_API_KEY`: require `Authorization: Bearer <token>` for analysis requests
- `RATE_LIMIT_WINDOW_MS`: in-memory rate-limit window
- `RATE_LIMIT_MAX_REQUESTS`: max requests per client/path within the window
- `CORTEX_MAX_BODY_SIZE`: Express JSON body-size limit

## Analyze A Document

```bash
curl -s http://127.0.0.1:8787/v1/intelligence \
  -H 'content-type: application/json' \
  -d '{"text":"Invoice #INV-100. Acme Corp LLC must pay USD 500 by July 31, 2026. Late payment incurs a penalty."}'
```

## Validation Without Socket Binding

This environment blocks opening a listening socket, so HTTP behavior is validated through in-process handler tests instead of `curl` against a live local port. The endpoint contract is exercised in [test/server.test.js](/home/generisx/cortex/test/server.test.js).

## Endpoints

- `GET /health`
- `GET /.well-known/asp.json`
- `GET /openapi.json`
- `POST /v1/intelligence`

## ASP Registration

See [docs/asp-registration.md](/home/generisx/cortex/docs/asp-registration.md).

## Deployment

- [Vercel Deployment](/home/generisx/cortex/docs/deployment-vercel.md)
- [Submission Checklist](/home/generisx/cortex/docs/submission-checklist.md)
