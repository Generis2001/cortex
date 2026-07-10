# Submission Checklist

## Required

- Service responds on `GET /health`
- Service exposes `GET /.well-known/asp.json`
- Service exposes `GET /openapi.json`
- Service exposes `POST /v1/intelligence`
- Output is deterministic JSON
- Service class is documented as `A2MCP`
- README explains free mode and x402 paid mode

## Strongly Recommended

- OCR disabled unless configured with a real provider key
- x402 disabled unless real OKX credentials are present
- `npm test` passes
- `npm run lint` passes
- `npm run check:submission` passes

## Demo-Friendly Defaults

- Deploy in free mode first
- Turn on `ocr_space` only if you have a free OCR key
- Leave x402 off for zero-cost submission
