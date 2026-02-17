"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import type { CSSProperties } from "react";
import { colorForStatus, displayTargets } from "./helpers";
import EnableDropdown from "./EnableDropdown";
import RoleLogoView from "./RoleLogoView";
import RoleQuickLinks from "./RoleQuickLinks";
import styles from "./styles.module.css";
import type { Role } from "./types";

type ColumnVariant = "row" | "column";

type RoleColumnViewProps = {
  baseUrl?: string;
  roles: Role[];
  selected: Set<string>;
  iconSize: number;
  variant: ColumnVariant;
  laneCount: number;
  laneSize: number;
  animationRunning: boolean;
  speedOffsetSeconds: number;
  onToggleSelected: (id: string) => void;
  roleServerCountByRole?: Record<string, number>;
  rolePlans?: Record<string, { id: string; label: string }[]>;
  selectedPlanByRole?: Record<string, string | null>;
  onSelectRolePlan?: (roleId: string, planId: string | null) => void;
  onOpenVideo: (url: string, title: string) => void;
};

const DESELECTION_FADE_DURATION_MS = 3000;
const PER_ITEM_DURATION_MIN_SECONDS = 14;
const PER_ITEM_DURATION_MAX_SECONDS = 20;

function buildLanes(roles: Role[], laneCount: number): Role[][] {
  const safeLaneCount = Math.max(1, Math.floor(Number(laneCount) || 1));
  const lanes = Array.from({ length: safeLaneCount }, () => [] as Role[]);
  roles.forEach((role, index) => {
    lanes[index % safeLaneCount].push(role);
  });
  if (roles.length > 0) {
    lanes.forEach((lane, laneIndex) => {
      if (lane.length === 0) {
        lane.push(roles[laneIndex % roles.length]);
      }
    });
  }
  return lanes;
}

function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value));
}

