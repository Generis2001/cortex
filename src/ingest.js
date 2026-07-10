import crypto from "node:crypto";
import zlib from "node:zlib";

const TEXT_LIKE_CONTENT_TYPES = new Set([
  "text/plain",
  "text/markdown",
  "text/csv",
  "application/json",
  "application/xml",
  "text/xml",
]);

function sha256(buffer) {
  return crypto.createHash("sha256").update(buffer).digest("hex");
}

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
  if (!/^[A-Za-z0-9+/=\s]+$/.test(contentBase64)) {
    throw new TypeError("document.content_base64 must be valid base64");
  }

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
  if (lower.endsWith(".png")) return "image/png";
  if (lower.endsWith(".jpg") || lower.endsWith(".jpeg")) return "image/jpeg";
  return null;
}

function buildProvenance({ sourceBuffer, normalizedText, ingestion, ocrApplied }) {
  return {
    hash_algorithm: "sha256",
    source_bytes_sha256: sha256(sourceBuffer),
    normalized_text_sha256: sha256(Buffer.from(normalizedText, "utf8")),
    source_bytes_length: sourceBuffer.length,
    normalized_text_length: normalizedText.length,
    content_type: ingestion.content_type,
    filename: ingestion.filename,
    source_kind: ingestion.mode,
    ocr_applied: ocrApplied,
  };
}

function finalizeIngestion({ rawText, sourceBuffer, ingestion, metadata, ocrApplied }) {
  const normalizedText = rawText.trim();
  if (!normalizedText) throw new TypeError("Decoded document content is empty");

  return {
    text: normalizedText,
    metadata,
    ingestion,
    provenance: buildProvenance({ sourceBuffer, normalizedText, ingestion, ocrApplied }),
  };
}

function buildOcrHeaders(ocrConfig) {
  const headers = { "content-type": "application/json" };
  if (!ocrConfig?.apiKey) return headers;

  const headerName = (ocrConfig.authHeader || "authorization").toLowerCase();
  if (headerName === "authorization") {
    headers.authorization = `Bearer ${ocrConfig.apiKey}`;
  } else {
    headers[headerName] = ocrConfig.apiKey;
  }
  return headers;
}

function buildOcrSpaceFormData({ buffer, filename, contentType, ocrConfig }) {
  const form = new FormData();
  form.set("base64Image", `data:${contentType};base64,${buffer.toString("base64")}`);
  form.set("language", ocrConfig.language || "eng");
  form.set("isOverlayRequired", "false");
  form.set("isTable", ocrConfig.isTable ? "true" : "false");
  form.set("detectOrientation", ocrConfig.detectOrientation ? "true" : "false");
  form.set("scale", ocrConfig.scale ? "true" : "false");
  if (ocrConfig.engine) form.set("OCREngine", String(ocrConfig.engine));
  if (filename) form.set("filetype", filename.split(".").pop() || "");
  return form;
}

async function requestOcrSpaceText({ buffer, filename, contentType, ocrConfig, fetchImpl }) {
  const endpoint = ocrConfig.endpoint || "https://api.ocr.space/parse/image";
  const apiKey = ocrConfig.apiKey;
  if (!apiKey) {
    throw new TypeError("OCR.space requires CORTEX_OCR_API_KEY");
  }

  const response = await fetchImpl(endpoint, {
    method: "POST",
    headers: { apikey: apiKey },
    body: buildOcrSpaceFormData({ buffer, filename, contentType, ocrConfig }),
  });

  if (!response.ok) {
    throw new TypeError(`OCR.space request failed with status ${response.status}`);
  }

  const payload = await response.json();
  if (payload?.IsErroredOnProcessing) {
    const errorMessage = Array.isArray(payload.ErrorMessage) ? payload.ErrorMessage.join("; ") : payload.ErrorMessage || "Unknown OCR.space error";
    throw new TypeError(`OCR.space error: ${errorMessage}`);
  }

  const parsedText = Array.isArray(payload?.ParsedResults)
    ? payload.ParsedResults.map((result) => result?.ParsedText || "").join("\n").trim()
    : "";

  if (!parsedText) {
    throw new TypeError("OCR.space response did not contain parsed text");
  }

  return parsedText;
}

