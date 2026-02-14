"use client";

import { quickLinksForRole, toEmbedUrl } from "./helpers";
import styles from "./styles.module.css";
import type { Role } from "./types";

type RoleQuickLinksProps = {
  role: Role;
  onOpenVideo: (url: string, title: string) => void;
  maxVisible?: number;
};

export default function RoleQuickLinks({
  role,
  onOpenVideo,
  maxVisible,
}: RoleQuickLinksProps) {
  const quickLinks = quickLinksForRole(role);
  if (quickLinks.length === 0) return null;
  const visible = Number.isFinite(maxVisible)
    ? quickLinks.slice(0, Math.max(0, Number(maxVisible)))
    : quickLinks;
  const hiddenCount = Math.max(0, quickLinks.length - visible.length);

  return (
    <>
      {visible.map((link) =>
        link.type === "video" ? (
          <button
            key={link.key}
            onClick={() =>
              onOpenVideo(toEmbedUrl(link.url || ""), `${role.display_name} video`)
            }
            title={link.label}
            aria-label={link.label}
            className={`${styles.quickLinkControl} ${styles.quickLinkButton}`}
          >
            <i className={`${link.iconClass} ${styles.quickLinkIcon}`} aria-hidden="true" />
          </button>
        ) : (
          <a
            key={link.key}
            href={link.url || "#"}
            target="_blank"
            rel="noopener noreferrer"
            title={link.label}
            aria-label={link.label}
            className={`${styles.quickLinkControl} ${styles.quickLinkAnchor}`}
          >
            <i className={`${link.iconClass} ${styles.quickLinkIcon}`} aria-hidden="true" />
          </a>
        )
      )}
      {hiddenCount > 0 ? (
        <span
          className={styles.quickLinkOverflow}
          title={`+${hiddenCount} more`}
          aria-label={`${hiddenCount} more links`}
        >
          ...
        </span>
      ) : null}
    </>
  );
}
