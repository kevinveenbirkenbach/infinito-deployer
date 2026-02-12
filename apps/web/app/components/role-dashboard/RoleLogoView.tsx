"use client";

import type { CSSProperties } from "react";
import { useEffect, useMemo, useState } from "react";
import { SIMPLEICON_CDN } from "./constants";
import { initials, simpleIconCandidates } from "./helpers";
import styles from "./styles.module.css";
import type { Role } from "./types";

export default function RoleLogoView({
  role,
  size,
}: {
  role: Role;
  size: number;
}) {
  const simpleIconUrls = useMemo(() => {
    const candidates = simpleIconCandidates(role.display_name, role.id);
    const urls = candidates.map((slug) => `${SIMPLEICON_CDN}/${slug}`);
    if (role.logo?.source === "simpleicons" && role.logo.url) {
      return [role.logo.url, ...urls.filter((url) => url !== role.logo?.url)];
    }
    return urls;
  }, [role.display_name, role.id, role.logo?.source, role.logo?.url]);

  const initialMode: "simpleicons" | "meta" | "image" | "initials" =
    simpleIconUrls.length > 0
      ? "simpleicons"
      : role.logo?.css_class
      ? "meta"
      : role.logo?.url
      ? "image"
      : "initials";

  const [mode, setMode] = useState(initialMode);
  const [simpleIndex, setSimpleIndex] = useState(0);

  useEffect(() => {
    setMode(initialMode);
    setSimpleIndex(0);
  }, [initialMode, role.display_name, role.id]);

  const handleSimpleIconError = () => {
    setSimpleIndex((prev) => {
      const next = prev + 1;
      if (next < simpleIconUrls.length) return next;
      if (role.logo?.css_class) {
        setMode("meta");
      } else if (role.logo?.url) {
        setMode("image");
      } else {
        setMode("initials");
      }
      return prev;
    });
  };

  const handleMetaImageError = () => {
    setMode("initials");
  };

  const logoSizeStyle = {
    "--role-logo-size": `${size}px`,
    "--role-logo-meta-size": `${Math.max(16, Math.floor(size * 0.45))}px`,
    "--role-logo-initial-size": `${Math.max(14, Math.floor(size * 0.32))}px`,
  } as CSSProperties;

  return (
    <div className={styles.logoRoot} style={logoSizeStyle}>
      {mode === "simpleicons" && simpleIconUrls[simpleIndex] ? (
        <img
          src={simpleIconUrls[simpleIndex]}
          alt={role.display_name}
          onError={handleSimpleIconError}
          className={styles.logoImage}
        />
      ) : null}
      {mode === "meta" && role.logo?.css_class ? (
        <i
          className={`${role.logo.css_class} ${styles.logoMetaIcon}`}
          aria-hidden="true"
        />
      ) : null}
      {mode === "image" && role.logo?.url ? (
        <img
          src={role.logo.url}
          alt={role.display_name}
          onError={handleMetaImageError}
          className={styles.logoImage}
        />
      ) : null}
      {mode === "initials" ? (
        <span className={styles.logoInitials}>{initials(role.display_name)}</span>
      ) : null}
    </div>
  );
}
