"use client";

import { useEffect, useMemo, useState } from "react";
import RoleDashboard from "./RoleDashboard";
import DeploymentCredentialsForm from "./DeploymentCredentialsForm";
import InventoryVariablesPanel from "./InventoryVariablesPanel";
import { createInitialState, validateForm } from "../lib/deploy_form";

type Role = {
  id: string;
  display_name: string;
  status: string;
  description: string;
  deployment_targets: string[];
  logo?: { source: string; css_class?: string | null; url?: string | null };
};

export default function DeploymentWorkspace({ baseUrl }: { baseUrl: string }) {
  const [roles, setRoles] = useState<Role[]>([]);
  const [rolesLoading, setRolesLoading] = useState(true);
  const [rolesError, setRolesError] = useState<string | null>(null);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [credentials, setCredentials] = useState(createInitialState());

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

  const credentialErrors = useMemo(
    () => validateForm(credentials),
    [credentials]
  );

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

      <InventoryVariablesPanel
        baseUrl={baseUrl}
        selectedRoles={selectedRoles}
        credentials={credentials}
      />

      {Object.keys(credentialErrors).length > 0 ? (
        <div
          style={{
            marginTop: 12,
            padding: 12,
            borderRadius: 12,
            background: "#fef2f2",
            color: "#991b1b",
            fontSize: 12,
          }}
        >
          Complete the credentials form to enable inventory preview.
        </div>
      ) : null}
    </>
  );
}
