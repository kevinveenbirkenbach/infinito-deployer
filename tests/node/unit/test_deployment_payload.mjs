import test from "node:test";
import assert from "node:assert/strict";

import { buildDeploymentPayload } from "../../../apps/web/app/lib/deployment_payload.js";

test("builds payload for password auth", () => {
  const result = buildDeploymentPayload({
    deployTarget: "server",
    deployScope: "active",
    activeServer: {
      alias: "server-1",
      host: " example.com ",
      user: "root",
      authMethod: "password",
      password: "secret",
      privateKey: "",
    },
    selectedRolesByAlias: { "server-1": ["role-a", "role-b"] },
    activeAlias: "server-1",
    workspaceId: "ws1",
    inventoryReady: true,
  });

  assert.deepEqual(result.errors, {});
  assert.equal(result.payload.deploy_target, "server");
  assert.equal(result.payload.host, "example.com");
  assert.equal(result.payload.user, "root");
  assert.deepEqual(result.payload.selected_roles, ["role-a", "role-b"]);
  assert.equal(result.payload.auth.method, "password");
  assert.equal(result.payload.auth.password, "secret");
  assert.equal(result.payload.auth.private_key, undefined);
  assert.equal(result.payload.limit, "server-1");
});

test("requires at least one role", () => {
  const result = buildDeploymentPayload({
    deployTarget: "server",
    deployScope: "active",
    activeServer: {
      alias: "server-1",
      host: "example.com",
      user: "root",
      authMethod: "password",
      password: "secret",
      privateKey: "",
    },
    selectedRolesByAlias: { "server-1": [] },
    activeAlias: "server-1",
    workspaceId: "ws1",
    inventoryReady: true,
  });

  assert.ok(result.errors.selectedRoles);
  assert.equal(result.payload, null);
});

test("requires inventory ready", () => {
  const result = buildDeploymentPayload({
    deployTarget: "server",
    deployScope: "active",
    activeServer: {
      alias: "server-1",
      host: "example.com",
      user: "root",
      authMethod: "password",
      password: "secret",
      privateKey: "",
    },
    selectedRolesByAlias: { "server-1": ["role-a"] },
    activeAlias: "server-1",
    workspaceId: "ws1",
    inventoryReady: false,
  });

  assert.ok(result.errors.inventory);
  assert.equal(result.payload, null);
});

test("builds payload for key auth", () => {
  const result = buildDeploymentPayload({
    deployTarget: "workstation",
    deployScope: "active",
    activeServer: {
      alias: "server-1",
      host: "127.0.0.1",
      user: "dev",
      authMethod: "private_key",
      password: "",
      privateKey: "KEYDATA",
    },
    selectedRolesByAlias: { "server-1": ["role-a"] },
    activeAlias: "server-1",
    workspaceId: "ws1",
    inventoryReady: true,
  });

  assert.deepEqual(result.errors, {});
  assert.equal(result.payload.auth.method, "private_key");
  assert.equal(result.payload.auth.private_key, "KEYDATA");
  assert.equal(result.payload.auth.password, undefined);
});
