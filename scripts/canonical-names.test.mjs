import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const SANDBOX_BASE = "https://sandbox-api.oxygen.gr/v1";
const LIVE_SHOP = "nth02c-ir.myshopify.com";

const SKIP_DIRS = new Set([
  "node_modules",
  "build",
  ".git",
  ".react-router",
  ".shopify",
]);

function sourceFiles(dir, found = []) {
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    if (SKIP_DIRS.has(entry.name)) continue;
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      sourceFiles(full, found);
      continue;
    }
    if (/\.(ts|tsx|mjs|md|toml|json)$/.test(entry.name) || entry.name === ".env.example") {
      found.push(full);
    }
  }
  return found;
}

test("one Oxygen sandbox API base and one live shop domain", () => {
  const files = sourceFiles(root);
  const sandboxHosts = new Set();
  const shops = new Set();

  for (const file of files) {
    const text = fs.readFileSync(file, "utf8");
    for (const match of text.matchAll(/https?:\/\/[a-z0-9.-]*oxygen\.gr[^)\s`'"]*/gi)) {
      sandboxHosts.add(match[0].replace(/[>.,]+$/g, ""));
    }
    for (const match of text.matchAll(/[a-z0-9-]+\.myshopify\.com/gi)) {
      shops.add(match[0]);
    }
  }

  const unexpectedOxygen = [...sandboxHosts].filter((url) => {
    if (url === "https://oxygen.gr") return false;
    if (url === "https://api.oxygen.gr") return false;
    if (url === "https://api.oxygen.gr/openapi.json") return false;
    if (url === "https://api.oxygen.gr/v1") return false;
    if (url === SANDBOX_BASE || url.startsWith(`${SANDBOX_BASE}/`)) return false;
    return true;
  });

  assert.deepEqual(unexpectedOxygen, []);
  assert.ok(
    sandboxHosts.has(SANDBOX_BASE),
    "canonical sandbox base URL is missing",
  );
  assert.deepEqual([...shops], [LIVE_SHOP]);
});

test("distribution is the single-merchant custom app, without App Store compliance webhooks", () => {
  const server = fs.readFileSync(
    path.join(root, "app", "shopify.server.ts"),
    "utf8",
  );
  assert.match(server, /distribution:\s*AppDistribution\.SingleMerchant/);
  assert.doesNotMatch(server, /AppDistribution\.AppStore/);

  const toml = fs.readFileSync(path.join(root, "shopify.app.toml"), "utf8");
  const active = toml
    .split("\n")
    .filter((line) => !line.trim().startsWith("#"))
    .join("\n");
  assert.doesNotMatch(active, /compliance_topics/);
});
