"use client";

import type { CSSProperties } from "react";
import { useState } from "react";
import { colorForStatus, displayTargets } from "./helpers";
import EnableDropdown from "./EnableDropdown";
import RoleLogoView from "./RoleLogoView";
import RoleQuickLinks from "./RoleQuickLinks";
import styles from "./styles.module.css";
import type { Role, ViewConfig, ViewMode } from "./types";

type RoleGridViewProps = {
  baseUrl?: string;
  roles: Role[];
  selected: Set<string>;
  onToggleSelected: (id: string) => void;
  rolePlans?: Record<string, { id: string; label: string }[]>;
  selectedPlanByRole?: Record<string, string | null>;
  onSelectRolePlan?: (roleId: string, planId: string | null) => void;
  developerMode?: boolean;
  onEditRoleConfig?: (role: Role) => void;
  viewMode: ViewMode;
  viewConfig: ViewConfig;
  computedColumns: number;
  gridGap: number;
  onOpenVideo: (url: string, title: string) => void;
};

export default function RoleGridView({
  baseUrl,
  roles,
  selected,
  onToggleSelected,
  rolePlans,
  selectedPlanByRole,
  onSelectRolePlan,
  developerMode = false,
  onEditRoleConfig,
  viewMode,
  viewConfig,
  computedColumns,
  gridGap,
  onOpenVideo,
}: RoleGridViewProps) {
  const [hoveredRoleId, setHoveredRoleId] = useState<string | null>(null);

  const gridStyle = {
    "--role-grid-columns": computedColumns,
    "--role-grid-row-height": `${viewConfig.minHeight}px`,
    "--role-grid-gap": `${gridGap}px`,
  } as CSSProperties;

  return (
    <div className={styles.gridRoot} style={gridStyle}>
      {roles.map((role) => {
        const selectedState = selected.has(role.id);
        const statusColors = colorForStatus(role.status);
        const statusStyle = {
          "--status-bg": statusColors.bg,
          "--status-fg": statusColors.fg,
          "--status-border": statusColors.border,
        } as CSSProperties;
        const cardHeightStyle = {
          "--role-card-min-height": `${viewConfig.minHeight}px`,
        } as CSSProperties;
        const logo = <RoleLogoView role={role} size={viewConfig.iconSize} />;

        if (viewConfig.horizontal) {
          return (
            <article
              key={role.id}
              className={`${styles.cardBase} ${styles.horizontalCard} ${
                selectedState ? styles.cardSelected : styles.cardDefault
              }`}
              style={cardHeightStyle}
            >
              <div className={styles.horizontalHeader}>
                {logo}
                <div className={styles.roleMetaWrap}>
                  <div className={styles.roleTitleRow}>
                    <h3 className={styles.roleTitle} title={role.display_name}>
                      {role.display_name}
                    </h3>
                    <span className={styles.statusBadge} style={statusStyle}>
                      {role.status}
                    </span>
                  </div>
                  {viewConfig.showDescription ? (
                    <p className={`text-body-secondary ${styles.roleDescriptionShort}`}>
                      {role.description || "No description provided."}
                    </p>
                  ) : null}
                  {viewConfig.showTargets ? (
                    <div className={styles.targetList}>
                      {displayTargets(role.deployment_targets ?? []).map((target) => (
                        <span key={`${role.id}-${target}`} className={styles.targetBadge}>
                          {target}
                        </span>
                      ))}
                    </div>
                  ) : null}
                </div>
                <div className={styles.roleActionButtons}>
                  {developerMode && onEditRoleConfig ? (
                    <button
                      onClick={() => onEditRoleConfig(role)}
                      className={`${styles.selectButton} ${styles.selectButtonDefault}`}
                    >
                      <i className="fa-solid fa-pen-to-square" aria-hidden="true" />
                      <span>Edit</span>
                    </button>
                  ) : null}
                  <EnableDropdown
                    enabled={selectedState}
                    plans={rolePlans?.[role.id]}
                    selectedPlanId={selectedPlanByRole?.[role.id] ?? null}
                    onSelectPlan={(planId) => onSelectRolePlan?.(role.id, planId)}
                    roleId={role.id}
                    pricing={role.pricing || null}
                    pricingSummary={role.pricing_summary || null}
                    baseUrl={baseUrl}
                    onEnable={() => {
                      if (!selectedState) onToggleSelected(role.id);
                    }}
                    onDisable={() => {
                      if (selectedState) onToggleSelected(role.id);
                    }}
                    contextLabel={`the active device for "${role.display_name}"`}
                  />
                </div>
              </div>

              {viewConfig.showLinks ? (
                <div className={styles.horizontalLinks}>
                  <RoleQuickLinks role={role} onOpenVideo={onOpenVideo} />
                </div>
              ) : null}
            </article>
          );
        }

        if (viewMode === "mini") {
          const showTooltip = hoveredRoleId === role.id;
          const targets = displayTargets(role.deployment_targets ?? []);
          return (
            <article
              key={role.id}
              onMouseEnter={() => setHoveredRoleId(role.id)}
              onMouseLeave={() => setHoveredRoleId(null)}
              onFocus={() => setHoveredRoleId(role.id)}
              onBlur={() => setHoveredRoleId(null)}
              onClick={() => onToggleSelected(role.id)}
              onKeyDown={(event) => {
                if (event.key === "Enter" || event.key === " ") {
                  event.preventDefault();
                  onToggleSelected(role.id);
                }
              }}
              tabIndex={0}
              role="button"
              aria-pressed={selectedState}
              className={`${styles.cardBase} ${styles.miniCard} ${
                selectedState ? styles.cardSelected : styles.cardDefault
              }`}
              style={cardHeightStyle}
            >
              {logo}
              <div className={styles.miniTitle} title={role.display_name}>
                {role.display_name}
              </div>
              {selectedState ? (
                <span className={styles.miniSelectedBadge}>
                  <i className="fa-solid fa-check" aria-hidden="true" />
                </span>
              ) : null}
              {developerMode && onEditRoleConfig ? (
                <button
                  type="button"
                  onClick={(event) => {
                    event.stopPropagation();
                    onEditRoleConfig(role);
                  }}
                  className={styles.miniEditButton}
                >
                  <i className="fa-solid fa-pen-to-square" aria-hidden="true" />
                </button>
              ) : null}
              {showTooltip ? (
                <div className={styles.miniTooltip}>
                  <div className={styles.tooltipTitle}>{role.display_name}</div>
                  <span className={styles.statusBadge} style={statusStyle}>
                    {role.status}
                  </span>
                  {targets.length > 0 ? (
                    <div className={styles.targetList}>
                      {targets.map((target) => (
                        <span key={`${role.id}-${target}`} className={styles.targetBadgeTiny}>
                          {target}
                        </span>
                      ))}
                    </div>
                  ) : null}
                  <div className={`text-body-secondary ${styles.tooltipDescription}`}>
                    {role.description || "No description provided."}
                  </div>
                </div>
              ) : null}
            </article>
          );
        }

        return (
          <article
            key={role.id}
            className={`${styles.cardBase} ${styles.detailCard} ${
              selectedState ? styles.cardSelected : styles.cardDefault
            }`}
            style={cardHeightStyle}
          >
            <div className={styles.detailHeader}>
              {logo}
              <div className={styles.roleActionButtons}>
                {developerMode && onEditRoleConfig ? (
                  <button
                    onClick={() => onEditRoleConfig(role)}
                    className={`${styles.selectButton} ${styles.selectButtonDefault}`}
                  >
                    <i className="fa-solid fa-pen-to-square" aria-hidden="true" />
                      <span>Edit</span>
                    </button>
                ) : null}
                <EnableDropdown
                  enabled={selectedState}
                  plans={rolePlans?.[role.id]}
                  selectedPlanId={selectedPlanByRole?.[role.id] ?? null}
                  onSelectPlan={(planId) => onSelectRolePlan?.(role.id, planId)}
                  roleId={role.id}
                  pricing={role.pricing || null}
                  pricingSummary={role.pricing_summary || null}
                  baseUrl={baseUrl}
                  onEnable={() => {
                    if (!selectedState) onToggleSelected(role.id);
                  }}
                  onDisable={() => {
                    if (selectedState) onToggleSelected(role.id);
                  }}
                  contextLabel={`the active device for "${role.display_name}"`}
                />
              </div>
            </div>

            <div>
              <div className={styles.detailRoleMeta}>
                <h3 className={styles.roleTitle} title={role.display_name}>
                  {role.display_name}
                </h3>
                <span className={styles.statusBadge} style={statusStyle}>
                  {role.status}
                </span>
              </div>
              {viewConfig.showDescription ? (
                <p className={`text-body-secondary ${styles.roleDescriptionLong}`}>
                  {role.description || "No description provided."}
                </p>
              ) : null}
            </div>

            {viewConfig.showTargets ? (
              <div className={styles.targetList}>
                {displayTargets(role.deployment_targets ?? []).map((target) => (
                  <span key={`${role.id}-${target}`} className={styles.targetBadge}>
                    {target}
                  </span>
                ))}
              </div>
            ) : null}

            {viewConfig.showLinks ? (
              <div className={styles.detailLinks}>
                <RoleQuickLinks role={role} onOpenVideo={onOpenVideo} />
              </div>
            ) : null}
          </article>
        );
      })}
    </div>
  );
}
