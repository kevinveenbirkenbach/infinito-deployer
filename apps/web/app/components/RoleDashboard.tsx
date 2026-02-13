"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import type { CSSProperties, ReactNode } from "react";
import { createPortal } from "react-dom";
import CodeMirror from "@uiw/react-codemirror";
import { yaml as yamlLang } from "@codemirror/lang-yaml";
import { filterRoles } from "../lib/role_filter";
import { VIEW_CONFIG, VIEW_MODE_ICONS } from "./role-dashboard/constants";
import { sortStatuses } from "./role-dashboard/helpers";
import RoleGridView from "./role-dashboard/RoleGridView";
import RoleListView from "./role-dashboard/RoleListView";
import RoleLogoView from "./role-dashboard/RoleLogoView";
import RoleVideoModal from "./role-dashboard/RoleVideoModal";
import { VIEW_MODES } from "./role-dashboard/types";
import styles from "./RoleDashboard.module.css";
import type { Role, ViewMode } from "./role-dashboard/types";

type RoleAppConfigPayload = {
  role_id: string;
  alias: string;
  host_vars_path: string;
  content: string;
  imported_paths?: number;
};

const ROW_FILTER_OPTIONS: number[] = [1, 2, 3, 5, 10, 20, 100, 500, 1000];

type RoleDashboardProps = {
  roles: Role[];
  loading: boolean;
  error: string | null;
  selected: Set<string>;
  onToggleSelected: (id: string) => void;
  onLoadRoleAppConfig?: (
    roleId: string,
    alias?: string
  ) => Promise<RoleAppConfigPayload>;
  onSaveRoleAppConfig?: (
    roleId: string,
    content: string,
    alias?: string
  ) => Promise<RoleAppConfigPayload>;
  onImportRoleAppDefaults?: (
    roleId: string,
    alias?: string
  ) => Promise<RoleAppConfigPayload>;
  activeAlias?: string;
  serverAliases?: string[];
  selectedByAlias?: Record<string, string[]>;
  onToggleSelectedForAlias?: (alias: string, roleId: string) => void;
  serverSwitcher?: ReactNode;
  compact?: boolean;
};

