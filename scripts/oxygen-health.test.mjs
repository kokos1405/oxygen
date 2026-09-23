import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import test from "node:test";
import { fileURLToPath } from "node:url";
import path from "node:path";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const script = path.join(root, "scripts", "oxygen-health.mjs");

function run(env) {
  return spawnSync(process.execPath, [script], {
    cwd: root,
    env: { ...process.env, ...env },
    encoding: "utf8",
  });
}

test("skips when OXYGEN_API_KEY is missing", () => {
  const result = run({ OXYGEN_API_KEY: "" });
  assert.equal(result.status, 0);
  assert.match(result.stdout, /skipping Oxygen health check/);
});

test("refuses the production Oxygen host without calling it", () => {
  const result = run({
    OXYGEN_API_KEY: "test-key-not-used",
    OXYGEN_API_BASE_URL: "https://api.oxygen.gr/v1",
  });
  assert.equal(result.status, 1);
  assert.match(result.stderr, /production Oxygen/);
});

test("refuses a non-https base URL", () => {
  const result = run({
    OXYGEN_API_KEY: "test-key-not-used",
    OXYGEN_API_BASE_URL: "http://127.0.0.1/v1",
  });
  assert.equal(result.status, 1);
  assert.match(result.stderr, /https/);
});
