import {
  createOxygenClient,
  type OxygenClient,
} from "../oxygen/client.server";
import { resolvePaymentMethodId } from "../oxygen/payment-methods.server";
import {
  buildInvoiceLine,
  buildPrivateContact,
  buildRetailReceipt,
  CATALOG_PRICES_INCLUDE_VAT,
  contactCode,
  issueDateFromShopify,
  normalizeSku,
  productDisplayName,
  readWarehouseId,
  SALE_TAX_ID,
  shopifyGateway,
  shopifyPriceToNet,
  shouldWriteInventory,
} from "../oxygen/sync-rules";
import { EntityType, findOxygenId, upsertMapping } from "./mapping.server";

/**
 * Shopify → Oxygen sandbox sync.
 * Paid orders become retail receipts: document_type `rp`, myDATA `11.1`.
 * One Oxygen product per variant SKU. Stock writes need OXYGEN_DEFAULT_WAREHOUSE_ID.
 * New products are created with warehouses: [{ id, quantity: 0 }] and throw if that id is missing.
 */

export type SyncStatus = "stub" | "synced" | "skipped";

export interface SyncResult {
  status: SyncStatus;
  entityType: string | null;
  shopifyId: string | null;
  oxygenId: string | null;
  message: string;
}

export interface ShopifyAddress {
  first_name?: string | null;
  last_name?: string | null;
  phone?: string | null;
  country_code?: string | null;
  address1?: string | null;
  city?: string | null;
  zip?: string | null;
  company?: string | null;
}

export interface ShopifyCustomerPayload {
  id?: number | string;
  email?: string | null;
  first_name?: string | null;
  last_name?: string | null;
  phone?: string | null;
  default_address?: ShopifyAddress | null;
}

export interface ShopifyVariantPayload {
  id?: number | string;
  sku?: string | null;
  barcode?: string | null;
  price?: string | null;
  title?: string | null;
  inventory_item_id?: number | string | null;
}

export interface ShopifyProductPayload {
  id?: number | string;
  title?: string | null;
  status?: string | null;
  variants?: ShopifyVariantPayload[];
}

/** REST `inventory_levels/update` body. There is no product id. */
export interface ShopifyInventoryLevelPayload {
  inventory_item_id?: number | string;
  location_id?: number | string;
  available?: number | null;
  updated_at?: string;
}

export interface ShopifyLineItemPayload {
  id?: number | string;
  product_id?: number | string | null;
  variant_id?: number | string | null;
  sku?: string | null;
  title?: string | null;
  name?: string | null;
  quantity?: number;
  price?: string | null;
}

export interface ShopifyOrderPayload {
  id?: number | string;
  name?: string | null;
  email?: string | null;
  phone?: string | null;
  financial_status?: string | null;
  currency?: string | null;
  taxes_included?: boolean;
  gateway?: string | null;
  payment_gateway_names?: string[] | null;
  processed_at?: string | null;
  created_at?: string | null;
  customer?: ShopifyCustomerPayload | null;
  billing_address?: ShopifyAddress | null;
  shipping_address?: ShopifyAddress | null;
  line_items?: ShopifyLineItemPayload[];
}

function asId(value: number | string | null | undefined): string | null {
  if (value === undefined || value === null || value === "") return null;
  return String(value);
}

function result(input: {
  status: SyncStatus;
  entityType: string | null;
  shopifyId: string | null;
  oxygenId: string | null;
  message: string;
}): SyncResult {
  return input;
}

export async function syncCustomer(input: {
  shop: string;
  topic: string;
  customer: ShopifyCustomerPayload;
}): Promise<SyncResult> {
  const shopifyId = asId(input.customer.id);
  if (!shopifyId) {
    return result({
      status: "skipped",
      entityType: EntityType.Customer,
      shopifyId: null,
      oxygenId: null,
      message: "Customer webhook payload has no id.",
    });
  }

  const address = input.customer.default_address;
  const draft = buildPrivateContact({
    shopifyId,
    email: input.customer.email,
    firstName: input.customer.first_name || address?.first_name,
    lastName: input.customer.last_name || address?.last_name,
    phone: input.customer.phone || address?.phone,
    countryCode: address?.country_code,
    address1: address?.address1,
    city: address?.city,
    zip: address?.zip,
    company: address?.company,
  });
  const client = createOxygenClient();
  const oxygenId = await upsertContact(client, input.shop, shopifyId, draft);
  return result({
    status: "synced",
    entityType: EntityType.Customer,
    shopifyId,
    oxygenId,
    message: `Customer ${shopifyId} → Oxygen contact ${oxygenId}.`,
  });
}

