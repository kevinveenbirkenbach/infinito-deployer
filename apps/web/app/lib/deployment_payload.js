import { validateForm } from "./deploy_form.js";

/**
 * @param {object} args
 * @param {"active"|"all"} args.deployScope
 * @param {object | null} args.activeServer
 * @param {Record<string, string[]>} args.selectedRolesByAlias
 * @param {string | null} args.activeAlias
 * @param {string | null} args.workspaceId
 * @param {boolean} args.inventoryReady
 */
export function buildDeploymentPayload({
  deployScope,
  activeServer,
  selectedRolesByAlias,
  activeAlias,
  workspaceId,
  inventoryReady,
}) {
  const server = activeServer || {};
  const credentials = {
    alias: server.alias || "",
    host: server.host || "",
    user: server.user || "",
    authMethod: server.authMethod || "password",
    password: server.password || "",
    privateKey: server.privateKey || "",
  };

  const errors = { ...validateForm(credentials) };

  const rolesByAlias = selectedRolesByAlias || {};
  let roles = [];
  if (deployScope === "all") {
    const seen = new Set();
    Object.values(rolesByAlias).forEach((list) => {
      (list || []).forEach((role) => {
        const r = String(role ?? "").trim();
        if (r && !seen.has(r)) {
          seen.add(r);
          roles.push(r);
        }
      });
    });
  } else {
    const list = rolesByAlias?.[activeAlias || ""] || [];
    roles = (Array.isArray(list) ? list : [])
      .map((role) => String(role ?? "").trim())
      .filter(Boolean);
  }

  if (roles.length === 0) {
    errors.selectedRoles = "Select at least one role.";
  }

  if (!workspaceId) {
    errors.workspace = "Workspace is not ready yet.";
  }

  if (!inventoryReady) {
    errors.inventory = "Generate inventory in Workspace & Files first.";
  }

  if (deployScope === "active" && !String(activeAlias || "").trim()) {
    errors.deployScope = "Select an active server before deploying.";
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

  const payload = {
    workspace_id: workspaceId,
    host: String(credentials.host ?? "").trim(),
    user: String(credentials.user ?? "").trim(),
    auth,
    selected_roles: roles,
  };

  if (deployScope === "active") {
    payload.limit = String(activeAlias || "").trim();
  }

  return {
    payload,
    errors: {},
  };
}
