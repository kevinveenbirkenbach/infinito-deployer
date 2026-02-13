"use client";

import styles from "./styles.module.css";

type RemoveServerModalProps = {
  mode: "delete" | "purge" | null;
  targets: string[];
  removeBusy: boolean;
  removeError: string | null;
  onCancel: () => void;
  onConfirm: () => void;
};

export default function RemoveServerModal({
  mode,
  targets,
  removeBusy,
  removeError,
  onCancel,
  onConfirm,
}: RemoveServerModalProps) {
  const aliases = (targets || []).filter(Boolean);
  if (!mode || aliases.length === 0) return null;

  const targetSummary =
    aliases.length === 1 ? <strong>{aliases[0]}</strong> : <strong>{aliases.length} devices</strong>;
  const title = mode === "purge" ? "Purge device" : "Delete device";
  const actionLabel =
    mode === "purge"
      ? removeBusy
        ? "Purging..."
        : "Purge"
      : removeBusy
      ? "Deleting..."
      : "Delete";

  return (
    <div
      onClick={() => {
        if (!removeBusy) {
          onCancel();
        }
      }}
      className={`${styles.modalOverlay} ${styles.removeModalOverlay}`}
    >
      <div
        onClick={(event) => event.stopPropagation()}
        className={`${styles.modalCard} ${styles.removeModalCard}`}
      >
        <div>
          <h3 className={styles.modalTitle}>
            <i
              className={
                mode === "purge" ? "fa-solid fa-broom" : "fa-solid fa-trash"
              }
              aria-hidden="true"
            />{" "}
            {title}
          </h3>
          <p className={`text-body-secondary ${styles.modalHint}`}>
            Confirm action for {targetSummary}.
          </p>
          {mode === "purge" ? (
            <>
              <p className={`text-body-secondary ${styles.modalHint}`}>
                Purge includes delete. It removes the device from inventory, deletes
                its `host_vars` file, and deletes associated SSH key files.
              </p>
              <p className={`text-body-secondary ${styles.modalHint}`}>
                This cannot be undone automatically.
              </p>
            </>
          ) : (
            <p className={`text-body-secondary ${styles.modalHint}`}>
              Delete removes the device from inventory and from the UI list. Use
              purge if you also want to remove host_vars and SSH key files.
            </p>
          )}
        </div>
        {removeError ? <p className="text-danger">{removeError}</p> : null}
        <div className={styles.modalActionRow}>
          <button onClick={onCancel} className={styles.confirmCancelButton}>
            Cancel
          </button>
          <button
            onClick={onConfirm}
            disabled={removeBusy}
            className={`${styles.confirmDangerButton} ${
              removeBusy ? styles.deleteButtonBusy : ""
            }`}
          >
            {actionLabel}
          </button>
        </div>
      </div>
    </div>
  );
}
