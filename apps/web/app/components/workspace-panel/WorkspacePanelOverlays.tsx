"use client";

import type { CSSProperties } from "react";
import VaultPasswordModal from "../VaultPasswordModal";
import styles from "./WorkspacePanelOverlays.module.css";

export default function WorkspacePanelOverlays(props: any) {
  const {
    contextMenu,
    setContextMenu,
    createFile,
    createDirectory,
    renameFile,
    downloadFile,
    deleteFile,
    setMasterChangeOpen,
    setMasterChangeError,
    setKeyPassphraseModal,
    setKeyPassphraseError,
    editorMenu,
    setEditorMenu,
    openVaultValueModal,
    kdbxPromptOpen,
    handleKdbxSubmit,
    setKdbxPromptOpen,
    setEditorLoading,
    vaultPromptOpen,
    vaultPromptMode,
    vaultPromptConfirm,
    handleVaultPromptSubmit,
    setVaultPromptOpen,
    setVaultPromptMode,
    setPendingCredentials,
    masterChangeOpen,
    masterChangeValues,
    setMasterChangeValues,
    masterChangeError,
    submitMasterChange,
    masterChangeBusy,
    keyPassphraseModal,
    keyPassphraseValues,
    setKeyPassphraseValues,
    keyPassphraseError,
    submitKeyPassphraseChange,
    keyPassphraseBusy,
    vaultValueModal,
    setVaultValueModal,
    vaultValueInputs,
    setVaultValueInputs,
    submitVaultValue,
  } = props;

  const menuPositionStyle = (x: number, y: number) => {
    const top =
      typeof window !== "undefined" ? Math.min(y, window.innerHeight - 120) : y;
    const left =
      typeof window !== "undefined" ? Math.min(x, window.innerWidth - 180) : x;
    return {
      "--menu-top": `${top}px`,
      "--menu-left": `${left}px`,
    } as CSSProperties;
  };

  return (
    <>
      {contextMenu ? (
        <div
          onClick={(event) => event.stopPropagation()}
          onContextMenu={(event) => {
            event.preventDefault();
            event.stopPropagation();
          }}
          className={`${styles.contextMenu} ${styles.contextMenuPrimary}`}
          style={menuPositionStyle(contextMenu.x, contextMenu.y)}
        >
          <button
            onClick={() => {
              const base =
                contextMenu.path && contextMenu.isDir
                  ? contextMenu.path
                  : contextMenu.path
                  ? contextMenu.path.split("/").slice(0, -1).join("/")
                  : "";
              setContextMenu(null);
              createFile(base);
            }}
            className={styles.contextButton}
          >
            New file…
          </button>
          <button
            onClick={() => {
              const base =
                contextMenu.path && contextMenu.isDir
                  ? contextMenu.path
                  : contextMenu.path
                  ? contextMenu.path.split("/").slice(0, -1).join("/")
                  : "";
              setContextMenu(null);
              createDirectory(base);
            }}
            className={styles.contextButton}
          >
            New folder…
          </button>
          {contextMenu.path ? <div className={styles.separator} /> : null}
          {contextMenu.path ? (
            <button
              onClick={() => {
                const path = contextMenu.path;
                if (!path) return;
                setContextMenu(null);
                renameFile(path, contextMenu.isDir);
              }}
              className={styles.contextButton}
            >
              Rename{contextMenu.isDir ? " folder" : ""}
            </button>
          ) : null}
          {contextMenu.path && !contextMenu.isDir ? (
            <button
              onClick={() => {
                const path = contextMenu.path;
                if (!path) return;
                setContextMenu(null);
                downloadFile(path);
              }}
              className={styles.contextButton}
            >
              Download file
            </button>
          ) : null}
          {contextMenu.path ? (
            <button
              onClick={() => {
                const path = contextMenu.path;
                if (!path) return;
                setContextMenu(null);
                deleteFile(path, contextMenu.isDir);
              }}
              className={`${styles.contextButton} ${styles.contextButtonDanger}`}
            >
              Delete{contextMenu.isDir ? " folder" : ""}
            </button>
          ) : null}
          {contextMenu.path
            ? (() => {
                const isVault = contextMenu.path === "secrets/credentials.kdbx";
                const keyAlias =
                  contextMenu.path.startsWith("secrets/keys/") &&
                  !contextMenu.path.endsWith(".pub")
                    ? contextMenu.path.split("/").pop() || ""
                    : "";
                if (!isVault && !keyAlias) return null;
                return (
                  <>
                    <div className={styles.separator} />
                    {isVault ? (
                      <button
                        onClick={() => {
                          setContextMenu(null);
                          setMasterChangeOpen(true);
                          setMasterChangeError(null);
                        }}
                        className={styles.contextButton}
                      >
                        Change master password…
                      </button>
                    ) : null}
                    {keyAlias ? (
                      <button
                        onClick={() => {
                          setContextMenu(null);
                          setKeyPassphraseModal({ alias: keyAlias });
                          setKeyPassphraseError(null);
                        }}
                        className={styles.contextButton}
                      >
                        Change key passphrase…
                      </button>
                    ) : null}
                  </>
                );
              })()
            : null}
        </div>
      ) : null}
      {editorMenu ? (
        <div
          onClick={(event) => event.stopPropagation()}
          onContextMenu={(event) => {
            event.preventDefault();
            event.stopPropagation();
          }}
          className={`${styles.contextMenu} ${styles.contextMenuEditor}`}
          style={menuPositionStyle(editorMenu.x, editorMenu.y)}
        >
          <button
            onClick={() => openVaultValueModal("show", editorMenu.block)}
            className={styles.contextButton}
          >
            Show plaintext…
          </button>
          <button
            onClick={() => openVaultValueModal("change", editorMenu.block)}
            className={styles.contextButton}
          >
            Change value…
          </button>
        </div>
      ) : null}
      <VaultPasswordModal
        open={kdbxPromptOpen}
        title="Unlock credentials.kdbx"
        helperText="Master password is required to read KDBX files."
        onSubmit={(masterPassword) => handleKdbxSubmit(masterPassword)}
        onClose={() => {
          setKdbxPromptOpen(false);
          setEditorLoading(false);
        }}
      />
      <VaultPasswordModal
        open={vaultPromptOpen}
        title={
          vaultPromptMode === "save-vault"
            ? "Store vault password"
            : "Unlock credentials vault"
        }
        requireConfirm={vaultPromptConfirm}
        confirmLabel="Confirm master password"
        helperText="Master password is required for each vault action."
        onSubmit={handleVaultPromptSubmit}
        onClose={() => {
          setVaultPromptOpen(false);
          setVaultPromptMode(null);
          setPendingCredentials(null);
        }}
      />
      {masterChangeOpen ? (
        <div onClick={() => setMasterChangeOpen(false)} className={styles.modalOverlay}>
          <div
            onClick={(event) => event.stopPropagation()}
            className={styles.modalCard}
          >
            <h3 className={styles.modalTitle}>Change master password</h3>
            <div className={styles.fieldStack}>
              <label className={`text-body-tertiary ${styles.fieldLabel}`}>
                Current master password
              </label>
              <input
                type="password"
                value={masterChangeValues.current}
                onChange={(event) =>
                  setMasterChangeValues((prev: any) => ({
                    ...prev,
                    current: event.target.value,
                  }))
                }
                className={styles.inputControl}
              />
            </div>
            <div className={styles.fieldStack}>
              <label className={`text-body-tertiary ${styles.fieldLabel}`}>
                New master password
              </label>
              <input
                type="password"
                value={masterChangeValues.next}
                onChange={(event) =>
                  setMasterChangeValues((prev: any) => ({
                    ...prev,
                    next: event.target.value,
                  }))
                }
                className={styles.inputControl}
              />
            </div>
            <div className={styles.fieldStack}>
              <label className={`text-body-tertiary ${styles.fieldLabel}`}>
                Confirm new master password
              </label>
              <input
                type="password"
                value={masterChangeValues.confirm}
                onChange={(event) =>
                  setMasterChangeValues((prev: any) => ({
                    ...prev,
                    confirm: event.target.value,
                  }))
                }
                className={styles.inputControl}
              />
            </div>
            {masterChangeError ? (
              <p className={`text-danger ${styles.errorText}`}>{masterChangeError}</p>
            ) : null}
            <div className={styles.actionsRow}>
              <button
                onClick={() => setMasterChangeOpen(false)}
                className={styles.secondaryButton}
              >
                Cancel
              </button>
              <button
                onClick={submitMasterChange}
                disabled={masterChangeBusy}
                className={styles.primaryButton}
              >
                {masterChangeBusy ? "Saving..." : "Change password"}
              </button>
            </div>
          </div>
        </div>
      ) : null}
      {keyPassphraseModal ? (
        <div
          onClick={() => setKeyPassphraseModal(null)}
          className={styles.modalOverlay}
        >
          <div
            onClick={(event) => event.stopPropagation()}
            className={styles.modalCard}
          >
            <h3 className={styles.modalTitle}>Change key passphrase</h3>
            <div className={styles.fieldStack}>
              <label className={`text-body-tertiary ${styles.fieldLabel}`}>
                Master password
              </label>
              <input
                type="password"
                value={keyPassphraseValues.master}
                onChange={(event) =>
                  setKeyPassphraseValues((prev: any) => ({
                    ...prev,
                    master: event.target.value,
                  }))
                }
                className={styles.inputControl}
              />
            </div>
            <div className={styles.fieldStack}>
              <label className={`text-body-tertiary ${styles.fieldLabel}`}>
                New passphrase
              </label>
              <input
                type="password"
                value={keyPassphraseValues.next}
                onChange={(event) =>
                  setKeyPassphraseValues((prev: any) => ({
                    ...prev,
                    next: event.target.value,
                  }))
                }
                className={styles.inputControl}
              />
            </div>
            <div className={styles.fieldStack}>
              <label className={`text-body-tertiary ${styles.fieldLabel}`}>
                Confirm new passphrase
              </label>
              <input
                type="password"
                value={keyPassphraseValues.confirm}
                onChange={(event) =>
                  setKeyPassphraseValues((prev: any) => ({
                    ...prev,
                    confirm: event.target.value,
                  }))
                }
                className={styles.inputControl}
              />
            </div>
            {keyPassphraseError ? (
              <p className={`text-danger ${styles.errorText}`}>{keyPassphraseError}</p>
            ) : null}
            <div className={styles.actionsRow}>
              <button
                onClick={() => setKeyPassphraseModal(null)}
                className={styles.secondaryButton}
              >
                Cancel
              </button>
              <button
                onClick={submitKeyPassphraseChange}
                disabled={keyPassphraseBusy}
                className={styles.primaryButton}
              >
                {keyPassphraseBusy ? "Saving..." : "Change passphrase"}
              </button>
            </div>
          </div>
        </div>
      ) : null}
      {vaultValueModal ? (
        <div onClick={() => setVaultValueModal(null)} className={styles.modalOverlay}>
          <div
            onClick={(event) => event.stopPropagation()}
            className={`${styles.modalCard} ${styles.modalCardWide}`}
          >
            <h3 className={styles.modalTitle}>
              {vaultValueModal.mode === "show"
                ? `Reveal ${vaultValueModal.block.key}`
                : `Change ${vaultValueModal.block.key}`}
            </h3>
            <div className={styles.fieldStack}>
              <label className={`text-body-tertiary ${styles.fieldLabel}`}>
                Master password
              </label>
              <input
                type="password"
                value={vaultValueInputs.master}
                onChange={(event) =>
                  setVaultValueInputs((prev: any) => ({
                    ...prev,
                    master: event.target.value,
                  }))
                }
                className={styles.inputControl}
              />
            </div>
            {vaultValueModal.mode === "change" ? (
              <>
                <div className={styles.fieldStack}>
                  <label className={`text-body-tertiary ${styles.fieldLabel}`}>
                    New value
                  </label>
                  <textarea
                    value={vaultValueInputs.next}
                    onChange={(event) =>
                      setVaultValueInputs((prev: any) => ({
                        ...prev,
                        next: event.target.value,
                      }))
                    }
                    rows={4}
                    className={styles.textareaControl}
                  />
                </div>
                <div className={styles.fieldStack}>
                  <label className={`text-body-tertiary ${styles.fieldLabel}`}>
                    Confirm new value
                  </label>
                  <textarea
                    value={vaultValueInputs.confirm}
                    onChange={(event) =>
                      setVaultValueInputs((prev: any) => ({
                        ...prev,
                        confirm: event.target.value,
                      }))
                    }
                    rows={4}
                    className={styles.textareaControl}
                  />
                </div>
              </>
            ) : null}
            {vaultValueModal.mode === "show" && vaultValueModal.plaintext ? (
              <div className={styles.fieldStack}>
                <label className={`text-body-tertiary ${styles.fieldLabel}`}>
                  Plaintext
                </label>
                <textarea
                  readOnly
                  value={vaultValueModal.plaintext}
                  rows={4}
                  className={`${styles.textareaControl} ${styles.textareaReadonly}`}
                />
              </div>
            ) : null}
            {vaultValueModal.error ? (
              <p className={`text-danger ${styles.errorText}`}>{vaultValueModal.error}</p>
            ) : null}
            <div className={styles.actionsRow}>
              <button
                onClick={() => setVaultValueModal(null)}
                className={styles.secondaryButton}
              >
                Close
              </button>
              <button
                onClick={submitVaultValue}
                disabled={vaultValueModal.loading}
                className={styles.primaryButton}
              >
                {vaultValueModal.loading
                  ? "Working..."
                  : vaultValueModal.mode === "show"
                  ? "Reveal"
                  : "Encrypt & replace"}
              </button>
            </div>
          </div>
        </div>
      ) : null}
    </>
  );
}
