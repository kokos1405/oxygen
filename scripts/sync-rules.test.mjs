import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import test from "node:test";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");

test("merchant sync rules: tax, gateways, warehouse gate, receipt", () => {
  const result = spawnSync(
    process.execPath,
    [
      "--experimental-strip-types",
      "--input-type=module",
      "--eval",
      `
        import {
          SALE_TAX_ID,
          RETAIL_DOCUMENT_TYPE,
          RETAIL_MYDATA_DOCUMENT_TYPE,
          classifyShopifyGateway,
          matchPaymentMethod,
          readWarehouseId,
          shouldWriteInventory,
          shopifyPriceToNet,
          normalizeSku,
          buildRetailReceipt,
          buildInvoiceLine,
          issueDateFromShopify,
        } from "./app/oxygen/sync-rules.ts";

        if (SALE_TAX_ID !== "2238364a-8b60-4dc6-899c-1d8c63d5ea58") {
          throw new Error("unexpected tax id");
        }
        const cases = [
          ["cash", "cash"],
          ["manual", "cash"],
          ["Cash on Delivery", "cash"],
          ["shopify_payments", "card"],
          ["stripe", "card"],
          ["credit_card", "card"],
          ["paypal", "paypal"],
          ["PayPal Express", "paypal"],
          ["bogus", "default"],
          ["", "default"],
          ["unknown", "default"],
          ["some_new_gateway", "default"],
        ];
        for (const [gateway, bucket] of cases) {
          const got = classifyShopifyGateway(gateway);
          if (got !== bucket) throw new Error(gateway + " -> " + got + ", expected " + bucket);
        }

        const methods = [
          { id: "cash-id", title_gr: "Μετρητά", title_en: "Cash", status: true },
          { id: "pos-id", title_gr: "e-POS", title_en: "POS", status: true },
          { id: "paypal-id", title_gr: "PayPal", title_en: "PayPal", status: true },
        ];
        const cash = matchPaymentMethod(methods, "cash");
        const card = matchPaymentMethod(methods, "card");
        const paypal = matchPaymentMethod(methods, "paypal");
        const fallback = matchPaymentMethod(methods, "default");
        if (cash.id !== "cash-id" || cash.usedDefault) throw new Error("cash match");
        if (card.id !== "pos-id" || card.usedDefault) throw new Error("card match");
        if (paypal.id !== "paypal-id" || paypal.usedDefault) throw new Error("paypal match");
        if (fallback.id !== "cash-id" || !fallback.usedDefault) throw new Error("default match");

        if (readWarehouseId({ OXYGEN_DEFAULT_WAREHOUSE_ID: "" }) !== null) {
          throw new Error("empty warehouse should be null");
        }
        if (readWarehouseId({ OXYGEN_DEFAULT_WAREHOUSE_ID: "  wh-1  " }) !== "wh-1") {
          throw new Error("warehouse trim");
        }
        if (shouldWriteInventory(null) || shouldWriteInventory("")) {
          throw new Error("inventory must be skipped without a warehouse id");
        }
        if (!shouldWriteInventory("wh-1")) throw new Error("inventory should write");

        if (shopifyPriceToNet("12.40", true) !== 10) throw new Error("gross to net");
        if (shopifyPriceToNet("10.00", false) !== 10) throw new Error("net stays net");
        if (normalizeSku("  ") !== null) throw new Error("blank sku");
        if (normalizeSku(" SKU-1 ") !== "SKU-1") throw new Error("sku trim");

        const line = buildInvoiceLine({
          oxygenProductId: null,
          title: "Item",
          quantity: 2,
          unitPrice: "12.40",
          taxesIncluded: true,
          warehouseId: null,
        });
        if (line.tax_id !== SALE_TAX_ID || line.unit_net_value !== 10) {
          throw new Error("inline line tax/net");
        }
        const mapped = buildInvoiceLine({
          oxygenProductId: "oxy-prod",
          title: "Item",
          quantity: 1,
          unitPrice: "12.40",
          taxesIncluded: true,
          warehouseId: "wh-1",
        });
        if (mapped.code !== "oxy-prod" || mapped.tax_id !== SALE_TAX_ID || mapped.warehouse_id !== "wh-1") {
          throw new Error("mapped line");
        }

        const receipt = buildRetailReceipt({
          issueDate: "2026-09-23",
          contactId: "contact-1",
          paymentMethodId: "pos-id",
          orderName: "#1001",
          shopifyOrderId: "99",
          lines: [mapped],
        });
        if (receipt.document_type !== RETAIL_DOCUMENT_TYPE) throw new Error("document type");
        if (receipt.mydata_document_type !== RETAIL_MYDATA_DOCUMENT_TYPE) throw new Error("mydata");
        if (receipt.document_type !== "rp" || receipt.mydata_document_type !== "11.1") {
          throw new Error("locked receipt codes");
        }
        if (receipt.is_paid !== true) throw new Error("is_paid");
        if (issueDateFromShopify("2026-01-15T23:30:00Z") !== "2026-01-16") {
          throw new Error("athens date " + issueDateFromShopify("2026-01-15T23:30:00Z"));
        }
      `,
    ],
    { cwd: root, encoding: "utf8" },
  );

  assert.equal(result.status, 0, `${result.stderr}\n${result.stdout}`);
});