export async function syncProduct(input: {
  shop: string;
  topic: string;
  product: ShopifyProductPayload;
}): Promise<SyncResult> {
  const shopifyId = asId(input.product.id);
  if (!shopifyId) {
    return result({
      status: "skipped",
      entityType: EntityType.Product,
      shopifyId: null,
      oxygenId: null,
      message: "Product webhook payload has no id.",
    });
  }

  const variants = input.product.variants ?? [];
  if (variants.length === 0) {
    return result({
      status: "skipped",
      entityType: EntityType.Product,
      shopifyId,
      oxygenId: null,
      message: `Product ${shopifyId} has no variants.`,
    });
  }

  const client = createOxygenClient();
  const notes: string[] = [];
  let lastOxygenId: string | null = null;
  let synced = 0;

  for (const variant of variants) {
    const sku = normalizeSku(variant.sku);
    const variantId = asId(variant.id);
    if (!sku) {
      const label = variantId ?? "unknown";
      console.error(
        `[oxygen-sync] Skipping variant ${label} on product ${shopifyId}: SKU is required and was not invented.`,
      );
      notes.push(`variant ${label}: missing SKU`);
      continue;
    }
    if (!variantId) {
      throw new Error(
        `Product ${shopifyId} variant with SKU ${sku} has no id.`,
      );
    }

    const oxygenId = await upsertVariant(client, input.shop, {
      variantId,
      sku,
      price: variant.price,
      title: productDisplayName(input.product.title, variant.title),
      barcode: variant.barcode,
      active: input.product.status == null || input.product.status === "active",
      inventoryItemId: asId(variant.inventory_item_id),
    });
    lastOxygenId = oxygenId;
    synced += 1;
    notes.push(`variant ${variantId} SKU ${sku} → ${oxygenId}`);
  }

  if (synced === 0) {
    return result({
      status: "skipped",
      entityType: EntityType.Product,
      shopifyId,
      oxygenId: null,
      message: `Product ${shopifyId}: no variant had a SKU. ${notes.join("; ")}`,
    });
  }

  return result({
    status: "synced",
    entityType: EntityType.Variant,
    shopifyId,
    oxygenId: lastOxygenId,
    message: `Product ${shopifyId}: ${notes.join("; ")}`,
  });
}

export async function syncInventory(input: {
  shop: string;
  topic: string;
  level: ShopifyInventoryLevelPayload;
}): Promise<SyncResult> {
  const inventoryItemId = asId(input.level.inventory_item_id);
  const locationId = asId(input.level.location_id);
  const warehouseId = readWarehouseId();

  if (!warehouseId || !shouldWriteInventory(warehouseId)) {
    const message =
      "OXYGEN_DEFAULT_WAREHOUSE_ID is empty. Inventory stock was not written. Customers and orders still sync. Creating a new product requires the warehouse id.";
    console.warn(`[oxygen-sync] ${message}`);
    return result({
      status: "skipped",
      entityType: EntityType.InventoryItem,
      shopifyId: inventoryItemId,
      oxygenId: null,
      message,
    });
  }

  if (!inventoryItemId) {
    throw new Error("inventory_levels/update payload has no inventory_item_id.");
  }
  if (input.level.available == null) {
    return result({
      status: "skipped",
      entityType: EntityType.InventoryItem,
      shopifyId: inventoryItemId,
      oxygenId: null,
      message: `inventory_item ${inventoryItemId} has no available quantity. Stock was not written.`,
    });
  }

  const oxygenId = await findOxygenId(
    input.shop,
    EntityType.InventoryItem,
    inventoryItemId,
  );
  if (!oxygenId) {
    throw new Error(
      `No Oxygen product mapped for inventory_item ${inventoryItemId}. Sync the product (variant SKU) first.`,
    );
  }

  const client = createOxygenClient();
  await client.updateProduct(oxygenId, {
    warehouses: [{ id: warehouseId, quantity: input.level.available }],
  });

  return result({
    status: "synced",
    entityType: EntityType.InventoryItem,
    shopifyId: inventoryItemId,
    oxygenId,
    message:
      `inventory_item ${inventoryItemId} location ${locationId ?? "?"} available ${input.level.available} ` +
      `→ Oxygen product ${oxygenId} warehouse ${warehouseId}. All Shopify locations share this warehouse.`,
  });
}

