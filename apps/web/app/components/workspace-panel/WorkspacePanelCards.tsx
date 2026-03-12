"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import WorkspacePanelCardModals from "./WorkspacePanelCardModals";
import WorkspacePanelUsersMenu from "./WorkspacePanelUsersMenu";
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
    deletingWorkspace,
    onDeleteWorkspace,
    onUsersAction,
    onOpenHistory,
  } = props;

  const [secretsMenuOpen, setSecretsMenuOpen] = useState(false);
  const [workspaceMenuOpen, setWorkspaceMenuOpen] = useState(false);
  const [usersMenuOpen, setUsersMenuOpen] = useState(false);
  const [usersImportMenuOpen, setUsersImportMenuOpen] = useState(false);
  const [usersExportMenuOpen, setUsersExportMenuOpen] = useState(false);
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
    if (!secretsMenuOpen && !workspaceMenuOpen && !usersMenuOpen) return;
    const onMouseDown = (event: MouseEvent) => {
      const target = event.target as Node | null;
      if (!target) return;
      if (menuRootRef.current?.contains(target)) return;
      setSecretsMenuOpen(false);
      setWorkspaceMenuOpen(false);
      setUsersMenuOpen(false);
      setUsersImportMenuOpen(false);
      setUsersExportMenuOpen(false);
    };
    document.addEventListener("mousedown", onMouseDown);
    return () => {
      document.removeEventListener("mousedown", onMouseDown);
    };
  }, [secretsMenuOpen, workspaceMenuOpen, usersMenuOpen]);

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

  const openHistoryModal = () => {
    setSecretsMenuOpen(false);
    setWorkspaceMenuOpen(false);
    setUsersMenuOpen(false);
    setUsersImportMenuOpen(false);
    setUsersExportMenuOpen(false);
    onOpenHistory?.();
  };

  const deleteWorkspaceFromMenu = () => {
    if (!workspaceId || deletingWorkspace || !onDeleteWorkspace) return;
    setSecretsMenuOpen(false);
    setWorkspaceMenuOpen(false);
    setUsersMenuOpen(false);
    setUsersImportMenuOpen(false);
    setUsersExportMenuOpen(false);
    onDeleteWorkspace(workspaceId);
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
                setUsersMenuOpen(false);
                setUsersImportMenuOpen(false);
                setUsersExportMenuOpen(false);
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
                setUsersMenuOpen(false);
                setUsersImportMenuOpen(false);
                setUsersExportMenuOpen(false);
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
                      onClick={openHistoryModal}
                      disabled={!workspaceId}
                      className={styles.menuItem}
                    >
                      <span className={styles.menuItemLabel}>
                        <i className="fa-solid fa-clock" aria-hidden="true" />
                        History
                      </span>
                    </button>
                  </li>
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
                  <li className={styles.menuDivider} aria-hidden="true" />
                  <li>
                    <button
                      onClick={deleteWorkspaceFromMenu}
                      disabled={!workspaceId || deletingWorkspace || !onDeleteWorkspace}
                      className={`${styles.menuItem} ${styles.menuItemDanger}`}
                    >
                      <span className={styles.menuItemLabel}>
                        <i className="fa-solid fa-trash" aria-hidden="true" />
                        {deletingWorkspace ? "Deleting..." : "Delete workspace"}
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

          <WorkspacePanelUsersMenu
            workspaceId={workspaceId}
            usersMenuOpen={usersMenuOpen}
            setUsersMenuOpen={setUsersMenuOpen}
            setSecretsMenuOpen={setSecretsMenuOpen}
            setWorkspaceMenuOpen={setWorkspaceMenuOpen}
            usersImportMenuOpen={usersImportMenuOpen}
            setUsersImportMenuOpen={setUsersImportMenuOpen}
            usersExportMenuOpen={usersExportMenuOpen}
            setUsersExportMenuOpen={setUsersExportMenuOpen}
            onUsersAction={onUsersAction}
          />

          <input
            ref={uploadInputRef}
            type="file"
            accept=".zip,application/zip"
            onChange={onUploadSelect}
            className={styles.hiddenInput}
          />
        </div>
      </div>

      <WorkspacePanelCardModals
        vaultResetConfirmOpen={vaultResetConfirmOpen}
        setVaultResetConfirmOpen={setVaultResetConfirmOpen}
        resetVaultPassword={resetVaultPassword}
        credentialsBusy={credentialsBusy}
        vaultErrorMessage={vaultErrorMessage}
        vaultStatusMessage={vaultStatusMessage}
        scopeModalOpen={scopeModalOpen}
        setScopeModalOpen={setScopeModalOpen}
        submitIntent={submitIntent}
        setSubmitIntent={setSubmitIntent}
        selectionMode={selectionMode}
        setSelectionMode={setSelectionMode}
        selectAllCustomCells={selectAllCustomCells}
        deselectAllCustomCells={deselectAllCustomCells}
        selectedCellCount={selectedCellCount}
        matrixAliases={matrixAliases}
        matrixRoles={matrixRoles}
        serverRolesByAlias={serverRolesByAlias}
        matrixSelection={matrixSelection}
        toggleMatrixCell={toggleMatrixCell}
        overwriteDraft={overwriteDraft}
        setOverwriteDraft={setOverwriteDraft}
        credentialsError={credentialsError}
        credentialsStatus={credentialsStatus}
        confirmGenerate={confirmGenerate}
        canSubmitGenerate={canSubmitGenerate}
      />
    </div>
  );
}
