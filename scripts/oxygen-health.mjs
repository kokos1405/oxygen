/**
 * GET {OXYGEN_API_BASE_URL}/ and print the service payload.
 * Skips with exit 0 when OXYGEN_API_KEY is missing.
 * Refuses the production host api.oxygen.gr before any request.
 *
 * Keep the host check aligned with app/oxygen/sandbox-policy.ts.
 */

const SANDBOX_BASE_URL = "https://sandbox-api.oxygen.gr/v1";
const PRODUCTION_HOST = "api.oxygen.gr";

const apiKey = process.env.OXYGEN_API_KEY?.trim();
if (!apiKey) {
  console.log("OXYGEN_API_KEY is not set; skipping Oxygen health check.");
  process.exit(0);
}

const baseUrl = (process.env.OXYGEN_API_BASE_URL || SANDBOX_BASE_URL).replace(
  /\/+$/,
  "",
);

let url;
try {
  url = new URL(baseUrl);
} catch {
  console.error(`OXYGEN_API_BASE_URL is not a valid URL: ${baseUrl}`);
  process.exit(1);
}

if (url.protocol !== "https:") {
  console.error(`OXYGEN_API_BASE_URL must use https. Refusing ${baseUrl}`);
  process.exit(1);
}

if (url.hostname === PRODUCTION_HOST) {
  console.error(
    `Refusing to call production Oxygen (${PRODUCTION_HOST}). Use ${SANDBOX_BASE_URL}.`,
  );
  process.exit(1);
}

const endpoint = `${baseUrl}/`;
const response = await fetch(endpoint, {
  headers: {
    Authorization: `Bearer ${apiKey}`,
    Accept: "application/json",
  },
});

const body = await response.text();
if (!response.ok) {
  console.error(`Oxygen health check failed: ${response.status} ${body.slice(0, 500)}`);
  process.exit(1);
}

console.log(body);
