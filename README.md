# Cortex

Cortex is a Document Intelligence Agent Service Provider (ASP) for X Layer, the official OKX blockchain. It transforms unstructured document text into structured intelligence for autonomous agents, smart contracts, applications, and onchain workflows.

Cortex is not a summarization tool. It extracts actionable document intelligence using a deterministic JSON contract.

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

## Run Locally

```bash
npm test
npm start
```

The service listens on `http://127.0.0.1:8787` by default.

## Analyze A Document

```bash
curl -s http://127.0.0.1:8787/v1/intelligence \
  -H 'content-type: application/json' \
  -d '{"text":"Invoice #INV-100. Acme Corp LLC must pay USD 500 by July 31, 2026. Late payment incurs a penalty."}'
```

## Endpoints

- `GET /health`
- `GET /.well-known/asp.json`
- `GET /openapi.json`
- `POST /v1/intelligence`

## ASP Registration

See [docs/asp-registration.md](docs/asp-registration.md).
