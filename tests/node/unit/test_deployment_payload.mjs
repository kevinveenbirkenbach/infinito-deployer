import test from "node:test";
import assert from "node:assert/strict";

import { buildDeploymentPayload } from "../../../apps/web/app/lib/deployment_payload.js";

test("builds payload for password auth with selected aliases", () => {
  const result = buildDeploymentPayload({
    activeServer: {
      alias: "server_1",
      host: " example.com ",
      port: "",
      user: "root",
      authMethod: "password",
      password: "secret",
      privateKey: "",
    },
    selectedRolesByAlias: { server_1: ["role-a", "role-b"], server_2: ["role-c"] },
    selectedAliases: ["server_1"],
    selectableAliases: ["server_1", "server_2"],
    workspaceId: "ws1",
    inventoryReady: true,
  });

  assert.deepEqual(result.errors, {});
  assert.equal(result.payload.host, "example.com");
  assert.equal(result.payload.user, "root");
  assert.deepEqual(result.payload.selected_roles, ["role-a", "role-b"]);
  assert.equal(result.payload.auth.method, "password");
  assert.equal(result.payload.auth.password, "secret");
  assert.equal(result.payload.auth.private_key, undefined);
  assert.equal(result.payload.port, undefined);
  assert.equal(result.payload.limit, "server_1");
});

test("uses global role filter when provided", () => {
  const result = buildDeploymentPayload({
    activeServer: {
      alias: "server_1",
      host: "example.com",
      port: "",
      user: "root",
      authMethod: "password",
      password: "secret",
      privateKey: "",
    },
    selectedRolesByAlias: { server_1: ["role-a"], server_2: ["role-b"] },
    selectedAliases: ["server_1", "server_2"],
    selectableAliases: ["server_1", "server_2"],
    roleFilter: ["role-z", "role-a", "role-z"],
    workspaceId: "ws1",
    inventoryReady: true,
  });

  assert.deepEqual(result.errors, {});
  assert.deepEqual(result.payload.selected_roles, ["role-z", "role-a"]);
  assert.equal(result.payload.limit, undefined);
});

test("requires at least one role", () => {
  const result = buildDeploymentPayload({
    activeServer: {
      alias: "server_1",
      host: "example.com",
      port: "",
      user: "root",
      authMethod: "password",
      password: "secret",
      privateKey: "",
    },
    selectedRolesByAlias: { server_1: [] },
    selectedAliases: ["server_1"],
    selectableAliases: ["server_1"],
    workspaceId: "ws1",
    inventoryReady: true,
  });

  assert.ok(result.errors.selectedRoles);
  assert.equal(result.payload, null);
});

test("requires inventory ready", () => {
  const result = buildDeploymentPayload({
    activeServer: {
      alias: "server_1",
      host: "example.com",
      port: "",
      user: "root",
      authMethod: "password",
      password: "secret",
      privateKey: "",
    },
    selectedRolesByAlias: { server_1: ["role-a"] },
    selectedAliases: ["server_1"],
    selectableAliases: ["server_1"],
    workspaceId: "ws1",
    inventoryReady: false,
  });

  assert.ok(result.errors.inventory);
  assert.equal(result.payload, null);
});

test("builds payload for key auth", () => {
  const result = buildDeploymentPayload({
    activeServer: {
      alias: "server_1",
      host: "127.0.0.1",
      port: "2222",
      user: "dev",
      authMethod: "private_key",
      password: "",
      privateKey: "KEYDATA",
    },
    selectedRolesByAlias: { server_1: ["role-a"] },
    selectedAliases: ["server_1"],
    selectableAliases: ["server_1", "server_2"],
    workspaceId: "ws1",
    inventoryReady: true,
  });

  assert.deepEqual(result.errors, {});
  assert.equal(result.payload.auth.method, "private_key");
  assert.equal(result.payload.auth.private_key, "KEYDATA");
  assert.equal(result.payload.auth.password, undefined);
  assert.equal(result.payload.port, 2222);
  assert.equal(result.payload.limit, "server_1");
});

test("includes key passphrase when provided", () => {
  const result = buildDeploymentPayload({
    activeServer: {
      alias: "server_1",
      host: "127.0.0.1",
      port: "",
      user: "dev",
      authMethod: "private_key",
      password: "",
      privateKey: "KEYDATA",
      keyPassphrase: "pass123",
    },
    selectedRolesByAlias: { server_1: ["role-a"] },
    selectedAliases: ["server_1"],
    selectableAliases: ["server_1"],
    workspaceId: "ws1",
    inventoryReady: true,
  });

  assert.equal(result.payload.auth.passphrase, "pass123");
});
