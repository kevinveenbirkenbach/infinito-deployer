"use client";

import { useEffect, useState } from "react";

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
    <div
      onClick={onClose}
      style={{
        position: "fixed",
        inset: 0,
        background: "rgba(9, 12, 20, 0.65)",
        backdropFilter: "blur(6px)",
        display: "grid",
        placeItems: "center",
        zIndex: 80,
      }}
    >
      <div
        onClick={(event) => event.stopPropagation()}
        style={{
          width: "min(440px, 92vw)",
          background: "var(--bs-body-bg)",
          borderRadius: 18,
          border: "1px solid var(--bs-border-color-translucent)",
          boxShadow: "var(--deployer-shadow)",
          padding: 18,
          display: "grid",
          gap: 12,
        }}
      >
        <div>
          <h3 style={{ margin: 0, fontSize: 18 }}>{title}</h3>
          {helperText ? (
            <p
              className="text-body-secondary"
              style={{ margin: "6px 0 0", fontSize: 12 }}
            >
              {helperText}
            </p>
          ) : null}
        </div>
        <div style={{ display: "grid", gap: 8 }}>
          <label className="text-body-tertiary" style={{ fontSize: 12 }}>
            Master password
          </label>
          <input
            type="password"
            value={masterPassword}
            onChange={(event) => setMasterPassword(event.target.value)}
            placeholder="Enter master password"
            style={{
              padding: "8px 10px",
              borderRadius: 10,
              border: "1px solid var(--bs-border-color)",
              background: "var(--bs-body-bg)",
              fontSize: 12,
            }}
          />
        </div>
        {requireConfirm ? (
          <div style={{ display: "grid", gap: 8 }}>
            <label className="text-body-tertiary" style={{ fontSize: 12 }}>
              {confirmLabel}
            </label>
            <input
              type="password"
              value={confirmPassword}
              onChange={(event) => setConfirmPassword(event.target.value)}
              placeholder="Repeat master password"
              style={{
                padding: "8px 10px",
                borderRadius: 10,
                border: "1px solid var(--bs-border-color)",
                background: "var(--bs-body-bg)",
                fontSize: 12,
              }}
            />
          </div>
        ) : null}
        <div style={{ display: "flex", justifyContent: "flex-end", gap: 8 }}>
          <button
            onClick={onClose}
            style={{
              padding: "8px 12px",
              borderRadius: 999,
              border: "1px solid var(--bs-border-color)",
              background: "var(--bs-body-bg)",
              color: "var(--deployer-muted-ink)",
              fontSize: 12,
              cursor: "pointer",
            }}
          >
            Cancel
          </button>
          <button
            onClick={() =>
              onSubmit(masterPassword, requireConfirm ? confirmPassword : null)
            }
            disabled={!canSubmit}
            style={{
              padding: "8px 12px",
              borderRadius: 999,
              border: "1px solid var(--bs-body-color)",
              background: canSubmit
                ? "var(--bs-body-color)"
                : "var(--deployer-disabled-bg)",
              color: canSubmit
                ? "var(--bs-body-bg)"
                : "var(--deployer-disabled-text)",
              fontSize: 12,
              cursor: canSubmit ? "pointer" : "not-allowed",
            }}
          >
            Continue
          </button>
        </div>
      </div>
    </div>
  );
}
