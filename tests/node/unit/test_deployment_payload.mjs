import test from "node:test";
import assert from "node:assert/strict";

import { buildDeploymentPayload } from "../../../apps/web/app/lib/deployment_payload.js";

test("builds payload for password auth", () => {
  const result = buildDeploymentPayload({
    credentials: {
      deployTarget: "server",
      host: " example.com ",
      user: "root",
      authMethod: "password",
      password: "secret",
      privateKey: "",
    },
    selectedRoles: ["role-a", "role-b"],
    inventoryVars: { foo: "bar" },
    inventoryError: null,
  });

  assert.deepEqual(result.errors, {});
  assert.equal(result.payload.deploy_target, "server");
  assert.equal(result.payload.host, "example.com");
  assert.equal(result.payload.user, "root");
  assert.deepEqual(result.payload.selected_roles, ["role-a", "role-b"]);
  assert.equal(result.payload.auth.method, "password");
  assert.equal(result.payload.auth.password, "secret");
  assert.equal(result.payload.auth.private_key, undefined);
});

test("requires at least one role", () => {
  const result = buildDeploymentPayload({
    credentials: {
      deployTarget: "server",
      host: "example.com",
      user: "root",
      authMethod: "password",
      password: "secret",
      privateKey: "",
    },
    selectedRoles: [],
    inventoryVars: {},
    inventoryError: null,
  });

  assert.ok(result.errors.selectedRoles);
  assert.equal(result.payload, null);
});

test("surface inventory errors", () => {
  const result = buildDeploymentPayload({
    credentials: {
      deployTarget: "server",
      host: "example.com",
      user: "root",
      authMethod: "password",
      password: "secret",
      privateKey: "",
    },
    selectedRoles: ["role-a"],
    inventoryVars: null,
    inventoryError: "Invalid JSON.",
  });

  assert.ok(result.errors.inventoryVars);
  assert.equal(result.payload, null);
});

test("builds payload for key auth", () => {
  const result = buildDeploymentPayload({
    credentials: {
      deployTarget: "workstation",
      host: "127.0.0.1",
      user: "dev",
      authMethod: "private_key",
      password: "",
      privateKey: "KEYDATA",
    },
    selectedRoles: ["role-a"],
    inventoryVars: { hello: "world" },
    inventoryError: null,
  });

  assert.deepEqual(result.errors, {});
  assert.equal(result.payload.auth.method, "private_key");
  assert.equal(result.payload.auth.private_key, "KEYDATA");
  assert.equal(result.payload.auth.password, undefined);
});
