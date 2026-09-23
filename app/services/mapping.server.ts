import prisma from "../db.server";

/**
 * ID map: one row per (shop, entityType, shopifyId) → oxygenId.
 *
 * Why a database table, not Shopify metafields:
 * - Sync is read-only on Shopify. Metafields would need write scopes.
 * - Orders, locations and issued invoices are not all natural metafield owners.
 * - Lookups work in both directions (Shopify webhook → Oxygen id, and Oxygen id → Shopify id).
 * - A dev shop and the live shop stay isolated by the `shop` column.
 *
 * entityType values:
 * - customer        Shopify Customer id (or guest key) → Oxygen contact id
 * - variant         Shopify Variant id → Oxygen product id (one product per SKU)
 * - inventory_item  Shopify inventory item id → Oxygen product id
 * - order           Shopify Order id → Oxygen invoice id (idempotency for POST /invoices)
 */

export const EntityType = {
  Customer: "customer",
  Product: "product",
  Variant: "variant",
  InventoryItem: "inventory_item",
  Location: "location",
  Order: "order",
} as const;

export type EntityTypeName = (typeof EntityType)[keyof typeof EntityType];

export async function findOxygenId(
  shop: string,
  entityType: EntityTypeName,
  shopifyId: string,
): Promise<string | null> {
  const row = await prisma.externalIdMap.findUnique({
    where: {
      shop_entityType_shopifyId: { shop, entityType, shopifyId },
    },
  });
  return row?.oxygenId ?? null;
}

export async function upsertMapping(input: {
  shop: string;
  entityType: EntityTypeName;
  shopifyId: string;
  oxygenId: string;
}): Promise<void> {
  await prisma.externalIdMap.upsert({
    where: {
      shop_entityType_shopifyId: {
        shop: input.shop,
        entityType: input.entityType,
        shopifyId: input.shopifyId,
      },
    },
    create: input,
    update: { oxygenId: input.oxygenId },
  });
}
