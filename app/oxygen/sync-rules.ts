import type { OxygenContactWrite, OxygenInvoiceLine, OxygenInvoiceWrite } from "./types";

/**
 * Merchant-locked rules for the Shopify → Oxygen sandbox bridge.
 * OpenAPI: https://api.oxygen.gr/openapi.json
 */

/** ΦΠΑ 24% tax id supplied for this Oxygen account. Used on products and receipt lines. */
export const SALE_TAX_ID = "2238364a-8b60-4dc6-899c-1d8c63d5ea58";

/** Retail receipt for goods (Απόδειξη Πώλησης Αγαθών). */
export const RETAIL_DOCUMENT_TYPE = "rp" as const;

/** myDATA 11.1 — ΑΛΠ (retail receipt). */
export const RETAIL_MYDATA_DOCUMENT_TYPE = "11.1";

export const VAT_RATE = 0.24;

/**
 * Catalog prices on this Greek retail shop are gross (VAT included).
 * Order payloads can override this with `taxes_included`.
 */
export const CATALOG_PRICES_INCLUDE_VAT = true;

export type PaymentBucket = "cash" | "card" | "paypal" | "default";

/**
 * Shopify gateway → Oxygen payment-method bucket.
 *
 * | Shopify gateway                         | Bucket  | Oxygen title to match      |
 * |-----------------------------------------|---------|----------------------------|
 * | cash, manual, cod, cash_on_delivery     | cash    | Μετρητά / cash             |
 * | card, shopify_payments, stripe, credit  | card    | POS / e-POS / card         |
 * | paypal                                  | paypal  | PayPal                     |
 * | bogus, unknown, empty, anything else    | default | Μετρητά, else first active |
 */
export function classifyShopifyGateway(
  gateway: string | null | undefined,
): PaymentBucket {
  const normalized = (gateway ?? "")
    .trim()
    .toLowerCase()
    .replace(/[\s-]+/g, "_");

  if (
    !normalized ||
    normalized === "bogus" ||
    normalized === "unknown" ||
    normalized === "test"
  ) {
    return "default";
  }
  if (normalized.includes("paypal")) return "paypal";
  if (
    normalized.includes("shopify_payments") ||
    normalized.includes("stripe") ||
    normalized.includes("card") ||
    normalized.includes("credit") ||
    normalized === "pos"
  ) {
    return "card";
  }
  if (
    normalized === "cash" ||
    normalized === "manual" ||
    normalized.includes("cash_on_delivery") ||
    normalized.includes("cod") ||
    normalized.includes("μετρητ")
  ) {
    return "cash";
  }
  return "default";
}

export function shopifyGateway(order: {
  gateway?: string | null;
  payment_gateway_names?: string[] | null;
}): string | null {
  const named = order.payment_gateway_names?.find((name) => name.trim());
  if (named) return named;
  const legacy = order.gateway?.trim();
  return legacy || null;
}

const PAYMENT_ENV_KEYS: Record<PaymentBucket, string> = {
  cash: "OXYGEN_PAYMENT_METHOD_CASH",
  card: "OXYGEN_PAYMENT_METHOD_CARD",
  paypal: "OXYGEN_PAYMENT_METHOD_PAYPAL",
  default: "OXYGEN_PAYMENT_METHOD_DEFAULT",
};

export function paymentMethodOverride(
  bucket: PaymentBucket,
  env: NodeJS.ProcessEnv = process.env,
): string | null {
  const value = env[PAYMENT_ENV_KEYS[bucket]]?.trim();
  return value || null;
}

export interface PaymentMethodRef {
  id: string;
  title_gr?: string | null;
  title_en?: string | null;
  status?: boolean | null;
}

export interface PaymentMethodMatch {
  id: string;
  title: string;
  usedDefault: boolean;
}

function methodTitle(method: PaymentMethodRef): string {
  return `${method.title_gr ?? ""} ${method.title_en ?? ""}`.trim();
}

function titleBlob(method: PaymentMethodRef): string {
  return methodTitle(method).toLowerCase();
}

/**
 * Pick an Oxygen payment method for a bucket by title.
 * Unknown/bogus gateways (`default`) prefer Μετρητά and set `usedDefault`.
 * A bucket with no title match falls back the same way.
 */
export function matchPaymentMethod(
  methods: PaymentMethodRef[],
  bucket: PaymentBucket,
): PaymentMethodMatch | null {
  const active = methods.filter((method) => method.status !== false && method.id);
  const pool = active.length > 0 ? active : methods.filter((method) => method.id);
  const find = (pattern: RegExp) => pool.find((method) => pattern.test(titleBlob(method)));

  const specific =
    bucket === "cash"
      ? find(/μετρητ|cash/)
      : bucket === "card"
        ? find(/e-?\s*pos|\bpos\b|κάρτ|card/)
        : bucket === "paypal"
          ? find(/paypal/)
          : undefined;

  if (specific) {
    return { id: specific.id, title: methodTitle(specific), usedDefault: false };
  }

  const fallback = find(/μετρητ|cash/) ?? pool[0];
  if (!fallback) return null;
  return {
    id: fallback.id,
    title: methodTitle(fallback),
    usedDefault: true,
  };
}

