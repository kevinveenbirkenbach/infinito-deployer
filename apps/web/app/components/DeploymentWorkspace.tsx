"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import type { ReactNode } from "react";
import { createPortal } from "react-dom";
import RoleDashboard from "./RoleDashboard";
import DeploymentCredentialsForm from "./DeploymentCredentialsForm";
import WorkspacePanel from "./WorkspacePanel";
import LiveDeploymentView from "./LiveDeploymentView";
import { createInitialState } from "../lib/deploy_form";
import { buildDeploymentPayload } from "../lib/deployment_payload";

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

function ServerSwitcher({
  currentAlias,
  servers,
  onSelect,
  onCreate,
  onOpenServerTab,
}: {
  currentAlias: string;
  servers: ServerState[];
  onSelect: (alias: string) => void;
  onCreate: () => void;
  onOpenServerTab: () => void;
}) {
  const detailsRef = useRef<HTMLDetailsElement | null>(null);
  const close = () => {
    if (detailsRef.current) {
      detailsRef.current.open = false;
    }
  };
  const handleSelect = (alias: string) => {
    onSelect(alias);
    close();
  };
  const handleCreate = () => {
    onCreate();
    onOpenServerTab();
    close();
  };

  return (
    <details ref={detailsRef} style={{ position: "relative" }}>
      <summary
        style={{
          listStyle: "none",
          cursor: "pointer",
          padding: "6px 12px",
          borderRadius: 999,
          border: "1px solid var(--bs-body-color)",
          background: "var(--bs-body-color)",
          color: "var(--bs-body-bg)",
          fontSize: 12,
          display: "inline-flex",
          alignItems: "center",
          gap: 8,
        }}
      >
        <i className="fa-solid fa-server" aria-hidden="true" />
        <span>{currentAlias || "Select server"}</span>
      </summary>
      <div
        style={{
          position: "absolute",
          right: 0,
          marginTop: 8,
          padding: 10,
          borderRadius: 12,
          border: "1px solid var(--bs-border-color-translucent)",
          background: "var(--bs-body-bg)",
          boxShadow: "var(--deployer-shadow)",
          minWidth: 200,
          zIndex: 50,
          display: "grid",
          gap: 6,
        }}
      >
        {servers.length === 0 ? (
          <div className="text-body-secondary" style={{ fontSize: 12 }}>
            No servers yet.
          </div>
        ) : (
          servers.map((server) => (
            <button
              key={server.alias}
              onClick={() => handleSelect(server.alias)}
              style={{
                textAlign: "left",
                padding: "6px 10px",
                borderRadius: 10,
                border:
                  currentAlias === server.alias
                    ? "1px solid var(--bs-body-color)"
                    : "1px solid var(--bs-border-color)",
                background:
                  currentAlias === server.alias
                    ? "var(--bs-body-color)"
                    : "var(--bs-body-bg)",
                color:
                  currentAlias === server.alias
                    ? "var(--bs-body-bg)"
                    : "var(--bs-body-color)",
                fontSize: 12,
                cursor: "pointer",
              }}
            >
              {server.alias}
            </button>
          ))
        )}
        <button
          onClick={handleCreate}
          style={{
            marginTop: 4,
            padding: "6px 10px",
            borderRadius: 10,
            border: "1px dashed var(--bs-border-color)",
            background: "var(--bs-body-bg)",
            color: "var(--bs-body-color)",
            fontSize: 12,
            cursor: "pointer",
          }}
        >
          + New
        </button>
      </div>
    </details>
  );
}

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
  const [deployedAliases, setDeployedAliases] = useState<Set<string>>(
    new Set<string>()
  );
  const [serverListCollapsed, setServerListCollapsed] = useState(false);
  const lastDeploymentSelectionRef = useRef<string[] | null>(null);
  const [serverSwitcherTarget, setServerSwitcherTarget] =
    useState<HTMLElement | null>(null);

  const [workspaceId, setWorkspaceId] = useState<string | null>(null);
  const [inventoryReady, setInventoryReady] = useState(false);
  const [deploying, setDeploying] = useState(false);
  const [deployError, setDeployError] = useState<string | null>(null);
  const [jobId, setJobId] = useState<string | null>(null);
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
    if (typeof document === "undefined") return;
    setServerSwitcherTarget(
      document.getElementById("server-switcher-slot")
    );
  }, []);

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
    setDeployedAliases(new Set());
    setDeploySelection(new Set());
  }, [workspaceId]);

  const applySelectedRolesByAlias = useCallback(
    (rolesByAlias: Record<string, string[]>) => {
      const aliases = Object.keys(rolesByAlias || {})
        .map((alias) => alias.trim())
        .filter(Boolean);

      if (aliases.length === 0) {
        setSelectedByAlias({});
        setServers([]);
        setActiveAlias("");
        return;
      }

      setSelectedByAlias(() => {
        const next: Record<string, Set<string>> = {};
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
          if (aliases.includes(server.alias) && !seen.has(server.alias)) {
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

      if (!activeAlias || !aliases.includes(activeAlias)) {
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
        setAliasRenames((prev) => [...prev, { from: alias, to: nextAlias }]);
      }
    },
    [activeAlias]
  );

  const addServer = useCallback(() => {
    let idx = 1;
    let alias = `server-${idx}`;
    const existing = new Set(servers.map((server) => server.alias));
    while (existing.has(alias)) {
      idx += 1;
      alias = `server-${idx}`;
    }
    setServers((prev) => [...prev, createServer(alias)]);
    setSelectedByAlias((prev) => ({ ...prev, [alias]: new Set<string>() }));
    setActiveAlias(alias);
  }, [servers, createServer]);

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

  const deploymentPlan = useMemo(
    () =>
      buildDeploymentPayload({
        activeServer,
        selectedRolesByAlias,
        selectedAliases: Array.from(deploySelection),
        selectableAliases,
        workspaceId,
        inventoryReady,
      }),
    [
      activeServer,
      selectedRolesByAlias,
      deploySelection,
      selectableAliases,
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
      setJobId(created || null);
      if (created) {
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
      if (status.job_id && jobId && status.job_id !== jobId) return;
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
    [jobId]
  );

  const deployTableColumns =
    "32px minmax(140px, 1fr) minmax(180px, 2fr) minmax(120px, 1fr) minmax(200px, 2fr) 120px";

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
          activeAlias={activeAlias}
          onActiveAliasChange={setActiveAlias}
          onUpdateServer={updateServer}
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
        <div
          style={{
            display: "flex",
            flexDirection: "column",
            gap: 16,
            minHeight: 0,
            height: "100%",
          }}
        >
          <div
            style={{
              display: "flex",
              flexWrap: "wrap",
              gap: 12,
              alignItems: "center",
              justifyContent: "space-between",
            }}
          >
            <div style={{ display: "flex", gap: 10, alignItems: "center" }}>
              <button
                onClick={startDeployment}
                disabled={!canDeploy}
                style={{
                  padding: "10px 18px",
                  borderRadius: 999,
                  border: "1px solid var(--bs-border-color)",
                  background: canDeploy
                    ? "var(--deployer-accent)"
                    : "var(--deployer-disabled-bg)",
                  color: canDeploy
                    ? "var(--deployer-accent-contrast)"
                    : "var(--deployer-disabled-text)",
                  cursor: canDeploy ? "pointer" : "not-allowed",
                  fontWeight: 600,
                }}
              >
                {deploying ? "Starting..." : "Start deployment"}
              </button>
              {jobId ? (
                <div style={{ fontSize: 12 }}>
                  Job ID: <code>{jobId}</code>
                </div>
              ) : null}
            </div>
            <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
              <button
                onClick={selectAllDeployAliases}
                disabled={selectableAliases.length === 0}
                style={{
                  padding: "6px 12px",
                  borderRadius: 999,
                  border: "1px solid var(--bs-border-color)",
                  background: "var(--bs-body-bg)",
                  color: "var(--deployer-muted-ink)",
                  fontSize: 12,
                  cursor:
                    selectableAliases.length === 0 ? "not-allowed" : "pointer",
                }}
              >
                Select all
              </button>
              <button
                onClick={deselectAllDeployAliases}
                disabled={selectableAliases.length === 0}
                style={{
                  padding: "6px 12px",
                  borderRadius: 999,
                  border: "1px solid var(--bs-border-color)",
                  background: "var(--bs-body-bg)",
                  color: "var(--deployer-muted-ink)",
                  fontSize: 12,
                  cursor:
                    selectableAliases.length === 0 ? "not-allowed" : "pointer",
                }}
              >
                Deselect all
              </button>
              <button
                onClick={() =>
                  setServerListCollapsed((prev) => !prev)
                }
                style={{
                  padding: "6px 12px",
                  borderRadius: 999,
                  border: "1px solid var(--bs-border-color)",
                  background: "var(--bs-body-bg)",
                  color: "var(--deployer-muted-ink)",
                  fontSize: 12,
                  cursor: "pointer",
                }}
              >
                {serverListCollapsed ? "Show list" : "Hide list"}
              </button>
            </div>
          </div>

          {Object.keys(deploymentErrors).length > 0 ? (
            <div
              style={{
                padding: 12,
                borderRadius: 12,
                background: "var(--bs-tertiary-bg)",
                border: "1px solid var(--bs-border-color-translucent)",
                fontSize: 12,
              }}
            >
              {Object.values(deploymentErrors).map((message, idx) => (
                <div key={idx}>{message}</div>
              ))}
            </div>
          ) : null}

          {deployError ? (
            <div
              style={{
                color: "var(--bs-danger-text-emphasis)",
                fontSize: 12,
              }}
            >
              {deployError}
            </div>
          ) : null}

          <div
            style={{
              display: "flex",
              flexDirection: "column",
              gap: 12,
              flex: 1,
              minHeight: 0,
            }}
          >
            {!serverListCollapsed ? (
              <div
                style={{
                  maxHeight: "50%",
                  overflow: "auto",
                  borderRadius: 12,
                  border: "1px solid var(--bs-border-color-translucent)",
                  background: "var(--bs-body-bg)",
                  padding: 12,
                  display: "grid",
                  gap: 10,
                }}
              >
                <div
                  style={{
                    display: "grid",
                    gridTemplateColumns: deployTableColumns,
                    gap: 10,
                    fontSize: 11,
                    color: "var(--deployer-muted-ink)",
                    textTransform: "uppercase",
                    letterSpacing: "0.08em",
                  }}
                >
                  <span>Status</span>
                  <span>Alias</span>
                  <span>Host</span>
                  <span>User</span>
                  <span>Roles</span>
                  <span>Select</span>
                </div>
                {servers.map((server) => {
                  const alias = String(server.alias || "").trim();
                  if (!alias) return null;
                  const roles = selectedRolesByAlias?.[alias] ?? [];
                  const hasRoles = Array.isArray(roles) && roles.length > 0;
                  const isDeployed = deployedAliases.has(alias);
                  const isSelectable = hasRoles && !isDeployed;
                  const isSelected = deploySelection.has(alias);
                  const statusLabel = isDeployed
                    ? "Deployed"
                    : hasRoles
                    ? "Pending"
                    : "No roles";
                  const roleText = hasRoles
                    ? roles.join(", ")
                    : "No roles selected";
                  return (
                    <div
                      key={alias}
                      style={{
                        display: "grid",
                        gridTemplateColumns: deployTableColumns,
                        gap: 10,
                        alignItems: "center",
                        padding: "8px 10px",
                        borderRadius: 10,
                        border: isSelected
                          ? "1px solid var(--bs-body-color)"
                          : "1px solid var(--bs-border-color-translucent)",
                        background: "var(--bs-body-bg)",
                        fontSize: 12,
                      }}
                    >
                      <div
                        style={{
                          display: "flex",
                          alignItems: "center",
                          gap: 6,
                          color: isDeployed
                            ? "var(--bs-success-text-emphasis)"
                            : "var(--deployer-muted-ink)",
                        }}
                      >
                        {isDeployed ? (
                          <i className="fa-solid fa-check" aria-hidden="true" />
                        ) : (
                          <span style={{ fontSize: 10 }}>•</span>
                        )}
                        <span>{statusLabel}</span>
                      </div>
                      <span style={{ fontWeight: 600 }}>{alias}</span>
                      <span>{server.host || "—"}</span>
                      <span>{server.user || "—"}</span>
                      <span
                        className="text-body-secondary"
                        style={{
                          overflow: "hidden",
                          textOverflow: "ellipsis",
                          whiteSpace: "nowrap",
                        }}
                        title={roleText}
                      >
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
                    </div>
                  );
                })}
              </div>
            ) : null}

            <div style={{ flex: 1, minHeight: 0 }}>
              <LiveDeploymentView
                baseUrl={baseUrl}
                jobId={jobId ?? ""}
                autoConnect
                compact
                fill
                onStatusChange={handleDeploymentStatus}
              />
            </div>
          </div>
        </div>
      ),
    },
  ];

  const activeIndex = panels.findIndex((panel) => panel.key === activePanel);
  const hasPrev = activeIndex > 0;
  const hasNext = activeIndex >= 0 && activeIndex < panels.length - 1;

  const serverSwitcher = serverSwitcherTarget
    ? createPortal(
        <ServerSwitcher
          currentAlias={activeAlias}
          servers={servers}
          onSelect={setActiveAlias}
          onCreate={addServer}
          onOpenServerTab={() => setActivePanel("server")}
        />,
        serverSwitcherTarget
      )
    : null;

  return (
    <div
      style={{
        display: "flex",
        flexDirection: "column",
        gap: 16,
        height: "100%",
        minHeight: 0,
      }}
    >
      {serverSwitcher}
      <div
        style={{
          display: "flex",
          flexDirection: "column",
          gap: 12,
          flex: 1,
          minHeight: 0,
        }}
      >
        {panels.map((panel) => {
        const isOpen = activePanel === panel.key;
        const keepMounted = panel.key === "inventory";
        const mountContent = isOpen || keepMounted;
        return (
          <div
            key={panel.key}
            style={{
              display: "flex",
              flexDirection: "column",
              flex: isOpen ? 1 : "0 0 auto",
              minHeight: 0,
            }}
          >
            <button
              onClick={() => setActivePanel(panel.key)}
              aria-expanded={isOpen}
              style={{
                width: "100%",
                display: "flex",
                justifyContent: "space-between",
                alignItems: "center",
                padding: "12px 16px",
                borderRadius: isOpen ? "16px 16px 0 0" : 16,
                border: "1px solid var(--bs-border-color-translucent)",
                borderBottom: isOpen
                  ? "none"
                  : "1px solid var(--bs-border-color-translucent)",
                background: isOpen
                  ? "var(--bs-body-bg)"
                  : "var(--deployer-card-bg-soft)",
                cursor: "pointer",
                fontFamily: "var(--font-display)",
                fontSize: 16,
              }}
            >
              <span>{panel.title}</span>
              <span style={{ fontSize: 18 }}>{isOpen ? "–" : "+"}</span>
            </button>
            {mountContent ? (
              <div
                style={{
                  marginTop: 0,
                  border: "1px solid var(--bs-border-color-translucent)",
                  borderTop: "none",
                  borderRadius: "0 0 16px 16px",
                  padding: 12,
                  background: "var(--bs-body-bg)",
                  display: isOpen ? "block" : "none",
                  flex: 1,
                  minHeight: 0,
                  overflow: "auto",
                }}
                aria-hidden={!isOpen}
              >
                {panel.content}
              </div>
            ) : null}
          </div>
        );
      })}
      </div>
      <div
        style={{
          marginTop: 8,
          display: "flex",
          justifyContent: "space-between",
          gap: 12,
        }}
      >
        <button
          onClick={() =>
            hasPrev && setActivePanel(panels[activeIndex - 1].key)
          }
          disabled={!hasPrev}
          style={{
            padding: "8px 14px",
            borderRadius: 999,
            border: "1px solid var(--bs-border-color)",
            background: hasPrev
              ? "var(--bs-body-bg)"
              : "var(--deployer-disabled-bg)",
            color: hasPrev
              ? "var(--deployer-muted-ink)"
              : "var(--deployer-disabled-text)",
            cursor: hasPrev ? "pointer" : "not-allowed",
            fontSize: 12,
          }}
        >
          Back
        </button>
        <button
          onClick={() =>
            hasNext && setActivePanel(panels[activeIndex + 1].key)
          }
          disabled={!hasNext}
          style={{
            padding: "8px 14px",
            borderRadius: 999,
            border: "1px solid var(--bs-body-color)",
            background: hasNext
              ? "var(--bs-body-color)"
              : "var(--deployer-disabled-bg)",
            color: hasNext
              ? "var(--bs-body-bg)"
              : "var(--deployer-disabled-text)",
            cursor: hasNext ? "pointer" : "not-allowed",
            fontSize: 12,
          }}
        >
          Next
        </button>
      </div>
    </div>
  );
}
