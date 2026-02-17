"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import type { CSSProperties } from "react";
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
  onOpenRoleDetails?: (role: Role) => void;
  onEnableBundle: (bundle: Bundle) => void;
  onDisableBundle: (bundle: Bundle) => void;
};

const DESELECTION_FADE_DURATION_MS = 3000;
const LIST_GRID_TEMPLATE =
  "minmax(210px, 1.5fr) minmax(100px, 0.7fr) minmax(220px, 1.5fr) minmax(240px, 2fr) minmax(140px, 0.9fr)";

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
  onOpenRoleDetails,
  onEnableBundle,
  onDisableBundle,
}: BundleGridViewProps) {
  const [deselectionFlashBundleIds, setDeselectionFlashBundleIds] = useState<Set<string>>(
    new Set()
  );
  const [hoveredBundleId, setHoveredBundleId] = useState<string | null>(null);
  const [activeBundleDetailsId, setActiveBundleDetailsId] = useState<string | null>(null);
  const deselectionTimersRef = useRef<Record<string, ReturnType<typeof setTimeout>>>({});

  const gridStyle = {
    "--role-grid-columns": computedColumns,
    "--role-grid-row-height": `${minHeight}px`,
    "--role-grid-gap": `${gridGap}px`,
  } as CSSProperties;
  const listGridStyle = {
    gridTemplateColumns: LIST_GRID_TEMPLATE,
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

  const toggleBundle = (entry: BundleEntry) => {
    if (entry.state.enabled) {
      onDisableBundle(entry.bundle);
      triggerDeselectionFlash(entry.bundle.id);
      return;
    }
    clearDeselectionFlash(entry.bundle.id);
    onEnableBundle(entry.bundle);
  };

  const renderBundleRoleList = (entry: BundleEntry, pageSize: number) => (
    <BundleAppList
      bundleId={`${viewMode}:${entry.bundle.id}`}
      rows={entry.roleRows}
      pageSize={pageSize}
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

  if (entries.length === 0) {
    return <div className={`text-body-secondary ${styles.columnEmpty}`}>No bundles match the filters.</div>;
  }

  if (viewMode === "list" || viewMode === "matrix") {
    return (
      <>
        <div className={styles.listRoot}>
          <div className={`${styles.listGrid} ${styles.listHeader}`} style={listGridStyle}>
            <span className={styles.listHeaderCell}>Bundle</span>
            <span className={styles.listHeaderCell}>Target</span>
            <span className={styles.listHeaderCell}>Description</span>
            <span className={styles.listHeaderCell}>Apps</span>
            <span className={styles.listHeaderCell}>
              Enabled
              <i className="fa-solid fa-lock" aria-hidden="true" />
            </span>
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
                <div className={styles.listRoleCell}>
                  {bundleLogo(bundle, Math.max(28, viewConfig.iconSize - 8))}
                  <div className={styles.listRoleText}>
                    <div className={styles.listRoleName}>{bundle.title}</div>
                    <div className={`text-body-secondary ${styles.listRoleId}`}>{bundle.id}</div>
                  </div>
                </div>
                <span
                  className={`${styles.statusBadge} ${styles.listStatusBadge}`}
                  style={targetStatusStyle(bundle.deploy_target)}
                >
                  {bundle.deploy_target || "bundle"}
                </span>
                <div className={`text-body-secondary ${styles.listDescription}`}>
                  {bundle.description || "No description provided."}
                </div>
                <div className={styles.listPriceCell}>
                  <span className={styles.listPriceValue}>{entry.totalPriceLabel}</span>
                  <span className={`${styles.listPriceCaption} ${styles.bundlePerMonthCaption}`}>
                    per month
                  </span>
                  {renderBundleRoleList(entry, 2)}
                </div>
                <div className={styles.listPickActions}>
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
                  <span className={styles.detailPlanBadge} title={bundle.id}>
                    {bundle.id}
                  </span>
                  <span className={styles.statusBadge} style={statusStyle}>
                    {bundle.deploy_target || "bundle"}
                  </span>
                </div>
              </div>
            </div>

            <p className={styles.roleDescriptionOneLine}>
              {bundle.description || "No description provided."}
            </p>
            <div className={styles.listPriceCell}>
              <span className={styles.listPriceValue}>{entry.totalPriceLabel}</span>
              <span className={`${styles.listPriceCaption} ${styles.bundlePerMonthCaption}`}>
                per month
              </span>
            </div>
            <div className={styles.detailLinksRow}>{renderBundleRoleList(entry, 3)}</div>

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
    </>
  );
}
