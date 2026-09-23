import type { ActionFunctionArgs } from "react-router";
import { Prisma } from "@prisma/client";
import db from "../db.server";
import { authenticate } from "../shopify.server";
import {
  syncCustomer,
  syncInventory,
  syncOrder,
  syncProduct,
  type ShopifyCustomerPayload,
  type ShopifyInventoryLevelPayload,
  type ShopifyOrderPayload,
  type ShopifyProductPayload,
  type SyncResult,
} from "./sync.server";

const DONE_STATUSES = new Set(["stub", "synced", "skipped"]);

/**
 * App-specific webhook entry.
 *
 * HMAC: `authenticate.webhook` checks `X-Shopify-Hmac-Sha256` against
 * `SHOPIFY_API_SECRET` (base64 HMAC-SHA256 of the raw body). A bad signature
 * throws a 401 Response before any sync work. Subscriptions created by hand
 * in the Shopify admin are signed with a different secret and will fail —
 * declare them in shopify.app.toml.
 *
 * Idempotency: Shopify retries non-2xx responses for up to 48 hours and may
 * deliver the same `X-Shopify-Webhook-Id` more than once. A stored row with
 * status stub/synced/skipped returns 200 without running the stub again.
 * A failed attempt does not write that id, so the retry can proceed.
 * Invoice idempotency is separate and keyed by the order id in ExternalIdMap
 * (see syncOrder) because orders/create and orders/paid are different webhook ids.
 */
export async function action({ request }: ActionFunctionArgs) {
  const { topic, shop, payload } = await authenticate.webhook(request);
  const webhookId = request.headers.get("X-Shopify-Webhook-Id");

  if (webhookId) {
    const existing = await db.syncEvent.findUnique({ where: { webhookId } });
    if (existing && DONE_STATUSES.has(existing.status)) {
      return new Response(null, { status: 200 });
    }
  }

  let result: SyncResult;
  try {
    result = await dispatch(topic, shop, payload);
  } catch (error) {
    console.error(`Oxygen sync failed for ${topic} on ${shop}`, error);
    return new Response("Sync failed", { status: 500 });
  }

  try {
    await db.syncEvent.create({
      data: {
        shop,
        topic,
        shopifyId: result.shopifyId,
        webhookId,
        status: result.status,
        message: result.message,
      },
    });
  } catch (error) {
    if (
      error instanceof Prisma.PrismaClientKnownRequestError &&
      error.code === "P2002"
    ) {
      return new Response(null, { status: 200 });
    }
    console.error(`Failed to record sync event for ${topic} on ${shop}`, error);
    return new Response("Sync log failed", { status: 500 });
  }

  return new Response(null, { status: 200 });
}

async function dispatch(
  topic: string,
  shop: string,
  payload: unknown,
): Promise<SyncResult> {
  switch (topic) {
    case "CUSTOMERS_CREATE":
    case "CUSTOMERS_UPDATE":
      return syncCustomer({
        shop,
        topic,
        customer: payload as ShopifyCustomerPayload,
      });
    case "PRODUCTS_CREATE":
    case "PRODUCTS_UPDATE":
      return syncProduct({
        shop,
        topic,
        product: payload as ShopifyProductPayload,
      });
    case "INVENTORY_LEVELS_UPDATE":
      return syncInventory({
        shop,
        topic,
        level: payload as ShopifyInventoryLevelPayload,
      });
    case "ORDERS_CREATE":
    case "ORDERS_PAID":
      return syncOrder({
        shop,
        topic,
        order: payload as ShopifyOrderPayload,
      });
    default:
      return {
        status: "skipped",
        entityType: null,
        shopifyId: null,
        oxygenId: null,
        message: `No Oxygen sync for topic ${topic}.`,
      };
  }
}