export default function RoleDashboard({
  roles,
  loading,
  error,
  selected,
  onToggleSelected,
  onLoadRoleAppConfig,
  onSaveRoleAppConfig,
  onImportRoleAppDefaults,
  activeAlias,
  serverAliases,
  selectedByAlias,
  onToggleSelectedForAlias,
  serverSwitcher,
  compact = false,
}: RoleDashboardProps) {
  const Wrapper = compact ? "div" : "section";
  const wrapperClassName = compact ? styles.root : `${styles.root} ${styles.wrapper}`;

  const [query, setQuery] = useState("");
  const [queryDraft, setQueryDraft] = useState("");
  const [statusFilter, setStatusFilter] = useState<Set<string>>(new Set());
  const [targetFilter, setTargetFilter] = useState("all");
  const [showSelectedOnly, setShowSelectedOnly] = useState(false);
  const [page, setPage] = useState(1);
  const [viewMode, setViewMode] = useState<ViewMode>("detail");
  const [rowsOverride, setRowsOverride] = useState<number | null>(null);
  const scrollRef = useRef<HTMLDivElement | null>(null);
  const controlsRef = useRef<HTMLDivElement | null>(null);
  const filtersButtonRef = useRef<HTMLButtonElement | null>(null);
  const filtersPopoverRef = useRef<HTMLDivElement | null>(null);
  const modeRootRef = useRef<HTMLDivElement | null>(null);
  const [gridSize, setGridSize] = useState({ width: 0, height: 0 });
  const [filtersOpen, setFiltersOpen] = useState(false);
  const [filtersPos, setFiltersPos] = useState({ top: 0, left: 0 });
  const [modeMenuOpen, setModeMenuOpen] = useState(false);
  const [accessMode, setAccessMode] = useState<"customer" | "developer">("customer");
  const [developerConfirmOpen, setDeveloperConfirmOpen] = useState(false);
  const [editingRole, setEditingRole] = useState<Role | null>(null);
  const [editorContent, setEditorContent] = useState("");
  const [editorPath, setEditorPath] = useState("");
  const [editorAlias, setEditorAlias] = useState("");
  const [editorBusy, setEditorBusy] = useState(false);
  const [editorError, setEditorError] = useState<string | null>(null);
  const [editorStatus, setEditorStatus] = useState<string | null>(null);
  const editorExtensions = useMemo(() => [yamlLang()], []);
  const [activeVideo, setActiveVideo] = useState<{
    url: string;
    title: string;
  } | null>(null);

  useEffect(() => {
    if (!activeVideo) return;
    const handle = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        setActiveVideo(null);
      }
    };
    window.addEventListener("keydown", handle);
    return () => window.removeEventListener("keydown", handle);
  }, [activeVideo]);

  useEffect(() => {
    const node = scrollRef.current;
    if (!node) return;
    const update = () => {
      const controlsHeight = controlsRef.current?.clientHeight ?? 0;
      setGridSize({
        width: node.clientWidth || 0,
        height: Math.max(0, (node.clientHeight || 0) - controlsHeight),
      });
    };
    update();
    if (typeof ResizeObserver === "undefined") {
      window.addEventListener("resize", update);
      return () => window.removeEventListener("resize", update);
    }
    const observer = new ResizeObserver(() => update());
    observer.observe(node);
    if (controlsRef.current) observer.observe(controlsRef.current);
    return () => observer.disconnect();
  }, []);

  const statusOptions = useMemo(() => {
    const set = new Set<string>();
    roles.forEach((role) => {
      if (role.status) set.add(role.status);
    });
    return sortStatuses(Array.from(set));
  }, [roles]);

  const matrixAliases = useMemo(() => {
    const raw = Array.isArray(serverAliases) ? serverAliases : [];
    const deduped = Array.from(
      new Set(
        raw
          .map((alias) => String(alias || "").trim())
          .filter(Boolean)
      )
    );
    if (deduped.length > 0) return deduped;
    const fallback = String(activeAlias || "").trim();
    return fallback ? [fallback] : [];
  }, [serverAliases, activeAlias]);

  const selectedLookup = useMemo(() => {
    const out: Record<string, Set<string>> = {};
    if (selectedByAlias) {
      Object.entries(selectedByAlias).forEach(([alias, roleIds]) => {
        const key = String(alias || "").trim();
        if (!key) return;
        out[key] = new Set(
          (Array.isArray(roleIds) ? roleIds : [])
            .map((roleId) => String(roleId || "").trim())
            .filter(Boolean)
        );
      });
    }
    const active = String(activeAlias || "").trim();
    if (active && !out[active]) {
      out[active] = new Set(selected);
    }
    return out;
  }, [selectedByAlias, activeAlias, selected]);

  const baseFilteredRoles = useMemo(
    () =>
      filterRoles(roles, {
        statuses: statusFilter,
        target: targetFilter,
        query,
      }),
    [roles, statusFilter, targetFilter, query]
  );

  const filteredRoles = useMemo(() => {
    if (!showSelectedOnly) return baseFilteredRoles;
    if (viewMode === "matrix") {
      return baseFilteredRoles.filter((role) =>
        matrixAliases.some((alias) => selectedLookup[alias]?.has(role.id))
      );
    }
    return baseFilteredRoles.filter((role) => selected.has(role.id));
  }, [baseFilteredRoles, selected, showSelectedOnly, viewMode, matrixAliases, selectedLookup]);

  const viewConfig = VIEW_CONFIG[viewMode];
  const gridGap = 16;
  const widthBuffer = viewMode === "mini" ? 80 : viewConfig.horizontal ? 360 : 140;
  const minCardWidth = Math.max(viewConfig.minWidth, viewConfig.iconSize + widthBuffer);
  const computedColumns =
    viewMode === "list" || viewMode === "matrix"
      ? 1
      : Math.max(
          1,
          Math.floor((gridSize.width + gridGap) / (minCardWidth + gridGap))
        );
  const contentHeightBuffer =
    viewMode === "mini" ? 24 : viewMode === "matrix" ? 12 : 8;
  const computedRows = Math.max(
    1,
    Math.floor(
      (Math.max(0, gridSize.height - contentHeightBuffer) + gridGap) /
        (viewConfig.minHeight + gridGap)
    )
  );
  const rows = Math.max(1, rowsOverride ?? computedRows);
  const pageSize = Math.max(1, rows * computedColumns);
  const rowOptions = useMemo(() => {
    const maxRows = Math.max(
      1,
      Math.ceil(filteredRoles.length / Math.max(1, computedColumns))
    );
    const next = ROW_FILTER_OPTIONS.filter((value) => value <= maxRows);
    if (rowsOverride && !next.includes(rowsOverride)) {
      next.push(rowsOverride);
    }
    return next.sort((a, b) => a - b);
  }, [filteredRoles.length, computedColumns, rowsOverride]);

  const pageCount = Math.max(1, Math.ceil(filteredRoles.length / pageSize));
  const currentPage = Math.min(page, pageCount);
  const paginatedRoles = useMemo(() => {
    const start = (currentPage - 1) * pageSize;
    return filteredRoles.slice(start, start + pageSize);
  }, [filteredRoles, currentPage, pageSize]);

  const selectedCount = useMemo(() => {
    if (viewMode !== "matrix") return selected.size;
    return matrixAliases.reduce(
      (sum, alias) => sum + (selectedLookup[alias]?.size ?? 0),
      0
    );
  }, [viewMode, selected, matrixAliases, selectedLookup]);

  const filteredSelectedCount = useMemo(() => {
    if (viewMode !== "matrix") {
      return filteredRoles.filter((role) => selected.has(role.id)).length;
    }
    const allowedRoleIds = new Set(filteredRoles.map((role) => role.id));
    let count = 0;
    matrixAliases.forEach((alias) => {
      selectedLookup[alias]?.forEach((roleId) => {
        if (allowedRoleIds.has(roleId)) count += 1;
      });
    });
    return count;
  }, [viewMode, filteredRoles, selected, matrixAliases, selectedLookup]);

  const hiddenSelected = Math.max(0, selectedCount - filteredSelectedCount);

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

  const canToggleAliasRole = (alias: string) =>
    Boolean(onToggleSelectedForAlias) || String(activeAlias || "").trim() === alias;

  const toggleSelectedByAlias = (alias: string, roleId: string) => {
    if (!alias || !roleId) return;
    if (onToggleSelectedForAlias) {
      onToggleSelectedForAlias(alias, roleId);
      return;
    }
    if (String(activeAlias || "").trim() === alias) {
      onToggleSelected(roleId);
    }
  };

  useEffect(() => {
    setPage(1);
  }, [query, statusFilter, targetFilter, showSelectedOnly, viewMode, rowsOverride]);

  useEffect(() => {
    if (page > pageCount) setPage(pageCount);
  }, [page, pageCount]);

  const applySearch = () => {
    setQuery(queryDraft.trim());
  };

  const openFilters = () => {
    const button = filtersButtonRef.current;
    if (!button) return;
    const rect = button.getBoundingClientRect();
    const width = 280;
    setFiltersPos({
      top: rect.bottom + 8,
      left: Math.max(12, rect.right - width),
    });
    setFiltersOpen(true);
  };

  useEffect(() => {
    if (!filtersOpen) return;
    const handleClickOutside = (event: MouseEvent) => {
      const target = event.target as Node | null;
      if (!target) return;
      if (filtersPopoverRef.current?.contains(target)) return;
      if (filtersButtonRef.current?.contains(target)) return;
      setFiltersOpen(false);
    };
    const handleEscape = (event: KeyboardEvent) => {
      if (event.key === "Escape") setFiltersOpen(false);
    };
    const closeOnViewportChange = () => setFiltersOpen(false);

    document.addEventListener("mousedown", handleClickOutside);
    document.addEventListener("keydown", handleEscape);
    window.addEventListener("resize", closeOnViewportChange);
    window.addEventListener("scroll", closeOnViewportChange, true);
    return () => {
      document.removeEventListener("mousedown", handleClickOutside);
      document.removeEventListener("keydown", handleEscape);
      window.removeEventListener("resize", closeOnViewportChange);
      window.removeEventListener("scroll", closeOnViewportChange, true);
    };
  }, [filtersOpen]);

  useEffect(() => {
    if (!modeMenuOpen) return;
    const handleClickOutside = (event: MouseEvent) => {
      const target = event.target as Node | null;
      if (!target) return;
      if (modeRootRef.current?.contains(target)) return;
      setModeMenuOpen(false);
    };
    const handleEscape = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        setModeMenuOpen(false);
      }
    };
    document.addEventListener("mousedown", handleClickOutside);
    document.addEventListener("keydown", handleEscape);
    return () => {
      document.removeEventListener("mousedown", handleClickOutside);
      document.removeEventListener("keydown", handleEscape);
    };
  }, [modeMenuOpen]);

  useEffect(() => {
    const onEscape = (event: KeyboardEvent) => {
      if (event.key !== "Escape") return;
      if (developerConfirmOpen) {
        setDeveloperConfirmOpen(false);
        return;
      }
      if (editingRole) {
        setEditingRole(null);
      }
    };
    window.addEventListener("keydown", onEscape);
    return () => window.removeEventListener("keydown", onEscape);
  }, [developerConfirmOpen, editingRole]);

  const startEditRoleConfig = async (role: Role, aliasOverride?: string) => {
    if (!onLoadRoleAppConfig) return;
    const requestedAlias = String(aliasOverride || "").trim();
    setEditingRole(role);
    setEditorBusy(true);
    setEditorError(null);
    setEditorStatus(null);
    setEditorAlias(requestedAlias);
    try {
      const data = await onLoadRoleAppConfig(role.id, requestedAlias || undefined);
      setEditorContent(String(data?.content ?? ""));
      setEditorPath(String(data?.host_vars_path ?? ""));
      setEditorAlias(String(data?.alias ?? requestedAlias));
    } catch (err: any) {
      setEditorError(err?.message ?? "failed to load app config");
      setEditorContent("");
      setEditorPath("");
      setEditorAlias(requestedAlias);
    } finally {
      setEditorBusy(false);
    }
  };

  const saveRoleConfig = async () => {
    if (!editingRole || !onSaveRoleAppConfig) return;
    setEditorBusy(true);
    setEditorError(null);
    setEditorStatus(null);
    try {
      const data = await onSaveRoleAppConfig(
        editingRole.id,
        editorContent,
        editorAlias || undefined
      );
      setEditorContent(String(data?.content ?? editorContent));
      setEditorPath(String(data?.host_vars_path ?? editorPath));
      setEditorAlias(String(data?.alias ?? editorAlias));
      setEditorStatus("Saved.");
    } catch (err: any) {
      setEditorError(err?.message ?? "failed to save app config");
    } finally {
      setEditorBusy(false);
    }
  };

  const importRoleDefaults = async () => {
    if (!editingRole || !onImportRoleAppDefaults) return;
    setEditorBusy(true);
    setEditorError(null);
    setEditorStatus(null);
    try {
      const data = await onImportRoleAppDefaults(
        editingRole.id,
        editorAlias || undefined
      );
      setEditorContent(String(data?.content ?? editorContent));
      setEditorPath(String(data?.host_vars_path ?? editorPath));
      setEditorAlias(String(data?.alias ?? editorAlias));
      const imported = Number(data?.imported_paths ?? 0);
      setEditorStatus(
        imported > 0
          ? `Imported ${imported} missing paths from config/main.yml.`
          : "No missing defaults to import."
      );
    } catch (err: any) {
      setEditorError(err?.message ?? "failed to import defaults");
    } finally {
      setEditorBusy(false);
    }
  };

  const switchMode = (mode: "customer" | "developer") => {
    if (mode === accessMode) {
      setModeMenuOpen(false);
      return;
    }
    setModeMenuOpen(false);
    if (mode === "developer") {
      setDeveloperConfirmOpen(true);
      return;
    }
    setAccessMode("customer");
    setEditingRole(null);
  };

  const filtersOverlay =
    filtersOpen && typeof document !== "undefined"
      ? createPortal(
          <div
            ref={filtersPopoverRef}
            className={styles.dropdownCardOverlay}
            style={{ top: filtersPos.top, left: filtersPos.left }}
          >
            <div className={styles.group}>
              <span className={`text-body-tertiary ${styles.groupTitle}`}>Rows</span>
              <select
                value={rowsOverride ? String(rowsOverride) : "auto"}
                onChange={(event) => {
                  const value = event.target.value;
                  if (value === "auto") {
                    setRowsOverride(null);
                  } else {
                    const parsed = Number(value);
                    setRowsOverride(Number.isFinite(parsed) ? parsed : null);
                  }
                }}
                className={`form-select ${styles.rowSelect}`}
              >
                <option value="auto">Auto ({computedRows})</option>
                {rowOptions.map((value) => (
                  <option key={value} value={String(value)}>
                    {value} rows
                  </option>
                ))}
              </select>
            </div>

            <div className={styles.group}>
              <span className={`text-body-tertiary ${styles.groupTitle}`}>
                Deploy target
              </span>
              <div className={styles.groupButtons}>
                {["all", "server", "workstation"].map((target) => (
                  <button
                    key={target}
                    onClick={() => setTargetFilter(target)}
                    className={`${styles.pillButton} ${
                      targetFilter === target ? styles.pillButtonActive : ""
                    }`}
                  >
                    {target}
                  </button>
                ))}
              </div>
            </div>

            <div className={styles.group}>
              <span className={`text-body-tertiary ${styles.groupTitle}`}>Status</span>
              <div className={styles.groupButtons}>
                {statusOptions.map((status) => {
                  const active = statusFilter.has(status);
                  return (
                    <button
                      key={status}
                      onClick={() => toggleStatus(status)}
                      className={`${styles.pillButton} ${
                        active ? styles.pillButtonActive : ""
                      }`}
                    >
                      {status}
                    </button>
                  );
                })}
              </div>
            </div>

            <div className={styles.group}>
              <span className={`text-body-tertiary ${styles.groupTitle}`}>
                Selection
              </span>
              <div className={styles.groupButtons}>
                {[
                  { key: "all", label: "all", active: !showSelectedOnly },
                  { key: "selected", label: "selected", active: showSelectedOnly },
                ].map((item) => (
                  <button
                    key={item.key}
                    onClick={() => setShowSelectedOnly(item.key === "selected")}
                    className={`${styles.pillButton} ${
                      item.active ? styles.pillButtonActive : ""
                    }`}
                  >
                    {item.label}
                  </button>
                ))}
              </div>
            </div>
          </div>,
          document.body
        )
      : null;

  return (
    <Wrapper className={wrapperClassName}>
      {!compact ? (
        <div className={styles.header}>
          <div className={styles.headerLeft}>
            <h2 className={`text-body ${styles.title}`}>Software</h2>
            <p className={`text-body-secondary ${styles.subtitle}`}>
              Browse roles, filter fast, and keep your selections locked in while you
              explore.
            </p>
          </div>
          <div className={`text-body-secondary ${styles.headerRight}`}>
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
                {viewMode === "matrix"
                  ? ` · Matrix: ${matrixAliases.length} servers`
                  : activeAlias
                    ? ` · Active: ${activeAlias}`
                    : ""}
              </span>
            )}
          </div>
        </div>
      ) : null}

      {error ? <div className={`text-danger ${styles.error}`}>{error}</div> : null}

      <div className={styles.layout}>
        <div ref={scrollRef} className={styles.scrollArea}>
          <div ref={controlsRef} className={styles.controls}>
            <div className={styles.controlsRow}>
              <input
                value={queryDraft}
                onChange={(e) => {
                  const value = e.target.value;
                  setQueryDraft(value);
                  setQuery(value);
                }}
                onKeyDown={(event) => {
                  if (event.key === "Enter") {
                    event.preventDefault();
                    applySearch();
                  }
                }}
                placeholder="Search roles"
                aria-label="Search roles"
                className={`form-control ${styles.search}`}
              />
              <button
                ref={filtersButtonRef}
                onClick={() => {
                  if (filtersOpen) {
                    setFiltersOpen(false);
                  } else {
                    openFilters();
                  }
                }}
                className={`${styles.toolbarButton} ${styles.filterButton}`}
                aria-expanded={filtersOpen}
              >
                <i className="fa-solid fa-filter" aria-hidden="true" />
                <span>Filters</span>
                <i className="fa-solid fa-chevron-down" aria-hidden="true" />
              </button>
              {serverSwitcher && viewMode !== "matrix" ? (
                <div className={styles.serverSwitcherSlot}>{serverSwitcher}</div>
              ) : null}
              <div className={styles.viewModeButtons}>
                {VIEW_MODES.map((mode) => {
                  const active = viewMode === mode;
                  return (
                    <button
                      key={mode}
                      onClick={() => setViewMode(mode)}
                      title={`${mode} view`}
                      aria-label={`${mode} view`}
                      className={`${styles.viewModeButton} ${
                        active ? styles.viewModeButtonActive : ""
                      }`}
                    >
                      <i className={VIEW_MODE_ICONS[mode]} aria-hidden="true" />
                      <span>{mode}</span>
                    </button>
                  );
                })}
              </div>
              <div ref={modeRootRef} className={styles.modeControl}>
                <button
                  onClick={() => setModeMenuOpen((prev) => !prev)}
                  className={`${styles.modeButton} ${
                    accessMode === "customer"
                      ? styles.modeButtonCustomer
                      : styles.modeButtonDeveloper
                  }`}
                  aria-haspopup="menu"
                  aria-expanded={modeMenuOpen}
                >
                  <i className="fa-solid fa-sliders" aria-hidden="true" />
                  <span>Mode:</span>
                  <span>{accessMode === "customer" ? "Customer" : "Developer"}</span>
                  <i className="fa-solid fa-chevron-down" aria-hidden="true" />
                </button>
                {modeMenuOpen ? (
                  <div className={styles.modeMenu} role="menu">
                    <button
                      onClick={() => switchMode("customer")}
                      className={styles.modeMenuItem}
                    >
                      <span>Customer</span>
                    </button>
                    <button
                      onClick={() => switchMode("developer")}
                      className={styles.modeMenuItem}
                    >
                      <span>Developer</span>
                    </button>
                  </div>
                ) : null}
              </div>
            </div>
          </div>

          <div
            className={`${styles.content} ${
              viewMode === "matrix" ? styles.contentMatrix : ""
            }`}
          >
            {viewMode === "matrix" ? (
              matrixAliases.length === 0 ? (
                <div className={`text-body-secondary ${styles.matrixEmpty}`}>
                  Add at least one server to use matrix selection.
                </div>
              ) : (
                <div className={styles.matrixContainer}>
                  <table className={styles.matrixTable}>
                    <thead>
                      <tr>
                        <th>App</th>
                        {matrixAliases.map((alias) => (
                          <th key={alias}>{alias}</th>
                        ))}
                      </tr>
                    </thead>
                    <tbody>
                      {paginatedRoles.map((role) => (
                        <tr key={role.id}>
                          <th className={styles.matrixRoleCell}>
                            <div className={styles.matrixRoleInner}>
                              <RoleLogoView role={role} size={28} />
                              <div className={styles.matrixRoleText}>
                                <span className={styles.matrixRoleName}>
                                  {role.display_name}
                                </span>
                              </div>
                            </div>
                          </th>
                          {matrixAliases.map((alias) => {
                            const selectedState = Boolean(
                              selectedLookup[alias]?.has(role.id)
                            );
                            const selectable = canToggleAliasRole(alias);
                            return (
                              <td key={`${alias}:${role.id}`}>
                                <div className={styles.matrixCellActions}>
                                  <label
                                    className={`${styles.matrixSelectWrap} ${
                                      selectable
                                        ? ""
                                        : styles.matrixSelectWrapDisabled
                                    }`}
                                  >
                                    <input
                                      type="checkbox"
                                      checked={selectedState}
                                      disabled={!selectable}
                                      onChange={() =>
                                        toggleSelectedByAlias(alias, role.id)
                                      }
                                      className={styles.matrixCheckbox}
                                    />
                                    <span>Select</span>
                                  </label>
                                  {accessMode === "developer" && onLoadRoleAppConfig ? (
                                    <button
                                      type="button"
                                      onClick={() =>
                                        void startEditRoleConfig(role, alias)
                                      }
                                      className={styles.matrixEditButton}
                                    >
                                      <i
                                        className="fa-solid fa-pen-to-square"
                                        aria-hidden="true"
                                      />
                                      <span>Edit</span>
                                    </button>
                                  ) : null}
                                </div>
                              </td>
                            );
                          })}
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )
            ) : viewMode === "list" ? (
              <RoleListView
                roles={paginatedRoles}
                selected={selected}
                iconSize={viewConfig.iconSize}
                onToggleSelected={onToggleSelected}
                developerMode={accessMode === "developer"}
                onEditRoleConfig={
                  onLoadRoleAppConfig ? (role) => void startEditRoleConfig(role) : undefined
                }
                onOpenVideo={(url, title) => setActiveVideo({ url, title })}
              />
            ) : (
              <RoleGridView
                roles={paginatedRoles}
                selected={selected}
                onToggleSelected={onToggleSelected}
                developerMode={accessMode === "developer"}
                onEditRoleConfig={
                  onLoadRoleAppConfig ? (role) => void startEditRoleConfig(role) : undefined
                }
                viewMode={viewMode}
                viewConfig={viewConfig}
                computedColumns={computedColumns}
                gridGap={gridGap}
                onOpenVideo={(url, title) => setActiveVideo({ url, title })}
              />
            )}
          </div>
        </div>

        <div className={`text-body-secondary ${styles.pagination}`}>
          <button
            onClick={() => setPage((prev) => Math.max(1, prev - 1))}
            disabled={currentPage <= 1}
            className={`${styles.pageButton} ${
              currentPage <= 1 ? styles.pageButtonDisabled : styles.pageButtonEnabled
            }`}
          >
            Prev
          </button>
          <span>
            Page {currentPage} / {pageCount}
          </span>
          <button
            onClick={() => setPage((prev) => Math.min(pageCount, prev + 1))}
            disabled={currentPage >= pageCount}
            className={`${styles.pageButton} ${
              currentPage >= pageCount ? styles.pageButtonDisabled : styles.pageButtonEnabled
            }`}
          >
            Next
          </button>
        </div>
      </div>

      <RoleVideoModal activeVideo={activeVideo} onClose={() => setActiveVideo(null)} />
      {developerConfirmOpen ? (
        <div
          onClick={() => setDeveloperConfirmOpen(false)}
          className={styles.modeConfirmOverlay}
        >
          <div
            onClick={(event) => event.stopPropagation()}
            className={styles.modeConfirmCard}
          >
            <div className={styles.modeConfirmTitleRow}>
              <i
                className={`fa-solid fa-triangle-exclamation ${styles.modeConfirmIcon}`}
                aria-hidden="true"
              />
              <h3 className={styles.modeConfirmTitle}>Enable Developer mode?</h3>
            </div>
            <p className={styles.modeConfirmText}>
              Developer mode unlocks direct app configuration editing. Wrong values
              can cause misconfigurations.
            </p>
            <div className={styles.modeConfirmActions}>
              <button
                onClick={() => setDeveloperConfirmOpen(false)}
                className={`${styles.modeActionButton} ${styles.modeActionButtonSuccess}`}
              >
                <i className="fa-solid fa-circle-check" aria-hidden="true" />
                <span>Cancel</span>
              </button>
              <button
                onClick={() => {
                  setDeveloperConfirmOpen(false);
                  setAccessMode("developer");
                }}
                className={`${styles.modeActionButton} ${styles.modeActionButtonDanger}`}
              >
                <i className="fa-solid fa-triangle-exclamation" aria-hidden="true" />
                <span>Enable</span>
              </button>
            </div>
          </div>
        </div>
      ) : null}
      {editingRole ? (
        <div onClick={() => setEditingRole(null)} className={styles.configEditorOverlay}>
          <div
            onClick={(event) => event.stopPropagation()}
            className={styles.configEditorCard}
          >
            <div className={styles.configEditorHeader}>
              <div>
                <h3 className={styles.configEditorTitle}>
                  Edit app config: {editingRole.display_name}
                </h3>
                <p className={`text-body-secondary ${styles.configEditorMeta}`}>
                  {editorAlias ? `Alias: ${editorAlias} · ` : ""}
                  {editorPath || "host_vars file"}
                </p>
              </div>
            </div>
            <div className={styles.configEditorSurface}>
              <CodeMirror
                value={editorContent}
                height="100%"
                editable={!editorBusy}
                extensions={editorExtensions}
                onChange={(value) => {
                  setEditorContent(value);
                  setEditorStatus(null);
                  setEditorError(null);
                }}
                className={styles.configEditorCodeMirror}
              />
            </div>
            {editorError ? (
              <p className={`text-danger ${styles.configEditorMessage}`}>{editorError}</p>
            ) : null}
            {editorStatus ? (
              <p className={`text-success ${styles.configEditorMessage}`}>{editorStatus}</p>
            ) : null}
            <div className={styles.configEditorActions}>
              <button
                onClick={() => void importRoleDefaults()}
                disabled={editorBusy || !onImportRoleAppDefaults}
                className={styles.modeActionButton}
              >
                {editorBusy ? "Working..." : "Import defaults"}
              </button>
              <button
                onClick={() => setEditingRole(null)}
                className={styles.modeActionButton}
              >
                Close
              </button>
              <button
                onClick={() => void saveRoleConfig()}
                disabled={editorBusy || !onSaveRoleAppConfig}
                className={`${styles.modeActionButton} ${styles.modeActionButtonPrimary}`}
              >
                {editorBusy ? "Saving..." : "Save"}
              </button>
            </div>
          </div>
        </div>
      ) : null}
      {filtersOverlay}
    </Wrapper>
  );
}