async function requestOcrText({ buffer, filename, contentType, metadata, ocrConfig }) {
  if (!ocrConfig?.providerUrl && ocrConfig?.provider !== "ocr_space") return null;

  const fetchImpl = ocrConfig.fetchImpl || globalThis.fetch;
  if (typeof fetchImpl !== "function") {
    throw new TypeError("OCR provider is configured, but fetch is unavailable in this runtime");
  }

  if (ocrConfig.provider === "ocr_space") {
    return requestOcrSpaceText({ buffer, filename, contentType, ocrConfig, fetchImpl });
  }

  const response = await fetchImpl(ocrConfig.providerUrl, {
    method: "POST",
    headers: buildOcrHeaders(ocrConfig),
    body: JSON.stringify({
      filename,
      content_type: contentType,
      content_base64: buffer.toString("base64"),
      metadata,
      model: ocrConfig.model || undefined,
    }),
  });

  if (!response.ok) {
    throw new TypeError(`OCR provider request failed with status ${response.status}`);
  }

  const payload = await response.json();
  if (!payload || typeof payload.text !== "string" || payload.text.trim().length === 0) {
    throw new TypeError("OCR provider response must include a non-empty text field");
  }

  return payload.text;
}

export async function ingestDocument(input, options = {}) {
  const normalized = normalizeDocumentPayload(input);
  if (normalized.text) {
    const sourceBuffer = Buffer.from(normalized.text, "utf8");
    return finalizeIngestion({
      rawText: normalized.text,
      sourceBuffer,
      metadata: normalized.metadata,
      ingestion: {
        mode: "direct_text",
        content_type: "text/plain",
        filename: null,
        warnings: [],
      },
      ocrApplied: false,
    });
  }

  const buffer = decodeBase64(normalized.contentBase64);
  const inferredType = inferTextContentType(normalized.filename);
  const contentType = normalized.contentType === "application/octet-stream" && inferredType ? inferredType : normalized.contentType;

  if (TEXT_LIKE_CONTENT_TYPES.has(contentType)) {
    return finalizeIngestion({
      rawText: decodeTextLikeBuffer(buffer),
      sourceBuffer: buffer,
      metadata: normalized.metadata,
      ingestion: {
        mode: "base64_document",
        content_type: contentType,
        filename: normalized.filename,
        warnings: [],
      },
      ocrApplied: false,
    });
  }

  if (contentType === "application/pdf") {
    const text = extractPdfText(buffer);
    if (text) {
      return finalizeIngestion({
        rawText: text,
        sourceBuffer: buffer,
        metadata: normalized.metadata,
        ingestion: {
          mode: "base64_document",
          content_type: contentType,
          filename: normalized.filename,
          warnings: ["PDF extraction is text-layer based. Scanned PDFs still require an OCR backend."],
        },
        ocrApplied: false,
      });
    }

    const ocrText = await requestOcrText({
      buffer,
      filename: normalized.filename,
      contentType,
      metadata: normalized.metadata,
      ocrConfig: options.ocr,
    });

    if (!ocrText) {
      throw new TypeError("Unable to extract text from PDF document");
    }

    return finalizeIngestion({
      rawText: ocrText,
      sourceBuffer: buffer,
      metadata: normalized.metadata,
      ingestion: {
        mode: "base64_document",
        content_type: contentType,
        filename: normalized.filename,
        warnings: ["PDF content was extracted via OCR provider."],
      },
      ocrApplied: true,
    });
  }

  if (contentType.startsWith("image/")) {
    const ocrText = await requestOcrText({
      buffer,
      filename: normalized.filename,
      contentType,
      metadata: normalized.metadata,
      ocrConfig: options.ocr,
    });

    if (!ocrText) {
      throw new TypeError("OCR is not configured in this runtime. Provide extracted text or a text-layer PDF.");
    }

    return finalizeIngestion({
      rawText: ocrText,
      sourceBuffer: buffer,
      metadata: normalized.metadata,
      ingestion: {
        mode: "base64_document",
        content_type: contentType,
        filename: normalized.filename,
        warnings: ["Image content was extracted via OCR provider."],
      },
      ocrApplied: true,
    });
  }

  throw new TypeError(`Unsupported document content_type: ${contentType}`);
}