export async function syncOrder(input: {
  shop: string;
  topic: string;
  order: ShopifyOrderPayload;
}): Promise<SyncResult> {
  const shopifyId = asId(input.order.id);
  if (!shopifyId) {
    return result({
      status: "skipped",
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
  const client = createOxygenClient();
  const contactId = await ensureOrderContact(client, input.shop, input.order);

  if (existingInvoiceId) {
    return result({
      status: "skipped",
      entityType: EntityType.Order,
      shopifyId,
      oxygenId: existingInvoiceId,
      message: `Order ${shopifyId} already mapped to Oxygen document ${existingInvoiceId}. Not posting /invoices again.`,
    });
  }

  if (input.topic === "ORDERS_CREATE") {
    return result({
      status: "synced",
      entityType: EntityType.Order,
      shopifyId,
      oxygenId: null,
      message: `orders/create ensured Oxygen contact ${contactId} for order ${shopifyId}. No document issued until orders/paid.`,
    });
  }

  const gateway = shopifyGateway(input.order);
  const payment = await resolvePaymentMethodId(client, gateway);
  const taxesIncluded = input.order.taxes_included ?? CATALOG_PRICES_INCLUDE_VAT;
  const warehouseId = readWarehouseId();
  const lines = [];

  for (const item of input.order.line_items ?? []) {
    const quantity = item.quantity ?? 0;
    if (quantity <= 0) continue;
    const variantId = asId(item.variant_id);
    const oxygenProductId = variantId
      ? await findOxygenId(input.shop, EntityType.Variant, variantId)
      : null;
    lines.push(
      buildInvoiceLine({
        oxygenProductId,
        title: item.title || item.name || item.sku,
        quantity,
        unitPrice: item.price,
        taxesIncluded,
        warehouseId,
      }),
    );
  }

  if (lines.length === 0) {
    throw new Error(`Order ${shopifyId} has no billable line items.`);
  }

  const receipt = buildRetailReceipt({
    issueDate: issueDateFromShopify(
      input.order.processed_at || input.order.created_at,
    ),
    contactId,
    paymentMethodId: payment.id,
    orderName: input.order.name,
    shopifyOrderId: shopifyId,
    lines,
  });
  const invoice = await client.createInvoice(receipt);
  if (!invoice.id) {
    throw new Error(`Oxygen did not return an id for order ${shopifyId}.`);
  }

  await upsertMapping({
    shop: input.shop,
    entityType: EntityType.Order,
    shopifyId,
    oxygenId: invoice.id,
  });

  return result({
    status: "synced",
    entityType: EntityType.Order,
    shopifyId,
    oxygenId: invoice.id,
    message:
      `Order ${shopifyId} → Oxygen receipt ${invoice.id} ` +
      `(rp / myDATA 11.1, payment ${payment.bucket} via ${payment.source}, contact ${contactId}).`,
  });
}

async function ensureOrderContact(
  client: OxygenClient,
  shop: string,
  order: ShopifyOrderPayload,
): Promise<string> {
  const customer = order.customer;
  const address =
    customer?.default_address ||
    order.billing_address ||
    order.shipping_address ||
    null;
  const shopifyId =
    asId(customer?.id) ||
    (order.email?.trim()
      ? `guest:${order.email.trim().toLowerCase()}`
      : `guest:order:${asId(order.id) ?? "unknown"}`);
  const draft = buildPrivateContact({
    shopifyId,
    email: customer?.email || order.email,
    firstName: customer?.first_name || address?.first_name,
    lastName: customer?.last_name || address?.last_name,
    phone: customer?.phone || address?.phone || order.phone,
    countryCode: address?.country_code,
    address1: address?.address1,
    city: address?.city,
    zip: address?.zip,
    company: address?.company,
  });
  return upsertContact(client, shop, shopifyId, draft);
}

async function upsertContact(
  client: OxygenClient,
  shop: string,
  shopifyId: string,
  draft: ReturnType<typeof buildPrivateContact>,
): Promise<string> {
  for (const warning of draft.warnings) {
    console.warn(`[oxygen-sync] ${warning}`);
  }

  let oxygenId = await findOxygenId(shop, EntityType.Customer, shopifyId);
  const code = draft.body.code ?? contactCode(shopifyId);

  if (!oxygenId) {
    const byCode = await client.listContacts({ code });
    oxygenId = byCode.data?.find((contact) => contact.code === code)?.id ?? null;
  }
  if (!oxygenId && draft.body.email) {
    const email = draft.body.email.toLowerCase();
    const byEmail = await client.listContacts({ email: draft.body.email });
    oxygenId =
      byEmail.data?.find((contact) => contact.email?.toLowerCase() === email)
        ?.id ?? null;
  }

  if (oxygenId) {
    const updated = await client.updateContact(oxygenId, draft.body);
    const id = updated.id || oxygenId;
    await upsertMapping({
      shop,
      entityType: EntityType.Customer,
      shopifyId,
      oxygenId: id,
    });
    return id;
  }

  const created = await client.createContact(draft.body);
  if (!created.id) {
    throw new Error(`Oxygen contact create returned no id for ${shopifyId}.`);
  }
  await upsertMapping({
    shop,
    entityType: EntityType.Customer,
    shopifyId,
    oxygenId: created.id,
  });
  return created.id;
}

async function upsertVariant(
  client: OxygenClient,
  shop: string,
  variant: {
    variantId: string;
    sku: string;
    price: string | null | undefined;
    title: string;
    barcode?: string | null;
    active: boolean;
    inventoryItemId: string | null;
  },
): Promise<string> {
  const fields = {
    name: variant.title,
    code: variant.sku,
    type: 1 as const,
    sale_net_amount: shopifyPriceToNet(variant.price, CATALOG_PRICES_INCLUDE_VAT),
    sale_tax_id: SALE_TAX_ID,
    status: variant.active,
    ...(variant.barcode?.trim() ? { barcode: variant.barcode.trim() } : {}),
  };

  let oxygenId = await findOxygenId(shop, EntityType.Variant, variant.variantId);
  if (!oxygenId) {
    const listed = await client.listProducts({ code: variant.sku });
    oxygenId = listed.data?.find((product) => product.code === variant.sku)?.id ?? null;
  }

  if (oxygenId) {
    const updated = await client.updateProduct(oxygenId, fields);
    oxygenId = updated.id || oxygenId;
  } else {
    const warehouseId = readWarehouseId();
    if (!warehouseId) {
      throw new Error(
        "OXYGEN_DEFAULT_WAREHOUSE_ID is empty. Oxygen rejects product create with warehouses: []. Set it so create sends warehouses: [{ id, quantity: 0 }].",
      );
    }
    const created = await client.createProduct({
      ...fields,
      warehouses: [{ id: warehouseId, quantity: 0 }],
    });
    if (!created.id) {
      throw new Error(`Oxygen product create returned no id for SKU ${variant.sku}.`);
    }
    oxygenId = created.id;
  }

  await upsertMapping({
    shop,
    entityType: EntityType.Variant,
    shopifyId: variant.variantId,
    oxygenId,
  });
  if (variant.inventoryItemId) {
    await upsertMapping({
      shop,
      entityType: EntityType.InventoryItem,
      shopifyId: variant.inventoryItemId,
      oxygenId,
    });
  }
  return oxygenId;
}
