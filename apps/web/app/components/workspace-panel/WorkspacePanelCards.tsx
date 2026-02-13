"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import styles from "./WorkspacePanelCards.module.css";

type CredentialsTarget = {
  alias: string;
  targetRoles: string[];
};

const matrixKey = (alias: string, role: string) => `${alias}::${role}`;

export default function WorkspacePanelCards(props: any) {
  const {
    generateCredentials,
    resetVaultPassword,
    openMasterPasswordDialog,
    hasCredentialsVault,
    canGenerateCredentials,
    credentialsBusy,
    workspaceId,
    activeAlias,
    serverAliases,
    serverRolesByAlias,
    setCredentialsRole,
    setCredentialsScope,
    forceOverwrite,
    setForceOverwrite,
    credentialsError,
    credentialsStatus,
    downloadZip,
    zipBusy,
    openUploadPicker,
    uploadBusy,
    uploadInputRef,
    onUploadSelect,
    uploadError,
    zipError,
    uploadStatus,
    openInventoryCleanup,
    inventoryCleanupBusy,
  } = props;

  const [secretsMenuOpen, setSecretsMenuOpen] = useState(false);
  const [workspaceMenuOpen, setWorkspaceMenuOpen] = useState(false);
  const [vaultResetConfirmOpen, setVaultResetConfirmOpen] = useState(false);
  const [scopeModalOpen, setScopeModalOpen] = useState(false);
  const [selectionMode, setSelectionMode] = useState<"all" | "custom">("all");
  const [matrixSelection, setMatrixSelection] = useState<Record<string, boolean>>({});
  const [overwriteDraft, setOverwriteDraft] = useState(false);
  const [submitIntent, setSubmitIntent] = useState<"generate" | "regenerate">(
    "generate"
  );
  const menuRootRef = useRef<HTMLDivElement | null>(null);

  const sortedAliases = useMemo(() => {
    const list = Array.isArray(serverAliases) ? [...serverAliases] : [];
    const preferredAlias = String(activeAlias || "").trim();
    if (!preferredAlias || !list.includes(preferredAlias)) return list;
    return [preferredAlias, ...list.filter((alias) => alias !== preferredAlias)];
  }, [activeAlias, serverAliases]);

  const matrixAliases = useMemo(
    () => sortedAliases.filter((alias) => (serverRolesByAlias?.[alias] ?? []).length > 0),
    [serverRolesByAlias, sortedAliases]
  );

  const matrixRoles = useMemo(() => {
    const seen = new Set<string>();
    matrixAliases.forEach((alias) => {
      (serverRolesByAlias?.[alias] ?? []).forEach((roleId: string) => {
        const key = String(roleId || "").trim();
        if (key) seen.add(key);
      });
    });
    return Array.from(seen);
  }, [matrixAliases, serverRolesByAlias]);

  const allTargets = useMemo<CredentialsTarget[]>(
    () =>
      matrixAliases
        .map((alias) => ({
          alias,
          targetRoles: (serverRolesByAlias?.[alias] ?? []).filter(Boolean),
        }))
        .filter((target) => target.targetRoles.length > 0),
    [matrixAliases, serverRolesByAlias]
  );

  useEffect(() => {
    if (!secretsMenuOpen && !workspaceMenuOpen) return;
    const onMouseDown = (event: MouseEvent) => {
      const target = event.target as Node | null;
      if (!target) return;
      if (menuRootRef.current?.contains(target)) return;
      setSecretsMenuOpen(false);
      setWorkspaceMenuOpen(false);
    };
    document.addEventListener("mousedown", onMouseDown);
    return () => {
      document.removeEventListener("mousedown", onMouseDown);
    };
  }, [secretsMenuOpen, workspaceMenuOpen]);

  const buildFullSelection = () => {
    const next: Record<string, boolean> = {};
    allTargets.forEach((target) => {
      target.targetRoles.forEach((roleId) => {
        next[matrixKey(target.alias, roleId)] = true;
      });
    });
    return next;
  };

  const openScopeModal = () => {
    setSubmitIntent("generate");
    setSelectionMode("all");
    setMatrixSelection(buildFullSelection());
    setOverwriteDraft(forceOverwrite);
    setSecretsMenuOpen(false);
    setWorkspaceMenuOpen(false);
    setScopeModalOpen(true);
  };

  const customTargets = useMemo<CredentialsTarget[]>(() => {
    return matrixAliases
      .map((alias) => {
        const selectedRoles = (serverRolesByAlias?.[alias] ?? []).filter((roleId: string) =>
          Boolean(matrixSelection[matrixKey(alias, roleId)])
        );
        return {
          alias,
          targetRoles: selectedRoles,
        };
      })
      .filter((target) => target.targetRoles.length > 0);
  }, [matrixAliases, matrixSelection, serverRolesByAlias]);

  const selectedCellCount = useMemo(
    () => customTargets.reduce((sum, target) => sum + target.targetRoles.length, 0),
    [customTargets]
  );

  const canSubmitGenerate =
    canGenerateCredentials &&
    (selectionMode === "all" ? allTargets.length > 0 : customTargets.length > 0);
  const vaultStatusMessage =
    credentialsStatus && /vault password/i.test(credentialsStatus)
      ? credentialsStatus
      : null;
  const vaultErrorMessage =
    credentialsError && /vault password/i.test(credentialsError)
      ? credentialsError
      : null;

  const selectAllCustomCells = () => {
    setMatrixSelection(buildFullSelection());
  };

  const deselectAllCustomCells = () => {
    setMatrixSelection({});
  };

  const toggleMatrixCell = (alias: string, roleId: string) => {
    const key = matrixKey(alias, roleId);
    setMatrixSelection((prev) => {
      const next = { ...prev };
      if (next[key]) {
        delete next[key];
      } else {
        next[key] = true;
      }
      return next;
    });
  };

  const confirmGenerate = () => {
    const nextForce = submitIntent === "regenerate" ? true : overwriteDraft;
    const targets = selectionMode === "all" ? allTargets : customTargets;
    setCredentialsScope("all");
    setCredentialsRole("");
    setForceOverwrite(nextForce);
    void generateCredentials({
      force: nextForce,
      targets,
    });
  };

  return (
    <div className={styles.cardsRoot}>
      <div className={`bg-body border ${styles.card}`}>
        <div ref={menuRootRef} className={styles.bottomRail}>
          <div className={styles.menuWrap}>
            <button
              onClick={() => {
                setSecretsMenuOpen((prev) => !prev);
                setWorkspaceMenuOpen(false);
              }}
              className={styles.menuTrigger}
            >
              <i className="fa-solid fa-key" aria-hidden="true" />
              <span>Credentials</span>
              <i
                className={`fa-solid ${
                  secretsMenuOpen ? "fa-chevron-up" : "fa-chevron-down"
                }`}
                aria-hidden="true"
              />
            </button>
            {secretsMenuOpen ? (
              <div className={styles.menuPanel}>
                <ul className={styles.menuList}>
                  <li>
                    <button
                      onClick={openScopeModal}
                      disabled={!canGenerateCredentials}
                      className={styles.menuItem}
                    >
                      <span className={styles.menuItemLabel}>
                        <i className="fa-solid fa-cubes" aria-hidden="true" />
                        App credentials
                      </span>
                    </button>
                  </li>

                  <li>
                    <button
                      onClick={() => {
                        setSecretsMenuOpen(false);
                        setWorkspaceMenuOpen(false);
                        openMasterPasswordDialog();
                      }}
                      className={styles.menuItem}
                    >
                      <span className={styles.menuItemLabel}>
                        <i className="fa-solid fa-user-lock" aria-hidden="true" />
                        Master Passwort
                      </span>
                    </button>
                  </li>
                  <li>
                    <button
                      onClick={() => {
                        setSecretsMenuOpen(false);
                        setWorkspaceMenuOpen(false);
                        setVaultResetConfirmOpen(true);
                      }}
                      disabled={!hasCredentialsVault || credentialsBusy}
                      className={styles.menuItem}
                    >
                      <span className={styles.menuItemLabel}>
                        <i className="fa-solid fa-arrows-rotate" aria-hidden="true" />
                        Vault password
                      </span>
                    </button>
                  </li>
                </ul>
              </div>
            ) : null}
          </div>

          <div className={styles.menuWrap}>
            <button
              onClick={() => {
                setWorkspaceMenuOpen((prev) => !prev);
                setSecretsMenuOpen(false);
              }}
              className={styles.menuTrigger}
            >
              <i className="fa-solid fa-folder-tree" aria-hidden="true" />
              <span>Workspace</span>
              <i
                className={`fa-solid ${
                  workspaceMenuOpen ? "fa-chevron-up" : "fa-chevron-down"
                }`}
                aria-hidden="true"
              />
            </button>
            {workspaceMenuOpen ? (
              <div className={styles.menuPanel}>
                <ul className={styles.menuList}>
                  <li>
                    <button
                      onClick={() => {
                        setWorkspaceMenuOpen(false);
                        downloadZip();
                      }}
                      disabled={!workspaceId || zipBusy}
                      className={styles.menuItem}
                    >
                      <span className={styles.menuItemLabel}>
                        <i className="fa-solid fa-file-arrow-down" aria-hidden="true" />
                        {zipBusy ? "Exporting..." : "Export"}
                      </span>
                    </button>
                  </li>
                  <li>
                    <button
                      onClick={() => {
                        setWorkspaceMenuOpen(false);
                        openUploadPicker();
                      }}
                      disabled={!workspaceId || uploadBusy}
                      className={styles.menuItem}
                    >
                      <span className={styles.menuItemLabel}>
                        <i className="fa-solid fa-file-arrow-up" aria-hidden="true" />
                        {uploadBusy ? "Importing..." : "Import"}
                      </span>
                    </button>
                  </li>
                  <li>
                    <button
                      onClick={() => {
                        setWorkspaceMenuOpen(false);
                        openInventoryCleanup?.();
                      }}
                      disabled={!workspaceId || inventoryCleanupBusy}
                      className={styles.menuItem}
                    >
                      <span className={styles.menuItemLabel}>
                        <i className="fa-solid fa-broom" aria-hidden="true" />
                        {inventoryCleanupBusy ? "Cleanup running..." : "Cleanup"}
                      </span>
                    </button>
                  </li>
                </ul>
                {uploadError ? (
                  <p className={`text-danger ${styles.menuStatus}`}>{uploadError}</p>
                ) : null}
                {zipError ? (
                  <p className={`text-danger ${styles.menuStatus}`}>{zipError}</p>
                ) : null}
                {uploadStatus ? (
                  <p className={`text-success ${styles.menuStatus}`}>{uploadStatus}</p>
                ) : null}
              </div>
            ) : null}
          </div>

          <input
            ref={uploadInputRef}
            type="file"
            accept=".zip,application/zip"
            onChange={onUploadSelect}
            className={styles.hiddenInput}
          />
        </div>
      </div>

      {vaultResetConfirmOpen ? (
        <div onClick={() => setVaultResetConfirmOpen(false)} className={styles.modalOverlay}>
          <div onClick={(event) => event.stopPropagation()} className={styles.modalCard}>
            <h3 className={styles.modalTitle}>Reset vault password</h3>
            <p className={`text-body-secondary ${styles.statusText}`}>
              Reset vault password and re-encrypt all vault values in this workspace?
            </p>
            <div className={styles.modalActions}>
              <button
                onClick={() => setVaultResetConfirmOpen(false)}
                className={styles.modalButton}
              >
                <i className="fa-solid fa-xmark" aria-hidden="true" />
                Cancel
              </button>
              <button
                onClick={() => {
                  resetVaultPassword();
                }}
                disabled={credentialsBusy}
                className={styles.modalButton}
              >
                <i className="fa-solid fa-check" aria-hidden="true" />
                Continue
              </button>
            </div>
            {vaultErrorMessage ? (
              <p className={`text-danger ${styles.statusText}`}>{vaultErrorMessage}</p>
            ) : null}
            {vaultStatusMessage ? (
              <p className={`text-success ${styles.statusText}`}>{vaultStatusMessage}</p>
            ) : null}
          </div>
        </div>
      ) : null}

      {scopeModalOpen ? (
        <div onClick={() => setScopeModalOpen(false)} className={styles.modalOverlay}>
          <div
            onClick={(event) => event.stopPropagation()}
            className={`${styles.modalCard} ${styles.modalCardLarge}`}
          >
            <h3 className={styles.modalTitle}>App credentials</h3>

            <div className={styles.radioGroup}>
              <span className={`text-body-tertiary ${styles.label}`}>Action</span>
              <label className={`text-body-secondary ${styles.radioLabel}`}>
                <input
                  type="radio"
                  name="credentials-action-modal"
                  checked={submitIntent === "generate"}
                  onChange={() => setSubmitIntent("generate")}
                />
                Generate
              </label>
              <label className={`text-body-secondary ${styles.radioLabel}`}>
                <input
                  type="radio"
                  name="credentials-action-modal"
                  checked={submitIntent === "regenerate"}
                  onChange={() => setSubmitIntent("regenerate")}
                />
                Regenerate
              </label>
            </div>

            <div className={styles.tabRow}>
              <button
                onClick={() => setSelectionMode("all")}
                className={`${styles.tabButton} ${
                  selectionMode === "all" ? styles.tabButtonActive : ""
                }`}
              >
                All
              </button>
              <button
                onClick={() => setSelectionMode("custom")}
                className={`${styles.tabButton} ${
                  selectionMode === "custom" ? styles.tabButtonActive : ""
                }`}
              >
                Custom
              </button>
            </div>

            {selectionMode === "all" ? (
              <p className={`text-body-secondary ${styles.statusText}`}>
                All available server-role targets will run. Regenerate recreates all of them.
              </p>
            ) : (
              <div className={styles.matrixBlock}>
                <div className={styles.matrixToolbar}>
                  <button
                    onClick={selectAllCustomCells}
                    className={styles.matrixActionButton}
                  >
                    Select all
                  </button>
                  <button
                    onClick={deselectAllCustomCells}
                    className={styles.matrixActionButton}
                  >
                    Deselect all
                  </button>
                  <span className={`text-body-secondary ${styles.helpSmall}`}>
                    {selectedCellCount} selected
                  </span>
                </div>
                {matrixAliases.length === 0 || matrixRoles.length === 0 ? (
                  <p className={`text-body-secondary ${styles.statusText}`}>
                    No selected roles available.
                  </p>
                ) : (
                  <div className={styles.matrixContainer}>
                    <table className={styles.matrixTable}>
                      <thead>
                        <tr>
                          <th>Role</th>
                          {matrixAliases.map((alias) => (
                            <th key={alias}>{alias}</th>
                          ))}
                        </tr>
                      </thead>
                      <tbody>
                        {matrixRoles.map((roleId) => (
                          <tr key={roleId}>
                            <th>{roleId}</th>
                            {matrixAliases.map((alias) => {
                              const available = (serverRolesByAlias?.[alias] ?? []).includes(
                                roleId
                              );
                              const cellId = matrixKey(alias, roleId);
                              return (
                                <td key={cellId}>
                                  {available ? (
                                    <input
                                      type="checkbox"
                                      checked={Boolean(matrixSelection[cellId])}
                                      onChange={() => toggleMatrixCell(alias, roleId)}
                                      disabled={credentialsBusy}
                                      className={styles.matrixCheckbox}
                                    />
                                  ) : (
                                    <span className={styles.matrixUnavailable}>-</span>
                                  )}
                                </td>
                              );
                            })}
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                )}
              </div>
            )}

            {submitIntent !== "regenerate" ? (
              <label className={`text-body-secondary ${styles.checkboxLabel}`}>
                <input
                  type="checkbox"
                  checked={overwriteDraft}
                  onChange={(event) => setOverwriteDraft(event.target.checked)}
                />
                Overwrite existing credentials
              </label>
            ) : (
              <span className={`text-body-secondary ${styles.helpSmall}`}>
                Recreate always runs in overwrite mode.
              </span>
            )}

            {credentialsError ? (
              <p className={`text-danger ${styles.statusText}`}>{credentialsError}</p>
            ) : null}
            {credentialsStatus ? (
              <p className={`text-success ${styles.statusText}`}>{credentialsStatus}</p>
            ) : null}

            <div className={styles.modalActions}>
              <button onClick={() => setScopeModalOpen(false)} className={styles.modalButton}>
                <i className="fa-solid fa-xmark" aria-hidden="true" />
                Close
              </button>
              <button
                onClick={confirmGenerate}
                disabled={!canSubmitGenerate || credentialsBusy}
                className={styles.modalButton}
              >
                <i className="fa-solid fa-play" aria-hidden="true" />
                {credentialsBusy
                  ? "Working..."
                  : submitIntent === "regenerate"
                  ? "Recreate"
                  : "Create"}
              </button>
            </div>
          </div>
        </div>
      ) : null}
    </div>
  );
}
