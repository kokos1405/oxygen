import { OXYGEN_OPENAPI_URL } from "../oxygen/sandbox-policy";
import { EntityType, findOxygenId } from "./mapping.server";

/**
 * Sync stubs. Shopify is master. These functions do not call Oxygen yet:
 * several required ids (tax, payment method, myDATA type, warehouse) are
 * merchant configuration and must not be invented.
 *
 * OpenAPI: https://api.oxygen.gr/openapi.json
 */

export type SyncStatus = "stub" | "synced" | "skipped";

export interface SyncResult {
  status: SyncStatus;
  entityType: string | null;
  shopifyId: string | null;
  oxygenId: string | null;
  message: string;
}

export interface ShopifyCustomerPayload {
  id?: number | string;
  email?: string | null;
  first_name?: string | null;
  last_name?: string | null;
  phone?: string | null;
  default_address?: {
    country_code?: string | null;
    address1?: string | null;
    city?: string | null;
    zip?: string | null;
    company?: string | null;
  } | null;
}

export interface ShopifyProductPayload {
  id?: number | string;
  title?: string | null;
  status?: string | null;
  variants?: Array<{
    id?: number | string;
    sku?: string | null;
    barcode?: string | null;
    price?: string | null;
  }>;
}

/** REST `inventory_levels/update` body. There is no top-level product id. */
export interface ShopifyInventoryLevelPayload {
  inventory_item_id?: number | string;
  location_id?: number | string;
  available?: number | null;
  updated_at?: string;
}

export interface ShopifyOrderPayload {
  id?: number | string;
  name?: string | null;
  email?: string | null;
  financial_status?: string | null;
  currency?: string | null;
  customer?: ShopifyCustomerPayload | null;
  line_items?: Array<{
    id?: number | string;
    product_id?: number | string | null;
    variant_id?: number | string | null;
    sku?: string | null;
    title?: string | null;
    quantity?: number;
    price?: string | null;
  }>;
}

function asId(value: number | string | null | undefined): string | null {
  if (value === undefined || value === null || value === "") return null;
  return String(value);
}

function stub(input: {
  entityType: string | null;
  shopifyId: string | null;
  oxygenId: string | null;
  message: string;
}): SyncResult {
  return { status: "stub", ...input };
}

/**
 * Shopify customer → Oxygen contact.
 * TODO: map fields and call the client.
 * Required on POST /contacts: type, is_client, is_supplier, country.
 * Type 1 (private) needs name + surname. Type 2 (company) needs company_name,
 * vat_number, tax_office (Greece), street, number, city, zip_code.
 * FIXME: Shopify does not store Greek tax office or a reliable company/private flag.
 * https://api.oxygen.gr/openapi.json — POST /contacts, PATCH /contacts/{contact_id}
 */
export async function syncCustomer(input: {
  shop: string;
  topic: string;
  customer: ShopifyCustomerPayload;
}): Promise<SyncResult> {
  const shopifyId = asId(input.customer.id);
  if (!shopifyId) {
    return stub({
      entityType: EntityType.Customer,
      shopifyId: null,
      oxygenId: null,
      message: "Customer webhook payload has no id.",
    });
  }

  const oxygenId = await findOxygenId(
    input.shop,
    EntityType.Customer,
    shopifyId,
  );

  // TODO: if oxygenId is null, GET /contacts?email= before POST /contacts.
  // TODO: if oxygenId is set, PATCH /contacts/{oxygenId} with changed fields.
  // TODO: upsertMapping(customer) with the returned contact id.
  return stub({
    entityType: EntityType.Customer,
    shopifyId,
    oxygenId,
    message: oxygenId
      ? `Mapped customer ${shopifyId} → contact ${oxygenId}. TODO: PATCH /contacts/${oxygenId}.`
      : `No Oxygen contact for customer ${shopifyId}. TODO: POST /contacts (${OXYGEN_OPENAPI_URL}).`,
  });
}

/**
 * Shopify product → Oxygen product.
 * TODO: merchant must choose variant strategy before this writes anything.
 * FIXME: one Shopify product often has many variants. Oxygen models that either
 * as separate products or as a product group (`POST /products-groups`) plus variations.
 * Do not guess. Required on POST /products: name, code, warehouses, sale_net_amount,
 * sale_tax_id, status. sale_tax_id comes from GET /taxes — not from Shopify.
 * https://api.oxygen.gr/openapi.json — POST /products, PUT /products/{product_id}
 */
