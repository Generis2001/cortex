# Vercel Deployment

Recommended target for zero-cost submission: Vercel Hobby.

Status note as of July 10, 2026:
- Vercel Hobby is free.
- Hobby is intended for personal or non-commercial use.
- For a submission/demo deployment, this is the safest no-cost option.

## Why Vercel over Railway

Railway may still be useful, but its free-path positioning is less predictable. For a strict no-spend submission, Vercel is the better default.

## Required Repo Shape

This repo exposes an Express app as a default export from [src/index.js](/home/generisx/cortex/src/index.js), which matches Vercel's current Express deployment guidance.

## Environment Variables

Minimum for free submission:
- `SERVICE_BASE_URL`

Optional:
- `CORTEX_API_KEY`
- `CORTEX_OCR_PROVIDER=ocr_space`
- `CORTEX_OCR_API_KEY`

For paid x402 mode:
- `CORTEX_X402_ENABLED=true`
- `CORTEX_X402_PAY_TO`
- `OKX_API_KEY`
- `OKX_SECRET_KEY`
- `OKX_PASSPHRASE`

## Pre-Submission Checks

Run:

```bash
npm test
npm run lint
npm run check:submission
```

Optional OCR smoke test against OCR.space's public receipt sample:

```bash
npm run smoke:ocr-space
```

## Suggested Submission Mode

Use free mode for initial submission unless you already have live x402 credentials.

Reason:
- It avoids spend.
- It removes credential-related review failures.
- The service still cleanly qualifies as A2MCP.

After submission approval, you can turn on x402 by adding env vars only.
