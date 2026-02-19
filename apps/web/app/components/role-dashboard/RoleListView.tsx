"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import type { CSSProperties } from "react";
import { colorForStatus, displayTargets } from "./helpers";
import EnableDropdown from "./EnableDropdown";
import RoleLogoView from "./RoleLogoView";
import RoleQuickLinks from "./RoleQuickLinks";
import styles from "./styles.module.css";
import type { Role } from "./types";

type RoleListViewProps = {
  baseUrl?: string;
  roles: Role[];
  selected: Set<string>;
  iconSize: number;
  onToggleSelected: (id: string) => void;
  roleServerCountByRole?: Record<string, number>;
  rolePlans?: Record<string, { id: string; label: string }[]>;
  selectedPlanByRole?: Record<string, string | null>;
  onSelectRolePlan?: (roleId: string, planId: string | null) => void;
  onOpenVideo: (url: string, title: string) => void;
  forcedOpenColumns: OptionalListColumnKey[];
  forcedClosedColumns: OptionalListColumnKey[];
  onListColumnsChange: (payload: {
    open: OptionalListColumnKey[];
    closed: OptionalListColumnKey[];
  }) => void;
};

const DESELECTION_FADE_DURATION_MS = 3000;
const LIST_COLUMN_GAP_PX = 12;

export type OptionalListColumnKey =
  | "version"
  | "status"
  | "targets"
  | "description"
  | "links"
  | "price";

type ListColumnKey = "software" | OptionalListColumnKey | "enabled";

const LIST_COLUMN_ORDER: ListColumnKey[] = [
  "software",
  "version",
  "status",
  "targets",
  "description",
  "links",
  "price",
  "enabled",
];

export const OPTIONAL_LIST_COLUMNS: OptionalListColumnKey[] = [
  "version",
  "price",
  "status",
  "targets",
  "description",
  "links",
];

const LIST_COLUMN_LABEL: Record<ListColumnKey, string> = {
  software: "Software",
  version: "Version",
  status: "Status",
  targets: "Targets",
  description: "Description",
  links: "Links",
  price: "Price",
  enabled: "Enabled",
};

const LIST_COLUMN_TEMPLATE: Record<ListColumnKey, string> = {
  software: "minmax(188px, 2.1fr)",
  version: "minmax(92px, 0.75fr)",
  status: "minmax(94px, 0.8fr)",
  targets: "minmax(116px, 0.95fr)",
  description: "minmax(186px, 1.8fr)",
  links: "minmax(102px, 0.8fr)",
  price: "minmax(96px, 0.8fr)",
  enabled: "minmax(132px, 0.95fr)",
};

const LIST_COLUMN_MIN_WIDTH: Record<ListColumnKey, number> = {
  software: 188,
  version: 92,
  status: 94,
  targets: 116,
  description: 186,
  links: 102,
  price: 96,
  enabled: 132,
};

function collapseEmojiForRole(role: Role): string {
  const targets = (role.deployment_targets || []).map((entry) =>
    String(entry || "").trim().toLowerCase()
  );
  const hasUniversal = targets.includes("universal");
  const hasServer = targets.includes("server");
  const hasWorkstation = targets.includes("workstation");
  if (hasUniversal || (hasServer && hasWorkstation)) return "🧩";
  if (hasServer) return "🖥️";
  if (hasWorkstation) return "💻";
  return "📦";
}

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

