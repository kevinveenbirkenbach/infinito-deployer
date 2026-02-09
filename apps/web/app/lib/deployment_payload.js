import { validateForm } from "./deploy_form.js";

/**
 * @param {object} args
 * @param {object} args.credentials
 * @param {string[]} args.selectedRoles
 * @param {string | null} args.workspaceId
 * @param {boolean} args.inventoryReady
 */
export function buildDeploymentPayload({
  credentials,
  selectedRoles,
  workspaceId,
  inventoryReady,
}) {
  const errors = { ...validateForm(credentials) };

  const roles = (Array.isArray(selectedRoles) ? selectedRoles : [])
    .map((role) => String(role ?? "").trim())
    .filter(Boolean);

  if (roles.length === 0) {
    errors.selectedRoles = "Select at least one role.";
  }

  if (!workspaceId) {
    errors.workspace = "Workspace is not ready yet.";
  }

  if (!inventoryReady) {
    errors.inventory = "Generate inventory in Workspace & Files first.";
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

  return {
    payload: {
      workspace_id: workspaceId,
      deploy_target: credentials.deployTarget,
      host: String(credentials.host ?? "").trim(),
      user: String(credentials.user ?? "").trim(),
      auth,
      selected_roles: roles,
    },
    errors: {},
  };
}
