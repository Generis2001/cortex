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

test("extracts schema-aligned intelligence from a contract", () => {
  const result = analyzeDocument({ text: sampleContract });

  assert.equal(result.document_type, "Contract");
  assert.equal(typeof result.summary, "string");
  assert.ok(result.entities.organizations.includes("Acme Corp LLC"));
  assert.ok(result.entities.monetary_values.includes("USD 12,500"));
  assert.ok(result.obligations.length >= 2);
  assert.ok(result.deadlines.length >= 1);
  assert.ok(result.decisions.length >= 1);
  assert.ok(result.risks.some((risk) => risk.type === "explicit"));
  assert.ok(result.action_items.length >= 1);
  assert.equal(Array.isArray(result.missing_information), true);
  assert.equal(typeof result.confidence_score, "number");
});

test("rejects empty document text", () => {
  assert.throws(() => analyzeDocument({ text: "" }), /non-empty document text/);
});
