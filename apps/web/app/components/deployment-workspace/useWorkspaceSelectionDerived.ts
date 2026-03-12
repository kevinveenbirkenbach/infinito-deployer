"use client";

import { useCallback, useEffect, useMemo } from "react";
import type { Dispatch, SetStateAction } from "react";
import type { ConnectionResult, ServerState } from "../deployment-credentials/types";
import type { Role } from "./types";

type UseWorkspaceSelectionDerivedProps = {
  roles: Role[];
  selectedByAlias: Record<string, Set<string>>;
  setSelectedPlansByAlias: Dispatch<
    SetStateAction<Record<string, Record<string, string | null>>>
  >;
  activeAlias: string;
  servers: ServerState[];
  deployedAliases: Set<string>;
  deployRoleFilter: Set<string>;
  deployRoleQuery: string;
  setDeploySelection: Dispatch<SetStateAction<Set<string>>>;
  setDeployedAliases: Dispatch<SetStateAction<Set<string>>>;
  setConnectionResults: Dispatch<SetStateAction<Record<string, ConnectionResult>>>;
  setDeployRoleFilter: Dispatch<SetStateAction<Set<string>>>;
};

export function useWorkspaceSelectionDerived({
  roles,
  selectedByAlias,
  setSelectedPlansByAlias,
  activeAlias,
  servers,
  deployedAliases,
  deployRoleFilter,
  deployRoleQuery,
  setDeploySelection,
  setDeployedAliases,
  setConnectionResults,
  setDeployRoleFilter,
}: UseWorkspaceSelectionDerivedProps) {
  const selectedRolesByAlias = useMemo(() => {
    const out: Record<string, string[]> = {};
    Object.entries(selectedByAlias).forEach(([alias, set]) => {
      out[alias] = Array.from(set);
    });
    return out;
  }, [selectedByAlias]);

  const selectedRoles = useMemo(
    () => selectedRolesByAlias[activeAlias] ?? [],
    [selectedRolesByAlias, activeAlias]
  );

  const defaultPlanForRole = useCallback(
    (roleId: string) => {
      const role = roles.find((entry) => entry.id === roleId);
      if (!role) return "community";
      const pricing = role.pricing || null;
      const offerings = Array.isArray(pricing?.offerings) ? pricing.offerings : [];
      const defaultOfferingId = String(pricing?.default_offering_id || "").trim();
      const offering =
        offerings.find((item) => String(item?.id || "").trim() === defaultOfferingId) ||
        offerings[0] ||
        null;
      const plans = Array.isArray((offering as any)?.plans) ? (offering as any).plans : [];
      const defaultPlanId = String(pricing?.default_plan_id || "").trim();
      if (defaultPlanId && plans.some((plan: any) => String(plan?.id || "").trim() === defaultPlanId)) {
        return defaultPlanId;
      }
      const community = plans.find((plan: any) => String(plan?.id || "").trim() === "community");
      if (community) return "community";
      const first = plans[0];
      return String(first?.id || "").trim() || "community";
    },
    [roles]
  );

  useEffect(() => {
    setSelectedPlansByAlias((prev) => {
      const next: Record<string, Record<string, string | null>> = { ...prev };
      Object.entries(selectedByAlias).forEach(([alias, roleSet]) => {
        const current = { ...(next[alias] || {}) };
        roleSet.forEach((roleId) => {
          if (!current[roleId]) {
            current[roleId] = defaultPlanForRole(roleId);
          }
        });
        Object.keys(current).forEach((roleId) => {
          if (!roleSet.has(roleId)) {
            current[roleId] = null;
          }
        });
        next[alias] = current;
      });
      return next;
    });
  }, [selectedByAlias, defaultPlanForRole, setSelectedPlansByAlias]);

  const selectableAliases = useMemo(() => {
    const out: string[] = [];
    servers.forEach((server) => {
      const alias = String(server.alias || "").trim();
      if (!alias) return;
      const roles = (selectedRolesByAlias?.[alias] ?? []).filter(
        (roleId) =>
          deployRoleFilter.size === 0 || deployRoleFilter.has(String(roleId || ""))
      );
      const hasRoles = Array.isArray(roles) && roles.length > 0;
      const host = String(server.host || "").trim();
      const user = String(server.user || "").trim();
      const authReady =
        server.authMethod === "private_key"
          ? Boolean(String(server.privateKey || "").trim())
          : Boolean(String(server.password || "").trim());
      const portRaw = String(server.port || "").trim();
      const portNum = Number(portRaw);
      const portValid =
        !portRaw || (Number.isInteger(portNum) && portNum >= 1 && portNum <= 65535);
      const isConfigured = Boolean(host && user && authReady && portValid);
      if (hasRoles && isConfigured && !deployedAliases.has(alias)) {
        out.push(alias);
      }
    });
    return out;
  }, [servers, selectedRolesByAlias, deployedAliases, deployRoleFilter]);

  const inventoryRoleIds = useMemo(() => {
    const seen = new Set<string>();
    Object.values(selectedRolesByAlias).forEach((list) => {
      (Array.isArray(list) ? list : []).forEach((role) => {
        const roleId = String(role || "").trim();
        if (roleId) seen.add(roleId);
      });
    });
    return Array.from(seen).sort((a, b) => a.localeCompare(b));
  }, [selectedRolesByAlias]);

  const deployRoleOptions = useMemo(() => {
    const query = deployRoleQuery.trim().toLowerCase();
    if (!query) return inventoryRoleIds;
    return inventoryRoleIds.filter((roleId) => roleId.toLowerCase().includes(query));
  }, [inventoryRoleIds, deployRoleQuery]);

  const deployRoleSummary = useMemo(() => {
    if (inventoryRoleIds.length === 0) return "No apps in inventory";
    if (deployRoleFilter.size === 0) return "No apps selected";
    if (deployRoleFilter.size === inventoryRoleIds.length) {
      return `All apps (${inventoryRoleIds.length})`;
    }
    return `${deployRoleFilter.size} apps selected`;
  }, [inventoryRoleIds, deployRoleFilter]);

  useEffect(() => {
    setDeploySelection((prev) => {
      const allowed = new Set(selectableAliases);
      const next = new Set(Array.from(prev).filter((alias) => allowed.has(alias)));
      if (next.size === 0 && selectableAliases.length > 0) {
        selectableAliases.forEach((alias) => next.add(alias));
      }
      return next;
    });
  }, [selectableAliases, setDeploySelection]);

  useEffect(() => {
    setDeployedAliases((prev) => {
      const existing = new Set(servers.map((server) => server.alias));
      return new Set(Array.from(prev).filter((alias) => existing.has(alias)));
    });
  }, [servers, setDeployedAliases]);

  useEffect(() => {
    setConnectionResults((prev) => {
      const existing = new Set(servers.map((server) => server.alias));
      let changed = false;
      const next: Record<string, ConnectionResult> = {};
      Object.entries(prev).forEach(([alias, result]) => {
        if (existing.has(alias)) {
          next[alias] = result;
        } else {
          changed = true;
        }
      });
      return changed ? next : prev;
    });
  }, [servers, setConnectionResults]);

  useEffect(() => {
    setDeployRoleFilter((prev) => {
      const allowed = new Set(inventoryRoleIds);
      const next = new Set(Array.from(prev).filter((roleId) => allowed.has(roleId)));
      if (next.size === 0 && inventoryRoleIds.length > 0) {
        inventoryRoleIds.forEach((roleId) => next.add(roleId));
      }
      return next;
    });
  }, [inventoryRoleIds, setDeployRoleFilter]);

  return {
    selectedRolesByAlias,
    selectedRoles,
    defaultPlanForRole,
    selectableAliases,
    inventoryRoleIds,
    deployRoleOptions,
    deployRoleSummary,
  };
}
