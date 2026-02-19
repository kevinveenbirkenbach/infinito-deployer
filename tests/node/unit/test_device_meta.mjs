import test from "node:test";
import assert from "node:assert/strict";

import {
  buildCredentialsPatchFromHostVarsData,
  createServerPlaceholder,
  normalizePersistedDeviceMeta,
  parseHostVarsServerPatchData,
} from "../../../apps/web/app/lib/device_meta.js";

test("createServerPlaceholder does not assign random color or emoji", () => {
  const placeholder = createServerPlaceholder("smile");
  assert.equal(placeholder.alias, "smile");
  assert.equal(placeholder.color, "");
  assert.equal(placeholder.logoEmoji, "");
  assert.equal(placeholder.requirementServerType, "vps");
  assert.equal(placeholder.requirementStorageGb, "200");
  assert.equal(placeholder.requirementLocation, "Germany");
  assert.equal(placeholder.authMethod, "password");
});

test("normalizePersistedDeviceMeta keeps missing meta empty", () => {
  const [normalized] = normalizePersistedDeviceMeta([
    {
      alias: "device",
      description: "",
      primaryDomain: "",
      host: "",
      port: "22",
      user: "root",
      color: "",
      logoEmoji: "",
      authMethod: "password",
      password: "",
      privateKey: "",
      publicKey: "",
      keyAlgorithm: "ed25519",
      keyPassphrase: "",
    },
  ]);
  assert.equal(normalized.color, "");
  assert.equal(normalized.logoEmoji, "");
});

test("parseHostVarsServerPatchData extracts persisted color and emoji from host_vars", () => {
  const patch = parseHostVarsServerPatchData({
    ansible_host: "192.0.2.11",
    ansible_user: "admin",
    ansible_port: 2222,
    description: "Smile device",
    DOMAIN_PRIMARY: "example.org",
    server_requirements: {
      server_type: "dedicated",
      storage_gb: 750,
      location: "Nuremberg",
    },
    color: "#11aa55",
    logo: { emoji: "💾" },
  });

  assert.equal(patch.host, "192.0.2.11");
  assert.equal(patch.user, "admin");
  assert.equal(patch.port, "2222");
  assert.equal(patch.description, "Smile device");
  assert.equal(patch.primaryDomain, "example.org");
  assert.equal(patch.requirementServerType, "dedicated");
  assert.equal(patch.requirementStorageGb, "750");
  assert.equal(patch.requirementLocation, "Nuremberg");
  assert.equal(patch.color, "#11AA55");
  assert.equal(patch.logoEmoji, "💾");
});

test("buildCredentialsPatchFromHostVarsData does not clear color/emoji when missing", () => {
  const current = {
    host: "192.0.2.10",
    user: "root",
    port: "22",
    description: "",
    primaryDomain: "",
    requirementServerType: "vps",
    requirementStorageGb: "200",
    requirementLocation: "Germany",
    color: "#2255AA",
    logoEmoji: "💻",
  };

  const patch = buildCredentialsPatchFromHostVarsData(
    {
      ansible_host: "192.0.2.10",
      ansible_user: "root",
      ansible_port: 22,
      description: "",
      DOMAIN_PRIMARY: "",
    },
    current
  );

  assert.equal(Object.prototype.hasOwnProperty.call(patch, "color"), false);
  assert.equal(Object.prototype.hasOwnProperty.call(patch, "logoEmoji"), false);
});
