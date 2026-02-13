"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import type { CSSProperties, ReactNode } from "react";
import RoleDashboard from "./RoleDashboard";
import DeploymentCredentialsForm from "./DeploymentCredentialsForm";
import WorkspacePanel from "./WorkspacePanel";
import LiveDeploymentView from "./LiveDeploymentView";
import DeploymentWorkspaceServerSwitcher from "./DeploymentWorkspaceServerSwitcher";
import styles from "./DeploymentWorkspace.module.css";
import { createInitialState } from "../lib/deploy_form";
import { buildDeploymentPayload } from "../lib/deployment_payload";
import {
  hexToRgba,
  normalizeDeviceColor,
  normalizeDeviceEmoji,
  pickUniqueDeviceColor,
  pickUniqueDeviceEmoji,
} from "./deployment-credentials/device-visuals";
import type {
  ConnectionResult,
  ServerState,
} from "./deployment-credentials/types";

type Role = {
  id: string;
  display_name: string;
  status: string;
  description: string;
  deployment_targets: string[];
  logo?: { source: string; css_class?: string | null; url?: string | null };
  documentation?: string | null;
  video?: string | null;
  forum?: string | null;
  homepage?: string | null;
  issue_tracker_url?: string | null;
  license_url?: string | null;
};

type AliasRename = { from: string; to: string };

type DeploymentWorkspaceProps = {
  baseUrl: string;
  onJobCreated?: (jobId: string) => void;
};

type RoleAppConfigResponse = {
  role_id: string;
  alias: string;
  host_vars_path: string;
  content: string;
  imported_paths?: number;
};

function ensureUniqueDeviceMeta(servers: ServerState[]): ServerState[] {
  const usedColors = new Set<string>();
  const usedLogos = new Set<string>();
  servers.forEach((server) => {
    const color = normalizeDeviceColor(server.color);
    if (color) usedColors.add(color);
    const logo = normalizeDeviceEmoji(server.logoEmoji);
    if (logo) usedLogos.add(logo);
  });
  return servers.map((server) => {
    const normalizedColor = normalizeDeviceColor(server.color);
    const normalizedLogo = normalizeDeviceEmoji(server.logoEmoji);
    const color = normalizedColor || pickUniqueDeviceColor(usedColors);
    const logoEmoji = normalizedLogo || pickUniqueDeviceEmoji(usedLogos);
    if (!normalizedColor) {
      usedColors.add(color);
    }
    if (!normalizedLogo) {
      usedLogos.add(logoEmoji);
    }
    return {
      ...server,
      description: String(server.description || ""),
      color,
      logoEmoji,
    };
  });
}

function createDeviceStyle(
  color: string,
  {
    backgroundAlpha,
    borderAlpha,
    outlineAlpha,
  }: { backgroundAlpha: number; borderAlpha: number; outlineAlpha?: number }
): CSSProperties {
  const background = hexToRgba(color, backgroundAlpha);
  const border = hexToRgba(color, borderAlpha);
  const outline = hexToRgba(color, outlineAlpha ?? borderAlpha);
  return {
    ...(background ? { "--device-row-bg": background } : {}),
    ...(border ? { "--device-row-border": border } : {}),
    ...(outline ? { "--device-row-outline": outline } : {}),
  } as CSSProperties;
}

