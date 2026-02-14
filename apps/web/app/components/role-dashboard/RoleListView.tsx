"use client";

import { useState } from "react";
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
};

function collapseEmojiForRole(role: Role): string {
  const targets = (role.deployment_targets || []).map((entry) =>
    String(entry || "").trim().toLowerCase()
  );
  const hasServer = targets.includes("server");
  const hasWorkstation = targets.includes("workstation");
  if (hasServer && hasWorkstation) return "🧩";
  if (hasServer) return "🖥️";
  if (hasWorkstation) return "💻";
  return "📦";
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
}: RoleListViewProps) {
  const [expandedTitleIds, setExpandedTitleIds] = useState<Set<string>>(new Set());

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
        const roleServerCount = Math.max(
          0,
          Math.floor(Number(roleServerCountByRole?.[role.id] || 0))
        );
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
            }`}
          >
            <div className={styles.listRoleCell}>
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
              <EnableDropdown
                enabled={selectedState}
                compact
                pricingModel="app"
                plans={rolePlans?.[role.id]}
                selectedPlanId={selectedPlanByRole?.[role.id] ?? null}
                onSelectPlan={(planId) => onSelectRolePlan?.(role.id, planId)}
                roleId={role.id}
                pricing={role.pricing || null}
                pricingSummary={role.pricing_summary || null}
                baseUrl={baseUrl}
                serverCount={roleServerCount}
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
