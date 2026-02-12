"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import styles from "./WorkspacePanelCards.module.css";

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
    credentialsScope,
    credentialsRole,
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
  } = props;

  const [secretsMenuOpen, setSecretsMenuOpen] = useState(false);
  const [workspaceMenuOpen, setWorkspaceMenuOpen] = useState(false);
  const [secretsSubmenu, setSecretsSubmenu] = useState<"app" | null>(null);
  const [vaultResetConfirmOpen, setVaultResetConfirmOpen] = useState(false);
  const [scopeModalOpen, setScopeModalOpen] = useState(false);
  const [scopeDraft, setScopeDraft] = useState<"all" | "single">("all");
  const [serverDraft, setServerDraft] = useState("");
  const [roleDraft, setRoleDraft] = useState("");
  const [overwriteDraft, setOverwriteDraft] = useState(false);
  const [submitIntent, setSubmitIntent] = useState<"generate" | "regenerate">(
    "generate"
  );
  const menuRootRef = useRef<HTMLDivElement | null>(null);

  const sortedAliases = useMemo(
    () => (Array.isArray(serverAliases) ? [...serverAliases] : []),
    [serverAliases]
  );

  const roleOptions = useMemo(
    () => (serverDraft ? serverRolesByAlias?.[serverDraft] ?? [] : []),
    [serverDraft, serverRolesByAlias]
  );

  useEffect(() => {
    if (!secretsMenuOpen && !workspaceMenuOpen) return;
    const onMouseDown = (event: MouseEvent) => {
      const target = event.target as Node | null;
      if (!target) return;
      if (menuRootRef.current?.contains(target)) return;
      setSecretsMenuOpen(false);
      setWorkspaceMenuOpen(false);
      setSecretsSubmenu(null);
    };
    document.addEventListener("mousedown", onMouseDown);
    return () => {
      document.removeEventListener("mousedown", onMouseDown);
    };
  }, [secretsMenuOpen, workspaceMenuOpen]);

  useEffect(() => {
    if (!scopeModalOpen) return;
    if (!serverDraft || !sortedAliases.includes(serverDraft)) {
      setServerDraft(sortedAliases[0] ?? "");
    }
  }, [scopeModalOpen, serverDraft, sortedAliases]);

  useEffect(() => {
    if (scopeDraft !== "single") return;
    if (roleOptions.length === 0) {
      setRoleDraft("");
      return;
    }
    if (roleOptions.includes(roleDraft)) return;
    setRoleDraft(roleOptions[0]);
  }, [roleDraft, roleOptions, scopeDraft]);

  const openScopeModal = (intent: "generate" | "regenerate") => {
    const nextScope = credentialsScope === "single" ? "single" : "all";
    const preferredAlias =
      (activeAlias && sortedAliases.includes(activeAlias) ? activeAlias : "") ||
      sortedAliases[0] ||
      "";
    const preferredRoles = preferredAlias
      ? serverRolesByAlias?.[preferredAlias] ?? []
      : [];
    const preferredRole =
      nextScope === "single"
        ? credentialsRole && preferredRoles.includes(credentialsRole)
          ? credentialsRole
          : preferredRoles[0] ?? ""
        : "";

    setSubmitIntent(intent);
    setScopeDraft(nextScope);
    setServerDraft(preferredAlias);
    setRoleDraft(preferredRole);
    setOverwriteDraft(intent === "regenerate" ? true : forceOverwrite);
    setSecretsMenuOpen(false);
    setWorkspaceMenuOpen(false);
    setSecretsSubmenu(null);
    setScopeModalOpen(true);
  };

  const targetRoles =
    scopeDraft === "single" ? (roleDraft ? [roleDraft] : []) : roleOptions;
  const canSubmitGenerate =
    canGenerateCredentials && Boolean(serverDraft) && targetRoles.length > 0;

  const confirmGenerate = () => {
    const nextScope = scopeDraft;
    const nextRole = nextScope === "single" ? roleDraft : "";
    const nextForce = submitIntent === "regenerate" ? true : overwriteDraft;
    setCredentialsScope(nextScope);
    setCredentialsRole(nextRole);
    setForceOverwrite(nextForce);
    void generateCredentials({
      scope: nextScope,
      role: nextRole,
      force: nextForce,
      alias: serverDraft,
      targetRoles,
    });
  };

  return (
    <div className={styles.cardsRoot}>
      <div className={`bg-body border ${styles.card}`}>
        <div ref={menuRootRef} className={styles.bottomRail}>
          <div className={styles.menuWrap}>
            <button
              onClick={() => {
                setSecretsMenuOpen((prev) => {
                  const next = !prev;
                  if (!next) setSecretsSubmenu(null);
                  return next;
                });
                setWorkspaceMenuOpen(false);
              }}
              className={styles.menuTrigger}
            >
              <i className="fa-solid fa-key" aria-hidden="true" />
              <span>Secrets</span>
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
                      onClick={() =>
                        setSecretsSubmenu((prev) => (prev === "app" ? null : "app"))
                      }
                      className={styles.menuItem}
                    >
                      <span className={styles.menuItemLabel}>
                        <i className="fa-solid fa-cubes" aria-hidden="true" />
                        App credentials
                      </span>
                      <i
                        className={`fa-solid ${
                          secretsSubmenu === "app" ? "fa-chevron-up" : "fa-chevron-down"
                        }`}
                        aria-hidden="true"
                      />
                    </button>
                    {secretsSubmenu === "app" ? (
                      <div className={styles.submenu}>
                        <button
                          onClick={() => openScopeModal("generate")}
                          disabled={!canGenerateCredentials}
                          className={styles.submenuItem}
                        >
                          <i className="fa-solid fa-plus" aria-hidden="true" />
                          Generate
                        </button>
                        <button
                          onClick={() => openScopeModal("regenerate")}
                          disabled={!canGenerateCredentials}
                          className={styles.submenuItem}
                        >
                          <i className="fa-solid fa-rotate-right" aria-hidden="true" />
                          Regenerate
                        </button>
                      </div>
                    ) : null}
                  </li>

                  <li className={styles.menuDivider} />

                  <li>
                    <button
                      onClick={() => {
                        setSecretsMenuOpen(false);
                        setWorkspaceMenuOpen(false);
                        setSecretsSubmenu(null);
                        openMasterPasswordDialog();
                      }}
                      className={styles.menuItem}
                    >
                      <span className={styles.menuItemLabel}>
                        <i className="fa-solid fa-user-lock" aria-hidden="true" />
                        {hasCredentialsVault
                          ? "Master password reset"
                          : "Master password set"}
                      </span>
                    </button>
                  </li>
                  <li>
                    <button
                      onClick={() => {
                        setSecretsMenuOpen(false);
                        setWorkspaceMenuOpen(false);
                        setSecretsSubmenu(null);
                        setVaultResetConfirmOpen(true);
                      }}
                      disabled={!hasCredentialsVault || credentialsBusy}
                      className={styles.menuItem}
                    >
                      <span className={styles.menuItemLabel}>
                        <i className="fa-solid fa-arrows-rotate" aria-hidden="true" />
                        Vault password reset
                      </span>
                    </button>
                  </li>
                </ul>
                {credentialsError ? (
                  <p className={`text-danger ${styles.menuStatus}`}>{credentialsError}</p>
                ) : null}
                {credentialsStatus ? (
                  <p className={`text-success ${styles.menuStatus}`}>{credentialsStatus}</p>
                ) : null}
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
                  setVaultResetConfirmOpen(false);
                  resetVaultPassword();
                }}
                disabled={credentialsBusy}
                className={styles.modalButton}
              >
                <i className="fa-solid fa-check" aria-hidden="true" />
                Continue
              </button>
            </div>
          </div>
        </div>
      ) : null}

      {scopeModalOpen ? (
        <div onClick={() => setScopeModalOpen(false)} className={styles.modalOverlay}>
          <div onClick={(event) => event.stopPropagation()} className={styles.modalCard}>
            <h3 className={styles.modalTitle}>
              {submitIntent === "regenerate"
                ? "Regenerate app credentials"
                : "Generate app credentials"}
            </h3>

            <div className={styles.radioGroup}>
              <label className={`text-body-secondary ${styles.radioLabel}`}>
                <input
                  type="radio"
                  name="credentials-scope-modal"
                  checked={scopeDraft === "all"}
                  onChange={() => setScopeDraft("all")}
                />
                All selected roles
              </label>
              <label className={`text-body-secondary ${styles.radioLabel}`}>
                <input
                  type="radio"
                  name="credentials-scope-modal"
                  checked={scopeDraft === "single"}
                  onChange={() => setScopeDraft("single")}
                />
                Single role
              </label>
            </div>

            <div className={styles.radioGroup}>
              <span className={`text-body-tertiary ${styles.label}`}>Server</span>
              <select
                value={serverDraft}
                onChange={(event) => setServerDraft(event.target.value)}
                disabled={sortedAliases.length === 0}
                className={`${styles.selectControl} ${
                  sortedAliases.length
                    ? styles.selectControlEnabled
                    : styles.selectControlDisabled
                }`}
              >
                {sortedAliases.length === 0 ? (
                  <option value="">No servers available</option>
                ) : null}
                {sortedAliases.map((alias: string) => (
                  <option key={alias} value={alias}>
                    {alias}
                  </option>
                ))}
              </select>
            </div>

            {scopeDraft === "single" ? (
              <div className={styles.radioGroup}>
                <span className={`text-body-tertiary ${styles.label}`}>Role</span>
                <select
                  value={roleDraft}
                  onChange={(event) => setRoleDraft(event.target.value)}
                  disabled={roleOptions.length === 0}
                  className={`${styles.selectControl} ${
                    roleOptions.length
                      ? styles.selectControlEnabled
                      : styles.selectControlDisabled
                  }`}
                >
                  {roleOptions.length === 0 ? (
                    <option value="">No roles selected</option>
                  ) : null}
                  {roleOptions.map((roleId: string) => (
                    <option key={roleId} value={roleId}>
                      {roleId}
                    </option>
                  ))}
                </select>
              </div>
            ) : null}

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
