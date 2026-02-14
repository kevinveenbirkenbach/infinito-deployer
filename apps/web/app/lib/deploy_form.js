export const AUTH_METHODS = ["password", "private_key"];
const ALIAS_PATTERN = /^[a-z0-9_-]+$/;

export function createInitialState() {
  return {
    alias: "device",
    description: "",
    primaryDomain: "",
    host: "",
    port: "22",
    user: "root",
    color: "#89CFF0",
    logoEmoji: "💻",
    authMethod: "password",
    password: "",
    privateKey: "",
    publicKey: "",
    keyAlgorithm: "ed25519",
    keyPassphrase: "",
  };
}

export function validateForm(state) {
  const errors = {};
  const alias = String(state?.alias ?? "").trim();
  const host = String(state?.host ?? "").trim();
  const portRaw = String(state?.port ?? "").trim();
  const user = String(state?.user ?? "").trim();
  const authMethod = state?.authMethod ?? "";
  const password = String(state?.password ?? "");
  const privateKey = String(state?.privateKey ?? "");

  if (!alias) {
    errors.alias = "Alias is required.";
  } else if (!ALIAS_PATTERN.test(alias)) {
    errors.alias = "Alias allows only a-z, 0-9, _ and -.";
  }
  if (!host) {
    errors.host = "Host is required.";
  }
  if (!user) {
    errors.user = "User is required.";
  }
  if (!portRaw) {
    errors.port = "Port is required.";
  } else {
    const portNum = Number(portRaw);
    if (!Number.isInteger(portNum) || portNum < 1 || portNum > 65535) {
      errors.port = "Port must be an integer between 1 and 65535.";
    }
  }

  if (!AUTH_METHODS.includes(authMethod)) {
    errors.authMethod = "Choose a valid auth method.";
  } else if (authMethod === "password") {
    if (!password) {
      errors.password = "Password is required.";
    }
    if (privateKey) {
      errors.privateKey = "Private key must be empty for password auth.";
    }
  } else if (authMethod === "private_key") {
    if (!privateKey) {
      errors.privateKey = "Private key is required.";
    }
    if (password) {
      errors.password = "Password must be empty for key auth.";
    }
  }

  return errors;
}

export function isFormValid(state) {
  return Object.keys(validateForm(state)).length === 0;
}
