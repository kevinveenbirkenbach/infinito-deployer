"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import type { CSSProperties } from "react";
import { createPortal } from "react-dom";
import { filterRoles } from "../lib/role_filter";
import { VIEW_CONFIG, VIEW_MODE_ICONS } from "./role-dashboard/constants";
import { sortStatuses } from "./role-dashboard/helpers";
import RoleGridView from "./role-dashboard/RoleGridView";
import RoleListView from "./role-dashboard/RoleListView";
import RoleVideoModal from "./role-dashboard/RoleVideoModal";
import { VIEW_MODES } from "./role-dashboard/types";
import styles from "./RoleDashboard.module.css";
import type { Role, ViewMode } from "./role-dashboard/types";

type RoleDashboardProps = {
  roles: Role[];
  loading: boolean;
  error: string | null;
  selected: Set<string>;
  onToggleSelected: (id: string) => void;
  activeAlias?: string;
  compact?: boolean;
};

export default function RoleDashboard({
  roles,
  loading,
  error,
  selected,
  onToggleSelected,
  activeAlias,
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
  const [gridSize, setGridSize] = useState({ width: 0, height: 0 });
  const [filtersOpen, setFiltersOpen] = useState(false);
  const [filtersPos, setFiltersPos] = useState({ top: 0, left: 0 });
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
    return baseFilteredRoles.filter((role) => selected.has(role.id));
  }, [baseFilteredRoles, selected, showSelectedOnly]);

  const viewConfig = VIEW_CONFIG[viewMode];
  const gridGap = 16;
  const widthBuffer = viewMode === "mini" ? 80 : viewConfig.horizontal ? 360 : 140;
  const minCardWidth = Math.max(viewConfig.minWidth, viewConfig.iconSize + widthBuffer);
  const computedColumns =
    viewMode === "list"
      ? 1
      : Math.max(
          1,
          Math.floor((gridSize.width + gridGap) / (minCardWidth + gridGap))
        );
  const computedRows = Math.max(
    1,
    Math.floor((gridSize.height + gridGap) / (viewConfig.minHeight + gridGap))
  );
  const rows = Math.max(1, rowsOverride ?? computedRows);
  const pageSize = Math.max(1, rows * computedColumns);

  const pageCount = Math.max(1, Math.ceil(filteredRoles.length / pageSize));
  const currentPage = Math.min(page, pageCount);
  const paginatedRoles = useMemo(() => {
    const start = (currentPage - 1) * pageSize;
    return filteredRoles.slice(start, start + pageSize);
  }, [filteredRoles, currentPage, pageSize]);

  const selectedCount = selected.size;
  const filteredSelectedCount = filteredRoles.filter((role) => selected.has(role.id)).length;
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
                {Array.from(new Set([1, 2, 3, 4, 5, 6, computedRows]))
                  .sort((a, b) => a - b)
                  .map((value) => (
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
            <h2 className={`text-body ${styles.title}`}>Store</h2>
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
                {activeAlias ? ` · Active: ${activeAlias}` : ""}
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
                onClick={applySearch}
                className={`${styles.toolbarButton} ${styles.searchButton}`}
              >
                <i className="fa-solid fa-magnifying-glass" aria-hidden="true" />
                <span>Search</span>
              </button>
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
              </button>
            </div>
          </div>

          <div className={styles.content}>
            {viewMode === "list" ? (
              <RoleListView
                roles={paginatedRoles}
                selected={selected}
                iconSize={viewConfig.iconSize}
                onToggleSelected={onToggleSelected}
                onOpenVideo={(url, title) => setActiveVideo({ url, title })}
              />
            ) : (
              <RoleGridView
                roles={paginatedRoles}
                selected={selected}
                onToggleSelected={onToggleSelected}
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
      {filtersOverlay}
    </Wrapper>
  );
}