export function readWarehouseId(
  env: NodeJS.ProcessEnv = process.env,
): string | null {
  const value = env.OXYGEN_DEFAULT_WAREHOUSE_ID?.trim();
  return value || null;
}

/** Stock writes run only when a single default warehouse id is configured. */
export function shouldWriteInventory(warehouseId: string | null): boolean {
  return Boolean(warehouseId);
}

export function shopifyPriceToNet(
  price: string | number | null | undefined,
  taxesIncluded: boolean,
): number {
  const amount = typeof price === "number" ? price : Number(price);
  if (!Number.isFinite(amount)) {
    throw new Error(`Shopify price is missing or not a number: ${String(price)}`);
  }
  const net = taxesIncluded ? amount / (1 + VAT_RATE) : amount;
  return Math.round(net * 100) / 100;
}

export function normalizeSku(sku: string | null | undefined): string | null {
  const trimmed = sku?.trim();
  return trimmed ? trimmed : null;
}

export function productDisplayName(
  productTitle: string | null | undefined,
  variantTitle: string | null | undefined,
): string {
  const product = productTitle?.trim() || "Shopify product";
  const variant = variantTitle?.trim();
  if (!variant || variant.toLowerCase() === "default title") return product;
  return `${product} - ${variant}`;
}

export function issueDateFromShopify(iso: string | null | undefined): string {
  const parsed = iso ? new Date(iso) : new Date();
  const date = Number.isNaN(parsed.getTime()) ? new Date() : parsed;
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: "Europe/Athens",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(date);
}

export interface ContactDraft {
  body: OxygenContactWrite;
  warnings: string[];
}

/** Retail receipts (rp) are issued to a private client, so contacts are type 1. */
export function buildPrivateContact(input: {
  shopifyId: string;
  email?: string | null;
  firstName?: string | null;
  lastName?: string | null;
  phone?: string | null;
  countryCode?: string | null;
  address1?: string | null;
  city?: string | null;
  zip?: string | null;
  company?: string | null;
}): ContactDraft {
  const warnings: string[] = [];
  const firstName = input.firstName?.trim();
  const lastName = input.lastName?.trim();
  if (!firstName || !lastName) {
    warnings.push(
      `Customer ${input.shopifyId} is missing a first or last name. Using a placeholder so POST /contacts can succeed.`,
    );
  }
  const country = input.countryCode?.trim();
  if (!country) {
    warnings.push(
      `Customer ${input.shopifyId} has no country. Using GR because POST /contacts requires a country.`,
    );
  }
  if (input.company?.trim()) {
    warnings.push(
      `Customer ${input.shopifyId} has company "${input.company.trim()}". Contact stays a private client because paid orders are retail receipts (rp).`,
    );
  }

  return {
    warnings,
    body: {
      code: contactCode(input.shopifyId),
      type: 1,
      is_client: true,
      is_supplier: false,
      name: firstName || "Πελάτης",
      surname: lastName || input.shopifyId,
      email: input.email?.trim() || null,
      telephone: input.phone?.trim() || null,
      country: (country || "GR").slice(0, 2).toUpperCase(),
      street: input.address1?.trim() || undefined,
      city: input.city?.trim() || undefined,
      zip_code: input.zip?.trim() || undefined,
      nickname: input.company?.trim() || undefined,
    },
  };
}

export function contactCode(shopifyId: string): string {
  const safe = shopifyId.replace(/[^A-Za-z0-9_-]+/g, "-").replace(/^-+|-+$/g, "");
  return `shopify-${safe || "contact"}`;
}

export function buildInvoiceLine(input: {
  oxygenProductId: string | null;
  title?: string | null;
  quantity: number;
  unitPrice?: string | null;
  taxesIncluded: boolean;
  warehouseId: string | null;
}): OxygenInvoiceLine {
  const quantity = input.quantity;
  const warehouse = input.warehouseId
    ? { warehouse_id: input.warehouseId }
    : {};
  if (input.oxygenProductId) {
    return {
      code: input.oxygenProductId,
      description: input.title?.trim() || undefined,
      quantity,
      tax_id: SALE_TAX_ID,
      ...warehouse,
    };
  }
  return {
    description: input.title?.trim() || "Είδος Shopify",
    quantity,
    unit_net_value: shopifyPriceToNet(input.unitPrice, input.taxesIncluded),
    tax_id: SALE_TAX_ID,
    ...warehouse,
  };
}

/** Paid Shopify order → Oxygen retail receipt. `is_paid` marks it paid; do not also POST /payments. */
export function buildRetailReceipt(input: {
  issueDate: string;
  contactId: string;
  paymentMethodId: string;
  orderName?: string | null;
  shopifyOrderId: string;
  lines: OxygenInvoiceLine[];
}): OxygenInvoiceWrite {
  const label = input.orderName?.trim() || input.shopifyOrderId;
  return {
    issue_date: input.issueDate,
    document_type: RETAIL_DOCUMENT_TYPE,
    language: "el",
    mydata_document_type: RETAIL_MYDATA_DOCUMENT_TYPE,
    payment_method_id: input.paymentMethodId,
    contact_id: input.contactId,
    items: input.lines,
    is_paid: true,
    description: label,
    comments: `Shopify order ${label} (${input.shopifyOrderId})`,
  };
}
