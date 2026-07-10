import { analyzeDocument } from "../src/analyze.js";

const apiKey = process.env.CORTEX_OCR_API_KEY || "helloworld";
const sampleUrl = process.env.OCR_SPACE_SAMPLE_URL || "http://dl.a9t9.com/blog/ocr-online/screenshot.jpg";

const sampleResponse = await fetch(sampleUrl);
if (!sampleResponse.ok) {
  throw new Error(`Failed to fetch sample image: ${sampleResponse.status}`);
}

const arrayBuffer = await sampleResponse.arrayBuffer();
const contentType = sampleResponse.headers.get("content-type") || "image/jpeg";
const filename = sampleUrl.split("/").pop() || "sample.jpg";
const contentBase64 = Buffer.from(arrayBuffer).toString("base64");

const result = await analyzeDocument(
  {
    document: {
      filename,
      content_type: contentType,
      content_base64: contentBase64,
    },
  },
  {
    ingestion: {
      ocr: {
        provider: "ocr_space",
        apiKey,
        endpoint: process.env.CORTEX_OCR_ENDPOINT || "https://api.ocr.space/parse/image",
        language: process.env.CORTEX_OCR_LANGUAGE || "eng",
        engine: process.env.CORTEX_OCR_ENGINE || "2",
        detectOrientation: process.env.CORTEX_OCR_DETECT_ORIENTATION === "false" ? false : true,
        scale: process.env.CORTEX_OCR_SCALE === "false" ? false : true,
      },
    },
  }
);

console.log(JSON.stringify({
  sample_url: sampleUrl,
  document_type: result.document_type,
  confidence_score: result.confidence_score,
  ocr_applied: result.provenance.ocr_applied,
  parsed_preview: result.summary,
}, null, 2));
