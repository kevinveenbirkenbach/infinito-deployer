"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import type { CSSProperties, ReactNode } from "react";
import { createPortal } from "react-dom";
import RoleDashboard from "./RoleDashboard";
import DeploymentCredentialsForm from "./DeploymentCredentialsForm";
import WorkspacePanel from "./WorkspacePanel";
import LiveDeploymentView from "./LiveDeploymentView";
import DeploymentWorkspaceServerSwitcher from "./DeploymentWorkspaceServerSwitcher";
import styles from "./DeploymentWorkspace.module.css";
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
  const deployTableStyle = {
    "--deploy-table-columns": deployTableColumns,
  } as CSSProperties;

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
        <div className={styles.deployLayout}>
          <div className={styles.deployTop}>
            <div className={styles.deployTopLeft}>
              <button
                onClick={startDeployment}
                disabled={!canDeploy}
                className={`${styles.startButton} ${
                  canDeploy ? styles.startEnabled : styles.startDisabled
                }`}
              >
                {deploying ? "Starting..." : "Start deployment"}
              </button>
              {jobId ? (
                <div className={styles.jobInfo}>
                  Job ID: <code>{jobId}</code>
                </div>
              ) : null}
            </div>
            <div className={styles.deployTopRight}>
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
              <button
                onClick={() => setServerListCollapsed((prev) => !prev)}
                className={`${styles.smallButton} ${styles.smallButtonEnabled}`}
              >
                {serverListCollapsed ? "Show list" : "Hide list"}
              </button>
            </div>
          </div>

          {Object.keys(deploymentErrors).length > 0 ? (
            <div className={styles.errorList}>
              {Object.values(deploymentErrors).map((message, idx) => (
                <div key={idx}>{message}</div>
              ))}
            </div>
          ) : null}

          {deployError ? <div className={styles.errorText}>{deployError}</div> : null}

          <div className={styles.deployBody}>
            {!serverListCollapsed ? (
              <div className={styles.serverList} style={deployTableStyle}>
                <div className={styles.serverTableHeader}>
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
                  const rowStatusLabel = isDeployed
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
                      className={`${styles.serverRow} ${
                        isSelected ? styles.serverRowSelected : ""
                      }`}
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
                      <span
                        className={`text-body-secondary ${styles.roleCell}`}
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

            <div className={styles.liveWrap}>
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
        <DeploymentWorkspaceServerSwitcher
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
    <div className={styles.root}>
      {serverSwitcher}
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
