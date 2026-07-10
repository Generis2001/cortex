import zlib from "node:zlib";

const TEXT_LIKE_CONTENT_TYPES = new Set([
  "text/plain",
  "text/markdown",
  "text/csv",
  "application/json",
  "application/xml",
  "text/xml",
]);

function normalizeDocumentPayload(input) {
  if (typeof input === "string") {
    return { text: input, metadata: {} };
  }

  if (!input || typeof input !== "object") {
    throw new TypeError("Document payload must be a string or an object");
  }

  if (typeof input.text === "string" && input.text.trim()) {
    return { text: input.text, metadata: input.metadata || {} };
  }

  const document = input.document && typeof input.document === "object" ? input.document : input;
  const contentBase64 = document.content_base64 || input.content_base64 || input.document_base64;
  const contentType = (document.content_type || input.content_type || "application/octet-stream").toLowerCase();
  const filename = document.filename || input.filename || null;

  if (!contentBase64) {
    throw new TypeError("Request must include non-empty text or document.content_base64");
  }

  return {
    contentBase64,
    contentType,
    filename,
    metadata: input.metadata || {},
  };
}

function decodeBase64(contentBase64) {
  try {
    return Buffer.from(contentBase64, "base64");
  } catch {
    throw new TypeError("document.content_base64 must be valid base64");
  }
}

function decodePdfStringToken(token) {
  let value = token;
  if (value.startsWith("(") && value.endsWith(")")) {
    value = value.slice(1, -1);
  }

  return value
    .replace(/\\([\\()])/g, "$1")
    .replace(/\\n/g, "\n")
    .replace(/\\r/g, "\r")
    .replace(/\\t/g, "\t")
    .replace(/\\b/g, "\b")
    .replace(/\\f/g, "\f")
    .replace(/\\(\d{3})/g, (_, octal) => String.fromCharCode(Number.parseInt(octal, 8)));
}

function extractTextOperators(streamText) {
  const chunks = [];
  const singleText = [...streamText.matchAll(/\(((?:\\.|[^\\)])*)\)\s*Tj/g)].map((match) => decodePdfStringToken(`(${match[1]})`));
  chunks.push(...singleText);

  const arrayText = [...streamText.matchAll(/\[((?:.|\n|\r)*?)\]\s*TJ/g)];
  for (const match of arrayText) {
    const tokens = [...match[1].matchAll(/\((?:\\.|[^\\)])*\)/g)].map((token) => decodePdfStringToken(token[0]));
    if (tokens.length > 0) chunks.push(tokens.join(" "));
  }

  return chunks;
}

function extractPdfText(buffer) {
  const binary = buffer.toString("latin1");
  const streamRegex = /<<(.*?)>>\s*stream\r?\n([\s\S]*?)\r?\nendstream/g;
  const fragments = [];
  let match;

  while ((match = streamRegex.exec(binary)) !== null) {
    const dictionary = match[1] || "";
    const rawStream = match[2] || "";
    let streamBuffer = Buffer.from(rawStream, "latin1");

    if (/\/FlateDecode/.test(dictionary)) {
      try {
        streamBuffer = zlib.inflateSync(streamBuffer);
      } catch {
        try {
          streamBuffer = zlib.inflateRawSync(streamBuffer);
        } catch {
          continue;
        }
      }
    }

    const streamText = streamBuffer.toString("latin1");
    fragments.push(...extractTextOperators(streamText));
  }

  if (fragments.length === 0) {
    const fallback = [...binary.matchAll(/\(((?:\\.|[^\\)])*)\)/g)]
      .map((token) => decodePdfStringToken(`(${token[1]})`))
      .filter((value) => /[A-Za-z0-9]/.test(value));
    return fallback.join("\n").trim();
  }

  return fragments.join("\n").replace(/\n{3,}/g, "\n\n").trim();
}

function decodeTextLikeBuffer(buffer) {
  return buffer.toString("utf8").replace(/^\uFEFF/, "").trim();
}

function inferTextContentType(filename) {
  if (!filename) return null;
  const lower = filename.toLowerCase();
  if (lower.endsWith(".txt") || lower.endsWith(".md") || lower.endsWith(".csv")) return "text/plain";
  if (lower.endsWith(".json")) return "application/json";
  if (lower.endsWith(".xml")) return "application/xml";
  if (lower.endsWith(".pdf")) return "application/pdf";
  return null;
}

export function ingestDocument(input) {
  const normalized = normalizeDocumentPayload(input);
  if (normalized.text) {
    return {
      text: normalized.text.trim(),
      metadata: normalized.metadata,
      ingestion: {
        mode: "direct_text",
        content_type: "text/plain",
        filename: null,
        warnings: [],
      },
    };
  }

  const buffer = decodeBase64(normalized.contentBase64);
  const inferredType = inferTextContentType(normalized.filename);
  const contentType = normalized.contentType === "application/octet-stream" && inferredType ? inferredType : normalized.contentType;

  if (TEXT_LIKE_CONTENT_TYPES.has(contentType)) {
    const text = decodeTextLikeBuffer(buffer);
    if (!text) throw new TypeError("Decoded document content is empty");
    return {
      text,
      metadata: normalized.metadata,
      ingestion: {
        mode: "base64_document",
        content_type: contentType,
        filename: normalized.filename,
        warnings: [],
      },
    };
  }

  if (contentType === "application/pdf") {
    const text = extractPdfText(buffer);
    if (!text) {
      throw new TypeError("Unable to extract text from PDF document");
    }

    return {
      text,
      metadata: normalized.metadata,
      ingestion: {
        mode: "base64_document",
        content_type: contentType,
        filename: normalized.filename,
        warnings: [
          "PDF extraction is text-layer based. Scanned PDFs still require an OCR backend.",
        ],
      },
    };
  }

  if (contentType.startsWith("image/")) {
    throw new TypeError("OCR is not configured in this runtime. Provide extracted text or a text-layer PDF.");
  }

  throw new TypeError(`Unsupported document content_type: ${contentType}`);
}