export async function syncProduct(input: {
  shop: string;
  topic: string;
  product: ShopifyProductPayload;
}): Promise<SyncResult> {
  const shopifyId = asId(input.product.id);
  if (!shopifyId) {
    return stub({
      entityType: EntityType.Product,
      shopifyId: null,
      oxygenId: null,
      message: "Product webhook payload has no id.",
    });
  }

  const oxygenId = await findOxygenId(input.shop, EntityType.Product, shopifyId);
  const variantCount = input.product.variants?.length ?? 0;

  return stub({
    entityType: EntityType.Product,
    shopifyId,
    oxygenId,
    message:
      `Product ${shopifyId} has ${variantCount} variant(s). ` +
      "FIXME: confirm SKU-per-Oxygen-product vs /products-groups before POST /products. " +
      `sale_tax_id and warehouses[].id are merchant data (${OXYGEN_OPENAPI_URL}).`,
  });
}

/**
 * Shopify inventory level → Oxygen warehouse quantity.
 * There is no standalone inventory endpoint. Quantity is `warehouses[].quantity`
 * on POST/PUT /products/{product_id}.
 * FIXME: payload has inventory_item_id + location_id, not a product id.
 * TODO: Admin GraphQL to resolve inventory item → variant → product (read_products, read_inventory),
 * then ExternalIdMap location → warehouse id, then PUT the Oxygen product.
 * Confirm whether PUT warehouses replaces the whole set (OpenAPI description says the array is the warehouse details).
 */
export async function syncInventory(input: {
  shop: string;
  topic: string;
  level: ShopifyInventoryLevelPayload;
}): Promise<SyncResult> {
  const inventoryItemId = asId(input.level.inventory_item_id);
  const locationId = asId(input.level.location_id);
  const warehouseId = locationId
    ? await findOxygenId(input.shop, EntityType.Location, locationId)
    : null;

  return stub({
    entityType: EntityType.Location,
    shopifyId: locationId,
    oxygenId: warehouseId,
    message:
      `inventory_item ${inventoryItemId ?? "?"} at location ${locationId ?? "?"}` +
      `${warehouseId ? ` → warehouse ${warehouseId}` : " has no warehouse mapping"}. ` +
      `available=${input.level.available ?? "?"}. ` +
      "TODO: resolve variant, then PUT /products/{id} warehouses[].quantity. " +
      OXYGEN_OPENAPI_URL,
  });
}

/**
 * Shopify order → Oxygen contact, then invoice.
 *
 * Idempotency: orders/create and orders/paid both arrive for one order.
 * POST /invoices must run only when ExternalIdMap has no `order` row for this id.
 * orders/create ensures the contact. orders/paid is the invoice step.
 * orders/updated is intentionally not subscribed.
 *
 * FIXME required invoice fields that Shopify does not provide:
 * payment_method_id (GET /payment-methods), mydata_document_type (AADE 8.1 enum in OpenAPI),
 * per-line tax_id unless a valid Oxygen product code is sent.
 * document_type is `p` or `rp` for goods — merchant must confirm retail receipt vs invoice.
 * https://api.oxygen.gr/openapi.json — POST /invoices, POST /invoices/{invoice_id}/payments
 */
export async function syncOrder(input: {
  shop: string;
  topic: string;
  order: ShopifyOrderPayload;
}): Promise<SyncResult> {
  const shopifyId = asId(input.order.id);
  if (!shopifyId) {
    return stub({
      entityType: EntityType.Order,
      shopifyId: null,
      oxygenId: null,
      message: "Order webhook payload has no id.",
    });
  }

  const existingInvoiceId = await findOxygenId(
    input.shop,
    EntityType.Order,
    shopifyId,
  );

  if (input.order.customer?.id) {
    await syncCustomer({
      shop: input.shop,
      topic: input.topic,
      customer: input.order.customer,
    });
  }

  if (existingInvoiceId) {
    return {
      status: "skipped",
      entityType: EntityType.Order,
      shopifyId,
      oxygenId: existingInvoiceId,
      message: `Order ${shopifyId} already mapped to invoice ${existingInvoiceId}. Not posting /invoices again.`,
    };
  }

  if (input.topic === "ORDERS_CREATE") {
    return stub({
      entityType: EntityType.Order,
      shopifyId,
      oxygenId: null,
      message:
        "orders/create ensures the contact only. Invoice is deferred to orders/paid so a paid order is not invoiced twice.",
    });
  }

  const lineCount = input.order.line_items?.length ?? 0;
  return stub({
    entityType: EntityType.Order,
    shopifyId,
    oxygenId: null,
    message:
      `TODO: POST /invoices for order ${shopifyId} (${lineCount} lines) after the contact exists. ` +
      "FIXME: payment_method_id, mydata_document_type, document_type and line tax_id " +
      `must be confirmed with the merchant (${OXYGEN_OPENAPI_URL}). ` +
      "If the invoice is paid, either is_paid=true or POST /invoices/{id}/payments — do not do both.",
  });
}
