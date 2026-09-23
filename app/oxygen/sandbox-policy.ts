/** Sandbox-only guard for the Oxygen Pelatologio API. */

export const OXYGEN_SANDBOX_BASE_URL = "https://sandbox-api.oxygen.gr/v1";

/** Production API host. Requests to this host are refused. */
export const OXYGEN_PRODUCTION_HOST = "api.oxygen.gr";

export const OXYGEN_OPENAPI_URL = "https://api.oxygen.gr/openapi.json";

export function assertSandboxBaseUrl(baseUrl: string): void {
  let url: URL;
  try {
    url = new URL(baseUrl);
  } catch {
    throw new Error(`OXYGEN_API_BASE_URL is not a valid URL: ${baseUrl}`);
  }

  if (url.protocol !== "https:") {
    throw new Error(
      `OXYGEN_API_BASE_URL must use https. Refusing ${url.protocol} URL.`,
    );
  }

  if (url.hostname === OXYGEN_PRODUCTION_HOST) {
    throw new Error(
      `Refusing to call production Oxygen (${OXYGEN_PRODUCTION_HOST}). ` +
        `Set OXYGEN_API_BASE_URL to ${OXYGEN_SANDBOX_BASE_URL}. ` +
        `Field reference: ${OXYGEN_OPENAPI_URL}`,
    );
  }
}

/**
 * Join a base URL that already includes `/v1` with an OpenAPI path.
 * `new URL("/contacts", "https://host/v1")` would drop `/v1`, so this does not use that.
 */
export function joinOxygenUrl(baseUrl: string, path: string): string {
  const normalizedBase = baseUrl.replace(/\/+$/, "");
  if (path === "" || path === "/") {
    return `${normalizedBase}/`;
  }
  const suffix = path.startsWith("/") ? path : `/${path}`;
  return `${normalizedBase}${suffix}`;
}
