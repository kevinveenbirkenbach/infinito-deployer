"use client";

import { useEffect, useRef, useState } from "react";
import styles from "./styles.module.css";

type EnableDropdownProps = {
  enabled: boolean;
  disabled?: boolean;
  compact?: boolean;
  contextLabel?: string;
  onEnable: () => void;
  onDisable: () => void;
};

export default function EnableDropdown({
  enabled,
  disabled = false,
  compact = false,
  contextLabel,
  onEnable,
  onDisable,
}: EnableDropdownProps) {
  const rootRef = useRef<HTMLDivElement | null>(null);
  const [menuOpen, setMenuOpen] = useState(false);
  const [confirmOpen, setConfirmOpen] = useState(false);

  useEffect(() => {
    if (!menuOpen) return;
    const handleClickOutside = (event: MouseEvent) => {
      const target = event.target as Node | null;
      if (!target) return;
      if (rootRef.current?.contains(target)) return;
      setMenuOpen(false);
    };
    const handleEscape = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        setMenuOpen(false);
      }
    };
    document.addEventListener("mousedown", handleClickOutside);
    document.addEventListener("keydown", handleEscape);
    return () => {
      document.removeEventListener("mousedown", handleClickOutside);
      document.removeEventListener("keydown", handleEscape);
    };
  }, [menuOpen]);

  const requestDisable = () => {
    if (!enabled || disabled) return;
    setMenuOpen(false);
    setConfirmOpen(true);
  };

  const label = enabled ? "Enabled" : "Enable";

  return (
    <>
      <div ref={rootRef} className={styles.enableControl}>
        <button
          type="button"
          disabled={disabled}
          onClick={() => {
            if (disabled) return;
            setMenuOpen((prev) => !prev);
          }}
          className={`${styles.enableTrigger} ${
            enabled ? styles.enableTriggerEnabled : styles.enableTriggerIdle
          } ${compact ? styles.enableTriggerCompact : ""} ${
            disabled ? styles.enableTriggerDisabled : ""
          }`}
          aria-haspopup="menu"
          aria-expanded={menuOpen}
        >
          <span>{label}</span>
          <i className="fa-solid fa-chevron-down" aria-hidden="true" />
        </button>
        {menuOpen ? (
          <div className={styles.enableMenu} role="menu">
            <button
              type="button"
              onClick={() => {
                setMenuOpen(false);
                if (!enabled) onEnable();
              }}
              className={`${styles.enableMenuItem} ${
                enabled ? styles.enableMenuItemActive : ""
              }`}
            >
              Enable
            </button>
            <button
              type="button"
              disabled={!enabled}
              onClick={requestDisable}
              className={`${styles.enableMenuItem} ${styles.enableMenuItemDanger}`}
            >
              Disable
            </button>
          </div>
        ) : null}
      </div>

      {confirmOpen ? (
        <div
          className={styles.enableConfirmOverlay}
          onClick={() => setConfirmOpen(false)}
        >
          <div
            className={styles.enableConfirmCard}
            onClick={(event) => event.stopPropagation()}
          >
            <h4 className={styles.enableConfirmTitle}>Disable app selection?</h4>
            <p className={styles.enableConfirmText}>
              {contextLabel
                ? `Disabling will remove this app from ${contextLabel}.`
                : "Disabling will remove this app from the current deployment selection."}
            </p>
            <p className={styles.enableConfirmText}>
              It will no longer be written to inventory for that scope and will not run
              in deployments until you enable it again.
            </p>
            <div className={styles.enableConfirmActions}>
              <button
                type="button"
                onClick={() => setConfirmOpen(false)}
                className={styles.enableCancelButton}
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={() => {
                  setConfirmOpen(false);
                  onDisable();
                }}
                className={styles.enableDisableButton}
              >
                Disable
              </button>
            </div>
          </div>
        </div>
      ) : null}
    </>
  );
}
