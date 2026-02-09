"use client";

import { useMemo, useState } from "react";
import { filterRoles } from "../lib/role_filter";

type RoleLogo = {
  source: string;
  css_class?: string | null;
  url?: string | null;
};

type Role = {
  id: string;
  display_name: string;
  status: string;
  description: string;
  deployment_targets: string[];
  logo?: RoleLogo | null;
};

const STATUS_ORDER = [
  "stable",
  "beta",
  "alpha",
  "pre-alpha",
  "deprecated",
];

const STATUS_COLORS: Record<
  string,
  { bg: string; fg: string; border: string }
> = {
  stable: { bg: "#dcfce7", fg: "#166534", border: "#86efac" },
  beta: { bg: "#dbeafe", fg: "#1e3a8a", border: "#93c5fd" },
  alpha: { bg: "#fde68a", fg: "#92400e", border: "#fcd34d" },
  "pre-alpha": { bg: "#fee2e2", fg: "#991b1b", border: "#fecaca" },
  deprecated: { bg: "#e5e7eb", fg: "#374151", border: "#d1d5db" },
};

function sortStatuses(statuses: string[]): string[] {
  const order = new Map(STATUS_ORDER.map((s, idx) => [s, idx]));
  return [...statuses].sort((a, b) => {
    const aIdx = order.get(a) ?? 999;
    const bIdx = order.get(b) ?? 999;
    if (aIdx === bIdx) {
      return a.localeCompare(b);
    }
    return aIdx - bIdx;
  });
}

function initials(name: string) {
  const parts = name.split(/\s+/).filter(Boolean);
  if (parts.length === 0) return "?";
  if (parts.length === 1) return parts[0].slice(0, 2).toUpperCase();
  return (parts[0][0] + parts[1][0]).toUpperCase();
}

type RoleDashboardProps = {
  roles: Role[];
  loading: boolean;
  error: string | null;
  selected: Set<string>;
  onToggleSelected: (id: string) => void;
};

