"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import type { CSSProperties } from "react";
import { createPortal } from "react-dom";
import BundleAppList, { type BundleAppListRow } from "./BundleAppList";
import BundleDetailsModal from "./BundleDetailsModal";
import EnableDropdown from "./EnableDropdown";
import styles from "./styles.module.css";
import type { Bundle, Role, ViewConfig, ViewMode } from "./types";

type BundleState = {
  enabled: boolean;
  selectedCount: number;
  totalCount: number;
};

type BundleEntry = {
  bundle: Bundle;
  roleIds: string[];
  roleRows: BundleRoleRow[];
  totalPriceLabel: string;
  state: BundleState;
};

type BundleRoleRow = BundleAppListRow;

type BundleGridViewProps = {
  bundles: Bundle[];
  viewMode: ViewMode;
  viewConfig: ViewConfig;
  computedColumns: number;
  gridGap: number;
  minHeight: number;
  activeAlias: string;
  bundleStates: Record<string, BundleState>;
  roleById: Record<string, Role>;
  roleServerCountByRole?: Record<string, number>;
  forcedOpenColumns: BundleOptionalListColumnKey[];
  forcedClosedColumns: BundleOptionalListColumnKey[];
  onListColumnsChange: (payload: {
    open: BundleOptionalListColumnKey[];
    closed: BundleOptionalListColumnKey[];
  }) => void;
  onOpenRoleDetails?: (role: Role) => void;
  onEnableBundle: (bundle: Bundle) => void;
  onDisableBundle: (bundle: Bundle) => void;
};

const DESELECTION_FADE_DURATION_MS = 3000;
const LIST_COLUMN_GAP_PX = 12;

export type BundleOptionalListColumnKey =
  | "target"
  | "description"
  | "apps"
  | "price"
  | "details";

type BundleListColumnKey = "bundle" | BundleOptionalListColumnKey | "enabled";

const BUNDLE_LIST_COLUMN_ORDER: BundleListColumnKey[] = [
  "bundle",
  "target",
  "description",
  "apps",
  "price",
  "details",
  "enabled",
];

export const BUNDLE_OPTIONAL_LIST_COLUMNS: BundleOptionalListColumnKey[] = [
  "target",
  "description",
  "apps",
  "price",
  "details",
];

const BUNDLE_LIST_COLUMN_LABEL: Record<BundleListColumnKey, string> = {
  bundle: "Bundle",
  target: "Target",
  description: "Description",
  apps: "Apps",
  price: "Price",
  details: "Details",
  enabled: "Enabled",
};

const BUNDLE_LIST_COLUMN_TEMPLATE: Record<BundleListColumnKey, string> = {
  bundle: "minmax(210px, 1.35fr)",
  target: "minmax(94px, 0.72fr)",
  description: "minmax(200px, 1.45fr)",
  apps: "minmax(258px, 1.9fr)",
  price: "minmax(94px, 0.68fr)",
  details: "minmax(108px, 0.72fr)",
  enabled: "minmax(132px, 0.95fr)",
};

const BUNDLE_LIST_COLUMN_MIN_WIDTH: Record<BundleListColumnKey, number> = {
  bundle: 210,
  target: 94,
  description: 200,
  apps: 258,
  price: 94,
  details: 108,
  enabled: 132,
};

function formatMonthlyPrice(amount: number): string {
  const normalizedAmount = Math.max(0, Number(amount) || 0);
  try {
    return new Intl.NumberFormat(undefined, {
      style: "currency",
      currency: "EUR",
      minimumFractionDigits: 2,
      maximumFractionDigits: 2,
    }).format(normalizedAmount);
  } catch {
    return `€${normalizedAmount.toFixed(2)}`;
  }
}

function bundleIconClass(bundle: Bundle): string {
  const raw = String(bundle.logo_class || "").trim();
  return raw || "fa-solid fa-layer-group";
}

