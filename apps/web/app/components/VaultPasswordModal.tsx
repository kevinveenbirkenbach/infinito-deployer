"use client";

import { useEffect, useState } from "react";
import styles from "./VaultPasswordModal.module.css";

type VaultPasswordModalProps = {
  open: boolean;
  title: string;
  requireConfirm?: boolean;
  confirmLabel?: string;
  helperText?: string;
  onSubmit: (masterPassword: string, confirmPassword: string | null) => void;
  onClose: () => void;
};

export default function VaultPasswordModal({
  open,
  title,
  requireConfirm = false,
  confirmLabel = "Confirm master password",
  helperText,
  onSubmit,
  onClose,
}: VaultPasswordModalProps) {
  const [masterPassword, setMasterPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");

  useEffect(() => {
    if (!open) return;
    setMasterPassword("");
    setConfirmPassword("");
  }, [open]);

  if (!open) return null;

  const canSubmit = requireConfirm
    ? masterPassword && confirmPassword && masterPassword === confirmPassword
    : !!masterPassword;

  return (
    <div onClick={onClose} className={styles.overlay}>
      <div onClick={(event) => event.stopPropagation()} className={styles.card}>
        <div>
          <h3 className={styles.title}>{title}</h3>
          {helperText ? (
            <p className={`text-body-secondary ${styles.helper}`}>{helperText}</p>
          ) : null}
        </div>
        <div className={styles.field}>
          <label className={`text-body-tertiary ${styles.label}`}>
            Master password
          </label>
          <input
            type="password"
            value={masterPassword}
            onChange={(event) => setMasterPassword(event.target.value)}
            placeholder="Enter master password"
            className={styles.input}
          />
        </div>
        {requireConfirm ? (
          <div className={styles.field}>
            <label className={`text-body-tertiary ${styles.label}`}>
              {confirmLabel}
            </label>
            <input
              type="password"
              value={confirmPassword}
              onChange={(event) => setConfirmPassword(event.target.value)}
              placeholder="Repeat master password"
              className={styles.input}
            />
          </div>
        ) : null}
        <div className={styles.actions}>
          <button onClick={onClose} className={styles.cancel}>
            Cancel
          </button>
          <button
            onClick={() =>
              onSubmit(masterPassword, requireConfirm ? confirmPassword : null)
            }
            disabled={!canSubmit}
            className={`${styles.continueButton} ${
              canSubmit ? styles.continueEnabled : styles.continueDisabled
            }`}
          >
            Continue
          </button>
        </div>
      </div>
    </div>
  );
}
