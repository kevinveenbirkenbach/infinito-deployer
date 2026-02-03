import test from "node:test";
import assert from "node:assert/strict";

import {
  statusLabel,
  statusColors,
  isTerminalStatus,
} from "../../../apps/web/app/lib/deployment_status.js";

test("statusLabel returns friendly label", () => {
  assert.equal(statusLabel("running"), "Running");
  assert.equal(statusLabel("unknown"), "Unknown");
});

test("statusColors returns defaults", () => {
  const colors = statusColors("running");
  assert.ok(colors.bg);
  const fallback = statusColors("mystery");
  assert.ok(fallback.bg);
});

test("terminal statuses are detected", () => {
  assert.equal(isTerminalStatus("succeeded"), true);
  assert.equal(isTerminalStatus("failed"), true);
  assert.equal(isTerminalStatus("running"), false);
});
