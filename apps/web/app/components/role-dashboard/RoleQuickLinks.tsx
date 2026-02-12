"use client";

import { quickLinksForRole, toEmbedUrl } from "./helpers";
import styles from "./styles.module.css";
import type { Role } from "./types";

type RoleQuickLinksProps = {
  role: Role;
  onOpenVideo: (url: string, title: string) => void;
};

export default function RoleQuickLinks({
  role,
  onOpenVideo,
}: RoleQuickLinksProps) {
  const quickLinks = quickLinksForRole(role);
  if (quickLinks.length === 0) return null;

  return (
    <>
      {quickLinks.map((link) =>
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
    </>
  );
}
