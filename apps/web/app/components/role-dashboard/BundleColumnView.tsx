"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import type { CSSProperties } from "react";
import EnableDropdown from "./EnableDropdown";
import styles from "./styles.module.css";
import type { Bundle } from "./types";

type ColumnVariant = "row" | "column";

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

type BundleColumnViewProps = {
  bundles: Bundle[];
  iconSize: number;
  variant: ColumnVariant;
  laneCount: number;
  laneSize: number;
  animationRunning: boolean;
  activeAlias: string;
  bundleStates: Record<string, BundleState>;
  onEnableBundle: (bundle: Bundle) => void;
  onDisableBundle: (bundle: Bundle) => void;
};

const DESELECTION_FADE_DURATION_MS = 3000;
const PER_ITEM_DURATION_MIN_SECONDS = 14;
const PER_ITEM_DURATION_MAX_SECONDS = 20;

function buildLanes<T>(items: T[], laneCount: number): T[][] {
  const safeLaneCount = Math.max(1, Math.floor(Number(laneCount) || 1));
  const lanes = Array.from({ length: safeLaneCount }, () => [] as T[]);
  items.forEach((item, index) => {
    lanes[index % safeLaneCount].push(item);
  });
  if (items.length > 0) {
    lanes.forEach((lane, laneIndex) => {
      if (lane.length === 0) {
        lane.push(items[laneIndex % items.length]);
      }
    });
  }
  return lanes;
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

export default function BundleColumnView({
  bundles,
  iconSize,
  variant,
  laneCount,
  laneSize,
  animationRunning,
  activeAlias,
  bundleStates,
  onEnableBundle,
  onDisableBundle,
}: BundleColumnViewProps) {
  const [deselectionFlashBundleIds, setDeselectionFlashBundleIds] = useState<Set<string>>(
    new Set()
  );
  const [hoveredLaneIndex, setHoveredLaneIndex] = useState<number | null>(null);
  const deselectionTimersRef = useRef<Record<string, ReturnType<typeof setTimeout>>>({});

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

  const lanes = useMemo(() => buildLanes(entries, laneCount), [entries, laneCount]);
  const safeLaneCount = Math.max(1, lanes.length);
  const safeLaneSize = Math.max(
    variant === "row" ? 110 : 160,
    Math.floor(Number(laneSize) || 0)
  );
  const rootStyle = {
    "--column-lane-count": safeLaneCount,
    "--column-lane-size": `${safeLaneSize}px`,
    "--column-row-card-width": `${Math.max(420, Math.round(safeLaneSize * 2))}px`,
    "--column-column-card-min-height": `${Math.max(260, Math.round(safeLaneSize * 2))}px`,
  } as CSSProperties;
  const laneRandomPerItemSeconds = useMemo(
    () =>
      lanes.map(() => {
        const random = Math.random();
        return (
          PER_ITEM_DURATION_MIN_SECONDS +
          random * (PER_ITEM_DURATION_MAX_SECONDS - PER_ITEM_DURATION_MIN_SECONDS)
        );
      }),
    [lanes, variant]
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
    return (
      <div className={styles.columnRoot} style={rootStyle}>
        <div className={`text-body-secondary ${styles.columnEmpty}`}>No bundles match the filters.</div>
      </div>
    );
  }

  return (
    <div
      className={`${styles.columnRoot} ${
        variant === "row" ? styles.columnRootRow : styles.columnRootColumn
      }`}
      style={rootStyle}
    >
      <div
        className={`${styles.columnLanes} ${
          variant === "row" ? styles.columnLanesRow : styles.columnLanesColumn
        }`}
      >
        {lanes.map((laneEntries, laneIndex) => {
          const displayEntries =
            laneEntries.length > 0 ? [...laneEntries, ...laneEntries] : [];
          const basePerItemSeconds =
            laneRandomPerItemSeconds[laneIndex] ??
            (PER_ITEM_DURATION_MIN_SECONDS + PER_ITEM_DURATION_MAX_SECONDS) / 2;
          const itemsPerLoop = Math.max(1, laneEntries.length);
          const duration = Number((basePerItemSeconds * itemsPerLoop).toFixed(2));
          const laneStyle = {
            "--column-scroll-duration": `${duration}s`,
          } as CSSProperties;
          const lanePaused = !animationRunning || hoveredLaneIndex === laneIndex;
          return (
            <div
              key={`lane-${laneIndex}`}
              className={`${styles.columnLane} ${
                variant === "row" ? styles.columnLaneRow : styles.columnLaneColumn
              }`}
            >
              <div
                className={styles.columnViewport}
                onMouseEnter={() => setHoveredLaneIndex(laneIndex)}
                onMouseLeave={() =>
                  setHoveredLaneIndex((prev) => (prev === laneIndex ? null : prev))
                }
              >
                <div
                  className={`${styles.columnTrack} ${
                    variant === "row"
                      ? styles.columnTrackHorizontal
                      : styles.columnTrackVertical
                  } ${lanePaused ? styles.columnTrackPaused : ""}`}
                  style={laneStyle}
                >
                  {displayEntries.map((entry, cardIndex) => {
                    const { bundle, roleIds, state } = entry;
                    const isDeselectionFlashing = deselectionFlashBundleIds.has(bundle.id);
                    const statusStyle = targetStatusStyle(bundle.deploy_target);
                    const appsLabel = `${state.selectedCount}/${state.totalCount}`;
                    const appsCaption = `of ${Math.max(1, roleIds.length)} apps enabled`;

                    return (
                      <article
                        key={`${laneIndex}-${cardIndex}-${bundle.id}`}
                        className={`${styles.cardBase} ${styles.columnCard} ${
                          variant === "row" ? styles.columnCardRow : styles.columnCardColumn
                        } ${state.enabled ? styles.cardSelected : styles.cardDefault} ${
                          isDeselectionFlashing ? styles.cardDeselectedFlash : ""
                        }`}
                      >
                        <div
                          className={`${styles.columnCardLayout} ${
                            variant === "row"
                              ? styles.columnCardLayoutRow
                              : styles.columnCardLayoutColumn
                          }`}
                        >
                          {variant === "row" ? (
                            <div className={styles.columnRowShell}>
                              <div className={styles.columnRowVisualPane}>
                                <div className={styles.columnLogoFrame}>
                                  {bundleLogo(bundle, Math.max(88, iconSize + 24))}
                                </div>
                                <div className={styles.columnBadgeRow}>
                                  <span className={styles.detailPlanBadge} title={bundle.id}>
                                    {bundle.id}
                                  </span>
                                  <span className={styles.statusBadge} style={statusStyle}>
                                    {bundle.deploy_target || "bundle"}
                                  </span>
                                </div>
                                <div className={styles.columnLinksRow}>
                                  {renderBundleSummary(entry)}
                                </div>
                              </div>
                              <div className={styles.columnRowContentPane}>
                                <h3 className={styles.columnRoleName} title={bundle.title}>
                                  {bundle.title}
                                </h3>
                                <p
                                  className={`text-body-secondary ${styles.columnDescription} ${styles.columnDescriptionTight}`}
                                >
                                  {bundle.description || "No description provided."}
                                </p>
                                <div className={styles.columnPricePanel}>
                                  <span className={styles.columnPriceValue}>{appsLabel}</span>
                                  <span className={styles.columnPriceCaption}>{appsCaption}</span>
                                </div>
                                <div className={styles.columnActionRow}>
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
                            </div>
                          ) : (
                            <div className={styles.columnVerticalShell}>
                              <header className={styles.columnVerticalHeader}>
                                <h3 className={styles.columnRoleName} title={bundle.title}>
                                  {bundle.title}
                                </h3>
                              </header>
                              <div className={styles.columnLogoFrame}>
                                {bundleLogo(bundle, Math.max(92, iconSize + 28))}
                              </div>
                              <div className={styles.columnBadgeRow}>
                                <span className={styles.detailPlanBadge} title={bundle.id}>
                                  {bundle.id}
                                </span>
                                <span className={styles.statusBadge} style={statusStyle}>
                                  {bundle.deploy_target || "bundle"}
                                </span>
                              </div>
                              <p
                                className={`text-body-secondary ${styles.columnDescription} ${styles.columnDescriptionMedium}`}
                              >
                                {bundle.description || "No description provided."}
                              </p>
                              <div className={styles.columnPricePanel}>
                                <span className={styles.columnPriceValue}>{appsLabel}</span>
                                <span className={styles.columnPriceCaption}>{appsCaption}</span>
                              </div>
                              <div className={styles.columnLinksRow}>
                                {renderBundleSummary(entry)}
                              </div>
                              <div className={styles.columnActionRow}>
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
                          )}
                        </div>
                      </article>
                    );
                  })}
                </div>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
