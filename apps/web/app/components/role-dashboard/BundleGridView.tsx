"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import type { CSSProperties } from "react";
import EnableDropdown from "./EnableDropdown";
import styles from "./styles.module.css";
import type { Bundle, ViewConfig, ViewMode } from "./types";

type BundleState = {
  enabled: boolean;
  selectedCount: number;
  totalCount: number;
};

type BundleEntry = {
  bundle: Bundle;
  roleIds: string[];
  visibleRoles: string[];
  hiddenRoles: number;
  state: BundleState;
};

type BundleGridViewProps = {
  bundles: Bundle[];
  viewMode: ViewMode;
  viewConfig: ViewConfig;
  computedColumns: number;
  gridGap: number;
  minHeight: number;
  activeAlias: string;
  bundleStates: Record<string, BundleState>;
  onEnableBundle: (bundle: Bundle) => void;
  onDisableBundle: (bundle: Bundle) => void;
};

const DESELECTION_FADE_DURATION_MS = 3000;
const LIST_GRID_TEMPLATE =
  "minmax(210px, 1.8fr) minmax(100px, 0.75fr) minmax(220px, 1.9fr) minmax(180px, 1.15fr) minmax(116px, 0.8fr)";

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
  onEnableBundle,
  onDisableBundle,
}: BundleGridViewProps) {
  const [deselectionFlashBundleIds, setDeselectionFlashBundleIds] = useState<Set<string>>(
    new Set()
  );
  const [hoveredBundleId, setHoveredBundleId] = useState<string | null>(null);
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
        const visibleRoles = roleIds.slice(0, 2);
        const hiddenRoles = Math.max(0, roleIds.length - visibleRoles.length);
        const state = bundleStates[bundle.id] || {
          enabled: false,
          selectedCount: 0,
          totalCount: roleIds.length,
        };
        return {
          bundle,
          roleIds,
          visibleRoles,
          hiddenRoles,
          state,
        };
      }),
    [bundles, bundleStates]
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

  const renderBundleSummary = (entry: BundleEntry) => (
    <div className={styles.detailLinks}>
      <span className={styles.bundleRoleCount}>
        {entry.state.selectedCount}/{entry.state.totalCount} apps
      </span>
      {entry.visibleRoles.map((roleId) => (
        <span key={`${entry.bundle.id}:${roleId}`} className={styles.bundleBadgeTiny}>
          {roleId}
        </span>
      ))}
      {entry.hiddenRoles > 0 ? (
        <span className={styles.quickLinkOverflow}>...</span>
      ) : null}
    </div>
  );

  useEffect(() => {
    return () => {
      Object.values(deselectionTimersRef.current).forEach((timer) => clearTimeout(timer));
      deselectionTimersRef.current = {};
    };
  }, []);

  if (entries.length === 0) {
    return <div className={`text-body-secondary ${styles.columnEmpty}`}>No bundles match the filters.</div>;
  }

  if (viewMode === "list" || viewMode === "matrix") {
    return (
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
              {renderBundleSummary(entry)}
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
    );
  }

  const isMiniView = viewMode === "mini";
  const isHorizontalView = viewMode === "row" || viewMode === "column";

  return (
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
              <div className={styles.horizontalLinks}>{renderBundleSummary(entry)}</div>
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

            <div className={styles.detailFooterRow}>
              <div className={styles.detailControlRow}>
                <EnableDropdown
                  enabled={state.enabled}
                  variant="tile"
                  showPlanField={false}
                  pricingModel="bundle"
                  plans={[{ id: "community", label: "Community" }]}
                  selectedPlanId="community"
                  tileMeta={renderBundleSummary(entry)}
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
            </div>
          </article>
        );
      })}
    </div>
  );
}
