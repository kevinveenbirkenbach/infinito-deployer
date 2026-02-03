import { validateForm } from "./deploy_form.js";

/**
 * @param {object} args
 * @param {object} args.credentials
 * @param {string[]} args.selectedRoles
 * @param {Record<string, any> | null} args.inventoryVars
 * @param {string | null} args.inventoryError
 */
export function buildDeploymentPayload({
  credentials,
  selectedRoles,
  inventoryVars,
  inventoryError,
}) {
  const errors = { ...validateForm(credentials) };

  const roles = (Array.isArray(selectedRoles) ? selectedRoles : [])
    .map((role) => String(role ?? "").trim())
    .filter(Boolean);

  if (roles.length === 0) {
    errors.selectedRoles = "Select at least one role.";
  }

  if (inventoryError) {
    errors.inventoryVars = inventoryError;
  }

  const hasErrors = Object.keys(errors).length > 0;
  if (hasErrors) {
    return { payload: null, errors };
  }

  const auth = { method: credentials.authMethod };
  if (credentials.authMethod === "password") {
    auth.password = String(credentials.password ?? "");
  }
  if (credentials.authMethod === "private_key") {
    auth.private_key = String(credentials.privateKey ?? "");
  }

  const vars =
    inventoryVars && typeof inventoryVars === "object" && !Array.isArray(inventoryVars)
      ? inventoryVars
      : {};

  return {
    payload: {
      deploy_target: credentials.deployTarget,
      host: String(credentials.host ?? "").trim(),
      user: String(credentials.user ?? "").trim(),
      auth,
      selected_roles: roles,
      inventory_vars: vars,
    },
    errors: {},
  };
}
