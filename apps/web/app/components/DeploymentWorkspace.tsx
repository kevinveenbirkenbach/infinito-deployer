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

type DeploymentWorkspaceProps = {
  baseUrl: string;
  onJobCreated?: (jobId: string) => void;
};

export default function DeploymentWorkspace({
  baseUrl,
  onJobCreated,
}: DeploymentWorkspaceProps) {
  const [roles, setRoles] = useState<Role[]>([]);
  const [rolesLoading, setRolesLoading] = useState(true);
  const [rolesError, setRolesError] = useState<string | null>(null);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [credentials, setCredentials] = useState(createInitialState());
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

  const selectedRoles = useMemo(
    () => Array.from(selected.values()),
    [selected]
  );

  const applySelectedRoles = useCallback(
    (rolesFromInventory: string[]) => {
      const available = roles.map((role) => role.id);
      const allowed = available.length ? new Set(available) : null;
      const next = (rolesFromInventory || []).filter((id) =>
        allowed ? allowed.has(id) : true
      );
      setSelected(new Set(next));
    },
    [roles]
  );

  const toggleSelected = (id: string) => {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(id)) {
        next.delete(id);
      } else {
        next.add(id);
      }
      return next;
    });
  };

  const deploymentPlan = useMemo(
    () =>
      buildDeploymentPayload({
        credentials,
        selectedRoles,
        workspaceId,
        inventoryReady,
      }),
    [credentials, selectedRoles, workspaceId, inventoryReady]
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

  return (
    <>
      <RoleDashboard
        roles={roles}
        loading={rolesLoading}
        error={rolesError}
        selected={selected}
        onToggleSelected={toggleSelected}
      />

      <DeploymentCredentialsForm
        baseUrl={baseUrl}
        value={credentials}
        onChange={setCredentials}
      />

      <WorkspacePanel
        baseUrl={baseUrl}
        selectedRoles={selectedRoles}
        credentials={credentials}
        onCredentialsPatch={(patch) =>
          setCredentials((prev) => ({ ...prev, ...patch }))
        }
        onInventoryReadyChange={setInventoryReady}
        onSelectedRolesChange={applySelectedRoles}
        onWorkspaceIdChange={setWorkspaceId}
      />

      <section
        style={{
          marginTop: 28,
          padding: 24,
          borderRadius: 24,
          background:
            "linear-gradient(120deg, rgba(15, 23, 42, 0.95), rgba(2, 6, 23, 0.95))",
          border: "1px solid rgba(148, 163, 184, 0.3)",
          color: "#e2e8f0",
          boxShadow: "0 18px 40px rgba(15, 23, 42, 0.25)",
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
                color: "#f8fafc",
              }}
            >
              Launch Deployment
            </h2>
            <p style={{ margin: "8px 0 0", color: "#cbd5f5" }}>
              Kick off a real run using the selected roles, credentials, and
              the workspace inventory. The job ID streams live logs below.
            </p>
          </div>
          <div
            style={{
              flex: "1 1 240px",
              alignSelf: "center",
              textAlign: "right",
              color: "#e2e8f0",
              fontSize: 13,
            }}
          >
            Selected roles:{" "}
            <strong>{selectedRoles.length || "none"}</strong>
            <br />
            Target: <strong>{credentials.deployTarget || "—"}</strong>
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
          <button
            onClick={startDeployment}
            disabled={!canDeploy}
            style={{
              padding: "10px 18px",
              borderRadius: 999,
              border: "1px solid rgba(248, 250, 252, 0.4)",
              background: canDeploy ? "#38bdf8" : "#1e293b",
              color: canDeploy ? "#0f172a" : "#94a3b8",
              cursor: canDeploy ? "pointer" : "not-allowed",
              fontWeight: 600,
            }}
          >
            {deploying ? "Starting..." : "Start deployment"}
          </button>
          {jobId ? (
            <div style={{ fontSize: 12, color: "#e2e8f0" }}>
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
              background: "rgba(248, 250, 252, 0.1)",
              border: "1px solid rgba(148, 163, 184, 0.3)",
              fontSize: 12,
              color: "#f8fafc",
            }}
          >
            {Object.values(deploymentErrors).map((message, idx) => (
              <div key={idx}>{message}</div>
            ))}
          </div>
        ) : null}

        {deployError ? (
          <div style={{ marginTop: 8, color: "#fca5a5", fontSize: 12 }}>
            {deployError}
          </div>
        ) : null}
      </section>
    </>
  );
}
