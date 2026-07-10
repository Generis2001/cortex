import test from "node:test";
import assert from "node:assert/strict";
import { analyzeDocument } from "../src/analyze.js";

const sampleContract = `
Service Agreement
Company: Acme Corp LLC
Client: Nova Labs Inc.
Contract ID: CT-1001
The Client shall pay USD 12,500 by March 15, 2026. Failure to pay by the due date constitutes breach and may result in termination.
The Provider must deliver the API endpoint within 10 business days after kickoff.
Governing Law: laws of New York.
The parties agreed that payment will be held in escrow until approval.
Contact: ops@example.com
`;

const samplePdfBase64 = Buffer.from(`%PDF-1.4
1 0 obj
<< /Type /Catalog /Pages 2 0 R >>
endobj
2 0 obj
<< /Type /Pages /Count 1 /Kids [3 0 R] >>
endobj
3 0 obj
<< /Type /Page /Parent 2 0 R /MediaBox [0 0 300 144] /Contents 4 0 R >>
endobj
4 0 obj
<< /Length 96 >>
stream
BT
/F1 12 Tf
72 100 Td
(Invoice INV-2001) Tj
0 -16 Td
(Acme Corp LLC must pay USD 500 by July 31, 2026.) Tj
ET
endstream
endobj
trailer
<< /Root 1 0 R >>
%%EOF`, "utf8").toString("base64");

test("extracts schema-aligned intelligence from a contract", async () => {
  const result = await analyzeDocument({ text: sampleContract });

  assert.equal(result.document_type, "Contract");
  assert.equal(typeof result.summary, "string");
  assert.equal(result.provenance.hash_algorithm, "sha256");
  assert.ok(result.entities.organizations.includes("Acme Corp LLC"));
  assert.ok(result.entities.monetary_values.includes("USD 12,500"));
  assert.ok(result.entities.evidence.organizations[0].source_spans.length >= 1);
  assert.ok(result.obligations.length >= 2);
  assert.ok(result.obligations[0].source_spans.length >= 1);
  assert.ok(result.deadlines.length >= 1);
  assert.ok(result.decisions.length >= 1);
  assert.ok(result.risks.some((risk) => risk.type === "explicit"));
  assert.ok(result.action_items.length >= 1);
  assert.equal(Array.isArray(result.missing_information), true);
  assert.equal(typeof result.confidence_score, "number");
});

test("ingests base64 pdf content without external pdf binaries", async () => {
  const result = await analyzeDocument({
    document: {
      filename: "invoice.pdf",
      content_type: "application/pdf",
      content_base64: samplePdfBase64,
    },
  });

  assert.equal(result.document_type, "Invoice");
  assert.ok(result.entities.ids.includes("INV-2001"));
  assert.ok(result.entities.monetary_values.includes("USD 500"));
  assert.ok(result.missing_information.some((item) => item.reason.includes("text-layer based")));
});

test("uses configured OCR provider for images", async () => {
  const imageBase64 = Buffer.from("fake-image-binary", "utf8").toString("base64");
  const originalFetch = globalThis.fetch;
  globalThis.fetch = async () => new Response(JSON.stringify({ text: "Receipt RC-9. Merchant: Acme Corp LLC. Paid USD 40 on 2026-07-01." }), { status: 200, headers: { "content-type": "application/json" } });

  try {
    const result = await analyzeDocument(
      {
        document: {
          filename: "receipt.png",
          content_type: "image/png",
          content_base64: imageBase64,
        },
      },
      {
        ingestion: {
          ocr: {
            providerUrl: "https://ocr.example.test/extract",
          },
        },
      }
    );

    assert.equal(result.provenance.ocr_applied, true);
    assert.equal(result.document_type, "Receipt");
    assert.ok(result.entities.monetary_values.includes("USD 40"));
    assert.ok(result.missing_information.some((item) => item.reason.includes("OCR provider")));
  } finally {
    globalThis.fetch = originalFetch;
  }
});

test("rejects empty document text", async () => {
  await assert.rejects(() => analyzeDocument({ text: "" }), /non-empty text|non-empty document text|include non-empty text/i);
});

test("extracts ungrouped monetary values with four or more digits", async () => {
  const result = await analyzeDocument({
    text: "Invoice INV-42. Acme Corp must pay USD 1250 by August 15, 2026. Late payment incurs a 5% penalty.",
  });

  assert.ok(result.entities.organizations.includes("Acme Corp"));
  assert.ok(!result.entities.organizations.includes("Invoice INV-42. Acme Corp"));
  assert.ok(result.entities.monetary_values.includes("USD 1250"));
});
