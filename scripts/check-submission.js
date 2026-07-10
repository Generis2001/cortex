const checks = [];

function addCheck(name, passed, detail) {
  checks.push({ name, passed, detail });
}

function env(name) {
  return process.env[name] || "";
}

addCheck("base_url", Boolean(env("SERVICE_BASE_URL")), env("SERVICE_BASE_URL") || "Missing SERVICE_BASE_URL");
addCheck("ocr_mode", true, env("CORTEX_OCR_PROVIDER") || "disabled");
addCheck("x402_mode", true, env("CORTEX_X402_ENABLED") || "false");

if (env("CORTEX_OCR_PROVIDER") === "ocr_space") {
  addCheck("ocr_space_api_key", Boolean(env("CORTEX_OCR_API_KEY")), env("CORTEX_OCR_API_KEY") ? "configured" : "Missing CORTEX_OCR_API_KEY");
}

if (env("CORTEX_X402_ENABLED") === "true") {
  addCheck("x402_pay_to", Boolean(env("CORTEX_X402_PAY_TO") || env("PAY_TO_ADDRESS")), env("CORTEX_X402_PAY_TO") || env("PAY_TO_ADDRESS") || "Missing seller address");
  addCheck("okx_api_key", Boolean(env("OKX_API_KEY")), env("OKX_API_KEY") ? "configured" : "Missing OKX_API_KEY");
  addCheck("okx_secret_key", Boolean(env("OKX_SECRET_KEY")), env("OKX_SECRET_KEY") ? "configured" : "Missing OKX_SECRET_KEY");
  addCheck("okx_passphrase", Boolean(env("OKX_PASSPHRASE")), env("OKX_PASSPHRASE") ? "configured" : "Missing OKX_PASSPHRASE");
}

const failed = checks.filter((check) => !check.passed);
for (const check of checks) {
  console.log(`${check.passed ? "PASS" : "FAIL"} ${check.name}: ${check.detail}`);
}

if (failed.length > 0) {
  process.exitCode = 1;
} else {
  console.log("Submission configuration looks complete.");
}
