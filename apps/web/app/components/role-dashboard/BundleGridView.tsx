"use client";

import type { CSSProperties } from "react";
import EnableDropdown from "./EnableDropdown";
import styles from "./styles.module.css";
import type { Bundle } from "./types";

type BundleState = {
  enabled: boolean;
  selectedCount: number;
  totalCount: number;
};

type BundleGridViewProps = {
  bundles: Bundle[];
  computedColumns: number;
  gridGap: number;
  minHeight: number;
  activeAlias: string;
  bundleStates: Record<string, BundleState>;
  onEnableBundle: (bundle: Bundle) => void;
  onDisableBundle: (bundle: Bundle) => void;
};

function bundleIconClass(bundle: Bundle): string {
  const raw = String(bundle.logo_class || "").trim();
  return raw || "fa-solid fa-layer-group";
}

export default function BundleGridView({
  bundles,
  computedColumns,
  gridGap,
  minHeight,
  activeAlias,
  bundleStates,
  onEnableBundle,
  onDisableBundle,
}: BundleGridViewProps) {
  const gridStyle = {
    "--role-grid-columns": computedColumns,
    "--role-grid-row-height": `${minHeight}px`,
    "--role-grid-gap": `${gridGap}px`,
  } as CSSProperties;

  return (
    <div className={styles.gridRoot} style={gridStyle}>
      {bundles.map((bundle) => {
        const state = bundleStates[bundle.id] || {
          enabled: false,
          selectedCount: 0,
          totalCount: Array.isArray(bundle.role_ids) ? bundle.role_ids.length : 0,
        };
        const roleIds = Array.isArray(bundle.role_ids) ? bundle.role_ids : [];
        const visibleRoles = roleIds.slice(0, 2);
        const hiddenRoles = Math.max(0, roleIds.length - visibleRoles.length);

        return (
          <article
            key={bundle.id}
            className={`${styles.cardBase} ${styles.bundleCard} ${
              state.enabled ? styles.cardSelected : styles.cardDefault
            }`}
          >
            <div className={styles.detailTitleRow}>
              <div className={styles.detailRoleMeta}>
                <div className={styles.logoRoot}>
                  <i
                    className={`${bundleIconClass(bundle)} ${styles.logoMetaIcon}`}
                    aria-hidden="true"
                  />
                </div>
                <h3 className={styles.roleTitle} title={bundle.title}>
                  {bundle.title}
                </h3>
                <span className={styles.statusBadge}>{bundle.deploy_target}</span>
              </div>
            </div>

            <p className={`text-body-secondary ${styles.roleDescriptionLong}`}>
              {bundle.description || "No description provided."}
            </p>

            <div className={styles.bundleFooterRow}>
              <div className={styles.detailLinks}>
                <span className={styles.bundleRoleCount}>
                  {state.selectedCount}/{state.totalCount} apps
                </span>
                {visibleRoles.map((roleId) => (
                  <span key={`${bundle.id}:${roleId}`} className={styles.bundleBadgeTiny}>
                    {roleId}
                  </span>
                ))}
                {hiddenRoles > 0 ? (
                  <span className={styles.quickLinkOverflow}>...</span>
                ) : null}
              </div>
              <div className={styles.bundleControlRow}>
                <EnableDropdown
                  enabled={state.enabled}
                  compact
                  pricingModel="bundle"
                  plans={[{ id: "community", label: "Community" }]}
                  selectedPlanId="community"
                  appCount={Math.max(1, roleIds.length)}
                  contextLabel={`device "${activeAlias}" for bundle "${bundle.title}"`}
                  onEnable={() => onEnableBundle(bundle)}
                  onDisable={() => onDisableBundle(bundle)}
                />
              </div>
            </div>
          </article>
        );
      })}
    </div>
  );
}
