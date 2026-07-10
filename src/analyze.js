const DOCUMENT_TYPES = [
  {
    type: "Invoice",
    patterns: [/\binvoice\b/i, /\binvoice\s*#/i, /\bbill\s+to\b/i, /\bamount\s+due\b/i],
  },
  {
    type: "Receipt",
    patterns: [/\breceipt\b/i, /\bpaid\b/i, /\btransaction\s+id\b/i, /\bmerchant\b/i],
  },
  {
    type: "Contract",
    patterns: [/\bagreement\b/i, /\bcontract\b/i, /\bparty\b/i, /\bterm\b/i, /\bjurisdiction\b/i],
  },
  {
    type: "Resume",
    patterns: [/\bresume\b/i, /\bcurriculum vitae\b/i, /\bexperience\b/i, /\beducation\b/i, /\bskills\b/i],
  },
  {
    type: "Proposal",
    patterns: [/\bproposal\b/i, /\bscope of work\b/i, /\bdeliverables\b/i, /\bpricing\b/i],
  },
  {
    type: "Whitepaper",
    patterns: [/\bwhitepaper\b/i, /\babstract\b/i, /\btokenomics\b/i, /\bprotocol\b/i],
  },
  {
    type: "Medical Report",
    patterns: [/\bpatient\b/i, /\bdiagnosis\b/i, /\bclinical\b/i, /\bmedical\s+report\b/i],
  },
  {
    type: "Bank Statement",
    patterns: [/\bbank\s+statement\b/i, /\baccount\s+number\b/i, /\bopening\s+balance\b/i, /\bclosing\s+balance\b/i],
  },
  {
    type: "Government Form",
    patterns: [/\bgovernment\b/i, /\bform\b/i, /\btaxpayer\b/i, /\bpassport\b/i, /\bnational\s+id\b/i],
  },
  {
    type: "Academic Paper",
    patterns: [/\babstract\b/i, /\bmethodology\b/i, /\breferences\b/i, /\bjournal\b/i],
  },
  {
    type: "Technical Documentation",
    patterns: [/\bapi\b/i, /\bendpoint\b/i, /\bsdk\b/i, /\bconfiguration\b/i, /\binstallation\b/i],
  },
  {
    type: "Meeting Notes",
    patterns: [/\bmeeting\s+notes\b/i, /\battendees\b/i, /\bagenda\b/i, /\baction\s+items\b/i],
  },
  {
    type: "Legal Filing",
    patterns: [/\bcourt\b/i, /\bplaintiff\b/i, /\bdefendant\b/i, /\bcase\s+no\b/i, /\bfiling\b/i],
  },
  {
    type: "Purchase Order",
    patterns: [/\bpurchase\s+order\b/i, /\bpo\s*#/i, /\bvendor\b/i, /\bship\s+to\b/i],
  },
];

const DATE_PATTERN = /\b(?:\d{4}-\d{2}-\d{2}|\d{1,2}[/-]\d{1,2}[/-]\d{2,4}|(?:Jan(?:uary)?|Feb(?:ruary)?|Mar(?:ch)?|Apr(?:il)?|May|Jun(?:e)?|Jul(?:y)?|Aug(?:ust)?|Sep(?:t(?:ember)?)?|Oct(?:ober)?|Nov(?:ember)?|Dec(?:ember)?)\s+\d{1,2},?\s+\d{4})\b/gi;
const MONEY_PATTERN = /\b(?:USD|US\$|EUR|GBP|NGN|OKB|OKT|ETH|BTC|USDT|USDC|\$|\u20AC|\u00A3|\u20A6)\s?\d{1,3}(?:,\d{3})*(?:\.\d{2,8})?\b/gi;
const EMAIL_PATTERN = /\b[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}\b/gi;
const PHONE_PATTERN = /\b(?:\+?\d{1,3}[\s.-]?)?(?:\(?\d{3}\)?[\s.-]?)\d{3}[\s.-]?\d{4}\b/g;
const URL_PATTERN = /\bhttps?:\/\/[^\s)]+/gi;
const ADDRESS_PATTERN = /\b\d{1,6}\s+[A-Za-z0-9.'-]+(?:\s+[A-Za-z0-9.'-]+){1,6}\s+(?:Street|St|Avenue|Ave|Road|Rd|Boulevard|Blvd|Lane|Ln|Drive|Dr|Way|Court|Ct)\b/gi;
const ACCOUNT_PATTERN = /\b(?:account|acct|iban|routing|wallet|address)\s*(?:number|no\.?|id|#)?\s*[:#-]?\s*([A-Z0-9][A-Z0-9-]{4,})\b/gi;
const ID_PATTERN = /\b(?:invoice|receipt|contract|case|po|purchase order|transaction|tx|reference|ref|employee|customer|vendor)\s*(?:number|no\.?|id|#)?\s*[:#-]?\s*([A-Z0-9][A-Z0-9-]{2,})\b/gi;
const CLAUSE_PATTERN = /\b(?:termination|confidentiality|indemnification|liability|governing law|jurisdiction|force majeure|non[- ]?compete|exclusivity|renewal|payment terms|intellectual property|dispute resolution)\b/gi;
const REGULATORY_PATTERN = /\b(?:GDPR|HIPAA|SOX|SOC\s*2|ISO\s*27001|KYC|AML|OFAC|PCI\s*DSS|SEC|FINRA|IRS|FDA)\b/gi;
const DIGITAL_ID_PATTERN = /\b(?:0x[a-fA-F0-9]{40}|[a-fA-F0-9]{64}|did:[a-z0-9]+:[A-Za-z0-9._:%-]+)\b/g;

const OBLIGATION_VERBS = ["shall", "must", "will", "agrees to", "is required to", "responsible for", "undertakes to"];
const DEADLINE_HINTS = ["due", "deadline", "expires", "expiration", "renewal", "renew", "payment", "milestone", "before", "by", "within", "no later than", "response period"];
const DECISION_HINTS = ["approved", "agreed", "accepted", "confirmed", "resolved", "decided", "authorized", "signed", "executed"];
const EXPLICIT_RISK_HINTS = ["risk", "penalty", "breach", "default", "late fee", "termination", "non-compliance", "liquidated damages", "dispute"];

function unique(values) {
  return [...new Set(values.filter(Boolean).map((value) => value.trim()).filter(Boolean))];
}

function matches(text, pattern) {
  return [...text.matchAll(pattern)].map((match) => match[0]);
}

function captureAll(text, pattern) {
  return [...text.matchAll(pattern)].map((match) => match[1] || match[0]);
}

function splitSentences(text) {
  return text
    .replace(/\r/g, "")
    .split(/(?<=[.!?])\s+|\n+/)
    .map((sentence) => sentence.trim())
    .filter((sentence) => sentence.length > 0);
}

function includesAny(value, hints) {
  const lower = value.toLowerCase();
  return hints.some((hint) => lower.includes(hint));
}

function detectDocumentType(text) {
  const scores = DOCUMENT_TYPES.map(({ type, patterns }) => ({
    type,
    score: patterns.reduce((count, pattern) => count + (pattern.test(text) ? 1 : 0), 0),
  })).sort((a, b) => b.score - a.score);

  const best = scores[0];
  if (!best || best.score === 0) {
    return { type: "Unknown", confidence: 0.35 };
  }

  const confidence = Math.min(0.95, 0.45 + best.score * 0.12);
  return { type: best.type, confidence };
}

function extractLabeledValues(text, labels) {
  const values = [];
  for (const label of labels) {
    const pattern = new RegExp(`\\b${label}\\s*[:#-]\\s*([^\\n;]+)`, "gi");
    for (const match of text.matchAll(pattern)) {
      values.push(match[1].trim());
    }
  }
  return unique(values);
}

function extractOrganizations(text) {
  const labeled = extractLabeledValues(text, ["company", "organization", "vendor", "supplier", "client", "customer", "employer", "issuer", "bill to", "ship to"]);
  const suffixMatches = matches(text, /\b[A-Z][A-Za-z0-9&.,'-]*(?:\s+[A-Z][A-Za-z0-9&.,'-]*){0,5}\s+(?:Inc\.?|LLC|Ltd\.?|Limited|Corp\.?|Corporation|Company|Co\.?|Foundation|DAO|Bank|University|Hospital)\b/g);
  return unique([...labeled, ...suffixMatches]);
}

function extractPeople(text) {
  const labeled = extractLabeledValues(text, ["name", "employee", "candidate", "patient", "attendee", "representative", "signatory", "prepared by", "approved by"]);
  const titleMatches = matches(text, /\b(?:Mr\.|Ms\.|Mrs\.|Dr\.|Prof\.)\s+[A-Z][a-z]+(?:\s+[A-Z][a-z]+){0,3}\b/g);
  return unique([...labeled, ...titleMatches]);
}

function extractProducts(text) {
  const labeled = extractLabeledValues(text, ["product", "item", "service", "deliverable", "sku"]);
  const skuLines = matches(text, /\bSKU\s*[:#-]?\s*[A-Z0-9-]+\b/gi);
  return unique([...labeled, ...skuLines]);
}

function extractPaymentTerms(text) {
  const sentences = splitSentences(text);
  return sentences.filter((sentence) => /\b(?:net\s*\d+|payment terms|amount due|late fee|payable|deposit|installment|escrow)\b/i.test(sentence));
}

function extractJurisdiction(text) {
  const sentences = splitSentences(text);
  return sentences.filter((sentence) => /\b(?:jurisdiction|governing law|venue|courts of|laws of)\b/i.test(sentence));
}

function extractEntities(text) {
  return {
    people: extractPeople(text),
    organizations: extractOrganizations(text),
    dates: unique(matches(text, DATE_PATTERN)),
    monetary_values: unique(matches(text, MONEY_PATTERN)),
    addresses: unique(matches(text, ADDRESS_PATTERN)),
    products: extractProducts(text),
    account_numbers: unique(captureAll(text, ACCOUNT_PATTERN)),
    ids: unique(captureAll(text, ID_PATTERN)),
    contract_clauses: unique(matches(text, CLAUSE_PATTERN)),
    jurisdiction_information: extractJurisdiction(text),
    payment_terms: extractPaymentTerms(text),
    regulatory_references: unique(matches(text, REGULATORY_PATTERN)),
    digital_identifiers: unique(matches(text, DIGITAL_ID_PATTERN)),
    emails: unique(matches(text, EMAIL_PATTERN)),
    phone_numbers: unique(matches(text, PHONE_PATTERN)),
    urls: unique(matches(text, URL_PATTERN)),
  };
}

function extractActor(sentence) {
  const actorMatch = sentence.match(/^(.{1,80}?)\s+(?:shall|must|will|agrees to|is required to|is responsible for|undertakes to)\b/i);
  if (actorMatch) return actorMatch[1].replace(/^the\s+/i, "").trim();
  const responsibleMatch = sentence.match(/\b(?:by|from)\s+([A-Z][A-Za-z0-9&.,' -]{2,60})\b/);
  return responsibleMatch ? responsibleMatch[1].trim() : "Unspecified";
}

function extractDeadlineFromSentence(sentence) {
  const date = sentence.match(DATE_PATTERN);
  if (date) return date[0];
  const relative = sentence.match(/\bwithin\s+\d+\s+(?:business\s+)?(?:days|weeks|months|years)\b/i);
  if (relative) return relative[0];
  const laterThan = sentence.match(/\bno later than\s+[^.;]+/i);
  return laterThan ? laterThan[0] : null;
}

function extractObligations(text) {
  return splitSentences(text)
    .filter((sentence) => includesAny(sentence, OBLIGATION_VERBS))
    .map((sentence) => ({
      actor: extractActor(sentence),
      action: sentence,
      conditions: extractCondition(sentence),
      deadline_or_timeframe: extractDeadlineFromSentence(sentence),
      consequences_of_non_compliance: extractConsequence(sentence),
      source_text: sentence,
      confidence_score: 0.72,
    }));
}

function extractCondition(sentence) {
  const condition = sentence.match(/\b(?:if|provided that|subject to|unless|upon|after)\b[^.;]+/i);
  return condition ? condition[0] : null;
}

function extractConsequence(sentence) {
  const consequence = sentence.match(/\b(?:otherwise|failing which|failure to|late fee|penalty|may terminate|constitutes breach)\b[^.;]+/i);
  return consequence ? consequence[0] : null;
}

function extractDeadlines(text) {
  return splitSentences(text)
    .filter((sentence) => includesAny(sentence, DEADLINE_HINTS) )
    .map((sentence) => ({
      event: classifyDeadlineEvent(sentence),
      date_or_timeframe: extractDeadlineFromSentence(sentence),
      source_text: sentence,
      confidence_score: extractDeadlineFromSentence(sentence) ? 0.76 : 0.55,
    }));
}

function classifyDeadlineEvent(sentence) {
  const lower = sentence.toLowerCase();
  if (lower.includes("renew")) return "Renewal";
  if (lower.includes("expir")) return "Expiration";
  if (lower.includes("payment") || lower.includes("due")) return "Payment deadline";
  if (lower.includes("milestone")) return "Milestone";
  if (lower.includes("response")) return "Response period";
  return "Time-sensitive event";
}

function extractDecisions(text) {
  return splitSentences(text)
    .filter((sentence) => includesAny(sentence, DECISION_HINTS))
    .map((sentence) => ({
      decision: sentence,
      status: "explicit",
      source_text: sentence,
      confidence_score: 0.74,
    }));
}

function extractRisks(text, entities, obligations) {
  const sentences = splitSentences(text);
  const explicit = sentences
    .filter((sentence) => includesAny(sentence, EXPLICIT_RISK_HINTS))
    .map((sentence) => ({
      type: "explicit",
      category: classifyRisk(sentence),
      description: sentence,
      source_text: sentence,
      confidence_score: 0.76,
    }));

  const inferred = [];
  if (obligations.some((obligation) => !obligation.actor || obligation.actor === "Unspecified")) {
    inferred.push({
      type: "inferred",
      category: "operational",
      description: "One or more obligations do not identify a responsible actor.",
      source_text: null,
      confidence_score: 0.63,
    });
  }
  if (entities.monetary_values.length > 0 && entities.payment_terms.length === 0) {
    inferred.push({
      type: "inferred",
      category: "financial",
      description: "Monetary values are present, but payment terms were not detected.",
      source_text: null,
      confidence_score: 0.58,
    });
  }
  if (/\bTBD\b|\bto be determined\b|\bN\/A\b|\[.*?\]/i.test(text)) {
    inferred.push({
      type: "inferred",
      category: "missing_information",
      description: "Document contains placeholders or unresolved fields that may block execution.",
      source_text: null,
      confidence_score: 0.68,
    });
  }
  if (/\b(?:contract|agreement)\b/i.test(text) && entities.jurisdiction_information.length === 0) {
    inferred.push({
      type: "inferred",
      category: "legal",
      description: "Agreement-like document does not include detected jurisdiction or governing law language.",
      source_text: null,
      confidence_score: 0.52,
    });
  }

  return [...explicit, ...inferred];
}

function classifyRisk(sentence) {
  const lower = sentence.toLowerCase();
  if (lower.includes("penalty") || lower.includes("late fee") || lower.includes("liquidated")) return "financial";
  if (lower.includes("breach") || lower.includes("jurisdiction") || lower.includes("termination")) return "legal";
  if (lower.includes("non-compliance") || lower.includes("regulatory")) return "compliance";
  if (lower.includes("default") || lower.includes("failure")) return "operational";
  return "general";
}

function extractMissingInformation(text, entities) {
  const missing = [];
  const placeholders = unique(matches(text, /\bTBD\b|\bto be determined\b|\bN\/A\b|\[[^\]]+\]/gi));
  for (const placeholder of placeholders) {
    missing.push({
      item: placeholder,
      reason: "Placeholder or unresolved value detected in document text.",
      confidence_score: 0.8,
    });
  }
  if (entities.emails.length === 0 && /\bcontact\b/i.test(text)) {
    missing.push({
      item: "contact_email",
      reason: "Document references contact details, but no email address was detected.",
      confidence_score: 0.55,
    });
  }
  return missing;
}

function buildActionItems({ documentType, obligations, deadlines, risks, missingInformation }) {
  const actionItems = [];
  for (const obligation of obligations) {
    actionItems.push({
      action: "Track obligation for execution",
      actor: obligation.actor,
      trigger: obligation.deadline_or_timeframe ? "deadline_monitor" : "obligation_registry",
      details: obligation.action,
      x_layer_workflow: "Create an agent task or smart-contract-readable obligation record keyed by document hash and responsible actor.",
      confidence_score: 0.72,
    });
  }
  for (const deadline of deadlines) {
    actionItems.push({
      action: "Schedule deadline reminder",
      actor: "Autonomous scheduling agent",
      trigger: deadline.date_or_timeframe || "time_sensitive_event_detected",
      details: deadline.source_text,
      x_layer_workflow: "Emit a deadline event for downstream X Layer applications or escrow/payment agents.",
      confidence_score: deadline.confidence_score,
    });
  }
  if (risks.length > 0) {
    actionItems.push({
      action: "Route document for risk review",
      actor: "Risk review agent or human operator",
      trigger: "risk_detected",
      details: `${risks.length} risk item(s) detected in ${documentType}.`,
      x_layer_workflow: "Gate automated approval or payment release until risk review is complete.",
      confidence_score: 0.66,
    });
  }
  if (missingInformation.length > 0) {
    actionItems.push({
      action: "Request missing information",
      actor: "Human operator or intake agent",
      trigger: "missing_information_detected",
      details: missingInformation.map((item) => item.item).join(", "),
      x_layer_workflow: "Prevent downstream execution until required fields are resolved and attested.",
      confidence_score: 0.7,
    });
  }
  return actionItems;
}

function buildSummary(documentType, entities, obligations, deadlines, risks) {
  const parts = [
    `Document classified as ${documentType}.`,
    `Detected ${entities.people.length} people, ${entities.organizations.length} organizations, ${entities.dates.length} dates, and ${entities.monetary_values.length} monetary values.`,
    `Extracted ${obligations.length} obligations, ${deadlines.length} deadlines or time-sensitive events, and ${risks.length} risks.`,
    "Output is structured for autonomous agents, X Layer applications, smart contracts, and workflow automation.",
  ];
  return parts.join(" ");
}

function scoreConfidence(documentTypeConfidence, entities, obligations, risks, text) {
  let score = documentTypeConfidence;
  if (entities.dates.length || entities.monetary_values.length || entities.organizations.length) score += 0.08;
  if (obligations.length) score += 0.05;
  if (risks.some((risk) => risk.type === "inferred")) score -= 0.03;
  if (text.length < 120) score -= 0.12;
  return Math.max(0.1, Math.min(0.98, Number(score.toFixed(2))));
}

export function analyzeDocument(input) {
  const text = typeof input === "string" ? input : input?.text;
  if (!text || typeof text !== "string" || text.trim().length === 0) {
    throw new TypeError("analyzeDocument requires non-empty document text");
  }

  const normalizedText = text.trim();
  const { type: documentType, confidence: documentTypeConfidence } = detectDocumentType(normalizedText);
  const entities = extractEntities(normalizedText);
  const obligations = extractObligations(normalizedText);
  const deadlines = extractDeadlines(normalizedText);
  const decisions = extractDecisions(normalizedText);
  const risks = extractRisks(normalizedText, entities, obligations);
  const missingInformation = extractMissingInformation(normalizedText, entities);
  const actionItems = buildActionItems({ documentType, obligations, deadlines, risks, missingInformation });

  return {
    document_type: documentType,
    summary: buildSummary(documentType, entities, obligations, deadlines, risks),
    entities,
    obligations,
    deadlines,
    decisions,
    risks,
    action_items: actionItems,
    missing_information: missingInformation,
    confidence_score: scoreConfidence(documentTypeConfidence, entities, obligations, risks, normalizedText),
  };
}
