"use client";

import styles from "./styles.module.css";

type RemoveServerModalProps = {
  removeTarget: string | null;
  removeBusy: boolean;
  removeError: string | null;
  onCancel: () => void;
  onConfirm: () => void;
};

export default function RemoveServerModal({
  removeTarget,
  removeBusy,
  removeError,
  onCancel,
  onConfirm,
}: RemoveServerModalProps) {
  if (!removeTarget) return null;

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
          <h3 className={styles.modalTitle}>Delete device</h3>
          <p className={`text-body-secondary ${styles.modalHint}`}>
            Remove <strong>{removeTarget}</strong> from inventory and delete its host_vars
            file?
          </p>
        </div>
        {removeError ? <p className="text-danger">{removeError}</p> : null}
        <div className={styles.modalActionRow}>
          <button onClick={onCancel} className={styles.subtleButton}>
            Cancel
          </button>
          <button
            onClick={onConfirm}
            disabled={removeBusy}
            className={`${styles.deleteButton} ${
              removeBusy ? styles.deleteButtonBusy : ""
            }`}
          >
            {removeBusy ? "Deleting..." : "Delete"}
          </button>
        </div>
      </div>
    </div>
  );
}
