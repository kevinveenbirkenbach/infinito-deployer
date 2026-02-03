import test from "node:test";
import assert from "node:assert/strict";

import {
  parseJsonObject,
  kvToObject,
  buildInventoryVars,
} from "../../../apps/web/app/lib/inventory_vars.js";

test("parseJsonObject detects invalid JSON", () => {
  const result = parseJsonObject("{");
  assert.equal(result.error, "Invalid JSON.");
});

test("parseJsonObject rejects non-object", () => {
  const result = parseJsonObject('["a"]');
  assert.equal(result.error, "JSON must be an object.");
});

test("kvToObject merges pairs", () => {
  const out = kvToObject([
    { key: "region", value: "eu" },
    { key: "debug", value: "true" },
  ]);
  assert.equal(out.region, "eu");
  assert.equal(out.debug, "true");
});

test("buildInventoryVars merges JSON and kv overrides", () => {
  const result = buildInventoryVars(
    '{"region":"us","feature":"on"}',
    [{ key: "region", value: "eu" }]
  );
  assert.equal(result.error, null);
  assert.equal(result.value.region, "eu");
  assert.equal(result.value.feature, "on");
});