export default function RoleColumnView({
  baseUrl,
  roles,
  selected,
  iconSize,
  variant,
  laneCount,
  laneSize,
  animationRunning,
  speedOffsetSeconds,
  onToggleSelected,
  roleServerCountByRole,
  rolePlans,
  selectedPlanByRole,
  onSelectRolePlan,
  onOpenVideo,
}: RoleColumnViewProps) {
  const [deselectionFlashRoleIds, setDeselectionFlashRoleIds] = useState<Set<string>>(
    new Set()
  );
  const [hoveredLaneIndex, setHoveredLaneIndex] = useState<number | null>(null);
  const deselectionTimersRef = useRef<Record<string, ReturnType<typeof setTimeout>>>({});
  const lanes = useMemo(() => buildLanes(roles, laneCount), [roles, laneCount]);
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

  if (roles.length === 0) {
    return (
      <div className={styles.columnRoot} style={rootStyle}>
        <div className={`text-body-secondary ${styles.columnEmpty}`}>No apps match the filters.</div>
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
        {lanes.map((laneRoles, laneIndex) => {
          const displayRoles = laneRoles.length > 0 ? [...laneRoles, ...laneRoles] : [];
          const basePerItemSeconds =
            laneRandomPerItemSeconds[laneIndex] ??
            (PER_ITEM_DURATION_MIN_SECONDS + PER_ITEM_DURATION_MAX_SECONDS) / 2;
          const adjustedPerItemSeconds = clamp(
            basePerItemSeconds + speedOffsetSeconds,
            PER_ITEM_DURATION_MIN_SECONDS,
            PER_ITEM_DURATION_MAX_SECONDS
          );
          const itemsPerLoop = Math.max(1, laneRoles.length);
          const duration = Number((adjustedPerItemSeconds * itemsPerLoop).toFixed(2));
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
                  {displayRoles.map((role, cardIndex) => {
                    const selectedState = selected.has(role.id);
                    const isDeselectionFlashing = deselectionFlashRoleIds.has(role.id);
                    const plans = rolePlans?.[role.id] || [{ id: "community", label: "Community" }];
                    const selectedPlanId =
                      selectedPlanByRole?.[role.id] ??
                      plans.find((plan) => plan.id === "community")?.id ??
                      plans[0]?.id ??
                      "community";
                    const roleServerCount = Math.max(
                      0,
                      Math.floor(Number(roleServerCountByRole?.[role.id] || 0))
                    );
                    const statusColors = colorForStatus(role.status);
                    const statusStyle = {
                      "--status-bg": statusColors.bg,
                      "--status-fg": statusColors.fg,
                      "--status-border": statusColors.border,
                    } as CSSProperties;

                    return (
                      <article
                        key={`${laneIndex}-${cardIndex}-${role.id}`}
                        className={`${styles.cardBase} ${styles.columnCard} ${
                          variant === "row" ? styles.columnCardRow : styles.columnCardColumn
                        } ${selectedState ? styles.cardSelected : styles.cardDefault} ${
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
                            <>
                              <div className={styles.columnRowPrimary}>
                                <RoleLogoView role={role} size={Math.max(36, iconSize - 4)} />
                                <span className={styles.statusBadge} style={statusStyle}>
                                  {role.status}
                                </span>
                                <div className={styles.columnTargetRow}>
                                  {displayTargets(role.deployment_targets ?? []).map((target) => (
                                    <span
                                      key={`${role.id}-${target}-${cardIndex}`}
                                      className={styles.targetBadgeTiny}
                                    >
                                      {target}
                                    </span>
                                  ))}
                                </div>
                                <div className={styles.columnRoleId} title={role.id}>
                                  {role.id}
                                </div>
                              </div>
                              <div className={styles.columnRowSecondary}>
                                <div className={styles.columnRowHead}>
                                  <h3 className={styles.columnRoleName} title={role.display_name}>
                                    {role.display_name}
                                  </h3>
                                  <p className={`text-body-secondary ${styles.columnDescription}`}>
                                    {role.description || "No description provided."}
                                  </p>
                                </div>
                                <div className={styles.columnRowFooter}>
                                  <div className={styles.columnSecondaryMeta}>
                                    <div className={styles.columnLinksRow}>
                                      <RoleQuickLinks
                                        role={role}
                                        onOpenVideo={onOpenVideo}
                                        adaptiveOverflow
                                      />
                                    </div>
                                  </div>
                                  <div className={styles.columnActions}>
                                    <EnableDropdown
                                      enabled={selectedState}
                                      compact
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
                                </div>
                              </div>
                            </>
                          ) : (
                            <>
                              <div className={styles.columnPrimary}>
                                <div className={styles.columnTitleRow}>
                                  <RoleLogoView role={role} size={iconSize} />
                                  <div className={styles.columnTitleMeta}>
                                    <h3 className={styles.columnRoleName} title={role.display_name}>
                                      {role.display_name}
                                    </h3>
                                    <div className={styles.columnBadgeRow}>
                                      <span className={styles.statusBadge} style={statusStyle}>
                                        {role.status}
                                      </span>
                                      <span className={styles.columnRoleId} title={role.id}>
                                        {role.id}
                                      </span>
                                    </div>
                                  </div>
                                </div>
                                <div className={styles.columnTargetRow}>
                                  {displayTargets(role.deployment_targets ?? []).map((target) => (
                                    <span
                                      key={`${role.id}-${target}-${cardIndex}`}
                                      className={styles.targetBadge}
                                    >
                                      {target}
                                    </span>
                                  ))}
                                </div>
                                <p className={`text-body-secondary ${styles.columnDescription}`}>
                                  {role.description || "No description provided."}
                                </p>
                              </div>
                              <div className={styles.columnSecondary}>
                                <div className={styles.columnSecondaryMeta}>
                                  <div className={styles.columnLinksRow}>
                                    <RoleQuickLinks
                                      role={role}
                                      onOpenVideo={onOpenVideo}
                                      adaptiveOverflow
                                    />
                                  </div>
                                </div>
                                <div className={styles.columnActions}>
                                  <EnableDropdown
                                    enabled={selectedState}
                                    compact
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
                              </div>
                            </>
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
