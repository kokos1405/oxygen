import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import test from "node:test";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");

test("sandbox policy keeps /v1 and blocks production", () => {
  const result = spawnSync(
    process.execPath,
    [
      "--experimental-strip-types",
      "--input-type=module",
      "--eval",
      `
        import { assertSandboxBaseUrl, joinOxygenUrl, OXYGEN_SANDBOX_BASE_URL } from "./app/oxygen/sandbox-policy.ts";
        if (joinOxygenUrl(OXYGEN_SANDBOX_BASE_URL, "/contacts") !== "https://sandbox-api.oxygen.gr/v1/contacts") {
          throw new Error("join dropped /v1");
        }
        if (joinOxygenUrl(OXYGEN_SANDBOX_BASE_URL, "/") !== "https://sandbox-api.oxygen.gr/v1/") {
          throw new Error("bad health url");
        }
        let threw = false;
        try { assertSandboxBaseUrl("https://api.oxygen.gr/v1"); } catch { threw = true; }
        if (!threw) throw new Error("production allowed");
        assertSandboxBaseUrl(OXYGEN_SANDBOX_BASE_URL);
      `,
    ],
    { cwd: root, encoding: "utf8" },
  );

  assert.equal(result.status, 0, result.stderr);
});
