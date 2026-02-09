export const AUTH_METHODS = ["password", "private_key"];
export const DEPLOY_TARGETS = ["server", "workstation"];

export function createInitialState() {
  return {
    deployTarget: "server",
    alias: "main",
    host: "",
    user: "",
    authMethod: "password",
    password: "",
    privateKey: "",
  };
}

export function validateForm(state) {
  const errors = {};
  const deployTarget = state?.deployTarget ?? "";
  const alias = String(state?.alias ?? "").trim();
  const host = String(state?.host ?? "").trim();
  const user = String(state?.user ?? "").trim();
  const authMethod = state?.authMethod ?? "";
  const password = String(state?.password ?? "");
  const privateKey = String(state?.privateKey ?? "");

  if (!DEPLOY_TARGETS.includes(deployTarget)) {
    errors.deployTarget = "Choose a valid deployment target.";
  }
  if (!alias) {
    errors.alias = "Alias is required.";
  }
  if (!host) {
    errors.host = "Host is required.";
  }
  if (!user) {
    errors.user = "User is required.";
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
