import test from "node:test";
import assert from "node:assert/strict";

import { filterRoles } from "../apps/web/app/lib/role_filter.js";

const roles = [
  {
    id: "redis",
    display_name: "Redis",
    status: "stable",
    description: "In-memory store",
    deployment_targets: ["server"],
  },
  {
    id: "vim",
    display_name: "Vim",
    status: "beta",
    description: "Editor",
    deployment_targets: ["workstation", "universal"],
  },
  {
    id: "nginx",
    display_name: "Nginx",
    status: "stable",
    description: "Web server",
    deployment_targets: ["server"],
  },
];

test("filters by status and target", () => {
  const filtered = filterRoles(roles, {
    statuses: ["stable"],
    target: "server",
  });
  assert.equal(filtered.length, 2);
  assert.ok(filtered.every((role) => role.status === "stable"));
});

test("filters by search query", () => {
  const filtered = filterRoles(roles, { query: "editor" });
  assert.equal(filtered.length, 1);
  assert.equal(filtered[0].id, "vim");
});
