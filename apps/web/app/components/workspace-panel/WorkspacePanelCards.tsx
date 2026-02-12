"use client";

import styles from "./WorkspacePanelCards.module.css";

export default function WorkspacePanelCards(props: any) {
  const {
    generateCredentials,
    canGenerateCredentials,
    credentialsBusy,
    vaultPasswordDraft,
    setVaultPasswordDraft,
    vaultPasswordConfirm,
    setVaultPasswordConfirm,
    setVaultPromptMode,
    setVaultPromptConfirm,
    setVaultPromptOpen,
    workspaceId,
    credentialsScope,
    setValuesText,
    setSetValuesText,
    activeRoles,
    credentialsRole,
    setCredentialsRole,
    setCredentialsScope,
    allowEmptyPlain,
    setAllowEmptyPlain,
    forceOverwrite,
    setForceOverwrite,
    credentialsError,
    vaultError,
    vaultStatus,
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

  return (
    <div className={styles.cardsRoot}>
      <div className={`bg-body border ${styles.card}`}>
        <label className={`text-body-tertiary ${styles.label}`}>Credentials</label>
        <div className={styles.actionsRow}>
          <button
            onClick={generateCredentials}
            disabled={!canGenerateCredentials}
            className={`${styles.primaryButton} ${
              canGenerateCredentials
                ? styles.primaryButtonEnabled
                : styles.primaryButtonDisabled
            }`}
          >
            {credentialsBusy ? "Working..." : "Generate credentials"}
          </button>
        </div>
        <div className={styles.formStack}>
          <input
            type="password"
            value={vaultPasswordDraft}
            onChange={(e) => setVaultPasswordDraft(e.target.value)}
            placeholder="Vault password (stored in credentials.kdbx)"
            className={styles.inputControl}
          />
          <input
            type="password"
            value={vaultPasswordConfirm}
            onChange={(e) => setVaultPasswordConfirm(e.target.value)}
            placeholder="Confirm vault password"
            className={styles.inputControl}
          />
          <button
            onClick={() => {
              setVaultPromptMode("save-vault");
              setVaultPromptConfirm(true);
              setVaultPromptOpen(true);
            }}
            disabled={!workspaceId || !vaultPasswordDraft}
            className={styles.auxButton}
          >
            Save vault password
          </button>
          {credentialsScope === "single" ? (
            <input
              value={setValuesText}
              onChange={(e) => setSetValuesText(e.target.value)}
              placeholder="Optional --set values (key=value, comma or newline)"
              className={styles.inputControl}
            />
          ) : null}
          <div className={styles.radioGroup}>
            <span className={`text-body-tertiary ${styles.label}`}>Generate for</span>
            <label className={`text-body-secondary ${styles.radioLabel}`}>
              <input
                type="radio"
                name="credentials-scope"
                checked={credentialsScope === "all"}
                onChange={() => setCredentialsScope("all")}
              />
              All selected roles
            </label>
            <label className={`text-body-secondary ${styles.radioLabel}`}>
              <input
                type="radio"
                name="credentials-scope"
                checked={credentialsScope === "single"}
                onChange={() => setCredentialsScope("single")}
              />
              Single role
            </label>
            {credentialsScope === "single" ? (
              <select
                value={credentialsRole}
                onChange={(e) => setCredentialsRole(e.target.value)}
                disabled={activeRoles.length === 0}
                className={`${styles.selectControl} ${
                  activeRoles.length
                    ? styles.selectControlEnabled
                    : styles.selectControlDisabled
                }`}
              >
                {activeRoles.length === 0 ? (
                  <option value="">No roles selected</option>
                ) : null}
                {activeRoles.map((roleId: string) => (
                  <option key={roleId} value={roleId}>
                    {roleId}
                  </option>
                ))}
              </select>
            ) : null}
          </div>
          <label className={`text-body-secondary ${styles.checkboxLabel}`}>
            <input
              type="checkbox"
              checked={allowEmptyPlain}
              onChange={(e) => setAllowEmptyPlain(e.target.checked)}
            />
            Allow empty plain values
          </label>
          <label className={`text-body-secondary ${styles.checkboxLabel}`}>
            <input
              type="checkbox"
              checked={forceOverwrite}
              onChange={(e) => setForceOverwrite(e.target.checked)}
            />
            Overwrite existing credentials
          </label>
          <span className={`text-body-tertiary ${styles.helpSmall}`}>
            Vault password is stored in credentials.kdbx. Master password is required
            for each write.
          </span>
        </div>
        {credentialsError ? (
          <p className={`text-danger ${styles.statusText}`}>{credentialsError}</p>
        ) : null}
        {vaultError ? <p className={`text-danger ${styles.statusText}`}>{vaultError}</p> : null}
        {vaultStatus ? (
          <p className={`text-success ${styles.statusText}`}>{vaultStatus}</p>
        ) : null}
        {credentialsStatus ? (
          <p className={`text-success ${styles.statusText}`}>{credentialsStatus}</p>
        ) : null}
      </div>

      <div className={`bg-body border ${styles.card}`}>
        <label className={`text-body-tertiary ${styles.label}`}>
          Workspace import/export
        </label>
        <div className={styles.actionsRow}>
          <button
            onClick={downloadZip}
            disabled={!workspaceId || zipBusy}
            className={styles.neutralButton}
          >
            {zipBusy ? "Preparing..." : "Download ZIP"}
          </button>
          <button
            onClick={openUploadPicker}
            disabled={!workspaceId || uploadBusy}
            className={`${styles.primaryButton} ${
              workspaceId ? styles.primaryButtonEnabled : styles.primaryButtonDisabled
            }`}
          >
            {uploadBusy ? "Uploading..." : "Upload ZIP"}
          </button>
          <input
            ref={uploadInputRef}
            type="file"
            accept=".zip,application/zip"
            onChange={onUploadSelect}
            className={styles.hiddenInput}
          />
        </div>
        {uploadError ? (
          <p className={`text-danger ${styles.statusText}`}>{uploadError}</p>
        ) : null}
        {zipError ? <p className={`text-danger ${styles.statusText}`}>{zipError}</p> : null}
        {uploadStatus ? (
          <p className={`text-success ${styles.statusText}`}>{uploadStatus}</p>
        ) : null}
      </div>
    </div>
  );
}
