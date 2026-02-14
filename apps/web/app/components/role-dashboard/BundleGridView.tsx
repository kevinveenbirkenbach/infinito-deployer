"use client";

import type { CSSProperties } from "react";
import styles from "./styles.module.css";
import type { Bundle } from "./types";

type BundleGridViewProps = {
  bundles: Bundle[];
  computedColumns: number;
  gridGap: number;
  minHeight: number;
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
}: BundleGridViewProps) {
  const gridStyle = {
    "--role-grid-columns": computedColumns,
    "--role-grid-row-height": `${minHeight}px`,
    "--role-grid-gap": `${gridGap}px`,
  } as CSSProperties;

  return (
    <div className={styles.gridRoot} style={gridStyle}>
      {bundles.map((bundle) => (
        <article
          key={bundle.id}
          className={`${styles.cardBase} ${styles.bundleCard} ${styles.cardDefault}`}
        >
          <div className={styles.bundleHeader}>
            <div className={styles.logoRoot}>
              <i className={`${bundleIconClass(bundle)} ${styles.logoMetaIcon}`} aria-hidden="true" />
            </div>
            <div className={styles.bundleHeaderText}>
              <h3 className={styles.roleTitle} title={bundle.title}>
                {bundle.title}
              </h3>
              <span className={styles.targetBadge}>{bundle.deploy_target}</span>
            </div>
          </div>
          <p className={`text-body-secondary ${styles.roleDescriptionLong}`}>
            {bundle.description || "No description provided."}
          </p>
          <div className={styles.bundleFooterMeta}>
            <span className={styles.bundleRoleCount}>
              {Array.isArray(bundle.role_ids) ? bundle.role_ids.length : 0} roles
            </span>
          </div>
        </article>
      ))}
    </div>
  );
}
