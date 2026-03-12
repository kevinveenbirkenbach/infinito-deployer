"use client";
import { useCallback } from "react";
import type { Dispatch, SetStateAction } from "react";
import { createServerPlaceholder, normalizePersistedDeviceMeta } from "../../lib/device_meta";
import {
  pickUniqueDeviceColor,
  pickUniqueDeviceEmoji,
} from "../deployment-credentials/device-visuals";
import type {
  ConnectionResult,
  ServerState,
} from "../deployment-credentials/types";
import { DEFAULT_PRIMARY_DOMAIN } from "./domain-utils";
import type { OrderedProviderServer } from "./types";
type UseWorkspaceServerSelectionActionsProps = {
  servers: ServerState[];
  setServers: Dispatch<SetStateAction<ServerState[]>>;
  activeAlias: string;
  setActiveAlias: Dispatch<SetStateAction<string>>;
  selectedByAlias: Record<string, Set<string>>;
  setSelectedByAlias: Dispatch<SetStateAction<Record<string, Set<string>>>>;
  setSelectedPlansByAlias: Dispatch<
    SetStateAction<Record<string, Record<string, string | null>>>
  >;
  defaultPlanForRole: (roleId: string) => string;
  persistDeviceVisualMetaForAlias: (
    alias: string,
    patch: { color?: string; logoEmoji?: string }
  ) => Promise<void>;
  workspaceId: string | null;
  inventoryReady: boolean;
  setAliasDeletes: Dispatch<SetStateAction<string[]>>;
  setAliasCleanups: Dispatch<SetStateAction<string[]>>;
  setSelectionTouched: Dispatch<SetStateAction<boolean>>;
  setConnectionResults: Dispatch<SetStateAction<Record<string, ConnectionResult>>>;
  setOpenCredentialsAlias: Dispatch<SetStateAction<string | null>>;
  setDeploySelection: Dispatch<SetStateAction<Set<string>>>;
  setDeployRoleFilter: Dispatch<SetStateAction<Set<string>>>;
  setDeployedAliases: Dispatch<SetStateAction<Set<string>>>;
  setAliasRenames: Dispatch<SetStateAction<Array<{ from: string; to: string }>>>;
  selectableAliases: string[];
  inventoryRoleIds: string[];
};
export function useWorkspaceServerSelectionActions({
  servers,
  setServers,
  activeAlias,
  setActiveAlias,
  selectedByAlias,
  setSelectedByAlias,
  setSelectedPlansByAlias,
  defaultPlanForRole,
  persistDeviceVisualMetaForAlias,
  workspaceId,
  inventoryReady,
  setAliasDeletes,
  setAliasCleanups,
  setSelectionTouched,
  setConnectionResults,
  setOpenCredentialsAlias,
  setDeploySelection,
  setDeployRoleFilter,
  setDeployedAliases,
  setAliasRenames,
  selectableAliases,
  inventoryRoleIds,
}: UseWorkspaceServerSelectionActionsProps) {
  const applySelectedRolesByAlias = useCallback(
    (rolesByAlias: Record<string, string[]>) => {
      const aliases = Object.keys(rolesByAlias || {})
        .map((alias) => alias.trim())
        .filter(Boolean);
      if (aliases.length === 0) {
        setSelectedByAlias((prev) => {
          if (Object.keys(prev).length > 0) return prev;
          return { device: new Set<string>() };
        });
        setSelectedPlansByAlias((prev) => {
          if (Object.keys(prev).length > 0) return prev;
          return { device: {} };
        });
        setServers((prev) => {
          if (prev.length > 0) return prev;
          return normalizePersistedDeviceMeta([createServerPlaceholder("device")]);
        });
        setActiveAlias((prev) => prev || "device");
        return;
      }
      setSelectedByAlias((prev) => {
        const next: Record<string, Set<string>> = {};
        Object.entries(prev).forEach(([alias, set]) => {
          next[alias] = new Set<string>(set);
        });
        aliases.forEach((alias) => {
          next[alias] = new Set<string>(rolesByAlias?.[alias] ?? []);
        });
        return next;
      });
      setSelectedPlansByAlias((prev) => {
        const next: Record<string, Record<string, string | null>> = { ...prev };
        aliases.forEach((alias) => {
          const current = { ...(next[alias] || {}) };
          const enabled = new Set(
            (rolesByAlias?.[alias] ?? [])
              .map((item) => String(item || "").trim())
              .filter(Boolean)
          );
          enabled.forEach((roleId) => {
            if (!current[roleId]) {
              current[roleId] = defaultPlanForRole(roleId);
            }
          });
          Object.keys(current).forEach((roleId) => {
            if (!enabled.has(roleId)) current[roleId] = null;
          });
          next[alias] = current;
        });
        return next;
      });
      setServers((prev) => {
        const byAlias = new Map(prev.map((server) => [server.alias, server]));
        const ordered: string[] = [];
        const seen = new Set<string>();
        prev.forEach((server) => {
          if (!seen.has(server.alias)) {
            ordered.push(server.alias);
            seen.add(server.alias);
          }
        });
        aliases
          .filter((alias) => !seen.has(alias))
          .sort((a, b) => a.localeCompare(b))
          .forEach((alias) => ordered.push(alias));
        const nextServers: ServerState[] = [];
        ordered.forEach((alias) => {
          const existing = byAlias.get(alias);
          nextServers.push(existing ?? createServerPlaceholder(alias));
        });
        return normalizePersistedDeviceMeta(nextServers);
      });
      if (!activeAlias) {
        setActiveAlias(aliases[0] ?? "");
      }
    },
    [activeAlias, defaultPlanForRole, setActiveAlias, setSelectedByAlias, setSelectedPlansByAlias, setServers]
  );
  const updateServer = useCallback(
    (alias: string, patch: Partial<ServerState>) => {
      if (!alias) return;
      const nextAliasRaw =
        typeof patch.alias === "string" ? patch.alias.trim() : "";
      const shouldRename = nextAliasRaw && nextAliasRaw !== alias;
      const hasColorPatch = Object.prototype.hasOwnProperty.call(patch, "color");
      const hasLogoPatch = Object.prototype.hasOwnProperty.call(patch, "logoEmoji");
      setServers((prev) => {
        const idx = prev.findIndex((server) => server.alias === alias);
        if (idx === -1) return prev;
        if (
          shouldRename &&
          prev.some((server, i) => server.alias === nextAliasRaw && i !== idx)
        ) {
          return prev;
        }
        const next = [...prev];
        next[idx] = {
          ...prev[idx],
          ...patch,
          alias: shouldRename ? nextAliasRaw : prev[idx].alias,
        };
        return normalizePersistedDeviceMeta(next);
      });
      if (hasColorPatch || hasLogoPatch) {
        const targetAlias = shouldRename ? nextAliasRaw : alias;
        void persistDeviceVisualMetaForAlias(targetAlias, {
          ...(hasColorPatch ? { color: String(patch.color || "") } : {}),
          ...(hasLogoPatch ? { logoEmoji: String(patch.logoEmoji || "") } : {}),
        });
      }
      if (shouldRename) {
        const nextAlias = nextAliasRaw;
        setSelectedByAlias((prev) => {
          const next: Record<string, Set<string>> = { ...prev };
          const roles = next[alias]
            ? new Set<string>(next[alias])
            : new Set<string>();
          delete next[alias];
          if (next[nextAlias]) {
            roles.forEach((role) => next[nextAlias].add(role));
          } else {
            next[nextAlias] = roles;
          }
          return next;
        });
        setSelectedPlansByAlias((prev) => {
          const next: Record<string, Record<string, string | null>> = { ...prev };
          const previous = { ...(next[alias] || {}) };
          delete next[alias];
          next[nextAlias] = { ...(next[nextAlias] || {}), ...previous };
          return next;
        });
        if (activeAlias === alias) {
          setActiveAlias(nextAlias);
        }
        setConnectionResults((prev) => {
          if (!prev[alias]) return prev;
          const next = { ...prev, [nextAlias]: prev[alias] };
          delete next[alias];
          return next;
        });
        setAliasRenames((prev) => [...prev, { from: alias, to: nextAlias }]);
      }
    },
    [
      activeAlias,
      persistDeviceVisualMetaForAlias,
      setActiveAlias,
      setAliasRenames,
      setConnectionResults,
      setSelectedByAlias,
      setSelectedPlansByAlias,
      setServers,
    ]
  );
  const addServer = useCallback(
    (createServer: (alias: string, existingServers?: ServerState[]) => ServerState, aliasHint?: string) => {
      const existing = new Set(servers.map((server) => server.alias));
      const normalizedHint = String(aliasHint || "")
        .trim()
        .toLowerCase()
        .replace(/[^a-z0-9-]/g, "-")
        .replace(/-+/g, "-")
        .replace(/^-|-$/g, "");
      const baseAlias = normalizedHint || "device";
      let alias = baseAlias;
      let idx = 2;
      while (existing.has(alias)) {
        alias = `${baseAlias}-${idx}`;
        idx += 1;
      }
      const newServer = createServer(alias, servers);
      setServers((prev) => normalizePersistedDeviceMeta([...prev, newServer]));
      setSelectedByAlias((prev) => ({ ...prev, [alias]: new Set<string>() }));
      setActiveAlias(alias);
      void persistDeviceVisualMetaForAlias(alias, {
        color: newServer.color,
        logoEmoji: newServer.logoEmoji,
      });
      return alias;
    },
    [servers, persistDeviceVisualMetaForAlias, setActiveAlias, setSelectedByAlias, setServers]
  );
  const removeServerFromClient = useCallback(
    (alias: string) => {
      if (!alias) return;
      setServers((prev) => {
        const next = prev.filter((server) => server.alias !== alias);
        if (activeAlias === alias) {
          setActiveAlias(next[0]?.alias ?? "");
        }
        return normalizePersistedDeviceMeta(next);
      });
      setSelectedByAlias((prev) => {
        const next: Record<string, Set<string>> = { ...prev };
        delete next[alias];
        return next;
      });
      setSelectedPlansByAlias((prev) => {
        const next: Record<string, Record<string, string | null>> = { ...prev };
        delete next[alias];
        return next;
      });
      setConnectionResults((prev) => {
        if (!prev[alias]) return prev;
        const next = { ...prev };
        delete next[alias];
        return next;
      });
      setOpenCredentialsAlias((prev) => (prev === alias ? null : prev));
      setDeploySelection((prev) => {
        if (!prev.has(alias)) return prev;
        const next = new Set(prev);
        next.delete(alias);
        return next;
      });
      setDeployedAliases((prev) => {
        if (!prev.has(alias)) return prev;
        const next = new Set(prev);
        next.delete(alias);
        return next;
      });
      setSelectionTouched(true);
    },
    [
      activeAlias,
      setActiveAlias,
      setConnectionResults,
      setDeploySelection,
      setDeployedAliases,
      setOpenCredentialsAlias,
      setSelectedByAlias,
      setSelectedPlansByAlias,
      setSelectionTouched,
      setServers,
    ]
  );
  const removeServer = useCallback(
    async (alias: string) => {
      if (!alias) return;
      if (!workspaceId || !inventoryReady) {
        throw new Error("Workspace inventory is not ready yet.");
      }
      setAliasDeletes((prev) => [...prev, alias]);
      removeServerFromClient(alias);
    },
    [inventoryReady, removeServerFromClient, setAliasDeletes, workspaceId]
  );
  const cleanupServer = useCallback(
    async (alias: string) => {
      if (!alias) return;
      if (!workspaceId || !inventoryReady) {
        throw new Error("Workspace inventory is not ready yet.");
      }
      setAliasCleanups((prev) => [...prev, alias]);
      removeServerFromClient(alias);
    },
    [inventoryReady, removeServerFromClient, setAliasCleanups, workspaceId]
  );
  const toggleSelectedForAlias = useCallback((alias: string, id: string) => {
    const targetAlias = String(alias || "").trim();
    const roleId = String(id || "").trim();
    if (!targetAlias || !roleId) return;
    const currentlySelected = Boolean(selectedByAlias[targetAlias]?.has(roleId));
    const nextEnabled = !currentlySelected;
    setSelectedByAlias((prev) => {
      const next: Record<string, Set<string>> = { ...prev };
      const set = next[targetAlias]
        ? new Set<string>(next[targetAlias])
        : new Set<string>();
      if (set.has(roleId)) {
        set.delete(roleId);
      } else {
        set.add(roleId);
      }
      next[targetAlias] = set;
      return next;
    });
    setSelectedPlansByAlias((prev) => {
      const next: Record<string, Record<string, string | null>> = { ...prev };
      const current = { ...(next[targetAlias] || {}) };
      current[roleId] = nextEnabled ? current[roleId] || defaultPlanForRole(roleId) : null;
      next[targetAlias] = current;
      return next;
    });
    setSelectionTouched(true);
  }, [defaultPlanForRole, selectedByAlias, setSelectedByAlias, setSelectedPlansByAlias, setSelectionTouched]);
  const toggleSelected = useCallback(
    (id: string) => {
      if (!activeAlias) return;
      toggleSelectedForAlias(activeAlias, id);
    },
    [activeAlias, toggleSelectedForAlias]
  );
  const toggleDeployAlias = useCallback((alias: string) => {
    if (!alias) return;
    setDeploySelection((prev) => {
      const next = new Set(prev);
      if (next.has(alias)) {
        next.delete(alias);
      } else {
        next.add(alias);
      }
      return next;
    });
  }, [setDeploySelection]);
  const selectAllDeployAliases = useCallback(() => {
    setDeploySelection(new Set(selectableAliases));
  }, [selectableAliases, setDeploySelection]);
  const deselectAllDeployAliases = useCallback(() => {
    setDeploySelection(new Set());
  }, [setDeploySelection]);
  const toggleDeployRole = useCallback((roleId: string) => {
    const key = String(roleId || "").trim();
    if (!key) return;
    setDeployRoleFilter((prev) => {
      const next = new Set(prev);
      if (next.has(key)) {
        next.delete(key);
      } else {
        next.add(key);
      }
      return next;
    });
  }, [setDeployRoleFilter]);
  const selectAllDeployRoles = useCallback(() => {
    setDeployRoleFilter(new Set(inventoryRoleIds));
  }, [inventoryRoleIds, setDeployRoleFilter]);
  const deselectAllDeployRoles = useCallback(() => {
    setDeployRoleFilter(new Set());
  }, [setDeployRoleFilter]);
  const handleConnectionResult = useCallback((alias: string, result: ConnectionResult) => {
    const key = String(alias || "").trim();
    if (!key) return;
    setConnectionResults((prev) => ({ ...prev, [key]: result }));
  }, [setConnectionResults]);
  const handleProviderOrderedServer = useCallback(
    (device: OrderedProviderServer) => {
      const alias = String(device.alias || "").trim();
      if (!alias) return;
      const existingAlias = servers.some((server) => server.alias === alias);
      const nextColor = pickUniqueDeviceColor(new Set(servers.map((server) => server.color)));
      const nextLogoEmoji = pickUniqueDeviceEmoji(
        new Set(servers.map((server) => server.logoEmoji))
      );
      const requirementServerType = String(device.requirementServerType || "vps").trim() || "vps";
      const requirementStorageGb = String(device.requirementStorageGb || "200").trim() || "200";
      const requirementLocation = String(device.requirementLocation || "Germany").trim() || "Germany";
      setServers((prev) => {
        const existingIndex = prev.findIndex((server) => server.alias === alias);
        const patch: ServerState = {
          alias,
          description: "",
          primaryDomain: DEFAULT_PRIMARY_DOMAIN,
          requirementServerType,
          requirementStorageGb,
          requirementLocation,
          host: String(device.ansible_host || ""),
          port: String(device.ansible_port || 22),
          user: String(device.ansible_user || "root"),
          color: nextColor,
          logoEmoji: nextLogoEmoji,
          authMethod: "password",
          password: "",
          privateKey: "",
          publicKey: "",
          keyAlgorithm: "ed25519",
          keyPassphrase: "",
        };
        if (existingIndex >= 0) {
          const next = [...prev];
          next[existingIndex] = {
            ...next[existingIndex],
            host: patch.host,
            user: patch.user,
            port: patch.port,
            requirementServerType: patch.requirementServerType,
            requirementStorageGb: patch.requirementStorageGb,
            requirementLocation: patch.requirementLocation,
          };
          return normalizePersistedDeviceMeta(next);
        }
        return normalizePersistedDeviceMeta([...prev, patch]);
      });
      if (!existingAlias) {
        void persistDeviceVisualMetaForAlias(alias, {
          color: nextColor,
          logoEmoji: nextLogoEmoji,
        });
      }
      setSelectedByAlias((prev) => {
        if (prev[alias]) return prev;
        return { ...prev, [alias]: new Set<string>() };
      });
      setSelectedPlansByAlias((prev) => {
        if (prev[alias]) return prev;
        return { ...prev, [alias]: {} };
      });
      setActiveAlias(alias);
    },
    [
      persistDeviceVisualMetaForAlias,
      servers,
      setActiveAlias,
      setSelectedByAlias,
      setSelectedPlansByAlias,
      setServers,
    ]
  );
  return {
    applySelectedRolesByAlias,
    updateServer,
    addServer,
    removeServer,
    cleanupServer,
    toggleSelectedForAlias,
    toggleSelected,
    toggleDeployAlias,
    selectAllDeployAliases,
    deselectAllDeployAliases,
    toggleDeployRole,
    selectAllDeployRoles,
    deselectAllDeployRoles,
    handleConnectionResult,
    handleProviderOrderedServer,
  };
}
