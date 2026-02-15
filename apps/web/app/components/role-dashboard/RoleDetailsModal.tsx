"use client";

import EnableDropdown from "./EnableDropdown";
import RoleLogoView from "./RoleLogoView";
import RoleQuickLinks from "./RoleQuickLinks";
import { displayCategories, displayTargets } from "./helpers";
import styles from "./styles.module.css";
import type { Role } from "./types";

type RoleDetailsModalProps = {
  role: Role | null;
  aliases: string[];
  selectedAlias: string;
  selected: boolean;
  plans: { id: string; label: string }[];
  selectedPlanId: string | null;
  serverCount: number;
  onAliasChange: (alias: string) => void;
  onSelectPlan: (planId: string | null) => void;
  onEnable: () => void;
  onDisable: () => void;
  expertMode?: boolean;
  onEditRoleConfig?: () => void;
  onOpenVideo: (url: string, title: string) => void;
  onClose: () => void;
};

export default function RoleDetailsModal({
  role,
  aliases,
  selectedAlias,
  selected,
  plans,
  selectedPlanId,
  serverCount,
  onAliasChange,
  onSelectPlan,
  onEnable,
  onDisable,
  expertMode = false,
  onEditRoleConfig,
  onOpenVideo,
  onClose,
}: RoleDetailsModalProps) {
  if (!role) return null;

  const targets = displayTargets(role.deployment_targets ?? []);
  const categories = displayCategories(role.categories);
  const tags = displayCategories(role.galaxy_tags);

  return (
    <div onClick={onClose} className={styles.roleDetailsOverlay}>
      <div
        onClick={(event) => event.stopPropagation()}
        className={styles.roleDetailsCard}
      >
        <div className={styles.roleDetailsHeader}>
          <div className={styles.roleDetailsTitleWrap}>
            <RoleLogoView role={role} size={40} />
            <div className={styles.roleDetailsTitleText}>
              <h3 className={styles.roleDetailsTitle}>{role.display_name}</h3>
              <p className={styles.roleDetailsRoleId}>{role.id}</p>
            </div>
          </div>
          <button type="button" onClick={onClose} className={styles.roleDetailsCloseButton}>
            Close
          </button>
        </div>

        <div className={styles.roleDetailsAliasRow}>
          <span className={styles.roleDetailsAliasLabel}>Server</span>
          <select
            value={selectedAlias}
            onChange={(event) => onAliasChange(String(event.target.value || "").trim())}
            className={styles.roleDetailsAliasSelect}
          >
            {aliases.map((alias) => (
              <option key={alias} value={alias}>
                {alias}
              </option>
            ))}
          </select>
        </div>

        <div className={styles.roleDetailsBody}>
          <p className={`text-body-secondary ${styles.roleDetailsDescription}`}>
            {role.description || "No description provided."}
          </p>

          {targets.length > 0 ? (
            <div className={styles.roleDetailsSection}>
              <span className={styles.roleDetailsSectionLabel}>Targets</span>
              <div className={styles.roleDetailsPillRow}>
                {targets.map((target) => (
                  <span key={`${role.id}:${target}`} className={styles.targetBadge}>
                    {target}
                  </span>
                ))}
              </div>
            </div>
          ) : null}

          {categories.length > 0 ? (
            <div className={styles.roleDetailsSection}>
              <span className={styles.roleDetailsSectionLabel}>Categories</span>
              <div className={styles.roleDetailsPillRow}>
                {categories.map((entry) => (
                  <span key={`${role.id}:category:${entry}`} className={styles.targetBadge}>
                    {entry}
                  </span>
                ))}
              </div>
            </div>
          ) : null}

          {tags.length > 0 ? (
            <div className={styles.roleDetailsSection}>
              <span className={styles.roleDetailsSectionLabel}>Tags</span>
              <div className={styles.roleDetailsPillRow}>
                {tags.map((entry) => (
                  <span key={`${role.id}:tag:${entry}`} className={styles.targetBadge}>
                    {entry}
                  </span>
                ))}
              </div>
            </div>
          ) : null}

          <div className={styles.roleDetailsSection}>
            <span className={styles.roleDetailsSectionLabel}>Links</span>
            <div className={styles.roleDetailsLinks}>
              <RoleQuickLinks role={role} onOpenVideo={onOpenVideo} adaptiveOverflow />
            </div>
          </div>

          <div className={styles.roleDetailsControlWrap}>
            {expertMode && onEditRoleConfig ? (
              <div className={styles.roleDetailsActions}>
                <button
                  type="button"
                  onClick={onEditRoleConfig}
                  className={`${styles.selectButton} ${styles.selectButtonDefault}`}
                >
                  <i className="fa-solid fa-pen-to-square" aria-hidden="true" />
                  <span>Edit</span>
                </button>
              </div>
            ) : null}
            <EnableDropdown
              enabled={selected}
              pricingModel="app"
              plans={plans}
              selectedPlanId={selectedPlanId}
              onSelectPlan={onSelectPlan}
              roleId={role.id}
              pricing={role.pricing || null}
              pricingSummary={role.pricing_summary || null}
              serverCount={serverCount}
              appCount={1}
              onEnable={onEnable}
              onDisable={onDisable}
            />
          </div>
        </div>
      </div>
    </div>
  );
}
