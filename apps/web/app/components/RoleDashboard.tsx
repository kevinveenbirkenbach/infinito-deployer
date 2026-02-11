"use client";

import { useEffect, useMemo, useState } from "react";
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
  stable: {
    bg: "var(--bs-success-bg-subtle)",
    fg: "var(--bs-success-text-emphasis)",
    border: "var(--bs-success-border-subtle)",
  },
  beta: {
    bg: "var(--bs-info-bg-subtle)",
    fg: "var(--bs-info-text-emphasis)",
    border: "var(--bs-info-border-subtle)",
  },
  alpha: {
    bg: "var(--bs-warning-bg-subtle)",
    fg: "var(--bs-warning-text-emphasis)",
    border: "var(--bs-warning-border-subtle)",
  },
  "pre-alpha": {
    bg: "var(--bs-danger-bg-subtle)",
    fg: "var(--bs-danger-text-emphasis)",
    border: "var(--bs-danger-border-subtle)",
  },
  deprecated: {
    bg: "var(--bs-secondary-bg-subtle)",
    fg: "var(--bs-secondary-text-emphasis)",
    border: "var(--bs-secondary-border-subtle)",
  },
};

const PAGE_SIZE = 12;

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

function displayTargets(targets: string[]) {
  const out = new Set<string>();
  targets.forEach((target) => {
    const trimmed = (target || "").trim();
    if (!trimmed) return;
    if (trimmed === "universal") {
      out.add("server");
      out.add("workstation");
      return;
    }
    out.add(trimmed);
  });
  return Array.from(out);
}

type RoleDashboardProps = {
  roles: Role[];
  loading: boolean;
  error: string | null;
  selected: Set<string>;
  onToggleSelected: (id: string) => void;
  activeAlias?: string;
};

