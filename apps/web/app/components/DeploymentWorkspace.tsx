"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import RoleDashboard from "./RoleDashboard";
import DeploymentCredentialsForm from "./DeploymentCredentialsForm";
import WorkspacePanel from "./WorkspacePanel";
import { createInitialState } from "../lib/deploy_form";
import { buildDeploymentPayload } from "../lib/deployment_payload";

type Role = {
  id: string;
  display_name: string;
  status: string;
  description: string;
  deployment_targets: string[];
  logo?: { source: string; css_class?: string | null; url?: string | null };
};

type ServerState = {
  alias: string;
  host: string;
  user: string;
  authMethod: string;
  password: string;
  privateKey: string;
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
  const defaultAlias = initial.alias;
  const [roles, setRoles] = useState<Role[]>([]);
  const [rolesLoading, setRolesLoading] = useState(true);
  const [rolesError, setRolesError] = useState<string | null>(null);
  const [deployScope, setDeployScope] = useState<"active" | "all">("active");
  const [servers, setServers] = useState<ServerState[]>([
    {
      alias: initial.alias,
      host: initial.host,
      user: initial.user,
      authMethod: initial.authMethod,
      password: initial.password,
      privateKey: initial.privateKey,
    },
  ]);
  const [activeAlias, setActiveAlias] = useState(initial.alias);
  const [selectedByAlias, setSelectedByAlias] = useState<
    Record<string, Set<string>>
  >(() => ({ [initial.alias]: new Set<string>() }));
  const [aliasRenames, setAliasRenames] = useState<AliasRename[]>([]);
  const [selectionTouched, setSelectionTouched] = useState(false);

  const [workspaceId, setWorkspaceId] = useState<string | null>(null);
  const [inventoryReady, setInventoryReady] = useState(false);
  const [deploying, setDeploying] = useState(false);
  const [deployError, setDeployError] = useState<string | null>(null);
  const [jobId, setJobId] = useState<string | null>(null);

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
    if (servers.length <= 1 && deployScope === "all") {
      setDeployScope("active");
    }
  }, [servers, deployScope]);

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
      user: "",
      authMethod: "password",
      password: "",
      privateKey: "",
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

  const applySelectedRolesByAlias = useCallback(
    (rolesByAlias: Record<string, string[]>) => {
      const rawAliases = Object.keys(rolesByAlias || {}).filter(Boolean);
      const hasRealAliases = rawAliases.some((alias) => alias !== defaultAlias);
      const placeholderRoles = rolesByAlias?.[defaultAlias] ?? [];
      const placeholderServer = servers.find(
        (server) => server.alias === defaultAlias
      );
      const placeholderHasData = !!(
        placeholderServer &&
        (placeholderServer.host ||
          placeholderServer.user ||
          placeholderServer.password ||
          placeholderServer.privateKey)
      );

      let aliases = rawAliases;
      if (hasRealAliases && !placeholderHasData && placeholderRoles.length === 0) {
        aliases = rawAliases.filter((alias) => alias !== defaultAlias);
      }
      if (aliases.length === 0) {
        aliases = [defaultAlias];
      }

      setSelectedByAlias((prev) => {
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

      if (
        !activeAlias ||
        !aliases.includes(activeAlias) ||
        (activeAlias === defaultAlias && aliases[0] !== defaultAlias)
      ) {
        setActiveAlias(aliases[0] ?? "");
      }
    },
    [activeAlias, createServer, defaultAlias, servers]
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

  const deploymentPlan = useMemo(
    () =>
      buildDeploymentPayload({
        deployScope,
        activeServer,
        selectedRolesByAlias,
        activeAlias,
        workspaceId,
        inventoryReady,
      }),
    [
      deployScope,
      activeServer,
      selectedRolesByAlias,
      activeAlias,
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
      user: activeServer?.user ?? "",
      authMethod: activeServer?.authMethod ?? "password",
    };
  }, [activeServer]);

  return (
    <>
      <RoleDashboard
        roles={roles}
        loading={rolesLoading}
        error={rolesError}
        selected={new Set<string>(selectedRoles)}
        onToggleSelected={toggleSelected}
        activeAlias={activeAlias}
      />

      <DeploymentCredentialsForm
        baseUrl={baseUrl}
        servers={servers}
        activeAlias={activeAlias}
        onActiveAliasChange={setActiveAlias}
        onUpdateServer={updateServer}
        onAddServer={addServer}
      />

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
        selectionTouched={selectionTouched}
      />

      <section
        style={{
          marginTop: 28,
          padding: 24,
          borderRadius: 24,
          background: "var(--deployer-panel-dark-bg)",
          border: "1px solid var(--deployer-panel-dark-border)",
          color: "var(--deployer-panel-dark-text)",
          boxShadow: "var(--deployer-shadow-strong)",
        }}
      >
        <div style={{ display: "flex", flexWrap: "wrap", gap: 16 }}>
          <div style={{ flex: "1 1 320px" }}>
            <h2
              style={{
                margin: 0,
                fontFamily: "var(--font-display)",
                fontSize: 26,
                letterSpacing: "-0.02em",
              }}
            >
              Launch Deployment
            </h2>
            <p
              style={{
                margin: "8px 0 0",
                color: "var(--deployer-panel-dark-muted)",
              }}
            >
              Kick off a real run using the selected roles, credentials, and
              the workspace inventory. The job ID streams live logs below.
            </p>
          </div>
          <div
            style={{
              flex: "1 1 240px",
              alignSelf: "center",
              textAlign: "right",
              fontSize: 13,
            }}
          >
            Selected roles: <strong>{selectedRoles.length || "none"}</strong>
            <br />
            Active server: <strong>{activeAlias || "—"}</strong>
          </div>
        </div>

        <div
          style={{
            marginTop: 16,
            display: "flex",
            flexWrap: "wrap",
            gap: 12,
            alignItems: "center",
          }}
        >
          <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
            <span
              style={{
                fontSize: 12,
                color: "var(--deployer-panel-dark-muted)",
              }}
            >
              Deploy scope:
            </span>
            {["active", "all"].map((scope) => {
              const disabled = servers.length <= 1 && scope === "all";
              const isActive = deployScope === scope;
              return (
                <button
                  key={scope}
                  onClick={() => !disabled && setDeployScope(scope as any)}
                  style={{
                    padding: "6px 12px",
                    borderRadius: 999,
                    border: "1px solid var(--deployer-panel-dark-border)",
                    background: isActive
                      ? "var(--deployer-accent)"
                      : "var(--deployer-panel-dark-pill-bg)",
                    color: isActive
                      ? "var(--deployer-accent-contrast)"
                      : "var(--deployer-panel-dark-text)",
                    cursor: disabled ? "not-allowed" : "pointer",
                    fontSize: 12,
                    opacity: disabled ? 0.5 : 1,
                  }}
                >
                  {scope === "active" ? "Active" : "All"}
                </button>
              );
            })}
          </div>
          <button
            onClick={startDeployment}
            disabled={!canDeploy}
            style={{
              padding: "10px 18px",
              borderRadius: 999,
              border: "1px solid var(--deployer-panel-dark-border)",
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

        {Object.keys(deploymentErrors).length > 0 ? (
          <div
            style={{
              marginTop: 12,
              padding: 12,
              borderRadius: 12,
              background: "var(--deployer-panel-dark-subtle-bg)",
              border: "1px solid var(--deployer-panel-dark-border)",
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
              marginTop: 8,
              color: "var(--bs-danger-text-emphasis)",
              fontSize: 12,
            }}
          >
            {deployError}
          </div>
        ) : null}
      </section>
    </>
  );
}