export default function RoleDashboard({
  roles,
  loading,
  error,
  selected,
  onToggleSelected,
}: RoleDashboardProps) {
  const [query, setQuery] = useState("");
  const [statusFilter, setStatusFilter] = useState<Set<string>>(
    new Set()
  );
  const [targetFilter, setTargetFilter] = useState("all");

  const statusOptions = useMemo(() => {
    const set = new Set<string>();
    roles.forEach((role) => {
      if (role.status) set.add(role.status);
    });
    return sortStatuses(Array.from(set));
  }, [roles]);

  const filteredRoles = useMemo(() => {
    return filterRoles(roles, {
      statuses: statusFilter,
      target: targetFilter,
      query,
    });
  }, [roles, statusFilter, targetFilter, query]);

  const selectedCount = selected.size;
  const filteredSelectedCount = filteredRoles.filter((role) =>
    selected.has(role.id)
  ).length;
  const hiddenSelected = Math.max(
    0,
    selectedCount - filteredSelectedCount
  );

  const toggleStatus = (status: string) => {
    setStatusFilter((prev) => {
      const next = new Set(prev);
      if (next.has(status)) {
        next.delete(status);
      } else {
        next.add(status);
      }
      return next;
    });
  };

  return (
    <section
      style={{
        marginTop: 28,
        padding: 24,
        borderRadius: 24,
        background:
          "linear-gradient(120deg, rgba(250, 245, 255, 0.9), rgba(236, 253, 245, 0.85))",
        border: "1px solid rgba(15, 23, 42, 0.08)",
        boxShadow: "0 20px 60px rgba(15, 23, 42, 0.08)",
      }}
    >
      <div style={{ display: "flex", flexWrap: "wrap", gap: 16 }}>
        <div style={{ flex: "1 1 320px" }}>
          <h2
            style={{
              margin: 0,
              fontFamily: "var(--font-display)",
              fontSize: 28,
              letterSpacing: "-0.02em",
              color: "#0f172a",
            }}
          >
            Deployment Catalog
          </h2>
          <p style={{ margin: "8px 0 0", color: "#475569" }}>
            Browse roles, filter fast, and keep your selections locked in
            while you explore.
          </p>
        </div>
        <div
          style={{
            flex: "1 1 240px",
            alignSelf: "center",
            textAlign: "right",
            color: "#475569",
            fontSize: 13,
          }}
        >
          {loading ? (
            <span>Loading roles…</span>
          ) : (
            <span>
              {filteredRoles.length} / {roles.length} roles
              {selectedCount > 0 ? (
                <span>
                  {" "}
                  · Selected {selectedCount}
                  {hiddenSelected > 0 ? ` (${hiddenSelected} hidden)` : ""}
                </span>
              ) : null}
            </span>
          )}
        </div>
      </div>

      <div
        style={{
          display: "grid",
          gridTemplateColumns: "repeat(auto-fit, minmax(220px, 1fr))",
          gap: 12,
          marginTop: 20,
        }}
      >
        <div
          style={{
            padding: 16,
            borderRadius: 18,
            border: "1px solid rgba(15, 23, 42, 0.1)",
            background: "rgba(255,255,255,0.9)",
          }}
        >
          <label style={{ fontSize: 12, color: "#64748b" }}>Search</label>
          <input
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Search roles"
            style={{
              width: "100%",
              marginTop: 6,
              padding: "10px 12px",
              borderRadius: 12,
              border: "1px solid #cbd5f5",
              background: "#fff",
              fontSize: 14,
            }}
          />
        </div>
        <div
          style={{
            padding: 16,
            borderRadius: 18,
            border: "1px solid rgba(15, 23, 42, 0.1)",
            background: "rgba(255,255,255,0.9)",
          }}
        >
          <label style={{ fontSize: 12, color: "#64748b" }}>Deploy target</label>
          <div style={{ display: "flex", gap: 8, marginTop: 8 }}>
            {["all", "server", "workstation"].map((target) => (
              <button
                key={target}
                onClick={() => setTargetFilter(target)}
                style={{
                  padding: "6px 10px",
                  borderRadius: 999,
                  border:
                    targetFilter === target
                      ? "1px solid #0f172a"
                      : "1px solid #cbd5e1",
                  background:
                    targetFilter === target ? "#0f172a" : "#fff",
                  color:
                    targetFilter === target ? "#fff" : "#334155",
                  fontSize: 12,
                  cursor: "pointer",
                }}
              >
                {target}
              </button>
            ))}
          </div>
        </div>
        <div
          style={{
            padding: 16,
            borderRadius: 18,
            border: "1px solid rgba(15, 23, 42, 0.1)",
            background: "rgba(255,255,255,0.9)",
          }}
        >
          <label style={{ fontSize: 12, color: "#64748b" }}>
            Status filter
          </label>
          <div
            style={{
              display: "flex",
              flexWrap: "wrap",
              gap: 8,
              marginTop: 8,
            }}
          >
            {statusOptions.map((status) => {
              const active = statusFilter.has(status);
              const colors =
                STATUS_COLORS[status] ??
                ({ bg: "#e2e8f0", fg: "#1f2937", border: "#cbd5e1" } as const);
              return (
                <button
                  key={status}
                  onClick={() => toggleStatus(status)}
                  style={{
                    padding: "6px 10px",
                    borderRadius: 999,
                    border: `1px solid ${
                      active ? "#0f172a" : colors.border
                    }`,
                    background: active ? "#0f172a" : colors.bg,
                    color: active ? "#fff" : colors.fg,
                    fontSize: 12,
                    cursor: "pointer",
                  }}
                >
                  {status}
                </button>
              );
            })}
          </div>
        </div>
      </div>

      {error ? (
        <div style={{ marginTop: 16, color: "#b91c1c" }}>{error}</div>
      ) : null}

      <div
        style={{
          marginTop: 22,
          display: "grid",
          gridTemplateColumns: "repeat(auto-fit, minmax(220px, 1fr))",
          gap: 16,
        }}
      >
        {filteredRoles.map((role) => {
          const selectedState = selected.has(role.id);
          const statusColors =
            STATUS_COLORS[role.status] ??
            ({ bg: "#e2e8f0", fg: "#1f2937", border: "#cbd5e1" } as const);
          return (
            <article
              key={role.id}
              style={{
                padding: 18,
                borderRadius: 18,
                border: selectedState
                  ? "2px solid #0f172a"
                  : "1px solid rgba(15, 23, 42, 0.12)",
                background: "#fff",
                boxShadow:
                  "0 10px 25px rgba(15, 23, 42, 0.08)",
                display: "flex",
                flexDirection: "column",
                gap: 12,
                minHeight: 200,
              }}
            >
              <div
                style={{
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "space-between",
                  gap: 12,
                }}
              >
                <div
                  style={{
                    width: 46,
                    height: 46,
                    borderRadius: 16,
                    background: "rgba(15, 23, 42, 0.08)",
                    display: "grid",
                    placeItems: "center",
                    overflow: "hidden",
                  }}
                >
                  {role.logo?.url ? (
                    <img
                      src={role.logo.url}
                      alt={role.display_name}
                      style={{ width: "100%", height: "100%" }}
                    />
                  ) : (
                    <span
                      style={{
                        fontSize: 14,
                        fontWeight: 700,
                        color: "#0f172a",
                      }}
                    >
                      {initials(role.display_name)}
                    </span>
                  )}
                </div>
                <button
                  onClick={() => onToggleSelected(role.id)}
                  style={{
                    padding: "6px 10px",
                    borderRadius: 999,
                    border: selectedState
                      ? "1px solid #0f172a"
                      : "1px solid #cbd5e1",
                    background: selectedState ? "#0f172a" : "#fff",
                    color: selectedState ? "#fff" : "#334155",
                    fontSize: 12,
                    cursor: "pointer",
                  }}
                >
                  {selectedState ? "Selected" : "Select"}
                </button>
              </div>

              <div>
                <div
                  style={{
                    display: "flex",
                    alignItems: "center",
                    gap: 8,
                    flexWrap: "wrap",
                  }}
                >
                  <h3 style={{ margin: 0, fontSize: 16 }}>
                    {role.display_name}
                  </h3>
                  <span
                    style={{
                      fontSize: 11,
                      padding: "4px 8px",
                      borderRadius: 999,
                      background: statusColors.bg,
                      color: statusColors.fg,
                      border: `1px solid ${statusColors.border}`,
                    }}
                  >
                    {role.status}
                  </span>
                </div>
                <p
                  style={{
                    margin: "8px 0 0",
                    color: "#475569",
                    fontSize: 13,
                    lineHeight: 1.4,
                  }}
                >
                  {role.description || "No description provided."}
                </p>
              </div>

              <div style={{ display: "flex", gap: 6, flexWrap: "wrap" }}>
                {(role.deployment_targets ?? []).map((target) => (
                  <span
                    key={`${role.id}-${target}`}
                    style={{
                      fontSize: 11,
                      padding: "4px 8px",
                      borderRadius: 999,
                      background: "#f1f5f9",
                      color: "#0f172a",
                      border: "1px solid #e2e8f0",
                    }}
                  >
                    {target}
                  </span>
                ))}
              </div>
            </article>
          );
        })}
      </div>
    </section>
  );
}
