import {
  OXYGEN_OPENAPI_URL,
  OXYGEN_SANDBOX_BASE_URL,
  assertSandboxBaseUrl,
  joinOxygenUrl,
} from "./sandbox-policy";
import type {
  OxygenContact,
  OxygenContactListQuery,
  OxygenContactPatch,
  OxygenContactWrite,
  OxygenInvoice,
  OxygenInvoicePaymentWrite,
  OxygenInvoiceWrite,
  OxygenList,
  OxygenPaymentMethod,
  OxygenPdfTemplate,
  OxygenProduct,
  OxygenProductListQuery,
  OxygenProductUpdate,
  OxygenProductWrite,
  OxygenReceipt,
  OxygenServiceInfo,
  OxygenTax,
  OxygenWarehouse,
} from "./types";

export interface OxygenConfig {
  baseUrl: string;
  apiKey: string | null;
}

export class OxygenApiError extends Error {
  readonly status: number;
  readonly path: string;
  readonly responseBody: string;

  constructor(status: number, path: string, responseBody: string) {
    super(`Oxygen ${status} on ${path}`);
    this.name = "OxygenApiError";
    this.status = status;
    this.path = path;
    this.responseBody = responseBody.slice(0, 500);
  }
}

export function getOxygenConfig(
  env: NodeJS.ProcessEnv = process.env,
): OxygenConfig {
  const baseUrl = (env.OXYGEN_API_BASE_URL || OXYGEN_SANDBOX_BASE_URL).replace(
    /\/+$/,
    "",
  );
  assertSandboxBaseUrl(baseUrl);
  const apiKey = env.OXYGEN_API_KEY?.trim() || null;
  return { baseUrl, apiKey };
}

export function createOxygenClient(
  env: NodeJS.ProcessEnv = process.env,
): OxygenClient {
  const config = getOxygenConfig(env);
  if (!config.apiKey) {
    throw new Error(
      "OXYGEN_API_KEY is not set. Refusing to call Oxygen. See .env.example.",
    );
  }
  return new OxygenClient(config.baseUrl, config.apiKey);
}

/**
 * Oxygen REST client.
 * Auth: `Authorization: Bearer <OXYGEN_API_KEY>` and `Accept: application/json`.
 * Production host `api.oxygen.gr` is rejected in `assertSandboxBaseUrl`.
 */
export class OxygenClient {
  constructor(
    private readonly baseUrl: string,
    private readonly apiKey: string,
  ) {
    assertSandboxBaseUrl(baseUrl);
  }

  /** GET / — credential and connectivity check. */
  getServiceInfo(): Promise<OxygenServiceInfo> {
    return this.request<OxygenServiceInfo>("GET", "/");
  }

  listContacts(
    query?: OxygenContactListQuery,
  ): Promise<OxygenList<OxygenContact>> {
    return this.request("GET", withQuery("/contacts", query));
  }

  getContact(contactId: string): Promise<OxygenContact> {
    return this.request("GET", `/contacts/${encodeURIComponent(contactId)}`);
  }

  createContact(body: OxygenContactWrite): Promise<OxygenContact> {
    return this.request("POST", "/contacts", { body });
  }

  /**
   * PATCH /contacts/{id}. Partial update.
   * PUT requires every value (OpenAPI `putContactsByContact`) and is not wrapped
   * until a full-replace sync exists.
   */
  updateContact(
    contactId: string,
    body: OxygenContactPatch,
  ): Promise<OxygenContact> {
    return this.request(
      "PATCH",
      `/contacts/${encodeURIComponent(contactId)}`,
      { body },
    );
  }

  listProducts(
    query?: OxygenProductListQuery,
  ): Promise<OxygenList<OxygenProduct>> {
    return this.request("GET", withQuery("/products", query));
  }

  getProduct(productId: string): Promise<OxygenProduct> {
    return this.request("GET", `/products/${encodeURIComponent(productId)}`);
  }

  createProduct(body: OxygenProductWrite): Promise<OxygenProduct> {
    return this.request("POST", "/products", { body });
  }

  updateProduct(
    productId: string,
    body: OxygenProductUpdate,
  ): Promise<OxygenProduct> {
    return this.request("PUT", `/products/${encodeURIComponent(productId)}`, {
      body,
    });
  }

  listWarehouses(): Promise<{ data: OxygenWarehouse[] }> {
    return this.request("GET", "/warehouses");
  }

  /** GET /payment-methods — titles are matched to Shopify gateways. */
  listPaymentMethods(): Promise<{ data: OxygenPaymentMethod[] }> {
    return this.request("GET", "/payment-methods");
  }

  /** GET /taxes — ids are required later as `sale_tax_id` / invoice line `tax_id`. */
  listTaxes(): Promise<{ data: OxygenTax[] }> {
    return this.request("GET", "/taxes");
  }

  createInvoice(body: OxygenInvoiceWrite): Promise<OxygenInvoice> {
    return this.request("POST", "/invoices", { body });
  }

  getInvoice(invoiceId: string): Promise<OxygenInvoice> {
    return this.request("GET", `/invoices/${encodeURIComponent(invoiceId)}`);
  }

  getInvoicePdf(
    invoiceId: string,
    template?: OxygenPdfTemplate,
  ): Promise<ArrayBuffer> {
    const path = withQuery(`/invoices/${encodeURIComponent(invoiceId)}/pdf`, {
      template,
    });
    return this.request<ArrayBuffer>("GET", path, {
      accept: "application/pdf",
      binary: true,
    });
  }

  payInvoice(
    invoiceId: string,
    body: OxygenInvoicePaymentWrite = {},
  ): Promise<OxygenReceipt> {
    return this.request(
      "POST",
      `/invoices/${encodeURIComponent(invoiceId)}/payments`,
      { body },
    );
  }

  private async request<T>(
    method: string,
    path: string,
    options: {
      body?: unknown;
      accept?: string;
      binary?: boolean;
    } = {},
  ): Promise<T> {
    const headers: Record<string, string> = {
      Authorization: `Bearer ${this.apiKey}`,
      Accept: options.accept ?? "application/json",
    };
    if (options.body !== undefined) {
      headers["Content-Type"] = "application/json";
    }

    const response = await fetch(joinOxygenUrl(this.baseUrl, path), {
      method,
      headers,
      body:
        options.body !== undefined ? JSON.stringify(options.body) : undefined,
    });

    if (!response.ok) {
      const responseBody = await response.text();
      throw new OxygenApiError(response.status, path, responseBody);
    }

    if (options.binary) {
      return (await response.arrayBuffer()) as T;
    }

    if (response.status === 204) {
      return undefined as T;
    }

    return (await response.json()) as T;
  }
}

function withQuery(path: string, query?: object): string {
  if (!query) return path;
  const params = new URLSearchParams();
  for (const [key, value] of Object.entries(query)) {
    if (value !== undefined && value !== null && value !== "") {
      params.set(key, String(value));
    }
  }
  const qs = params.toString();
  if (!qs) return path;
  return `${path}?${qs}`;
}

export { OXYGEN_OPENAPI_URL };