export default function RoleDashboard({
  roles,
  loading,
  error,
  selected,
  onToggleSelected,
  activeAlias,
}: RoleDashboardProps) {
  const [query, setQuery] = useState("");
  const [statusFilter, setStatusFilter] = useState<Set<string>>(
    new Set()
  );
  const [targetFilter, setTargetFilter] = useState("all");
  const [showSelectedOnly, setShowSelectedOnly] = useState(false);
  const [page, setPage] = useState(1);

  const statusOptions = useMemo(() => {
    const set = new Set<string>();
    roles.forEach((role) => {
      if (role.status) set.add(role.status);
    });
    return sortStatuses(Array.from(set));
  }, [roles]);

  const baseFilteredRoles = useMemo(() => {
    return filterRoles(roles, {
      statuses: statusFilter,
      target: targetFilter,
      query,
    });
  }, [roles, statusFilter, targetFilter, query]);

  const filteredRoles = useMemo(() => {
    if (!showSelectedOnly) return baseFilteredRoles;
    return baseFilteredRoles.filter((role) => selected.has(role.id));
  }, [baseFilteredRoles, selected, showSelectedOnly]);

  const pageCount = Math.max(
    1,
    Math.ceil(filteredRoles.length / PAGE_SIZE)
  );
  const currentPage = Math.min(page, pageCount);
  const paginatedRoles = useMemo(() => {
    const start = (currentPage - 1) * PAGE_SIZE;
    return filteredRoles.slice(start, start + PAGE_SIZE);
  }, [filteredRoles, currentPage]);

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

  useEffect(() => {
    setPage(1);
  }, [query, statusFilter, targetFilter, showSelectedOnly]);

  useEffect(() => {
    if (page > pageCount) setPage(pageCount);
  }, [page, pageCount]);

  return (
    <section
      style={{
        marginTop: 28,
        padding: 24,
        borderRadius: 24,
        background: "var(--deployer-panel-catalog-bg)",
        border: "1px solid var(--bs-border-color-translucent)",
        boxShadow: "var(--deployer-shadow)",
      }}
    >
      <div style={{ display: "flex", flexWrap: "wrap", gap: 16 }}>
        <div style={{ flex: "1 1 320px" }}>
          <h2
            className="text-body"
            style={{
              margin: 0,
              fontFamily: "var(--font-display)",
              fontSize: 28,
              letterSpacing: "-0.02em",
            }}
          >
            Deployment Catalog
          </h2>
          <p className="text-body-secondary" style={{ margin: "8px 0 0" }}>
            Browse roles, filter fast, and keep your selections locked in
            while you explore.
          </p>
        </div>
        <div
          className="text-body-secondary"
          style={{
            flex: "1 1 240px",
            alignSelf: "center",
            textAlign: "right",
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
              {activeAlias ? ` · Active: ${activeAlias}` : ""}
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
            border: "1px solid var(--bs-border-color-translucent)",
            background: "var(--deployer-card-bg-soft)",
          }}
        >
          <label className="text-body-tertiary" style={{ fontSize: 12 }}>
            Search
          </label>
          <input
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Search roles"
            style={{
              width: "100%",
              marginTop: 6,
              padding: "10px 12px",
              borderRadius: 12,
              border: "1px solid var(--bs-border-color)",
              background: "var(--bs-body-bg)",
              fontSize: 14,
            }}
          />
        </div>
        <div
          style={{
            padding: 16,
            borderRadius: 18,
            border: "1px solid var(--bs-border-color-translucent)",
            background: "var(--deployer-card-bg-soft)",
          }}
        >
          <label className="text-body-tertiary" style={{ fontSize: 12 }}>
            Deploy target
          </label>
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
                      ? "1px solid var(--bs-body-color)"
                      : "1px solid var(--bs-border-color)",
                  background:
                    targetFilter === target
                      ? "var(--bs-body-color)"
                      : "var(--bs-body-bg)",
                  color:
                    targetFilter === target
                      ? "var(--bs-body-bg)"
                      : "var(--deployer-muted-ink)",
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
            border: "1px solid var(--bs-border-color-translucent)",
            background: "var(--deployer-card-bg-soft)",
          }}
        >
          <label className="text-body-tertiary" style={{ fontSize: 12 }}>
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
                ({
                  bg: "var(--bs-secondary-bg-subtle)",
                  fg: "var(--bs-secondary-text-emphasis)",
                  border: "var(--bs-secondary-border-subtle)",
                } as const);
              return (
                <button
                  key={status}
                  onClick={() => toggleStatus(status)}
                  style={{
                    padding: "6px 10px",
                    borderRadius: 999,
                    border: `1px solid ${
                      active ? "var(--bs-body-color)" : colors.border
                    }`,
                    background: active ? "var(--bs-body-color)" : colors.bg,
                    color: active ? "var(--bs-body-bg)" : colors.fg,
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
        <div
          style={{
            padding: 16,
            borderRadius: 18,
            border: "1px solid var(--bs-border-color-translucent)",
            background: "var(--deployer-card-bg-soft)",
          }}
        >
          <label className="text-body-tertiary" style={{ fontSize: 12 }}>
            Selection filter
          </label>
          <div style={{ display: "flex", gap: 8, marginTop: 8 }}>
            {[
              { key: "all", label: "all", active: !showSelectedOnly },
              { key: "selected", label: "selected", active: showSelectedOnly },
            ].map((item) => (
              <button
                key={item.key}
                onClick={() =>
                  setShowSelectedOnly(item.key === "selected")
                }
                style={{
                  padding: "6px 10px",
                  borderRadius: 999,
                  border: item.active
                    ? "1px solid var(--bs-body-color)"
                    : "1px solid var(--bs-border-color)",
                  background: item.active
                    ? "var(--bs-body-color)"
                    : "var(--bs-body-bg)",
                  color: item.active
                    ? "var(--bs-body-bg)"
                    : "var(--deployer-muted-ink)",
                  fontSize: 12,
                  cursor: "pointer",
                }}
              >
                {item.label}
              </button>
            ))}
          </div>
        </div>
      </div>

      {error ? (
        <div className="text-danger" style={{ marginTop: 16 }}>
          {error}
        </div>
      ) : null}

      <div
        style={{
          marginTop: 22,
          display: "grid",
          gridTemplateColumns: "repeat(auto-fit, minmax(220px, 1fr))",
          gap: 16,
          maxWidth: 1120,
          marginLeft: "auto",
          marginRight: "auto",
        }}
      >
        {paginatedRoles.map((role) => {
          const selectedState = selected.has(role.id);
          const statusColors =
            STATUS_COLORS[role.status] ??
            ({
              bg: "var(--bs-secondary-bg-subtle)",
              fg: "var(--bs-secondary-text-emphasis)",
              border: "var(--bs-secondary-border-subtle)",
            } as const);
          return (
            <article
              key={role.id}
              style={{
                padding: 18,
                borderRadius: 18,
                border: selectedState
                  ? "2px solid var(--bs-body-color)"
                  : "1px solid var(--bs-border-color-translucent)",
                background: "var(--bs-body-bg)",
                boxShadow: "var(--deployer-shadow)",
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
                    background: "var(--bs-secondary-bg)",
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
                        color: "var(--bs-body-color)",
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
                      ? "1px solid var(--bs-body-color)"
                      : "1px solid var(--bs-border-color)",
                    background: selectedState
                      ? "var(--bs-body-color)"
                      : "var(--bs-body-bg)",
                    color: selectedState
                      ? "var(--bs-body-bg)"
                      : "var(--deployer-muted-ink)",
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
                  className="text-body-secondary"
                  style={{
                    margin: "8px 0 0",
                    fontSize: 13,
                    lineHeight: 1.4,
                  }}
                >
                  {role.description || "No description provided."}
                </p>
              </div>

              <div style={{ display: "flex", gap: 6, flexWrap: "wrap" }}>
                {displayTargets(role.deployment_targets ?? []).map((target) => (
                  <span
                    key={`${role.id}-${target}`}
                    style={{
                      fontSize: 11,
                      padding: "4px 8px",
                      borderRadius: 999,
                      background: "var(--bs-tertiary-bg)",
                      color: "var(--bs-body-color)",
                      border: "1px solid var(--bs-border-color)",
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
      <div
        className="text-body-secondary"
        style={{
          marginTop: 14,
          display: "flex",
          justifyContent: "center",
          alignItems: "center",
          gap: 12,
          fontSize: 12,
        }}
      >
        <button
          onClick={() => setPage((prev) => Math.max(1, prev - 1))}
          disabled={currentPage <= 1}
          style={{
            padding: "6px 10px",
            borderRadius: 999,
            border: "1px solid var(--bs-border-color)",
            background:
              currentPage <= 1
                ? "var(--deployer-disabled-bg)"
                : "var(--bs-body-bg)",
            color:
              currentPage <= 1
                ? "var(--deployer-disabled-text)"
                : "var(--deployer-muted-ink)",
            cursor: currentPage <= 1 ? "not-allowed" : "pointer",
          }}
        >
          Prev
        </button>
        <span>
          Page {currentPage} / {pageCount}
        </span>
        <button
          onClick={() =>
            setPage((prev) => Math.min(pageCount, prev + 1))
          }
          disabled={currentPage >= pageCount}
          style={{
            padding: "6px 10px",
            borderRadius: 999,
            border: "1px solid var(--bs-border-color)",
            background:
              currentPage >= pageCount
                ? "var(--deployer-disabled-bg)"
                : "var(--bs-body-bg)",
            color:
              currentPage >= pageCount
                ? "var(--deployer-disabled-text)"
                : "var(--deployer-muted-ink)",
            cursor:
              currentPage >= pageCount ? "not-allowed" : "pointer",
          }}
        >
          Next
        </button>
      </div>
    </section>
  );
}
