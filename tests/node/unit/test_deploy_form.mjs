import test from "node:test";
import assert from "node:assert/strict";

import {
  createInitialState,
  validateForm,
  isFormValid,
} from "../../../apps/web/app/lib/deploy_form.js";

test("initial state is invalid and empty", () => {
  const state = createInitialState();
  assert.ok(state.alias);
  assert.equal(state.host, "");
  assert.equal(state.port, "");
  assert.equal(state.user, "");
  assert.equal(state.password, "");
  assert.equal(state.privateKey, "");
  assert.equal(state.publicKey, "");
  assert.equal(state.keyAlgorithm, "ed25519");
  assert.equal(state.keyPassphrase, "");
  assert.equal(isFormValid(state), false);
});

test("password auth requires password and forbids private key", () => {
  const errors = validateForm({
    alias: "server_1",
    host: "example.com",
    user: "root",
    authMethod: "password",
    password: "secret",
    privateKey: "should-not-be-here",
  });
  assert.ok(errors.privateKey);
});

test("private key auth requires key and forbids password", () => {
  const errors = validateForm({
    alias: "server_1",
    host: "example.com",
    user: "root",
    authMethod: "private_key",
    password: "should-not-be-here",
    privateKey: "KEYDATA",
  });
  assert.ok(errors.password);
});

test("valid form passes", () => {
  const errors = validateForm({
    alias: "server_1",
    host: "127.0.0.1",
    user: "dev",
    authMethod: "password",
    password: "secret",
    privateKey: "",
  });
  assert.equal(Object.keys(errors).length, 0);
});