function targetStatusStyle(target: string): CSSProperties {
  const normalized = String(target || "").trim().toLowerCase();
  if (normalized === "server") {
    return {
      "--status-bg": "var(--bs-info-bg-subtle)",
      "--status-fg": "var(--bs-info-text-emphasis)",
      "--status-border": "var(--bs-info-border-subtle)",
    } as CSSProperties;
  }
  if (normalized === "workstation") {
    return {
      "--status-bg": "var(--bs-success-bg-subtle)",
      "--status-fg": "var(--bs-success-text-emphasis)",
      "--status-border": "var(--bs-success-border-subtle)",
    } as CSSProperties;
  }
  return {
    "--status-bg": "var(--bs-secondary-bg-subtle)",
    "--status-fg": "var(--bs-secondary-text-emphasis)",
    "--status-border": "var(--bs-secondary-border-subtle)",
  } as CSSProperties;
}

function bundleLogo(bundle: Bundle, size: number) {
  const logoSizeStyle = {
    "--role-logo-size": `${size}px`,
    "--role-logo-meta-size": `${Math.max(20, Math.floor(size * 0.82))}px`,
    "--role-logo-initial-size": `${Math.max(14, Math.floor(size * 0.32))}px`,
  } as CSSProperties;

  return (
    <div className={styles.logoRoot} style={logoSizeStyle}>
      <i className={`${bundleIconClass(bundle)} ${styles.logoMetaIcon}`} aria-hidden="true" />
    </div>
  );
}