export default function RoleListView({
  baseUrl,
  roles,
  selected,
  iconSize,
  onToggleSelected,
  roleServerCountByRole,
  rolePlans,
  selectedPlanByRole,
  onSelectRolePlan,
  onOpenVideo,
  forcedOpenColumns,
  forcedClosedColumns,
  onListColumnsChange,
}: RoleListViewProps) {
  const [expandedTitleIds, setExpandedTitleIds] = useState<Set<string>>(new Set());
  const [deselectionFlashRoleIds, setDeselectionFlashRoleIds] = useState<Set<string>>(
    new Set()
  );
  const deselectionTimersRef = useRef<Record<string, ReturnType<typeof setTimeout>>>({});
  const listScrollRef = useRef<HTMLDivElement | null>(null);
  const listTopScrollRef = useRef<HTMLDivElement | null>(null);
  const listTopScrollInnerRef = useRef<HTMLDivElement | null>(null);
  const [containerWidth, setContainerWidth] = useState(0);
  const [showTopScrollbar, setShowTopScrollbar] = useState(false);
  const forcedOpenColumnSet = useMemo(
    () => new Set<OptionalListColumnKey>(forcedOpenColumns),
    [forcedOpenColumns]
  );
  const forcedClosedColumnSet = useMemo(
    () => new Set<OptionalListColumnKey>(forcedClosedColumns),
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

  const toggleTitleExpansion = (roleId: string) => {
    setExpandedTitleIds((prev) => {
      const next = new Set(prev);
      if (next.has(roleId)) {
        next.delete(roleId);
      } else {
        next.add(roleId);
      }
      return next;
    });
  };

  const clearDeselectionFlash = (roleId: string) => {
    const timer = deselectionTimersRef.current[roleId];
    if (timer) {
      clearTimeout(timer);
      delete deselectionTimersRef.current[roleId];
    }
    setDeselectionFlashRoleIds((prev) => {
      if (!prev.has(roleId)) return prev;
      const next = new Set(prev);
      next.delete(roleId);
      return next;
    });
  };

  const triggerDeselectionFlash = (roleId: string) => {
    clearDeselectionFlash(roleId);
    setDeselectionFlashRoleIds((prev) => {
      const next = new Set(prev);
      next.add(roleId);
      return next;
    });
    deselectionTimersRef.current[roleId] = setTimeout(() => {
      setDeselectionFlashRoleIds((prev) => {
        if (!prev.has(roleId)) return prev;
        const next = new Set(prev);
        next.delete(roleId);
        return next;
      });
      delete deselectionTimersRef.current[roleId];
    }, DESELECTION_FADE_DURATION_MS);
  };

  useEffect(() => {
    return () => {
      Object.values(deselectionTimersRef.current).forEach((timer) => clearTimeout(timer));
      deselectionTimersRef.current = {};
    };
  }, []);

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

  const visibleColumns = useMemo(() => {
    const visible = new Set<ListColumnKey>(["software", "enabled"]);
    let usedWidth =
      LIST_COLUMN_MIN_WIDTH.software +
      LIST_COLUMN_MIN_WIDTH.enabled +
      LIST_COLUMN_GAP_PX;

    OPTIONAL_LIST_COLUMNS.forEach((column) => {
      if (forcedClosedColumnSet.has(column)) return;

      const minWidth = LIST_COLUMN_MIN_WIDTH[column];
      const isForcedOpen = forcedOpenColumnSet.has(column);
      const fitsByDefault =
        containerWidth > 0
          ? usedWidth + LIST_COLUMN_GAP_PX + minWidth <= containerWidth
          : false;

      if (!isForcedOpen && !fitsByDefault) return;

      visible.add(column);
      usedWidth += LIST_COLUMN_GAP_PX + minWidth;
    });

    return LIST_COLUMN_ORDER.filter((column) => visible.has(column));
  }, [containerWidth, forcedOpenColumnSet, forcedClosedColumnSet]);

  const listGridStyle = useMemo(
    () => {
      const minWidth =
        visibleColumns.reduce((sum, column) => sum + LIST_COLUMN_MIN_WIDTH[column], 0) +
        Math.max(0, visibleColumns.length - 1) * LIST_COLUMN_GAP_PX;
      return {
        gridTemplateColumns: visibleColumns
          .map((column) => LIST_COLUMN_TEMPLATE[column])
          .join(" "),
        width: "100%",
        minWidth: `max(100%, ${minWidth}px)`,
      } as CSSProperties;
    },
    [visibleColumns]
  );

  useEffect(() => {
    syncTopScrollbarMetrics();
  }, [visibleColumns, roles.length]);

  const toggleColumn = (column: OptionalListColumnKey) => {
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
      open: OPTIONAL_LIST_COLUMNS.filter((entry) => nextOpen.has(entry)),
      closed: OPTIONAL_LIST_COLUMNS.filter((entry) => nextClosed.has(entry)),
    });
  };

  return (
    <div className={styles.listRoot}>
      <div className={styles.listStickyBar}>
        <div className={styles.listColumnToolbar}>
          <span className={styles.listColumnToolbarLabel}>Columns</span>
          {OPTIONAL_LIST_COLUMNS.map((column) => {
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
                title={visible ? `Collapse ${LIST_COLUMN_LABEL[column]}` : `Expand ${LIST_COLUMN_LABEL[column]}`}
              >
                <span>{LIST_COLUMN_LABEL[column]}</span>
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
              {LIST_COLUMN_LABEL[column]}
              {column === "software" || column === "enabled" ? (
                <i className="fa-solid fa-lock" aria-hidden="true" />
              ) : null}
            </span>
          ))}
        </div>

        {roles.map((role) => {
          const selectedState = selected.has(role.id);
          const isDeselectionFlashing = deselectionFlashRoleIds.has(role.id);
          const roleServerCount = Math.max(
            0,
            Math.floor(Number(roleServerCountByRole?.[role.id] || 0))
          );
          const plans = rolePlans?.[role.id] || [{ id: "community", label: "Community" }];
          const fallbackPlanId =
            plans.find((plan) => plan.id === "community")?.id ?? plans[0]?.id ?? "community";
          const selectedPlanId = selectedPlanByRole?.[role.id] ?? fallbackPlanId;
          const selectedPlanLabel =
            plans.find((plan) => plan.id === selectedPlanId)?.label ??
            plans.find((plan) => plan.id === fallbackPlanId)?.label ??
            "Community";
          const monthlyPriceLabel = formatMonthlyPrice(Math.max(1, roleServerCount));

          const name = String(role.display_name || "").trim();
          const collapsedByLength = name.length > 30;
          const expanded = expandedTitleIds.has(role.id);
          const collapseName = collapsedByLength && !expanded;
          const collapseEmoji = collapseEmojiForRole(role);
          const statusColors = colorForStatus(role.status);
          const statusStyle = {
            "--status-bg": statusColors.bg,
            "--status-fg": statusColors.fg,
            "--status-border": statusColors.border,
          } as CSSProperties;

          return (
            <div
              key={role.id}
              className={`${styles.listGrid} ${styles.listRow} ${
                selectedState ? styles.listRowSelected : styles.listRowDefault
              } ${isDeselectionFlashing ? styles.listRowDeselectedFlash : ""}`}
              style={listGridStyle}
            >
              {visibleColumns.map((column) => {
                if (column === "software") {
                  return (
                    <div key={`${role.id}:software`} className={styles.listRoleCell}>
                      <RoleLogoView role={role} size={iconSize} />
                      <div className={styles.listRoleText}>
                        {collapseName ? (
                          <button
                            type="button"
                            onClick={() => toggleTitleExpansion(role.id)}
                            className={styles.listRoleExpandButton}
                            title={name}
                            aria-label={`Expand title for ${name}`}
                          >
                            <span aria-hidden="true">{collapseEmoji}</span>
                          </button>
                        ) : collapsedByLength ? (
                          <button
                            type="button"
                            onClick={() => toggleTitleExpansion(role.id)}
                            className={styles.listRoleExpandedButton}
                            title="Collapse title"
                            aria-label={`Collapse title for ${name}`}
                          >
                            <span className={styles.listRoleNameExpanded}>{name}</span>
                            <span aria-hidden="true">🔽</span>
                          </button>
                        ) : (
                          <div className={styles.listRoleName}>{name}</div>
                        )}
                      </div>
                    </div>
                  );
                }

                if (column === "version") {
                  return (
                    <div key={`${role.id}:version`} className={styles.listVersionCell}>
                      <span className={styles.detailPlanBadge}>{selectedPlanLabel}</span>
                    </div>
                  );
                }

                if (column === "status") {
                  return (
                    <span
                      key={`${role.id}:status`}
                      className={`${styles.statusBadge} ${styles.listStatusBadge}`}
                      style={statusStyle}
                    >
                      {role.status}
                    </span>
                  );
                }

                if (column === "targets") {
                  return (
                    <div key={`${role.id}:targets`} className={styles.targetList}>
                      {displayTargets(role.deployment_targets ?? []).map((target) => (
                        <span key={`${role.id}-${target}`} className={styles.targetBadgeTiny}>
                          {target}
                        </span>
                      ))}
                    </div>
                  );
                }

                if (column === "description") {
                  return (
                    <div key={`${role.id}:description`} className={`text-body-secondary ${styles.listDescription}`}>
                      {role.description || "No description provided."}
                    </div>
                  );
                }

                if (column === "links") {
                  return (
                    <div key={`${role.id}:links`} className={styles.horizontalLinks}>
                      <RoleQuickLinks role={role} onOpenVideo={onOpenVideo} />
                    </div>
                  );
                }

                if (column === "price") {
                  return (
                    <div key={`${role.id}:price`} className={styles.listPriceCell}>
                      <span className={styles.listPriceValue}>{monthlyPriceLabel}</span>
                      <span className={styles.listPriceCaption}>per month</span>
                    </div>
                  );
                }

                return (
                  <div key={`${role.id}:enabled`} className={styles.listPickActions}>
                    <EnableDropdown
                      enabled={selectedState}
                      compact
                      showPlanField={false}
                      pricingModel="app"
                      plans={plans}
                      selectedPlanId={selectedPlanId}
                      onSelectPlan={(planId) => {
                        onSelectRolePlan?.(role.id, planId);
                        if (selectedState && !planId) {
                          triggerDeselectionFlash(role.id);
                          return;
                        }
                        if (planId) clearDeselectionFlash(role.id);
                      }}
                      roleId={role.id}
                      pricing={role.pricing || null}
                      pricingSummary={role.pricing_summary || null}
                      baseUrl={baseUrl}
                      serverCount={roleServerCount}
                      appCount={1}
                      onEnable={() => {
                        clearDeselectionFlash(role.id);
                        if (!selectedState) onToggleSelected(role.id);
                      }}
                      onDisable={() => {
                        if (selectedState) {
                          onToggleSelected(role.id);
                          triggerDeselectionFlash(role.id);
                        }
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
  );
}
