import type { OxygenClient } from "./client.server";
import type { OxygenPaymentMethod } from "./types";
import {
  classifyShopifyGateway,
  matchPaymentMethod,
  paymentMethodOverride,
  type PaymentBucket,
} from "./sync-rules";

const CACHE_TTL_MS = 10 * 60 * 1000;

interface CacheEntry {
  fetchedAt: number;
  methods: OxygenPaymentMethod[];
}

let cache: CacheEntry | null = null;

export function clearPaymentMethodCache(): void {
  cache = null;
}

export interface ResolvedPaymentMethod {
  id: string;
  bucket: PaymentBucket;
  source: string;
  usedDefault: boolean;
}

/**
 * Resolve a Shopify gateway to an Oxygen payment method id.
 * Env overrides win. Otherwise GET /payment-methods (cached) and match titles.
 */
export async function resolvePaymentMethodId(
  client: OxygenClient,
  gateway: string | null,
  env: NodeJS.ProcessEnv = process.env,
): Promise<ResolvedPaymentMethod> {
  const bucket = classifyShopifyGateway(gateway);
  const override = paymentMethodOverride(bucket, env);
  if (override) {
    return { id: override, bucket, source: "env", usedDefault: false };
  }

  const methods = await listPaymentMethodsCached(client);
  const match = matchPaymentMethod(methods, bucket);
  if (!match) {
    throw new Error(
      `No Oxygen payment method for Shopify gateway "${gateway ?? ""}" (bucket ${bucket}). Create one in Oxygen or set ${envKey(bucket)}.`,
    );
  }

  const defaultOverride =
    match.usedDefault ? paymentMethodOverride("default", env) : null;
  if (defaultOverride) {
    console.warn(
      `[oxygen-sync] Shopify gateway "${gateway ?? ""}" mapped to default payment method via OXYGEN_PAYMENT_METHOD_DEFAULT.`,
    );
    return {
      id: defaultOverride,
      bucket,
      source: "env-default",
      usedDefault: true,
    };
  }

  if (match.usedDefault) {
    console.warn(
      `[oxygen-sync] Shopify gateway "${gateway ?? ""}" has no exact payment-method title. Using "${match.title}" (${match.id}).`,
    );
  }

  return {
    id: match.id,
    bucket,
    source: match.title,
    usedDefault: match.usedDefault,
  };
}

async function listPaymentMethodsCached(
  client: OxygenClient,
): Promise<OxygenPaymentMethod[]> {
  if (cache && Date.now() - cache.fetchedAt < CACHE_TTL_MS) {
    return cache.methods;
  }
  const response = await client.listPaymentMethods();
  const methods = response.data ?? [];
  cache = { fetchedAt: Date.now(), methods };
  return methods;
}

function envKey(bucket: PaymentBucket): string {
  switch (bucket) {
    case "cash":
      return "OXYGEN_PAYMENT_METHOD_CASH";
    case "card":
      return "OXYGEN_PAYMENT_METHOD_CARD";
    case "paypal":
      return "OXYGEN_PAYMENT_METHOD_PAYPAL";
    default:
      return "OXYGEN_PAYMENT_METHOD_DEFAULT";
  }
}