export default function BundleGridView({
  bundles,
  viewMode,
  viewConfig,
  computedColumns,
  gridGap,
  minHeight,
  activeAlias,
  bundleStates,
  roleById,
  roleServerCountByRole,
  forcedOpenColumns,
  forcedClosedColumns,
  onListColumnsChange,
  onOpenRoleDetails,
  onEnableBundle,
  onDisableBundle,
}: BundleGridViewProps) {
  const [deselectionFlashBundleIds, setDeselectionFlashBundleIds] = useState<Set<string>>(
    new Set()
  );
  const [hoveredBundleId, setHoveredBundleId] = useState<string | null>(null);
  const [activeBundleDetailsId, setActiveBundleDetailsId] = useState<string | null>(null);
  const [pendingMiniDisableBundleId, setPendingMiniDisableBundleId] = useState<string | null>(
    null
  );
  const deselectionTimersRef = useRef<Record<string, ReturnType<typeof setTimeout>>>({});
  const listScrollRef = useRef<HTMLDivElement | null>(null);
  const listTopScrollRef = useRef<HTMLDivElement | null>(null);
  const listTopScrollInnerRef = useRef<HTMLDivElement | null>(null);
  const [containerWidth, setContainerWidth] = useState(0);
  const [showTopScrollbar, setShowTopScrollbar] = useState(false);
  const forcedOpenColumnSet = useMemo(
    () => new Set<BundleOptionalListColumnKey>(forcedOpenColumns),
    [forcedOpenColumns]
  );
  const forcedClosedColumnSet = useMemo(
    () => new Set<BundleOptionalListColumnKey>(forcedClosedColumns),
    [forcedClosedColumns]
  );

  const syncTopScrollbarMetrics = () => {
    const listNode = listScrollRef.current;
    const topNode = listTopScrollRef.current;
    const topInnerNode = listTopScrollInnerRef.current;
    if (!listNode || !topNode || !topInnerNode) return;
    const requiredWidth = Math.max(listNode.scrollWidth, listNode.clientWidth);
    topInnerNode.style.width = `${requiredWidth}px`;
    const needsScrollbar = listNode.scrollWidth - listNode.clientWidth > 1;
    setShowTopScrollbar(needsScrollbar);
    if (!needsScrollbar) {
      topNode.scrollLeft = 0;
      return;
    }
    topNode.scrollLeft = listNode.scrollLeft;
  };

  const gridStyle = {
    "--role-grid-columns": computedColumns,
    "--role-grid-row-height": `${minHeight}px`,
    "--role-grid-gap": `${gridGap}px`,
  } as CSSProperties;

  const entries = useMemo<BundleEntry[]>(
    () =>
      bundles.map((bundle) => {
        const roleIds = (Array.isArray(bundle.role_ids) ? bundle.role_ids : [])
          .map((roleId) => String(roleId || "").trim())
          .filter(Boolean);
        const roleRows = roleIds.map((roleId) => {
          const role = roleById[roleId] || null;
          const rawServerCount = Math.max(
            0,
            Math.floor(Number(roleServerCountByRole?.[roleId] || 0))
          );
          const monthlyPriceAmount = Math.max(
            1,
            rawServerCount
          );
          return {
            roleId,
            role,
            label: String(role?.display_name || roleId).trim(),
            monthlyPriceAmount,
            monthlyPriceLabel: formatMonthlyPrice(monthlyPriceAmount),
            isActive: rawServerCount > 0,
          };
        });
        const state = bundleStates[bundle.id] || {
          enabled: false,
          selectedCount: 0,
          totalCount: roleIds.length,
        };
        const totalPriceAmount = roleRows.reduce((sum, row) => sum + row.monthlyPriceAmount, 0);
        return {
          bundle,
          roleIds,
          roleRows,
          totalPriceLabel: formatMonthlyPrice(totalPriceAmount),
          state,
        };
      }),
    [bundles, bundleStates, roleById, roleServerCountByRole]
  );
  const activeBundleDetails = useMemo(
    () => entries.find((entry) => entry.bundle.id === activeBundleDetailsId) || null,
    [entries, activeBundleDetailsId]
  );
  const pendingMiniDisableEntry = useMemo(
    () => entries.find((entry) => entry.bundle.id === pendingMiniDisableBundleId) || null,
    [entries, pendingMiniDisableBundleId]
  );

  const clearDeselectionFlash = (bundleId: string) => {
    const timer = deselectionTimersRef.current[bundleId];
    if (timer) {
      clearTimeout(timer);
      delete deselectionTimersRef.current[bundleId];
    }
    setDeselectionFlashBundleIds((prev) => {
      if (!prev.has(bundleId)) return prev;
      const next = new Set(prev);
      next.delete(bundleId);
      return next;
    });
  };

  const triggerDeselectionFlash = (bundleId: string) => {
    clearDeselectionFlash(bundleId);
    setDeselectionFlashBundleIds((prev) => {
      const next = new Set(prev);
      next.add(bundleId);
      return next;
    });
    deselectionTimersRef.current[bundleId] = setTimeout(() => {
      setDeselectionFlashBundleIds((prev) => {
        if (!prev.has(bundleId)) return prev;
        const next = new Set(prev);
        next.delete(bundleId);
        return next;
      });
      delete deselectionTimersRef.current[bundleId];
    }, DESELECTION_FADE_DURATION_MS);
  };

  const requestMiniDisable = (entry: BundleEntry) => {
    setPendingMiniDisableBundleId(entry.bundle.id);
  };

  const cancelMiniDisable = () => {
    setPendingMiniDisableBundleId(null);
  };

  const confirmMiniDisable = () => {
    if (!pendingMiniDisableEntry) return;
    const { bundle } = pendingMiniDisableEntry;
    setPendingMiniDisableBundleId(null);
    onDisableBundle(bundle);
    triggerDeselectionFlash(bundle.id);
  };

  const toggleBundle = (entry: BundleEntry) => {
    if (entry.state.enabled) {
      requestMiniDisable(entry);
      return;
    }
    setPendingMiniDisableBundleId(null);
    clearDeselectionFlash(entry.bundle.id);
    onEnableBundle(entry.bundle);
  };

  const renderBundleRoleList = (
    entry: BundleEntry,
    pageSize: number,
    compact = false
  ) => (
    <BundleAppList
      bundleId={`${viewMode}:${entry.bundle.id}`}
      rows={entry.roleRows}
      pageSize={pageSize}
      compact={compact}
      onOpenRoleDetails={onOpenRoleDetails}
    />
  );

  useEffect(() => {
    return () => {
      Object.values(deselectionTimersRef.current).forEach((timer) => clearTimeout(timer));
      deselectionTimersRef.current = {};
    };
  }, []);

  useEffect(() => {
    if (!activeBundleDetailsId) return;
    const exists = entries.some((entry) => entry.bundle.id === activeBundleDetailsId);
    if (!exists) setActiveBundleDetailsId(null);
  }, [entries, activeBundleDetailsId]);

  useEffect(() => {
    if (!pendingMiniDisableBundleId) return;
    const exists = entries.some((entry) => entry.bundle.id === pendingMiniDisableBundleId);
    if (!exists) setPendingMiniDisableBundleId(null);
  }, [entries, pendingMiniDisableBundleId]);

  useEffect(() => {
    const node = listScrollRef.current;
    if (!node) return;

    const measure = () => {
      setContainerWidth(Math.max(0, node.clientWidth));
      syncTopScrollbarMetrics();
    };
    measure();

    if (typeof ResizeObserver === "undefined") {
      window.addEventListener("resize", measure);
      return () => window.removeEventListener("resize", measure);
    }

    const observer = new ResizeObserver(() => measure());
    observer.observe(node);
    return () => observer.disconnect();
  }, []);

  const visibleColumns = useMemo(() => {
    const visible = new Set<BundleListColumnKey>(["bundle", "enabled"]);
    let usedWidth =
      BUNDLE_LIST_COLUMN_MIN_WIDTH.bundle +
      BUNDLE_LIST_COLUMN_MIN_WIDTH.enabled +
      LIST_COLUMN_GAP_PX;

    BUNDLE_OPTIONAL_LIST_COLUMNS.forEach((column) => {
      if (forcedClosedColumnSet.has(column)) return;

      const minWidth = BUNDLE_LIST_COLUMN_MIN_WIDTH[column];
      const isForcedOpen = forcedOpenColumnSet.has(column);
      const fitsByDefault =
        containerWidth > 0
          ? usedWidth + LIST_COLUMN_GAP_PX + minWidth <= containerWidth
          : false;

      if (!isForcedOpen && !fitsByDefault) return;

      visible.add(column);
      usedWidth += LIST_COLUMN_GAP_PX + minWidth;
    });

    return BUNDLE_LIST_COLUMN_ORDER.filter((column) => visible.has(column));
  }, [containerWidth, forcedOpenColumnSet, forcedClosedColumnSet]);

  const listGridStyle = useMemo(
    () => {
      const minWidth =
        visibleColumns.reduce((sum, column) => sum + BUNDLE_LIST_COLUMN_MIN_WIDTH[column], 0) +
        Math.max(0, visibleColumns.length - 1) * LIST_COLUMN_GAP_PX;
      return {
        gridTemplateColumns: visibleColumns
          .map((column) => BUNDLE_LIST_COLUMN_TEMPLATE[column])
          .join(" "),
        width: "100%",
        minWidth: `max(100%, ${minWidth}px)`,
      } as CSSProperties;
    },
    [visibleColumns]
  );

  useEffect(() => {
    syncTopScrollbarMetrics();
  }, [visibleColumns, entries.length]);

  useEffect(() => {
    const listNode = listScrollRef.current;
    const topNode = listTopScrollRef.current;
    if (!listNode || !topNode) return;
    let syncing = false;

    const syncToTop = () => {
      if (syncing) return;
      syncing = true;
      topNode.scrollLeft = listNode.scrollLeft;
      syncing = false;
    };

    const syncToList = () => {
      if (syncing) return;
      syncing = true;
      listNode.scrollLeft = topNode.scrollLeft;
      syncing = false;
    };

    listNode.addEventListener("scroll", syncToTop, { passive: true });
    topNode.addEventListener("scroll", syncToList, { passive: true });
    return () => {
      listNode.removeEventListener("scroll", syncToTop);
      topNode.removeEventListener("scroll", syncToList);
    };
  }, [showTopScrollbar]);

  const toggleColumn = (column: BundleOptionalListColumnKey) => {
    const isCurrentlyVisible = visibleColumns.includes(column);
    const nextOpen = new Set(forcedOpenColumnSet);
    const nextClosed = new Set(forcedClosedColumnSet);
    if (isCurrentlyVisible) {
      nextOpen.delete(column);
      nextClosed.add(column);
    } else {
      nextClosed.delete(column);
      nextOpen.add(column);
    }

    onListColumnsChange({
      open: BUNDLE_OPTIONAL_LIST_COLUMNS.filter((entry) => nextOpen.has(entry)),
      closed: BUNDLE_OPTIONAL_LIST_COLUMNS.filter((entry) => nextClosed.has(entry)),
    });
  };

  if (entries.length === 0) {
    return <div className={`text-body-secondary ${styles.columnEmpty}`}>No bundles match the filters.</div>;
  }

  if (viewMode === "list" || viewMode === "matrix") {
    return (
      <>
        <div className={styles.listRoot}>
          <div className={styles.listStickyBar}>
            <div className={styles.listColumnToolbar}>
              <span className={styles.listColumnToolbarLabel}>Columns</span>
              {BUNDLE_OPTIONAL_LIST_COLUMNS.map((column) => {
                const visible = visibleColumns.includes(column);
                return (
                  <button
                    key={column}
                    type="button"
                    onClick={() => toggleColumn(column)}
                    className={`${styles.listColumnToggle} ${
                      visible ? styles.listColumnToggleActive : styles.listColumnToggleCollapsed
                    }`}
                    aria-pressed={visible}
                    title={
                      visible
                        ? `Collapse ${BUNDLE_LIST_COLUMN_LABEL[column]}`
                        : `Expand ${BUNDLE_LIST_COLUMN_LABEL[column]}`
                    }
                  >
                    <span>{BUNDLE_LIST_COLUMN_LABEL[column]}</span>
                    <i
                      className={visible ? "fa-solid fa-minus" : "fa-solid fa-plus"}
                      aria-hidden="true"
                    />
                  </button>
                );
              })}
            </div>
            <div
              ref={listTopScrollRef}
              className={`${styles.listTopScrollbar} ${
                showTopScrollbar ? styles.listTopScrollbarVisible : styles.listTopScrollbarHidden
              }`}
              aria-hidden="true"
            >
              <div ref={listTopScrollInnerRef} className={styles.listTopScrollbarInner} />
            </div>
          </div>

          <div ref={listScrollRef} className={styles.listScrollPane}>
            <div className={`${styles.listGrid} ${styles.listHeader}`} style={listGridStyle}>
              {visibleColumns.map((column) => (
                <span key={`header-${column}`} className={styles.listHeaderCell}>
                  {BUNDLE_LIST_COLUMN_LABEL[column]}
                  {column === "bundle" || column === "enabled" ? (
                    <i className="fa-solid fa-lock" aria-hidden="true" />
                  ) : null}
                </span>
              ))}
            </div>
            {entries.map((entry) => {
              const { bundle, roleIds, state } = entry;
              const isDeselectionFlashing = deselectionFlashBundleIds.has(bundle.id);
              return (
                <div
                  key={bundle.id}
                  className={`${styles.listGrid} ${styles.listRow} ${
                    state.enabled ? styles.listRowSelected : styles.listRowDefault
                  } ${isDeselectionFlashing ? styles.listRowDeselectedFlash : ""}`}
                  style={listGridStyle}
                >
                  {visibleColumns.map((column) => {
                    if (column === "bundle") {
                      return (
                        <div key={`${bundle.id}:bundle`} className={styles.listRoleCell}>
                          {bundleLogo(bundle, Math.max(28, viewConfig.iconSize - 8))}
                          <div className={styles.listRoleText}>
                            <div className={styles.listRoleName}>{bundle.title}</div>
                            <div className={`text-body-secondary ${styles.listRoleId}`}>
                              {bundle.id}
                            </div>
                          </div>
                        </div>
                      );
                    }

                    if (column === "target") {
                      return (
                        <span
                          key={`${bundle.id}:target`}
                          className={`${styles.statusBadge} ${styles.listStatusBadge}`}
                          style={targetStatusStyle(bundle.deploy_target)}
                        >
                          {bundle.deploy_target || "bundle"}
                        </span>
                      );
                    }

                    if (column === "description") {
                      return (
                        <div
                          key={`${bundle.id}:description`}
                          className={`text-body-secondary ${styles.listDescription}`}
                        >
                          {bundle.description || "No description provided."}
                        </div>
                      );
                    }

                    if (column === "apps") {
                      return (
                        <div key={`${bundle.id}:apps`} className={styles.bundleListAppsCell}>
                          {renderBundleRoleList(entry, 2, true)}
                        </div>
                      );
                    }

                    if (column === "price") {
                      return (
                        <div key={`${bundle.id}:price`} className={styles.listPriceCell}>
                          <span className={styles.listPriceValue}>{entry.totalPriceLabel}</span>
                          <span
                            className={`${styles.listPriceCaption} ${styles.bundlePerMonthCaption}`}
                          >
                            per month
                          </span>
                        </div>
                      );
                    }

                    if (column === "details") {
                      return (
                        <div key={`${bundle.id}:details`} className={styles.bundleListDetailsCell}>
                          <button
                            type="button"
                            className={styles.bundleListDetailsButton}
                            onClick={() => setActiveBundleDetailsId(bundle.id)}
                            title={`Open details for ${bundle.title}`}
                          >
                            <i className="fa-solid fa-circle-info" aria-hidden="true" />
                            <span>Details</span>
                          </button>
                        </div>
                      );
                    }

                    return (
                      <div key={`${bundle.id}:enabled`} className={styles.listPickActions}>
                        <EnableDropdown
                          enabled={state.enabled}
                          compact
                          showPlanField={false}
                          pricingModel="bundle"
                          plans={[{ id: "community", label: "Community" }]}
                          selectedPlanId="community"
                          appCount={Math.max(1, roleIds.length)}
                          contextLabel={`device "${activeAlias}" for bundle "${bundle.title}"`}
                          onEnable={() => {
                            clearDeselectionFlash(bundle.id);
                            onEnableBundle(bundle);
                          }}
                          onDisable={() => {
                            if (!state.enabled) return;
                            onDisableBundle(bundle);
                            triggerDeselectionFlash(bundle.id);
                          }}
                        />
                      </div>
                    );
                  })}
                </div>
              );
            })}
          </div>
        </div>
        <BundleDetailsModal
          bundle={activeBundleDetails?.bundle || null}
          roleRows={activeBundleDetails?.roleRows || []}
          totalPriceLabel={activeBundleDetails?.totalPriceLabel || "€0.00"}
          appsCaption={
            activeBundleDetails
              ? `${activeBundleDetails.state.selectedCount}/${activeBundleDetails.state.totalCount}`
              : "0/0"
          }
          onOpenRoleDetails={onOpenRoleDetails}
          onClose={() => setActiveBundleDetailsId(null)}
        />
      </>
    );
  }

  const isMiniView = viewMode === "mini";
  const isHorizontalView = viewMode === "row" || viewMode === "column";

  return (
    <>
      <div className={styles.gridRoot} style={gridStyle}>
        {entries.map((entry) => {
        const { bundle, roleIds, state } = entry;
        const isDeselectionFlashing = deselectionFlashBundleIds.has(bundle.id);
        const cardHeightStyle = {
          "--role-card-min-height": `${viewConfig.minHeight}px`,
        } as CSSProperties;
        const logo = bundleLogo(bundle, Math.max(38, viewConfig.iconSize));
        const statusStyle = targetStatusStyle(bundle.deploy_target);

        if (isMiniView) {
          const tooltipOpen = hoveredBundleId === bundle.id;
          return (
            <article
              key={bundle.id}
              onMouseEnter={() => setHoveredBundleId(bundle.id)}
              onMouseLeave={() => setHoveredBundleId(null)}
              onFocus={() => setHoveredBundleId(bundle.id)}
              onBlur={() => setHoveredBundleId(null)}
              onClick={() => toggleBundle(entry)}
              onKeyDown={(event) => {
                if (event.key === "Enter" || event.key === " ") {
                  event.preventDefault();
                  toggleBundle(entry);
                }
              }}
              tabIndex={0}
              role="button"
              aria-pressed={state.enabled}
              className={`${styles.cardBase} ${styles.miniCard} ${
                state.enabled ? styles.miniCardSelected : styles.cardDefault
              } ${isDeselectionFlashing ? styles.miniCardDeselectedFlash : ""}`}
              style={cardHeightStyle}
            >
              {logo}
              <div className={styles.miniTitle} title={bundle.title}>
                {bundle.title}
              </div>
              {state.enabled ? (
                <span className={styles.miniSelectedBadge}>
                  <i className="fa-solid fa-check" aria-hidden="true" />
                </span>
              ) : null}
              {tooltipOpen ? (
                <div className={styles.miniTooltip}>
                  <div className={styles.tooltipTitle}>{bundle.title}</div>
                  <span className={styles.statusBadge} style={statusStyle}>
                    {bundle.deploy_target || "bundle"}
                  </span>
                  <div className={`text-body-secondary ${styles.tooltipDescription}`}>
                    {bundle.description || "No description provided."}
                  </div>
                </div>
              ) : null}
            </article>
          );
        }

        if (isHorizontalView) {
          return (
            <article
              key={bundle.id}
              className={`${styles.cardBase} ${styles.horizontalCard} ${
                state.enabled ? styles.cardSelected : styles.cardDefault
              } ${isDeselectionFlashing ? styles.cardDeselectedFlash : ""}`}
              style={cardHeightStyle}
            >
              <div className={styles.horizontalHeader}>
                {logo}
                <div className={styles.roleMetaWrap}>
                  <div className={styles.roleTitleRow}>
                    <h3 className={styles.roleTitle} title={bundle.title}>
                      {bundle.title}
                    </h3>
                    <span className={styles.statusBadge} style={statusStyle}>
                      {bundle.deploy_target || "bundle"}
                    </span>
                  </div>
                  <p className={`text-body-secondary ${styles.roleDescriptionShort}`}>
                    {bundle.description || "No description provided."}
                  </p>
                  <div className={styles.listPriceCell}>
                    <span className={styles.listPriceValue}>{entry.totalPriceLabel}</span>
                    <span
                      className={`${styles.listPriceCaption} ${styles.bundlePerMonthCaption}`}
                    >
                      per month
                    </span>
                  </div>
                </div>
                <div className={styles.roleActionButtons}>
                  <EnableDropdown
                    enabled={state.enabled}
                    compact
                    showPlanField={false}
                    pricingModel="bundle"
                    plans={[{ id: "community", label: "Community" }]}
                    selectedPlanId="community"
                    appCount={Math.max(1, roleIds.length)}
                    contextLabel={`device "${activeAlias}" for bundle "${bundle.title}"`}
                    onOpenDetails={() => setActiveBundleDetailsId(bundle.id)}
                    onEnable={() => {
                      clearDeselectionFlash(bundle.id);
                      onEnableBundle(bundle);
                    }}
                    onDisable={() => {
                      if (!state.enabled) return;
                      onDisableBundle(bundle);
                      triggerDeselectionFlash(bundle.id);
                    }}
                  />
                </div>
              </div>
              <div className={styles.horizontalLinks}>{renderBundleRoleList(entry, 3)}</div>
            </article>
          );
        }

        return (
          <article
            key={bundle.id}
            className={`${styles.cardBase} ${styles.detailCard} ${
              state.enabled ? styles.cardSelected : styles.cardDefault
            } ${isDeselectionFlashing ? styles.cardDeselectedFlash : ""}`}
            style={cardHeightStyle}
          >
            <div className={styles.detailHeader}>
              {logo}
              <div className={styles.detailHeaderMeta}>
                <h3 className={styles.roleTitle} title={bundle.title}>
                  {bundle.title}
                </h3>
                <div className={styles.detailBadgeRow}>
                  <span className={styles.statusBadge} style={statusStyle}>
                    {bundle.deploy_target || "bundle"}
                  </span>
                </div>
              </div>
            </div>

            <p className={styles.roleDescriptionShort}>
              {bundle.description || "No description provided."}
            </p>
            <div className={styles.listPriceCell}>
              <span className={styles.listPriceValue}>{entry.totalPriceLabel}</span>
              <span className={`${styles.listPriceCaption} ${styles.bundlePerMonthCaption}`}>
                per month
              </span>
            </div>

            <div className={styles.detailFooterRow}>
              <div className={styles.detailControlRow}>
                <EnableDropdown
                  enabled={state.enabled}
                  compact
                  showPlanField={false}
                  pricingModel="bundle"
                  plans={[{ id: "community", label: "Community" }]}
                  selectedPlanId="community"
                  appCount={Math.max(1, roleIds.length)}
                  contextLabel={`device "${activeAlias}" for bundle "${bundle.title}"`}
                  onOpenDetails={() => setActiveBundleDetailsId(bundle.id)}
                  onEnable={() => {
                    clearDeselectionFlash(bundle.id);
                    onEnableBundle(bundle);
                  }}
                  onDisable={() => {
                    if (!state.enabled) return;
                    onDisableBundle(bundle);
                    triggerDeselectionFlash(bundle.id);
                  }}
                />
              </div>
            </div>
          </article>
        );
        })}
      </div>
      <BundleDetailsModal
        bundle={activeBundleDetails?.bundle || null}
        roleRows={activeBundleDetails?.roleRows || []}
        totalPriceLabel={activeBundleDetails?.totalPriceLabel || "€0.00"}
        appsCaption={
          activeBundleDetails
            ? `${activeBundleDetails.state.selectedCount}/${activeBundleDetails.state.totalCount}`
            : "0/0"
        }
        onOpenRoleDetails={onOpenRoleDetails}
        onClose={() => setActiveBundleDetailsId(null)}
      />
      {isMiniView && pendingMiniDisableEntry && typeof document !== "undefined"
        ? createPortal(
            <div className={styles.enableConfirmOverlay} onClick={cancelMiniDisable}>
              <div
                className={styles.enableConfirmCard}
                onClick={(event) => event.stopPropagation()}
              >
                <h4 className={styles.enableConfirmTitle}>Disable selection?</h4>
                <p className={styles.enableConfirmText}>
                  {activeAlias
                    ? `Warning: Disabling will remove bundle "${pendingMiniDisableEntry.bundle.title}" from device "${activeAlias}".`
                    : `Warning: Disabling will remove bundle "${pendingMiniDisableEntry.bundle.title}" from the current deployment selection.`}
                </p>
                <p className={styles.enableConfirmText}>
                  It will no longer be deployed until you enable it again.
                </p>
                <div className={styles.enableConfirmActions}>
                  <button
                    type="button"
                    onClick={cancelMiniDisable}
                    className={styles.enableCancelButton}
                  >
                    Cancel
                  </button>
                  <button
                    type="button"
                    onClick={confirmMiniDisable}
                    className={styles.enableDisableButton}
                  >
                    Disable
                  </button>
                </div>
              </div>
            </div>,
            document.body
          )
        : null}
    </>
  );
}