export default function DeploymentWorkspace({
  baseUrl,
  onJobCreated,
}: DeploymentWorkspaceProps) {
  const initial = useMemo(() => createInitialState(), []);
  const [roles, setRoles] = useState<Role[]>([]);
  const [rolesLoading, setRolesLoading] = useState(true);
  const [rolesError, setRolesError] = useState<string | null>(null);
  const [servers, setServers] = useState<ServerState[]>([
    {
      alias: initial.alias,
      description: initial.description,
      host: initial.host,
      port: initial.port,
      user: initial.user,
      color: pickUniqueDeviceColor(new Set<string>()),
      logoEmoji:
        normalizeDeviceEmoji(initial.logoEmoji) ||
        pickUniqueDeviceEmoji(new Set<string>()),
      authMethod: initial.authMethod,
      password: initial.password,
      privateKey: initial.privateKey,
      publicKey: initial.publicKey,
      keyAlgorithm: initial.keyAlgorithm,
      keyPassphrase: initial.keyPassphrase,
    },
  ]);
  const [activeAlias, setActiveAlias] = useState(initial.alias);
  const [selectedByAlias, setSelectedByAlias] = useState<
    Record<string, Set<string>>
  >(() => ({ [initial.alias]: new Set<string>() }));
  const [aliasRenames, setAliasRenames] = useState<AliasRename[]>([]);
  const [aliasDeletes, setAliasDeletes] = useState<string[]>([]);
  const [aliasCleanups, setAliasCleanups] = useState<string[]>([]);
  const [selectionTouched, setSelectionTouched] = useState(false);
  const [deploySelection, setDeploySelection] = useState<Set<string>>(
    new Set<string>()
  );
  const [deployRoleFilter, setDeployRoleFilter] = useState<Set<string>>(
    new Set<string>()
  );
  const [deployRolePickerOpen, setDeployRolePickerOpen] = useState(false);
  const [deployRoleQuery, setDeployRoleQuery] = useState("");
  const [deployedAliases, setDeployedAliases] = useState<Set<string>>(
    new Set<string>()
  );
  const [connectionResults, setConnectionResults] = useState<
    Record<string, ConnectionResult>
  >({});
  const [deployViewTab, setDeployViewTab] = useState<"live-log" | "terminal">(
    "live-log"
  );
  const lastDeploymentSelectionRef = useRef<string[] | null>(null);

  const [workspaceId, setWorkspaceId] = useState<string | null>(null);
  const [inventoryReady, setInventoryReady] = useState(false);
  const [deploying, setDeploying] = useState(false);
  const [deployError, setDeployError] = useState<string | null>(null);
  const [liveJobId, setLiveJobId] = useState("");
  const [connectRequestKey, setConnectRequestKey] = useState(0);
  const [cancelRequestKey, setCancelRequestKey] = useState(0);
  const [liveConnected, setLiveConnected] = useState(false);
  const [liveCanceling, setLiveCanceling] = useState(false);
  const [liveError, setLiveError] = useState<string | null>(null);
  const [openCredentialsAlias, setOpenCredentialsAlias] = useState<string | null>(
    null
  );
  const [activePanel, setActivePanel] = useState<
    "store" | "server" | "inventory" | "deploy"
  >("store");

  useEffect(() => {
    let alive = true;

    const load = async () => {
      setRolesLoading(true);
      setRolesError(null);
      try {
        const res = await fetch(`${baseUrl}/api/roles`, {
          cache: "no-store",
        });
        if (!res.ok) {
          throw new Error(`HTTP ${res.status}`);
        }
        const data = await res.json();
        if (alive) {
          setRoles(Array.isArray(data) ? data : []);
        }
      } catch (err: any) {
        if (alive) {
          setRolesError(err?.message ?? "failed to load roles");
        }
      } finally {
        if (alive) setRolesLoading(false);
      }
    };

    load();
    return () => {
      alive = false;
    };
  }, [baseUrl]);

  useEffect(() => {
    if (!activeAlias && servers.length > 0) {
      setActiveAlias(servers[0].alias);
      return;
    }
    if (activeAlias && !servers.some((server) => server.alias === activeAlias)) {
      setActiveAlias(servers[0]?.alias ?? "");
    }
  }, [activeAlias, servers]);

  useEffect(() => {
    if (!activeAlias) return;
    setSelectedByAlias((prev) => {
      if (prev[activeAlias]) return prev;
      return { ...prev, [activeAlias]: new Set<string>() };
    });
  }, [activeAlias]);

  const createServer = useCallback(
    (alias: string, existingServers: ServerState[] = []): ServerState => {
      const usedColors = new Set<string>();
      const usedLogos = new Set<string>();
      existingServers.forEach((server) => {
        const color = normalizeDeviceColor(server.color);
        if (color) usedColors.add(color);
        const logo = normalizeDeviceEmoji(server.logoEmoji);
        if (logo) usedLogos.add(logo);
      });
      return {
        alias,
        description: "",
        host: "",
        port: "22",
        user: "root",
        color: pickUniqueDeviceColor(usedColors),
        logoEmoji: pickUniqueDeviceEmoji(usedLogos),
        authMethod: "password",
        password: "",
        privateKey: "",
        publicKey: "",
        keyAlgorithm: "ed25519",
        keyPassphrase: "",
      };
    },
    []
  );

  const activeServer = useMemo(() => {
    if (activeAlias) {
      const found = servers.find((server) => server.alias === activeAlias);
      if (found) return found;
    }
    return servers[0] ?? null;
  }, [servers, activeAlias]);

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
    return inventoryRoleIds.filter((roleId) =>
      roleId.toLowerCase().includes(query)
    );
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
      const next = new Set(
        Array.from(prev).filter((alias) => allowed.has(alias))
      );
      if (next.size === 0 && selectableAliases.length > 0) {
        selectableAliases.forEach((alias) => next.add(alias));
      }
      return next;
    });
  }, [selectableAliases]);

  useEffect(() => {
    setDeployedAliases((prev) => {
      const existing = new Set(servers.map((server) => server.alias));
      return new Set(Array.from(prev).filter((alias) => existing.has(alias)));
    });
  }, [servers]);

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
  }, [servers]);

  useEffect(() => {
    setDeployRoleFilter((prev) => {
      const allowed = new Set(inventoryRoleIds);
      const next = new Set(Array.from(prev).filter((roleId) => allowed.has(roleId)));
      if (next.size === 0 && inventoryRoleIds.length > 0) {
        inventoryRoleIds.forEach((roleId) => next.add(roleId));
      }
      return next;
    });
  }, [inventoryRoleIds]);

  useEffect(() => {
    setDeployedAliases(new Set());
    setConnectionResults({});
    setDeploySelection(new Set());
    setDeployRoleFilter(new Set());
    setAliasRenames([]);
    setAliasDeletes([]);
    setAliasCleanups([]);
    setLiveJobId("");
    setLiveConnected(false);
    setLiveCanceling(false);
    setLiveError(null);
    setOpenCredentialsAlias(null);
    setConnectRequestKey(0);
    setCancelRequestKey(0);
  }, [workspaceId]);

  useEffect(() => {
    if (!deployRolePickerOpen) return;
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") setDeployRolePickerOpen(false);
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [deployRolePickerOpen]);

  const applySelectedRolesByAlias = useCallback(
    (rolesByAlias: Record<string, string[]>) => {
      const aliases = Object.keys(rolesByAlias || {})
        .map((alias) => alias.trim())
        .filter(Boolean);

      if (aliases.length === 0) {
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
          nextServers.push(existing ?? createServer(alias, nextServers));
        });
        return ensureUniqueDeviceMeta(nextServers);
      });

      if (!activeAlias) {
        setActiveAlias(aliases[0] ?? "");
      }
    },
    [activeAlias, createServer]
  );

  const updateServer = useCallback(
    (alias: string, patch: Partial<ServerState>) => {
      if (!alias) return;
      const nextAliasRaw =
        typeof patch.alias === "string" ? patch.alias.trim() : "";
      const shouldRename = nextAliasRaw && nextAliasRaw !== alias;

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
        return ensureUniqueDeviceMeta(next);
      });

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
    [activeAlias]
  );

  const addServer = useCallback(
    (_aliasHint?: string) => {
      const existing = new Set(servers.map((server) => server.alias));
      let alias = "device";
      let idx = 2;
      while (existing.has(alias)) {
        alias = `device-${idx}`;
        idx += 1;
      }

      setServers((prev) =>
        ensureUniqueDeviceMeta([...prev, createServer(alias, prev)])
      );
      setSelectedByAlias((prev) => ({ ...prev, [alias]: new Set<string>() }));
      setActiveAlias(alias);
    },
    [servers, createServer]
  );

  const removeServerFromClient = useCallback(
    (alias: string) => {
      if (!alias) return;
      setServers((prev) => {
        const next = prev.filter((server) => server.alias !== alias);
        if (activeAlias === alias) {
          setActiveAlias(next[0]?.alias ?? "");
        }
        return ensureUniqueDeviceMeta(next);
      });
      setSelectedByAlias((prev) => {
        const next: Record<string, Set<string>> = { ...prev };
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
    [activeAlias]
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
    [inventoryReady, workspaceId, removeServerFromClient]
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
    [inventoryReady, workspaceId, removeServerFromClient]
  );

  const toggleSelectedForAlias = useCallback((alias: string, id: string) => {
    const targetAlias = String(alias || "").trim();
    const roleId = String(id || "").trim();
    if (!targetAlias || !roleId) return;
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
    setSelectionTouched(true);
  }, []);

  const toggleSelected = useCallback(
    (id: string) => {
      if (!activeAlias) return;
      toggleSelectedForAlias(activeAlias, id);
    },
    [activeAlias, toggleSelectedForAlias]
  );

  const toggleDeployAlias = (alias: string) => {
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
  };

  const selectAllDeployAliases = () => {
    setDeploySelection(new Set(selectableAliases));
  };

  const deselectAllDeployAliases = () => {
    setDeploySelection(new Set());
  };

  const toggleDeployRole = (roleId: string) => {
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
  };

  const selectAllDeployRoles = () => {
    setDeployRoleFilter(new Set(inventoryRoleIds));
  };

  const deselectAllDeployRoles = () => {
    setDeployRoleFilter(new Set());
  };

  const handleConnectionResult = (alias: string, result: ConnectionResult) => {
    const key = String(alias || "").trim();
    if (!key) return;
    setConnectionResults((prev) => ({ ...prev, [key]: result }));
  };

  const deploymentPlan = useMemo(
    () =>
      buildDeploymentPayload({
        activeServer,
        selectedRolesByAlias,
        selectedAliases: Array.from(deploySelection),
        selectableAliases,
        roleFilter: Array.from(deployRoleFilter),
        workspaceId,
        inventoryReady,
      }),
    [
      activeServer,
      selectedRolesByAlias,
      deploySelection,
      selectableAliases,
      deployRoleFilter,
      workspaceId,
      inventoryReady,
    ]
  );

  const deploymentErrors = deploymentPlan.errors;
  const canDeploy = Object.keys(deploymentErrors).length === 0 && !deploying;

  const startDeployment = async () => {
    setDeployError(null);

    if (!deploymentPlan.payload) {
      setDeployError("Resolve the highlighted items before deploying.");
      return;
    }

    lastDeploymentSelectionRef.current = Array.from(deploySelection);
    setDeploying(true);
    try {
      const res = await fetch(`${baseUrl}/api/deployments`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(deploymentPlan.payload),
      });
      if (!res.ok) {
        let message = `HTTP ${res.status}`;
        try {
          const data = await res.json();
          if (data?.detail) {
            message = data.detail;
          }
        } catch {
          const text = await res.text();
          if (text) message = text;
        }
        throw new Error(message);
      }
      const data = await res.json();
      const created = String(data?.job_id ?? "");
      if (created) {
        setLiveJobId(created);
        setDeployViewTab("terminal");
        onJobCreated?.(created);
      }
    } catch (err: any) {
      setDeployError(err?.message ?? "Deployment failed");
    } finally {
      setDeploying(false);
    }
  };

  const credentials = useMemo(() => {
    return {
      alias: activeServer?.alias ?? "",
      description: activeServer?.description ?? "",
      host: activeServer?.host ?? "",
      port: activeServer?.port ?? "",
      user: activeServer?.user ?? "",
      color: activeServer?.color ?? "",
      logoEmoji: activeServer?.logoEmoji ?? "",
      authMethod: activeServer?.authMethod ?? "password",
    };
  }, [activeServer]);

  const handleDeploymentStatus = useCallback(
    (status: { job_id?: string; status?: string } | null) => {
      if (!status?.status) return;
      if (status.job_id && liveJobId && status.job_id !== liveJobId) return;
      const terminal = ["succeeded", "failed", "canceled"].includes(status.status);
      if (status.status === "succeeded" && lastDeploymentSelectionRef.current) {
        setDeployedAliases((prev) => {
          const next = new Set(prev);
          lastDeploymentSelectionRef.current?.forEach((alias) => next.add(alias));
          return next;
        });
      }
      if (terminal) {
        lastDeploymentSelectionRef.current = null;
      }
    },
    [liveJobId]
  );

  const deployTableColumns =
    "minmax(0, 1.3fr) minmax(0, 0.7fr) minmax(0, 1.25fr) minmax(62px, 0.45fr) minmax(0, 0.85fr) minmax(66px, 0.55fr) minmax(94px, 0.85fr) 52px";
  const deployTableStyle = {
    "--deploy-table-columns": deployTableColumns,
  } as CSSProperties;

  const isPortInvalid = (port: string) => {
    const raw = String(port || "").trim();
    if (!raw) return false;
    const num = Number(raw);
    return !Number.isInteger(num) || num < 1 || num > 65535;
  };

  const normalizePortValue = (value: string | number | null | undefined) => {
    const digits = String(value ?? "").replace(/[^\d]/g, "");
    if (!digits) return "";
    const parsed = Number.parseInt(digits, 10);
    if (!Number.isInteger(parsed)) return "";
    return String(Math.min(65535, Math.max(1, parsed)));
  };

  const isAuthMissing = (server: ServerState) =>
    server.authMethod === "private_key"
      ? !String(server.privateKey || "").trim()
      : !String(server.password || "").trim();

  const hasCredentials = (server: ServerState) => {
    const host = String(server.host || "").trim();
    const user = String(server.user || "").trim();
    const authReady = !isAuthMissing(server);
    return Boolean(host && user && authReady);
  };

  const canTestConnection = (server: ServerState) => {
    const host = String(server.host || "").trim();
    const user = String(server.user || "").trim();
    const portRaw = String(server.port || "").trim();
    const portValue = Number(portRaw);
    const portValid =
      Number.isInteger(portValue) && portValue >= 1 && portValue <= 65535;
    return Boolean(host && user && portValid && !isAuthMissing(server));
  };

  const testConnectionForServer = useCallback(
    async (server: ServerState) => {
      if (!workspaceId || !canTestConnection(server)) return;
      try {
        const portRaw = String(server.port ?? "").trim();
        const portValue = portRaw ? Number(portRaw) : null;
        const res = await fetch(
          `${baseUrl}/api/workspaces/${workspaceId}/test-connection`,
          {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
              host: server.host,
              port: Number.isInteger(portValue) ? portValue : undefined,
              user: server.user,
              auth_method: server.authMethod,
              password: server.password || undefined,
              private_key: server.privateKey || undefined,
              key_passphrase: server.keyPassphrase || undefined,
            }),
          }
        );
        if (!res.ok) {
          let message = `HTTP ${res.status}`;
          try {
            const data = await res.json();
            if (typeof data?.detail === "string" && data.detail.trim()) {
              message = data.detail.trim();
            }
          } catch {
            const text = await res.text();
            if (text.trim()) message = text.trim();
          }
          throw new Error(message);
        }
        const data = (await res.json()) as ConnectionResult;
        handleConnectionResult(server.alias, data);
      } catch (err: any) {
        handleConnectionResult(server.alias, {
          ping_ok: false,
          ping_error: err?.message ?? "ping failed",
          ssh_ok: false,
          ssh_error: err?.message ?? "ssh failed",
        });
      }
    },
    [baseUrl, workspaceId, handleConnectionResult]
  );

  const getConnectionState = (server: ServerState) => {
    const credentialsReady = hasCredentials(server);
    const status = connectionResults[server.alias];
    const fullyConnected = status?.ping_ok === true && status?.ssh_ok === true;

    if (credentialsReady && fullyConnected) {
      return {
        rowClass: styles.serverRowHealthy,
        label: "Connected",
        toneClass: styles.statusDotGreen,
        tooltip: "Ping and SSH checks succeeded.",
      };
    }
    if (!credentialsReady) {
      return {
        rowClass: styles.serverRowMissingCredentials,
        label: "Missing credentials",
        toneClass: styles.statusDotOrange,
        tooltip: "No credentials configured. Set password or SSH key before testing.",
      };
    }
    if (!status) {
      return {
        rowClass: styles.serverRowWarning,
        label: "Not tested",
        toneClass: styles.statusDotYellow,
        tooltip: "No connection test result yet.",
      };
    }
    if (status.ping_ok && status.ssh_ok) {
      return {
        rowClass: styles.serverRowHealthy,
        label: "Connected",
        toneClass: styles.statusDotGreen,
        tooltip: "Ping and SSH checks succeeded.",
      };
    }
    const detail: string[] = [];
    if (!status.ping_ok) {
      detail.push(status.ping_error?.trim() || "Ping check failed.");
    }
    if (!status.ssh_ok) {
      detail.push(status.ssh_error?.trim() || "SSH check failed.");
    }
    return {
      rowClass: styles.serverRowWarning,
      label: !status.ping_ok ? "Ping failed" : "Connection failed",
      toneClass: styles.statusDotOrange,
      tooltip: detail.join(" ") || "Connection test failed.",
    };
  };

  const requestConnect = () => {
    if (!liveJobId.trim()) return;
    setLiveError(null);
    setConnectRequestKey((prev) => prev + 1);
    setDeployViewTab("terminal");
  };

  const requestCancel = () => {
    if (!liveJobId.trim()) return;
    setLiveError(null);
    setCancelRequestKey((prev) => prev + 1);
  };

  const openCredentialsFor = (alias: string) => {
    const target = String(alias || "").trim();
    if (!target) return;
    setActiveAlias(target);
    setOpenCredentialsAlias(target);
    setActivePanel("server");
  };

  const roleAppConfigUrl = useCallback(
    (roleId: string, suffix = "", aliasOverride?: string) => {
      if (!workspaceId) {
        throw new Error("Workspace is not ready yet.");
      }
      const rid = encodeURIComponent(String(roleId || "").trim());
      const alias = String(aliasOverride || activeAlias || "").trim();
      const query = alias ? `?alias=${encodeURIComponent(alias)}` : "";
      return `${baseUrl}/api/workspaces/${workspaceId}/roles/${rid}/app-config${suffix}${query}`;
    },
    [activeAlias, baseUrl, workspaceId]
  );

  const parseApiError = async (res: Response) => {
    let message = `HTTP ${res.status}`;
    try {
      const data = await res.json();
      if (typeof data?.detail === "string" && data.detail.trim()) {
        message = data.detail;
      }
    } catch {
      const text = await res.text();
      if (text?.trim()) {
        message = text.trim();
      }
    }
    return message;
  };

  const loadRoleAppConfig = useCallback(
    async (roleId: string, aliasOverride?: string): Promise<RoleAppConfigResponse> => {
      const url = roleAppConfigUrl(roleId, "", aliasOverride);
      const res = await fetch(url, { cache: "no-store" });
      if (!res.ok) {
        throw new Error(await parseApiError(res));
      }
      return (await res.json()) as RoleAppConfigResponse;
    },
    [roleAppConfigUrl]
  );

  const saveRoleAppConfig = useCallback(
    async (
      roleId: string,
      content: string,
      aliasOverride?: string
    ): Promise<RoleAppConfigResponse> => {
      const url = roleAppConfigUrl(roleId, "", aliasOverride);
      const res = await fetch(url, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ content }),
      });
      if (!res.ok) {
        throw new Error(await parseApiError(res));
      }
      return (await res.json()) as RoleAppConfigResponse;
    },
    [roleAppConfigUrl]
  );

  const importRoleAppDefaults = useCallback(
    async (roleId: string, aliasOverride?: string): Promise<RoleAppConfigResponse> => {
      const url = roleAppConfigUrl(roleId, "/import-defaults", aliasOverride);
      const res = await fetch(url, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
      });
      if (!res.ok) {
        throw new Error(await parseApiError(res));
      }
      return (await res.json()) as RoleAppConfigResponse;
    },
    [roleAppConfigUrl]
  );

  const serverSwitcher = (
    <DeploymentWorkspaceServerSwitcher
      currentAlias={activeAlias}
      servers={servers}
      onSelect={setActiveAlias}
      onCreate={addServer}
      onOpenServerTab={() => setActivePanel("server")}
    />
  );

  const serverMetaByAlias = useMemo(
    () =>
      Object.fromEntries(
        servers.map((server) => [
          server.alias,
          { logoEmoji: server.logoEmoji || "💻", color: server.color || "" },
        ])
      ) as Record<string, { logoEmoji?: string | null; color?: string | null }>,
    [servers]
  );

  const panels: {
    key: "store" | "server" | "inventory" | "deploy";
    title: string;
    content: ReactNode;
  }[] = [
    {
      key: "store",
      title: "Software",
      content: (
        <RoleDashboard
          roles={roles}
          loading={rolesLoading}
          error={rolesError}
          selected={new Set<string>(selectedRoles)}
          onToggleSelected={toggleSelected}
          onLoadRoleAppConfig={loadRoleAppConfig}
          onSaveRoleAppConfig={saveRoleAppConfig}
          onImportRoleAppDefaults={importRoleAppDefaults}
          activeAlias={activeAlias}
          serverAliases={servers.map((server) => server.alias)}
          serverMetaByAlias={serverMetaByAlias}
          selectedByAlias={selectedRolesByAlias}
          onToggleSelectedForAlias={toggleSelectedForAlias}
          serverSwitcher={serverSwitcher}
          compact
        />
      ),
    },
    {
      key: "server",
      title: "Devices",
      content: (
        <DeploymentCredentialsForm
          baseUrl={baseUrl}
          workspaceId={workspaceId}
          servers={servers}
          connectionResults={connectionResults}
          activeAlias={activeAlias}
          onActiveAliasChange={setActiveAlias}
          onUpdateServer={updateServer}
          onConnectionResult={handleConnectionResult}
          onRemoveServer={removeServer}
          onCleanupServer={cleanupServer}
          onAddServer={addServer}
          openCredentialsAlias={openCredentialsAlias}
          onOpenCredentialsAliasHandled={() => setOpenCredentialsAlias(null)}
          compact
        />
      ),
    },
    {
      key: "inventory",
      title: "Inventory",
      content: (
        <div className={styles.inventoryPanelContent}>
          <WorkspacePanel
            baseUrl={baseUrl}
            selectedRolesByAlias={selectedRolesByAlias}
            credentials={credentials}
            onCredentialsPatch={(patch) => {
              if (!activeServer) return;
              updateServer(activeServer.alias, patch);
            }}
            onInventoryReadyChange={setInventoryReady}
            onSelectedRolesByAliasChange={applySelectedRolesByAlias}
            onWorkspaceIdChange={setWorkspaceId}
            aliasRenames={aliasRenames}
            onAliasRenamesHandled={(count) =>
              setAliasRenames((prev) => prev.slice(count))
            }
            aliasDeletes={aliasDeletes}
            onAliasDeletesHandled={(count) =>
              setAliasDeletes((prev) => prev.slice(count))
            }
            aliasCleanups={aliasCleanups}
            onAliasCleanupsHandled={(count) =>
              setAliasCleanups((prev) => prev.slice(count))
            }
            selectionTouched={selectionTouched}
            compact
          />
        </div>
      ),
    },
    {
      key: "deploy",
      title: "Setup",
      content: (
        <div className={styles.deployLayout}>
          <div className={styles.deployTabs}>
            <button
              type="button"
              onClick={() => setDeployViewTab("live-log")}
              className={`${styles.deployTabButton} ${
                deployViewTab === "live-log" ? styles.deployTabButtonActive : ""
              }`}
            >
              Deploy devices
            </button>
            <button
              type="button"
              onClick={() => setDeployViewTab("terminal")}
              className={`${styles.deployTabButton} ${
                deployViewTab === "terminal" ? styles.deployTabButtonActive : ""
              }`}
            >
              Terminal
            </button>
          </div>

          {deployError ? <div className={styles.errorText}>{deployError}</div> : null}
          {liveError ? <div className={styles.errorText}>{liveError}</div> : null}

          <div className={styles.deployBody}>
            <div
              className={`${styles.deployTabPanel} ${
                deployViewTab === "live-log" ? styles.deployTabPanelActive : ""
              }`}
              aria-hidden={deployViewTab !== "live-log"}
            >
              <div className={styles.serverTableCard} style={deployTableStyle}>
                <div className={styles.serverTableTop}>
                  <span className={styles.serverTableTitle}>Deploy devices</span>
                  <span className={`text-body-secondary ${styles.serverTableMeta}`}>
                    {deploySelection.size} selected
                  </span>
                </div>
                <div className={styles.serverTableHeader}>
                  <span>Status</span>
                  <span>Device</span>
                  <span>Host</span>
                  <span>Port</span>
                  <span>User</span>
                  <span>Apps</span>
                  <span>Edit</span>
                  <span>Select</span>
                </div>
                <div className={styles.serverTableRows}>
                  {servers.map((server) => {
                    const alias = String(server.alias || "").trim();
                    if (!alias) return null;
                    const roles = selectedRolesByAlias?.[alias] ?? [];
                    const filteredRoles = (Array.isArray(roles) ? roles : []).filter(
                      (roleId) =>
                        deployRoleFilter.size === 0 || deployRoleFilter.has(roleId)
                    );
                    const hasRoles = filteredRoles.length > 0;
                    const isDeployed = deployedAliases.has(alias);
                    const isSelected = deploySelection.has(alias);
                    const hostMissing = !String(server.host || "").trim();
                    const userMissing = !String(server.user || "").trim();
                    const portInvalid = isPortInvalid(server.port);
                    const authMissing = isAuthMissing(server);
                    const appsMissing = !hasRoles;
                    const isConfigured =
                      !hostMissing && !userMissing && !portInvalid && !authMissing;
                    const isSelectable = hasRoles && isConfigured && !isDeployed;
                    const connectionState = getConnectionState(server);
                    const statusToneClass = isDeployed
                      ? styles.statusDotGreen
                      : connectionState.toneClass;
                    const statusTooltip = isDeployed
                      ? "Device was included in the last successful deployment."
                      : hasRoles
                      ? connectionState.tooltip
                      : "No apps selected for this device.";
                    const tintAllowed =
                      !isDeployed &&
                      isConfigured &&
                      connectionState.rowClass !== styles.serverRowMissingCredentials;
                    const rowStyle = tintAllowed
                      ? createDeviceStyle(server.color, {
                          backgroundAlpha: 0.16,
                          borderAlpha: 0.56,
                          outlineAlpha: 0.86,
                        })
                      : undefined;
                    const roleText = hasRoles ? `${filteredRoles.length} apps` : "—";
                    const roleTitle = hasRoles
                      ? filteredRoles.sort().join(", ")
                      : "No apps selected";
                    return (
                      <div
                        key={alias}
                        className={`${styles.serverRow} ${
                          connectionState.rowClass
                        } ${isSelected ? styles.serverRowSelected : ""} ${
                          tintAllowed ? styles.serverRowTinted : ""
                        }`}
                        style={rowStyle}
                      >
                        <div
                          className={`${styles.statusCell} ${
                            isDeployed ? styles.statusCellDeployed : ""
                          }`}
                        >
                          <button
                            type="button"
                            className={styles.statusDotButton}
                            title={statusTooltip}
                            aria-label={`Status: ${
                              isDeployed ? "Deployed" : connectionState.label
                            }`}
                          >
                            <span
                              className={`${styles.statusDot} ${statusToneClass}`}
                              aria-hidden="true"
                            />
                          </button>
                        </div>
                        <span className={styles.aliasCell}>
                          <span className={styles.aliasWithEmoji}>
                            <span aria-hidden="true">{server.logoEmoji || "💻"}</span>
                            <span>{alias}</span>
                          </span>
                        </span>
                        <div className={styles.tableInputWrap}>
                          <input
                            value={server.host}
                            onChange={(event) =>
                              updateServer(alias, { host: event.target.value })
                            }
                            onBlur={(event) =>
                              void testConnectionForServer({
                                ...server,
                                host: event.currentTarget.value,
                              })
                            }
                            placeholder="example.com"
                            className={`${styles.tableInput} ${
                              hostMissing ? styles.tableInputMissing : ""
                            }`}
                          />
                          {hostMissing ? (
                            <span className={styles.cellAlert} title="Host is required.">
                              !
                            </span>
                          ) : null}
                        </div>
                        <div className={styles.tableInputWrap}>
                          <input
                            type="number"
                            value={server.port}
                            onChange={(event) =>
                              updateServer(alias, {
                                port: normalizePortValue(event.target.value),
                              })
                            }
                            onBlur={() =>
                              {
                                const normalized = normalizePortValue(server.port) || "22";
                                updateServer(alias, {
                                  port: normalized,
                                });
                                void testConnectionForServer({
                                  ...server,
                                  port: normalized,
                                });
                              }
                            }
                            placeholder="22"
                            min={1}
                            max={65535}
                            step={1}
                            inputMode="numeric"
                            className={`${styles.tableInput} ${
                              portInvalid ? styles.tableInputMissing : ""
                            }`}
                          />
                          {portInvalid ? (
                            <span
                              className={styles.cellAlert}
                              title="Port must be between 1 and 65535."
                            >
                              !
                            </span>
                          ) : null}
                        </div>
                        <div className={styles.tableInputWrap}>
                          <input
                            value={server.user}
                            onChange={(event) =>
                              updateServer(alias, { user: event.target.value })
                            }
                            onBlur={(event) =>
                              void testConnectionForServer({
                                ...server,
                                user: event.currentTarget.value,
                              })
                            }
                            placeholder="root"
                            className={`${styles.tableInput} ${
                              userMissing ? styles.tableInputMissing : ""
                            }`}
                          />
                          {userMissing ? (
                            <span className={styles.cellAlert} title="User is required.">
                              !
                            </span>
                          ) : null}
                        </div>
                        <div className={styles.appsCell} title={roleTitle}>
                          <span className={styles.roleCell}>{roleText}</span>
                          {appsMissing ? (
                            <span
                              className={styles.cellAlert}
                              title="Select at least one app for this device."
                            >
                              !
                            </span>
                          ) : null}
                        </div>
                        <div className={styles.credentialsCell}>
                          <button
                            type="button"
                            onClick={() => openCredentialsFor(alias)}
                            className={`${styles.smallButton} ${styles.smallButtonEnabled}`}
                          >
                            <i className="fa-solid fa-pen-to-square" aria-hidden="true" />
                            <span>Edit</span>
                          </button>
                        </div>
                        <div>
                          <input
                            type="checkbox"
                            checked={isSelected}
                            disabled={!isSelectable}
                            onChange={() => toggleDeployAlias(alias)}
                          />
                        </div>
                      </div>
                    );
                  })}
                </div>
                <div className={styles.serverTableFooter}>
                  <button
                    type="button"
                    onClick={() => setDeployRolePickerOpen(true)}
                    className={`${styles.smallButton} ${styles.smallButtonEnabled}`}
                    disabled={inventoryRoleIds.length === 0}
                    title="Choose apps passed to infinito deploy --id"
                  >
                    <i className="fa-solid fa-list-check" aria-hidden="true" />
                    <span>Apps: {deployRoleSummary}</span>
                  </button>
                  <button
                    onClick={selectAllDeployAliases}
                    disabled={selectableAliases.length === 0}
                    className={`${styles.smallButton} ${
                      selectableAliases.length === 0
                        ? styles.smallButtonDisabled
                        : styles.smallButtonEnabled
                    }`}
                  >
                    Select all
                  </button>
                  <button
                    onClick={deselectAllDeployAliases}
                    disabled={selectableAliases.length === 0}
                    className={`${styles.smallButton} ${
                      selectableAliases.length === 0
                        ? styles.smallButtonDisabled
                        : styles.smallButtonEnabled
                    }`}
                  >
                    Deselect all
                  </button>
                </div>
              </div>
            </div>

            <div
              className={`${styles.deployTabPanel} ${
                deployViewTab === "terminal" ? styles.deployTabPanelActive : ""
              }`}
              aria-hidden={deployViewTab !== "terminal"}
            >
              <div className={styles.liveWrap}>
                <LiveDeploymentView
                  baseUrl={baseUrl}
                  jobId={liveJobId}
                  compact
                  fill
                  hideControls
                  connectRequestKey={connectRequestKey}
                  cancelRequestKey={cancelRequestKey}
                  onJobIdSync={setLiveJobId}
                  onConnectedChange={setLiveConnected}
                  onCancelingChange={setLiveCanceling}
                  onErrorChange={setLiveError}
                  onStatusChange={handleDeploymentStatus}
                />
              </div>
            </div>
          </div>

          <div className={styles.deployFooter}>
            <input
              value={liveJobId}
              onChange={(event) => {
                setLiveError(null);
                setLiveJobId(event.target.value);
              }}
              placeholder="Job ID"
              className={`form-control ${styles.jobInput}`}
            />
            <button
              type="button"
              onClick={requestConnect}
              disabled={!liveJobId.trim() || liveConnected}
              className={`btn btn-info ${styles.footerButton}`}
            >
              {liveConnected ? "Connected" : "Connect"}
            </button>
            <button
              type="button"
              onClick={startDeployment}
              disabled={!canDeploy}
              className={`btn btn-success ${styles.footerButton}`}
            >
              {deploying ? "Deploying..." : "Deploy"}
            </button>
            <button
              type="button"
              onClick={requestCancel}
              disabled={!liveJobId.trim() || liveCanceling || !liveConnected}
              className={`btn btn-danger ${styles.footerButton}`}
            >
              {liveCanceling ? "Canceling..." : "Cancel"}
            </button>
          </div>
        </div>
      ),
    },
  ];

  const activeIndex = panels.findIndex((panel) => panel.key === activePanel);
  const hasPrev = activeIndex > 0;
  const hasNext = activeIndex >= 0 && activeIndex < panels.length - 1;

  return (
    <div className={styles.root}>
      <div className={styles.panels}>
        {panels.map((panel) => {
        const isOpen = activePanel === panel.key;
        const keepMounted = panel.key === "inventory";
        const mountContent = isOpen || keepMounted;
        return (
          <div
            key={panel.key}
            className={`${styles.panelItem} ${isOpen ? styles.panelItemOpen : ""}`}
          >
            <button
              onClick={() => setActivePanel(panel.key)}
              aria-expanded={isOpen}
              className={`${styles.panelHeader} ${
                isOpen ? styles.panelHeaderOpen : ""
              }`}
            >
              <span>{panel.title}</span>
              <span className={styles.panelIcon}>{isOpen ? "–" : "+"}</span>
            </button>
            {mountContent ? (
              <div
                className={`${styles.panelBody} ${
                  isOpen ? styles.panelBodyOpen : ""
                }`}
                aria-hidden={!isOpen}
              >
                {panel.content}
              </div>
            ) : null}
          </div>
        );
      })}
      </div>
      {deployRolePickerOpen ? (
        <div
          className={styles.rolePickerOverlay}
          onClick={() => setDeployRolePickerOpen(false)}
        >
          <div
            className={styles.rolePickerCard}
            onClick={(event) => event.stopPropagation()}
          >
            <div className={styles.rolePickerHeader}>
              <div>
                <h3 className={styles.rolePickerTitle}>Deploy App Filter</h3>
                <p className={`text-body-secondary ${styles.rolePickerHint}`}>
                  Selected apps are passed as <code>--id</code> for all selected
                  devices.
                </p>
              </div>
              <button
                type="button"
                onClick={() => setDeployRolePickerOpen(false)}
                className={`${styles.smallButton} ${styles.smallButtonEnabled}`}
              >
                Close
              </button>
            </div>

            <input
              value={deployRoleQuery}
              onChange={(event) => setDeployRoleQuery(event.target.value)}
              placeholder="Search apps"
              className={`form-control ${styles.rolePickerSearch}`}
            />

            <div className={styles.rolePickerActions}>
              <button
                type="button"
                onClick={selectAllDeployRoles}
                className={`${styles.smallButton} ${styles.smallButtonEnabled}`}
                disabled={inventoryRoleIds.length === 0}
              >
                Select all
              </button>
              <button
                type="button"
                onClick={deselectAllDeployRoles}
                className={`${styles.smallButton} ${styles.smallButtonEnabled}`}
                disabled={inventoryRoleIds.length === 0}
              >
                Clear all
              </button>
              <span className={`text-body-secondary ${styles.rolePickerCount}`}>
                {deployRoleSummary}
              </span>
            </div>

            <div className={styles.rolePickerList}>
              {deployRoleOptions.length === 0 ? (
                <span className={`text-body-secondary ${styles.rolePickerEmpty}`}>
                  No matching apps found.
                </span>
              ) : (
                deployRoleOptions.map((roleId) => (
                  <label key={roleId} className={styles.rolePickerItem}>
                    <input
                      type="checkbox"
                      checked={deployRoleFilter.has(roleId)}
                      onChange={() => toggleDeployRole(roleId)}
                    />
                    <span>{roleId}</span>
                  </label>
                ))
              )}
            </div>
          </div>
        </div>
      ) : null}
      <div className={styles.navRow}>
        <button
          onClick={() =>
            hasPrev && setActivePanel(panels[activeIndex - 1].key)
          }
          disabled={!hasPrev}
          className={`${styles.navButton} ${styles.backButton} ${
            hasPrev ? styles.backEnabled : styles.backDisabled
          }`}
        >
          Back
        </button>
        <button
          onClick={() =>
            hasNext && setActivePanel(panels[activeIndex + 1].key)
          }
          disabled={!hasNext}
          className={`${styles.navButton} ${styles.nextButton} ${
            hasNext ? styles.nextEnabled : styles.nextDisabled
          }`}
        >
          Next
        </button>
      </div>
    </div>
  );
}
