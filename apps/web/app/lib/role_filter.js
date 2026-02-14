/**
 * @typedef {Object} RoleLogo
 * @property {string} source
 * @property {string | null | undefined} [css_class]
 * @property {string | null | undefined} [url]
 */

/**
 * @typedef {Object} RolePricingPlan
 * @property {string} id
 * @property {string | null | undefined} [label]
 * @property {string | null | undefined} [description]
 */

/**
 * @typedef {Object} RolePricingOffering
 * @property {string} id
 * @property {string | null | undefined} [label]
 * @property {RolePricingPlan[] | null | undefined} [plans]
 */

/**
 * @typedef {Object} RolePricingSummary
 * @property {string | null | undefined} [default_offering_id]
 * @property {string | null | undefined} [default_plan_id]
 * @property {string[] | null | undefined} [currencies]
 * @property {string[] | null | undefined} [regions]
 * @property {boolean | null | undefined} [has_setup_fee]
 */

/**
 * @typedef {Object} RolePricing
 * @property {string | null | undefined} [default_offering_id]
 * @property {string | null | undefined} [default_plan_id]
 * @property {RolePricingOffering[] | null | undefined} [offerings]
 * @property {Object.<string, unknown> | null | undefined} [inputs]
 */

/**
 * @typedef {Object} Role
 * @property {string} id
 * @property {string} display_name
 * @property {string} status
 * @property {string} description
 * @property {string[]} deployment_targets
 * @property {RoleLogo | null | undefined} [logo]
 * @property {string | null | undefined} [documentation]
 * @property {string | null | undefined} [video]
 * @property {string | null | undefined} [forum]
 * @property {string | null | undefined} [homepage]
 * @property {string | null | undefined} [repository]
 * @property {string | null | undefined} [issue_tracker_url]
 * @property {string | null | undefined} [license_url]
 * @property {string[] | null | undefined} [categories]
 * @property {string[] | null | undefined} [galaxy_tags]
 * @property {boolean | null | undefined} [bundle_member]
 * @property {RolePricingSummary | null | undefined} [pricing_summary]
 * @property {RolePricing | null | undefined} [pricing]
 */

/**
 * @param {string | null | undefined} value
 */
export function normalizeText(value) {
  return String(value ?? "").toLowerCase();
}

/**
 * @param {Role[]} roles
 * @param {{ statuses?: Iterable<string>; target?: string; query?: string; categories?: Iterable<string>; tags?: Iterable<string> }} filters
 */
export function filterRoles(roles, filters) {
  const statusSet = new Set(filters?.statuses ?? []);
  const categorySet = new Set(
    Array.from(filters?.categories ?? [])
      .map(normalizeText)
      .filter(Boolean)
  );
  const tagSet = new Set(
    Array.from(filters?.tags ?? [])
      .map(normalizeText)
      .filter(Boolean)
  );
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

    if (categorySet.size > 0) {
      const categories = (role.categories ?? []).map(normalizeText);
      if (!categories.some((category) => categorySet.has(category))) {
        return false;
      }
    }

    if (tagSet.size > 0) {
      const tags = (role.galaxy_tags ?? []).map(normalizeText);
      if (!tags.some((tag) => tagSet.has(tag))) {
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
