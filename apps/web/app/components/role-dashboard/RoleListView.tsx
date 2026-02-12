"use client";

import type { CSSProperties } from "react";
import { colorForStatus, displayTargets } from "./helpers";
import RoleLogoView from "./RoleLogoView";
import RoleQuickLinks from "./RoleQuickLinks";
import styles from "./styles.module.css";
import type { Role } from "./types";

type RoleListViewProps = {
  roles: Role[];
  selected: Set<string>;
  iconSize: number;
  onToggleSelected: (id: string) => void;
  onOpenVideo: (url: string, title: string) => void;
};

export default function RoleListView({
  roles,
  selected,
  iconSize,
  onToggleSelected,
  onOpenVideo,
}: RoleListViewProps) {
  return (
    <div className={styles.listRoot}>
      <div className={`${styles.listGrid} ${styles.listHeader}`}>
        <span>Role</span>
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
                <div className={`text-body-secondary ${styles.listRoleId}`}>
                  {role.id}
                </div>
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
            <button
              onClick={() => onToggleSelected(role.id)}
              className={`${styles.selectButton} ${
                selectedState ? styles.selectButtonSelected : styles.selectButtonDefault
              }`}
            >
              {selectedState ? "Selected" : "Select"}
            </button>
          </div>
        );
      })}
    </div>
  );
}
