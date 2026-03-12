import { useMemo } from "react";
import type { CSSProperties } from "react";
import { hexToRgba } from "../deployment-credentials/device-visuals";
import { normalizeDeployTarget } from "./dashboard-filters";
import type { Bundle, Role } from "./types";

type BundleSelectionState = {
  enabled: boolean;
  selectedCount: number;
  totalCount: number;
};

type ActiveDetails = {
  role: Role;
  alias: string;
};

type UseRoleDashboardSelectionParams = {
  roles: Role[];
  bundles: Bundle[];
  activeAlias?: string;
  serverAliases?: string[];
  serverMetaByAlias?: Record<string, { logoEmoji?: string | null; color?: string | null }>;
  selected: Set<string>;
  selectedByAlias?: Record<string, string[]>;
  onToggleSelected: (id: string) => void;
  selectedPlanByAlias?: Record<string, Record<string, string | null>>;
  onToggleSelectedForAlias?: (alias: string, roleId: string) => void;
  onSelectPlanForAlias?: (alias: string, roleId: string, planId: string | null) => void;
  onCreateServerForTarget?: (target: string) => string | null;
  activeDetails: ActiveDetails | null;
  setBundleMergePrompt: (value: { bundle: Bundle; alias: string } | null) => void;
};

export function useRoleDashboardSelection({
  roles,
  bundles,
  activeAlias,
  serverAliases,
  serverMetaByAlias,
  selected,
  selectedByAlias,
  onToggleSelected,
  selectedPlanByAlias,
  onToggleSelectedForAlias,
  onSelectPlanForAlias,
  onCreateServerForTarget,
  activeDetails,
  setBundleMergePrompt,
}: UseRoleDashboardSelectionParams) {
  const matrixAliases = useMemo(() => {
    const raw = Array.isArray(serverAliases) ? serverAliases : [];
    const deduped = Array.from(
      new Set(
        raw
          .map((alias) => String(alias || "").trim())
          .filter(Boolean)
      )
    );
    if (deduped.length > 0) return deduped;
    const fallback = String(activeAlias || "").trim();
    return fallback ? [fallback] : [];
  }, [serverAliases, activeAlias]);

  const matrixColumnStyleByAlias = useMemo(() => {
    const out: Record<string, CSSProperties> = {};
    matrixAliases.forEach((alias) => {
      const color = String(serverMetaByAlias?.[alias]?.color || "").trim();
      const cellBg = hexToRgba(color, 0.14);
      const headBg = hexToRgba(color, 0.24);
      const border = hexToRgba(color, 0.58);
      if (!cellBg && !headBg && !border) return;
      out[alias] = {
        ...(cellBg ? { "--matrix-device-col-bg": cellBg } : {}),
        ...(headBg ? { "--matrix-device-col-head-bg": headBg } : {}),
        ...(border ? { "--matrix-device-col-border": border } : {}),
      } as CSSProperties;
    });
    return out;
  }, [matrixAliases, serverMetaByAlias]);

  const selectedLookup = useMemo(() => {
    const out: Record<string, Set<string>> = {};
    if (selectedByAlias) {
      Object.entries(selectedByAlias).forEach(([alias, roleIds]) => {
        const key = String(alias || "").trim();
        if (!key) return;
        out[key] = new Set(
          (Array.isArray(roleIds) ? roleIds : [])
            .map((roleId) => String(roleId || "").trim())
            .filter(Boolean)
        );
      });
    }
    const active = String(activeAlias || "").trim();
    if (active && !out[active]) {
      out[active] = new Set(selected);
    }
    return out;
  }, [selectedByAlias, activeAlias, selected]);

  const roleServerCountByRole = useMemo(() => {
    const counts: Record<string, number> = {};
    roles.forEach((role) => {
      const roleId = String(role.id || "").trim();
      if (!roleId) return;
      counts[roleId] = matrixAliases.reduce((sum, alias) => {
        return sum + (selectedLookup[alias]?.has(roleId) ? 1 : 0);
      }, 0);
    });
    return counts;
  }, [roles, matrixAliases, selectedLookup]);

  const roleById = useMemo(() => {
    const out: Record<string, Role> = {};
    roles.forEach((role) => {
      const roleId = String(role.id || "").trim();
      if (!roleId) return;
      out[roleId] = role;
    });
    return out;
  }, [roles]);

  const rolePlanOptions = useMemo(() => {
    const out: Record<string, { id: string; label: string }[]> = {};
    roles.forEach((role) => {
      const pricing = role?.pricing;
      const offerings = Array.isArray(pricing?.offerings) ? pricing.offerings : [];
      const defaultOfferingId = String(
        pricing?.default_offering_id || pricing?.default_offering || ""
      ).trim();
      const orderedOfferings = offerings.slice().sort((a: any, b: any) => {
        const aId = String(a?.id || "").trim();
        const bId = String(b?.id || "").trim();
        if (aId === defaultOfferingId && bId !== defaultOfferingId) return -1;
        if (bId === defaultOfferingId && aId !== defaultOfferingId) return 1;
        return aId.localeCompare(bId);
      });
      const plans = orderedOfferings.flatMap((offering: any) =>
        Array.isArray(offering?.plans) ? offering.plans : []
      );
      const normalized = plans
        .map((plan: any) => ({
          id: String(plan?.id || "").trim(),
          label: String(plan?.label || plan?.id || "").trim(),
        }))
        .filter((plan: { id: string; label: string }) => plan.id && plan.label);
      const deduped = Array.from(
        new Map(
          normalized.map((plan: { id: string; label: string }) => [plan.id, plan])
        ).values()
      );
      if (!deduped.some((plan) => plan.id === "community")) {
        deduped.unshift({ id: "community", label: "Community" });
      }
      out[role.id] =
        deduped.length > 0 ? deduped : [{ id: "community", label: "Community" }];
    });
    return out;
  }, [roles]);

  const defaultPlanByRole = useMemo(() => {
    const out: Record<string, string> = {};
    Object.entries(rolePlanOptions).forEach(([roleId, plans]) => {
      out[roleId] = plans.find((plan) => plan.id === "community")?.id || plans[0]?.id || "community";
    });
    return out;
  }, [rolePlanOptions]);

  const selectedPlanLookup = useMemo(() => {
    const out: Record<string, Record<string, string | null>> = {};
    matrixAliases.forEach((alias) => {
      const next: Record<string, string | null> = {};
      const selectedRoles = selectedLookup[alias] || new Set<string>();
      const rolePlans = selectedPlanByAlias?.[alias] || {};
      roles.forEach((role) => {
        const roleId = role.id;
        const selectedPlan = rolePlans?.[roleId];
        if (selectedRoles.has(roleId)) {
          next[roleId] = selectedPlan || defaultPlanByRole[roleId] || "community";
        } else {
          next[roleId] = null;
        }
      });
      out[alias] = next;
    });
    return out;
  }, [matrixAliases, selectedLookup, selectedPlanByAlias, roles, defaultPlanByRole]);

  const activeSelectedPlanByRole = useMemo(() => {
    const alias = String(activeAlias || "").trim();
    if (!alias) return {};
    return selectedPlanLookup[alias] || {};
  }, [activeAlias, selectedPlanLookup]);

  const canToggleAliasRole = (alias: string) =>
    Boolean(onSelectPlanForAlias || onToggleSelectedForAlias) ||
    String(activeAlias || "").trim() === alias;

  const canToggleAliasBundle = (alias: string) =>
    Boolean(onSelectPlanForAlias || onToggleSelectedForAlias) ||
    String(activeAlias || "").trim() === alias;

  const toggleSelectedByAlias = (alias: string, roleId: string) => {
    if (!alias || !roleId) return;
    if (onToggleSelectedForAlias) {
      onToggleSelectedForAlias(alias, roleId);
      return;
    }
    if (String(activeAlias || "").trim() === alias) {
      onToggleSelected(roleId);
    }
  };

  const selectPlanByAlias = (alias: string, roleId: string, planId: string | null) => {
    if (!alias || !roleId) return;
    if (onSelectPlanForAlias) {
      onSelectPlanForAlias(alias, roleId, planId);
      return;
    }
    const selectedState = Boolean(selectedLookup[alias]?.has(roleId));
    if (planId && !selectedState) {
      toggleSelectedByAlias(alias, roleId);
    } else if (!planId && selectedState) {
      toggleSelectedByAlias(alias, roleId);
    }
  };

  const knownRoleIds = useMemo(
    () => new Set(roles.map((role) => String(role.id || "").trim()).filter(Boolean)),
    [roles]
  );

  const resolveBundleAlias = (bundle: Bundle): string => {
    const currentAlias = String(activeAlias || "").trim();
    if (currentAlias) return currentAlias;

    const existingAliases = matrixAliases
      .map((alias) => String(alias || "").trim())
      .filter(Boolean);
    if (existingAliases.length > 0) {
      const deployTarget = normalizeDeployTarget(bundle.deploy_target);
      const targetMatch =
        existingAliases.find((alias) => alias.toLowerCase() === deployTarget) ||
        existingAliases.find((alias) =>
          alias.toLowerCase().includes(deployTarget === "workstation" ? "workstation" : "server")
        );
      return targetMatch || existingAliases[0];
    }

    const createdAlias = onCreateServerForTarget?.(bundle.deploy_target);
    return String(createdAlias || bundle.deploy_target || "server").trim() || "server";
  };

  const applyBundleToAlias = (
    bundle: Bundle,
    alias: string,
    strategy: "merge" | "overwrite"
  ) => {
    const targetAlias = String(alias || "").trim();
    if (!targetAlias) return;
    const bundleRoleIds = (Array.isArray(bundle.role_ids) ? bundle.role_ids : [])
      .map((roleId) => String(roleId || "").trim())
      .filter((roleId) => roleId && knownRoleIds.has(roleId));
    if (bundleRoleIds.length === 0) return;

    const existing = selectedLookup[targetAlias] || new Set<string>();
    const desired =
      strategy === "merge"
        ? new Set<string>([...Array.from(existing), ...bundleRoleIds])
        : new Set<string>(bundleRoleIds);

    const roleIdsToCheck = new Set<string>([...Array.from(existing), ...Array.from(desired)]);
    roleIdsToCheck.forEach((roleId) => {
      const hasNow = existing.has(roleId);
      const shouldHave = desired.has(roleId);
      if (hasNow === shouldHave) return;
      if (shouldHave) {
        const defaultPlan = defaultPlanByRole[roleId] || "community";
        selectPlanByAlias(targetAlias, roleId, defaultPlan);
      } else {
        selectPlanByAlias(targetAlias, roleId, null);
      }
    });
  };

  const requestEnableBundleForAlias = (bundle: Bundle, aliasOverride?: string) => {
    const aliasCandidate = String(aliasOverride || "").trim();
    const alias = aliasCandidate || resolveBundleAlias(bundle);
    if (!alias) return;
    const existing = selectedLookup[alias] || new Set<string>();
    if (existing.size === 0) {
      applyBundleToAlias(bundle, alias, "overwrite");
      return;
    }
    setBundleMergePrompt({ bundle, alias });
  };

  const disableBundleForAlias = (bundle: Bundle, aliasOverride?: string) => {
    const aliasCandidate = String(aliasOverride || "").trim();
    const alias = aliasCandidate || resolveBundleAlias(bundle);
    if (!alias) return;
    const existing = selectedLookup[alias] || new Set<string>();
    const bundleRoleIds = (Array.isArray(bundle.role_ids) ? bundle.role_ids : [])
      .map((roleId) => String(roleId || "").trim())
      .filter((roleId) => roleId && knownRoleIds.has(roleId));
    bundleRoleIds.forEach((roleId) => {
      if (existing.has(roleId)) {
        selectPlanByAlias(alias, roleId, null);
      }
    });
  };

  const requestEnableBundle = (bundle: Bundle) => {
    requestEnableBundleForAlias(bundle);
  };

  const disableBundle = (bundle: Bundle) => {
    disableBundleForAlias(bundle);
  };

  const bundleRoleCountById = useMemo(() => {
    const out: Record<string, number> = {};
    bundles.forEach((bundle) => {
      out[bundle.id] = (Array.isArray(bundle.role_ids) ? bundle.role_ids : [])
        .map((roleId) => String(roleId || "").trim())
        .filter((roleId) => roleId && knownRoleIds.has(roleId)).length;
    });
    return out;
  }, [bundles, knownRoleIds]);

  const bundleStateByAlias = useMemo(() => {
    const aliasCandidates = matrixAliases.length
      ? matrixAliases
      : [String(activeAlias || "").trim()].filter(Boolean);
    const byAlias: Record<string, Record<string, BundleSelectionState>> = {};

    aliasCandidates.forEach((alias) => {
      const selectedForAlias = selectedLookup[alias] || new Set<string>();
      const stateMap: Record<string, BundleSelectionState> = {};
      bundles.forEach((bundle) => {
        const bundleRoleIds = (Array.isArray(bundle.role_ids) ? bundle.role_ids : [])
          .map((roleId) => String(roleId || "").trim())
          .filter((roleId) => roleId && knownRoleIds.has(roleId));
        const totalCount = bundleRoleIds.length;
        const selectedCount = bundleRoleIds.reduce(
          (sum, roleId) => sum + (selectedForAlias.has(roleId) ? 1 : 0),
          0
        );
        stateMap[bundle.id] = {
          enabled: totalCount > 0 && selectedCount === totalCount,
          selectedCount,
          totalCount,
        };
      });
      byAlias[alias] = stateMap;
    });

    return byAlias;
  }, [matrixAliases, activeAlias, selectedLookup, bundles, knownRoleIds]);

  const bundleStateById = useMemo(() => {
    const alias = String(activeAlias || "").trim() || matrixAliases[0] || "";
    return bundleStateByAlias[alias] || {};
  }, [activeAlias, matrixAliases, bundleStateByAlias]);

  const detailAliases = useMemo(() => {
    const fallback = String(activeAlias || "").trim();
    const aliases = matrixAliases.map((alias) => String(alias || "").trim()).filter(Boolean);
    if (aliases.length > 0) return aliases;
    return fallback ? [fallback] : ["server"];
  }, [matrixAliases, activeAlias]);

  const activeDetailsAlias = useMemo(() => {
    if (!activeDetails) return detailAliases[0] || "server";
    if (detailAliases.includes(activeDetails.alias)) return activeDetails.alias;
    return detailAliases[0] || "server";
  }, [activeDetails, detailAliases]);

  const activeDetailsRoleId = String(activeDetails?.role?.id || "").trim();
  const activeDetailsSelected = Boolean(
    activeDetailsRoleId && selectedLookup[activeDetailsAlias]?.has(activeDetailsRoleId)
  );
  const activeDetailsPlans = activeDetailsRoleId
    ? rolePlanOptions[activeDetailsRoleId] || [{ id: "community", label: "Community" }]
    : [{ id: "community", label: "Community" }];
  const activeDetailsPlanId = activeDetailsRoleId
    ? selectedPlanLookup[activeDetailsAlias]?.[activeDetailsRoleId] ?? null
    : null;

  return {
    matrixAliases,
    matrixColumnStyleByAlias,
    selectedLookup,
    roleServerCountByRole,
    roleById,
    rolePlanOptions,
    selectedPlanLookup,
    activeSelectedPlanByRole,
    canToggleAliasRole,
    canToggleAliasBundle,
    toggleSelectedByAlias,
    selectPlanByAlias,
    requestEnableBundleForAlias,
    disableBundleForAlias,
    requestEnableBundle,
    disableBundle,
    bundleRoleCountById,
    bundleStateByAlias,
    bundleStateById,
    detailAliases,
    activeDetailsAlias,
    activeDetailsRoleId,
    activeDetailsSelected,
    activeDetailsPlans,
    activeDetailsPlanId,
    applyBundleToAlias,
  };
}
