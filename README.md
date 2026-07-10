# Cortex

Cortex is a Document Intelligence Agent Service Provider (ASP) for X Layer, the official OKX blockchain. It transforms unstructured document text and text-layer documents into structured intelligence for autonomous agents, smart contracts, applications, and onchain workflows.

Cortex is not a summarization tool. It extracts actionable document intelligence using a deterministic JSON contract with source-span traceability.

## Output Schema

```json
{
  "document_type": "",
  "summary": "",
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

Current limitation:
- Scanned PDFs and images still need an OCR backend. When OCR is unavailable, Cortex rejects image uploads instead of fabricating text.

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
