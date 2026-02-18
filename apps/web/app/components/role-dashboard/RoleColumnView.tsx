"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import type {
  CSSProperties,
  PointerEvent as ReactPointerEvent,
  WheelEvent as ReactWheelEvent,
} from "react";
import { colorForStatus } from "./helpers";
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
  onToggleSelected: (id: string) => void;
  roleServerCountByRole?: Record<string, number>;
  rolePlans?: Record<string, { id: string; label: string }[]>;
  selectedPlanByRole?: Record<string, string | null>;
  onSelectRolePlan?: (roleId: string, planId: string | null) => void;
  onOpenVideo: (url: string, title: string) => void;
  onOpenDetails?: (role: Role) => void;
};

const DESELECTION_FADE_DURATION_MS = 3000;
const PER_ITEM_DURATION_MIN_SECONDS = 14;
const PER_ITEM_DURATION_MAX_SECONDS = 20;

type LaneDragState = {
  laneIndex: number;
  pointerId: number;
  startPointerAxis: number;
  startScrollAxis: number;
};

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

export default function RoleColumnView({
  baseUrl,
  roles,
  selected,
  iconSize,
  variant,
  laneCount,
  laneSize,
  animationRunning,
  onToggleSelected,
  roleServerCountByRole,
  rolePlans,
  selectedPlanByRole,
  onSelectRolePlan,
  onOpenVideo,
  onOpenDetails,
}: RoleColumnViewProps) {
  const [deselectionFlashRoleIds, setDeselectionFlashRoleIds] = useState<Set<string>>(
    new Set()
  );
  const [hoveredLaneIndex, setHoveredLaneIndex] = useState<number | null>(null);
  const [draggingLaneIndex, setDraggingLaneIndex] = useState<number | null>(null);
  const deselectionTimersRef = useRef<Record<string, ReturnType<typeof setTimeout>>>({});
  const laneViewportRefs = useRef<Record<number, HTMLDivElement | null>>({});
  const laneDragRef = useRef<LaneDragState | null>(null);
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

  const readLaneScrollAxis = (viewport: HTMLDivElement): number =>
    variant === "row" ? viewport.scrollLeft : viewport.scrollTop;

  const writeLaneScrollAxis = (viewport: HTMLDivElement, value: number) => {
    if (variant === "row") {
      viewport.scrollLeft = value;
      return;
    }
    viewport.scrollTop = value;
  };

  const pointerAxis = (event: ReactPointerEvent<HTMLDivElement>): number =>
    variant === "row" ? event.clientX : event.clientY;

  const isInteractiveDragTarget = (target: EventTarget | null): boolean => {
    if (!(target instanceof HTMLElement)) return false;
    return Boolean(target.closest("button, a, input, select, textarea, [role='button']"));
  };

  const stopLaneDrag = (laneIndex: number, pointerId?: number) => {
    const drag = laneDragRef.current;
    if (!drag || drag.laneIndex !== laneIndex) return;
    if (typeof pointerId === "number" && drag.pointerId !== pointerId) return;
    const viewport = laneViewportRefs.current[laneIndex];
    if (
      viewport &&
      typeof pointerId === "number" &&
      typeof viewport.releasePointerCapture === "function"
    ) {
      try {
        viewport.releasePointerCapture(pointerId);
      } catch {
        // no-op: capture might already be released
      }
    }
    laneDragRef.current = null;
    setDraggingLaneIndex((prev) => (prev === laneIndex ? null : prev));
  };

  const handleLaneWheel =
    (laneIndex: number) => (event: ReactWheelEvent<HTMLDivElement>) => {
      const viewport = laneViewportRefs.current[laneIndex];
      if (!viewport) return;
      const delta =
        Math.abs(event.deltaY) >= Math.abs(event.deltaX) ? event.deltaY : event.deltaX;
      if (!Number.isFinite(delta) || delta === 0) return;
      writeLaneScrollAxis(viewport, readLaneScrollAxis(viewport) + delta);
      setHoveredLaneIndex(laneIndex);
      event.preventDefault();
    };

  const handleLanePointerDown =
    (laneIndex: number) => (event: ReactPointerEvent<HTMLDivElement>) => {
      if (event.button !== 0) return;
      if (isInteractiveDragTarget(event.target)) return;
      const viewport = laneViewportRefs.current[laneIndex];
      if (!viewport) return;
      laneDragRef.current = {
        laneIndex,
        pointerId: event.pointerId,
        startPointerAxis: pointerAxis(event),
        startScrollAxis: readLaneScrollAxis(viewport),
      };
      setDraggingLaneIndex(laneIndex);
      setHoveredLaneIndex(laneIndex);
      if (typeof viewport.setPointerCapture === "function") {
        try {
          viewport.setPointerCapture(event.pointerId);
        } catch {
          // no-op: capture can fail on unsupported targets
        }
      }
      event.preventDefault();
    };

  const handleLanePointerMove =
    (laneIndex: number) => (event: ReactPointerEvent<HTMLDivElement>) => {
      const drag = laneDragRef.current;
      if (!drag || drag.laneIndex !== laneIndex || drag.pointerId !== event.pointerId) return;
      const viewport = laneViewportRefs.current[laneIndex];
      if (!viewport) return;
      const delta = pointerAxis(event) - drag.startPointerAxis;
      writeLaneScrollAxis(viewport, drag.startScrollAxis - delta);
      event.preventDefault();
    };

  const handleLanePointerUp =
    (laneIndex: number) => (event: ReactPointerEvent<HTMLDivElement>) => {
      stopLaneDrag(laneIndex, event.pointerId);
    };

  const handleLanePointerCancel =
    (laneIndex: number) => (event: ReactPointerEvent<HTMLDivElement>) => {
      stopLaneDrag(laneIndex, event.pointerId);
    };

  useEffect(() => {
    return () => {
      Object.values(deselectionTimersRef.current).forEach((timer) => clearTimeout(timer));
      deselectionTimersRef.current = {};
      laneDragRef.current = null;
    };
  }, []);

  useEffect(() => {
    const raf = requestAnimationFrame(() => {
      lanes.forEach((_, laneIndex) => {
        const viewport = laneViewportRefs.current[laneIndex];
        if (!viewport) return;
        const maxScroll =
          variant === "row"
            ? Math.max(0, viewport.scrollWidth - viewport.clientWidth)
            : Math.max(0, viewport.scrollHeight - viewport.clientHeight);
        if (maxScroll <= 0) return;
        writeLaneScrollAxis(viewport, Math.floor(maxScroll / 2));
      });
    });
    return () => cancelAnimationFrame(raf);
  }, [lanes, variant]);

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
          const itemsPerLoop = Math.max(1, laneRoles.length);
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
                ref={(node) => {
                  laneViewportRefs.current[laneIndex] = node;
                }}
                className={`${styles.columnViewport} ${styles.columnViewportInteractive} ${
                  draggingLaneIndex === laneIndex ? styles.columnViewportDragging : ""
                }`}
                onMouseEnter={() => setHoveredLaneIndex(laneIndex)}
                onMouseLeave={() =>
                  setHoveredLaneIndex((prev) =>
                    draggingLaneIndex === laneIndex
                      ? laneIndex
                      : prev === laneIndex
                        ? null
                        : prev
                  )
                }
                onWheel={handleLaneWheel(laneIndex)}
                onPointerDown={handleLanePointerDown(laneIndex)}
                onPointerMove={handleLanePointerMove(laneIndex)}
                onPointerUp={handleLanePointerUp(laneIndex)}
                onPointerCancel={handleLanePointerCancel(laneIndex)}
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
                    const selectedPlanLabel =
                      plans.find(
                        (plan) =>
                          plan.id ===
                          (selectedPlanId ||
                            plans.find((candidate) => candidate.id === "community")?.id ||
                            plans[0]?.id)
                      )?.label || "Community";
                    const monthlyPriceLabel = formatMonthlyPrice(Math.max(1, roleServerCount));
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
                            <div className={styles.columnRowShell}>
                              <div className={styles.columnRowVisualPane}>
                                <div className={styles.columnLogoFrame}>
                                  <RoleLogoView role={role} size={Math.max(88, iconSize + 24)} />
                                </div>
                                <div className={styles.columnBadgeRow}>
                                  <span className={styles.detailPlanBadge} title={selectedPlanLabel}>
                                    {selectedPlanLabel}
                                  </span>
                                  <span className={styles.statusBadge} style={statusStyle}>
                                    {role.status}
                                  </span>
                                </div>
                                <div className={styles.columnLinksRow}>
                                  <RoleQuickLinks
                                    role={role}
                                    onOpenVideo={onOpenVideo}
                                    adaptiveOverflow
                                  />
                                </div>
                              </div>
                              <div className={styles.columnRowContentPane}>
                                <h3 className={styles.columnRoleName} title={role.display_name}>
                                  {role.display_name}
                                </h3>
                                <p
                                  className={`text-body-secondary ${styles.columnDescription} ${styles.columnDescriptionTight}`}
                                >
                                  {role.description || "No description provided."}
                                </p>
                                <div className={styles.columnPricePanel}>
                                  <span className={styles.columnPriceValue}>{monthlyPriceLabel}</span>
                                  <span className={styles.columnPriceCaption}>per month</span>
                                </div>
                                <div className={styles.columnActionRow}>
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
                                    onOpenDetails={
                                      onOpenDetails ? () => onOpenDetails(role) : undefined
                                    }
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
                          ) : (
                            <div className={styles.columnVerticalShell}>
                              <header className={styles.columnVerticalHeader}>
                                <h3 className={styles.columnRoleName} title={role.display_name}>
                                  {role.display_name}
                                </h3>
                              </header>
                              <div className={styles.columnLogoFrame}>
                                <RoleLogoView role={role} size={Math.max(92, iconSize + 28)} />
                              </div>
                              <div className={styles.columnBadgeRow}>
                                <span className={styles.detailPlanBadge} title={selectedPlanLabel}>
                                  {selectedPlanLabel}
                                </span>
                                <span className={styles.statusBadge} style={statusStyle}>
                                  {role.status}
                                </span>
                              </div>
                              <p
                                className={`text-body-secondary ${styles.columnDescription} ${styles.columnDescriptionMedium}`}
                              >
                                {role.description || "No description provided."}
                              </p>
                              <div className={styles.columnPricePanel}>
                                <span className={styles.columnPriceValue}>{monthlyPriceLabel}</span>
                                <span className={styles.columnPriceCaption}>per month</span>
                              </div>
                              <div className={styles.columnLinksRow}>
                                <RoleQuickLinks
                                  role={role}
                                  onOpenVideo={onOpenVideo}
                                  adaptiveOverflow
                                />
                              </div>
                              <div className={styles.columnActionRow}>
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
                                  onOpenDetails={
                                    onOpenDetails ? () => onOpenDetails(role) : undefined
                                  }
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
