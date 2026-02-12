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
import type { ConnectionResult } from "./deployment-credentials/types";

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

type ServerState = {
  alias: string;
  host: string;
  port: string;
  user: string;
  authMethod: string;
  password: string;
  privateKey: string;
  publicKey: string;
  keyAlgorithm: string;
  keyPassphrase: string;
};

type AliasRename = { from: string; to: string };

type DeploymentWorkspaceProps = {
  baseUrl: string;
  onJobCreated?: (jobId: string) => void;
};

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
      host: initial.host,
      port: initial.port,
      user: initial.user,
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
    (alias: string): ServerState => ({
      alias,
      host: "",
      port: "",
      user: "",
      authMethod: "password",
      password: "",
      privateKey: "",
      publicKey: "",
      keyAlgorithm: "ed25519",
      keyPassphrase: "",
    }),
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
      const roles = selectedRolesByAlias?.[alias] ?? [];
      const hasRoles = Array.isArray(roles) && roles.length > 0;
      if (hasRoles && !deployedAliases.has(alias)) {
        out.push(alias);
      }
    });
    return out;
  }, [servers, selectedRolesByAlias, deployedAliases]);

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
    setLiveJobId("");
    setLiveConnected(false);
    setLiveCanceling(false);
    setLiveError(null);
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

        return ordered.map((alias) => byAlias.get(alias) ?? createServer(alias));
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
        return next;
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
      let alias = "server";
      let idx = 2;
      while (existing.has(alias)) {
        alias = `server-${idx}`;
        idx += 1;
      }

      setServers((prev) => [...prev, createServer(alias)]);
      setSelectedByAlias((prev) => ({ ...prev, [alias]: new Set<string>() }));
      setActiveAlias(alias);
    },
    [servers, createServer]
  );

  const removeServer = useCallback(
    async (alias: string) => {
      if (!alias) return;
      if (!workspaceId || !inventoryReady) {
        throw new Error("Workspace inventory is not ready yet.");
      }
      setAliasDeletes((prev) => [...prev, alias]);
      setServers((prev) => {
        const next = prev.filter((server) => server.alias !== alias);
        if (activeAlias === alias) {
          setActiveAlias(next[0]?.alias ?? "");
        }
        return next;
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
      setSelectionTouched(true);
    },
    [activeAlias, inventoryReady, workspaceId]
  );

  const toggleSelected = (id: string) => {
    if (!activeAlias) return;
    setSelectedByAlias((prev) => {
      const next: Record<string, Set<string>> = { ...prev };
      const set = next[activeAlias]
        ? new Set<string>(next[activeAlias])
        : new Set<string>();
      if (set.has(id)) {
        set.delete(id);
      } else {
        set.add(id);
      }
      next[activeAlias] = set;
      return next;
    });
    setSelectionTouched(true);
  };

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
      host: activeServer?.host ?? "",
      port: activeServer?.port ?? "",
      user: activeServer?.user ?? "",
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
    "minmax(150px, 1.3fr) minmax(120px, 1fr) minmax(160px, 1.8fr) minmax(120px, 1fr) minmax(220px, 2.1fr) 72px 54px";
  const deployTableStyle = {
    "--deploy-table-columns": deployTableColumns,
  } as CSSProperties;

  const hasCredentials = (server: ServerState) => {
    const host = String(server.host || "").trim();
    const user = String(server.user || "").trim();
    const authReady =
      server.authMethod === "private_key"
        ? Boolean(String(server.privateKey || "").trim())
        : Boolean(String(server.password || "").trim());
    return Boolean(host && user && authReady);
  };

  const getConnectionState = (server: ServerState) => {
    const credentialsReady = hasCredentials(server);
    const status = connectionResults[server.alias];
    const pingFailed = status?.ping_ok === false;
    const fullyConnected = status?.ping_ok === true && status?.ssh_ok === true;

    if (credentialsReady && fullyConnected) {
      return {
        rowClass: styles.serverRowHealthy,
        label: "Connected",
        iconClass: "fa-solid fa-circle-check",
        iconTone: styles.iconSuccess,
      };
    }
    if (!credentialsReady && pingFailed) {
      return {
        rowClass: styles.serverRowCritical,
        label: "Ping fail + missing credentials",
        iconClass: "fa-solid fa-circle-xmark",
        iconTone: styles.iconDanger,
      };
    }
    if (!credentialsReady) {
      return {
        rowClass: styles.serverRowMissingCredentials,
        label: "Missing credentials",
        iconClass: "fa-solid fa-key",
        iconTone: styles.iconMuted,
      };
    }
    return {
      rowClass: styles.serverRowWarning,
      label: status ? "No SSH connection" : "Credentials ready",
      iconClass: "fa-solid fa-bolt",
      iconTone: styles.iconWarning,
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

  const serverSwitcher = (
    <DeploymentWorkspaceServerSwitcher
      currentAlias={activeAlias}
      servers={servers}
      onSelect={setActiveAlias}
      onCreate={addServer}
      onOpenServerTab={() => setActivePanel("server")}
    />
  );

  const panels: {
    key: "store" | "server" | "inventory" | "deploy";
    title: string;
    content: ReactNode;
  }[] = [
    {
      key: "store",
      title: "Store",
      content: (
        <RoleDashboard
          roles={roles}
          loading={rolesLoading}
          error={rolesError}
          selected={new Set<string>(selectedRoles)}
          onToggleSelected={toggleSelected}
          activeAlias={activeAlias}
          serverSwitcher={serverSwitcher}
          compact
        />
      ),
    },
    {
      key: "server",
      title: "Server",
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
          onAddServer={addServer}
          compact
        />
      ),
    },
    {
      key: "inventory",
      title: "Inventory",
      content: (
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
          selectionTouched={selectionTouched}
          compact
        />
      ),
    },
    {
      key: "deploy",
      title: "Deploy",
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
              Live log
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

          {Object.keys(deploymentErrors).length > 0 ? (
            <div className={styles.errorList}>
              {Object.values(deploymentErrors).map((message, idx) => (
                <div key={idx}>{message}</div>
              ))}
            </div>
          ) : null}

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
                  <span className={styles.serverTableTitle}>Live log</span>
                  <span className={`text-body-secondary ${styles.serverTableMeta}`}>
                    {deploySelection.size} selected
                  </span>
                </div>
                <div className={styles.serverTableHeader}>
                  <span>Status</span>
                  <span>Alias</span>
                  <span>Host</span>
                  <span>User</span>
                  <span>Apps</span>
                  <span>Select</span>
                  <span>Icon</span>
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
                    const isSelectable = hasRoles && !isDeployed;
                    const isSelected = deploySelection.has(alias);
                    const connectionState = getConnectionState(server);
                    const rowStatusLabel = isDeployed
                      ? "Deployed"
                      : hasRoles
                      ? connectionState.label
                      : "No apps";
                    const roleText = hasRoles ? `${filteredRoles.length} apps` : "—";
                    const roleTitle = hasRoles
                      ? filteredRoles.sort().join(", ")
                      : "No apps selected";
                    return (
                      <div
                        key={alias}
                        className={`${styles.serverRow} ${
                          connectionState.rowClass
                        } ${isSelected ? styles.serverRowSelected : ""}`}
                      >
                        <div
                          className={`${styles.statusCell} ${
                            isDeployed ? styles.statusCellDeployed : ""
                          }`}
                        >
                          {isDeployed ? (
                            <i className="fa-solid fa-check" aria-hidden="true" />
                          ) : (
                            <span className={styles.statusDot}>•</span>
                          )}
                          <span>{rowStatusLabel}</span>
                        </div>
                        <span className={styles.aliasCell}>{alias}</span>
                        <span>{server.host || "—"}</span>
                        <span>{server.user || "—"}</span>
                        <span className={styles.roleCell} title={roleTitle}>
                          {roleText}
                        </span>
                        <div>
                          <input
                            type="checkbox"
                            checked={isSelected}
                            disabled={!isSelectable}
                            onChange={() => toggleDeployAlias(alias)}
                          />
                        </div>
                        <div className={`${styles.healthCell} ${connectionState.iconTone}`}>
                          <i className={connectionState.iconClass} aria-hidden="true" />
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
                  servers.
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
