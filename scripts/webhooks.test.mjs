import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");

test("shopify.app.toml subscriptions match webhook-topics.json and route files", () => {
  const toml = fs.readFileSync(path.join(root, "shopify.app.toml"), "utf8");
  const activeToml = toml
    .split("\n")
    .filter((line) => !line.trim().startsWith("#"))
    .join("\n");

  const topics = [
    ...activeToml.matchAll(/topics\s*=\s*\[\s*"([^"]+)"\s*\]/g),
  ].map((match) => match[1]);
  const uris = [...activeToml.matchAll(/uri\s*=\s*"([^"]+)"/g)].map(
    (match) => match[1],
  );

  const declared = JSON.parse(
    fs.readFileSync(
      path.join(root, "app", "oxygen", "webhook-topics.json"),
      "utf8",
    ),
  );

  assert.deepEqual(
    declared.map((entry) => entry.topic).sort(),
    [...topics].sort(),
  );
  assert.deepEqual(
    declared.map((entry) => entry.uri).sort(),
    [...uris].sort(),
  );

  for (const entry of declared) {
    const routeFile = path.join(
      root,
      "app",
      "routes",
      `${entry.uri.split("/").filter(Boolean).join(".")}.tsx`,
    );
    assert.equal(fs.existsSync(routeFile), true, `missing ${routeFile}`);
  }
});

test("scopes stay read-only", () => {
  const toml = fs.readFileSync(path.join(root, "shopify.app.toml"), "utf8");
  const activeToml = toml
    .split("\n")
    .filter((line) => !line.trim().startsWith("#"))
    .join("\n");
  const scopesLine = activeToml
    .split("\n")
    .find((line) => line.trim().startsWith("scopes"));
  assert.ok(scopesLine);
  assert.doesNotMatch(scopesLine, /write_/);
  for (const scope of [
    "read_products",
    "read_inventory",
    "read_orders",
    "read_customers",
    "read_locations",
  ]) {
    assert.match(scopesLine, new RegExp(scope));
  }
});
