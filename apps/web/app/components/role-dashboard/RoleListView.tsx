"use client";

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
  serverCount?: number;
  rolePlans?: Record<string, { id: string; label: string }[]>;
  selectedPlanByRole?: Record<string, string | null>;
  onSelectRolePlan?: (roleId: string, planId: string | null) => void;
  developerMode?: boolean;
  onEditRoleConfig?: (role: Role) => void;
  onOpenVideo: (url: string, title: string) => void;
};

export default function RoleListView({
  baseUrl,
  roles,
  selected,
  iconSize,
  onToggleSelected,
  serverCount = 1,
  rolePlans,
  selectedPlanByRole,
  onSelectRolePlan,
  developerMode = false,
  onEditRoleConfig,
  onOpenVideo,
}: RoleListViewProps) {
  return (
    <div className={styles.listRoot}>
      <div className={`${styles.listGrid} ${styles.listHeader}`}>
        <span>Software</span>
        <span>Status</span>
        <span>Targets</span>
        <span>Description</span>
        <span>Links</span>
        <span>Pick</span>
      </div>
      {roles.map((role) => {
        const selectedState = selected.has(role.id);
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
            }`}
          >
            <div className={styles.listRoleCell}>
              <RoleLogoView role={role} size={iconSize} />
              <div className={styles.listRoleText}>
                <div className={styles.listRoleName}>{role.display_name}</div>
              </div>
            </div>
            <span
              className={`${styles.statusBadge} ${styles.listStatusBadge}`}
              style={statusStyle}
            >
              {role.status}
            </span>
            <div className={styles.targetList}>
              {displayTargets(role.deployment_targets ?? []).map((target) => (
                <span key={`${role.id}-${target}`} className={styles.targetBadgeTiny}>
                  {target}
                </span>
              ))}
            </div>
            <div className={`text-body-secondary ${styles.listDescription}`}>
              {role.description || "No description provided."}
            </div>
            <div className={styles.horizontalLinks}>
              <RoleQuickLinks role={role} onOpenVideo={onOpenVideo} />
            </div>
            <div className={styles.listPickActions}>
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
                serverCount={serverCount}
                appCount={1}
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
        );
      })}
    </div>
  );
}
