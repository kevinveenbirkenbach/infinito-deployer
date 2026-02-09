/**
 * @typedef {Object} RoleLogo
 * @property {string} source
 * @property {string | null | undefined} [css_class]
 * @property {string | null | undefined} [url]
 */

/**
 * @typedef {Object} Role
 * @property {string} id
 * @property {string} display_name
 * @property {string} status
 * @property {string} description
 * @property {string[]} deployment_targets
 * @property {RoleLogo | null | undefined} [logo]
 */

/**
 * @param {string | null | undefined} value
 */
export function normalizeText(value) {
  return String(value ?? "").toLowerCase();
}

/**
 * @param {Role[]} roles
 * @param {{ statuses?: Iterable<string>; target?: string; query?: string }} filters
 */
export function filterRoles(roles, filters) {
  const statusSet = new Set(filters?.statuses ?? []);
  const target = filters?.target ?? "all";
  const query = normalizeText(filters?.query);

  return (roles ?? []).filter((role) => {
    if (statusSet.size > 0 && !statusSet.has(role.status)) {
      return false;
    }

    if (target && target !== "all") {
      const targets = role.deployment_targets ?? [];
      if (target === "server" || target === "workstation") {
        if (!targets.includes(target) && !targets.includes("universal")) {
          return false;
        }
      } else if (!targets.includes(target)) {
        return false;
      }
    }

    if (query) {
      const haystack = [
        role.id,
        role.display_name,
        role.description,
      ]
        .map(normalizeText)
        .join(" ");
      if (!haystack.includes(query)) {
        return false;
      }
    }

    return true;
  });
}
