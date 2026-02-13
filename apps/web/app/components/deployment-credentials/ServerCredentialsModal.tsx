"use client";

import { FIELD_LABELS } from "./types";
import styles from "./styles.module.css";
import type { FormErrors, ServerState } from "./types";

type ServerCredentialsModalProps = {
  openServer: ServerState | null;
  openServerValid: boolean;
  formErrors: FormErrors;
  passwordConfirm: string;
  onPasswordConfirmChange: (value: string) => void;
  passphraseEnabled: boolean;
  onPassphraseEnabledChange: (value: boolean) => void;
  keygenBusy: boolean;
  keygenError: string | null;
  keygenStatus: string | null;
  workspaceId: string | null;
  onClose: () => void;
  onAuthChange: (alias: string, method: string) => void;
  onUpdateServer: (alias: string, patch: Partial<ServerState>) => void;
  onTriggerVaultPrompt: (
    action: "keygen" | "store-password",
    requireConfirm?: boolean
  ) => void;
  onGenerateKey: () => void;
  onCopyPublicKey: () => void;
};

export default function ServerCredentialsModal({
  openServer,
  openServerValid,
  formErrors,
  passwordConfirm,
  onPasswordConfirmChange,
  passphraseEnabled,
  onPassphraseEnabledChange,
  keygenBusy,
  keygenError,
  keygenStatus,
  workspaceId,
  onClose,
  onAuthChange,
  onUpdateServer,
  onTriggerVaultPrompt,
  onGenerateKey,
  onCopyPublicKey,
}: ServerCredentialsModalProps) {
  if (!openServer) return null;

  return (
    <div
      onClick={onClose}
      className={`${styles.modalOverlay} ${styles.serverModalOverlay}`}
    >
      <div
        onClick={(event) => event.stopPropagation()}
        className={`${styles.modalCard} ${styles.serverModalCard}`}
      >
        <div className={styles.modalHeader}>
          <div>
            <h3 className={styles.modalTitle}>Device · {openServer.alias}</h3>
            <p className={`text-body-secondary ${styles.modalHint}`}>
              Configure password or SSH key access for this device.
            </p>
          </div>
          <button onClick={onClose} className={styles.closeButton}>
            Close
          </button>
        </div>

        <div>
          <label className={`text-body-tertiary ${styles.sectionLabel}`}>
            Credential type
          </label>
          <div className={styles.segmentedButtons}>
            {[
              { key: "password", label: "Password" },
              { key: "private_key", label: "SSH key" },
            ].map((method) => (
              <button
                key={method.key}
                onClick={() => onAuthChange(openServer.alias, method.key)}
                className={`${styles.segmentedButton} ${
                  openServer.authMethod === method.key
                    ? styles.segmentedButtonActive
                    : ""
                }`}
              >
                {method.label}
              </button>
            ))}
          </div>
          {formErrors.authMethod ? (
            <p className={`text-danger ${styles.errorTextTop}`}>{formErrors.authMethod}</p>
          ) : null}
        </div>

        {openServer.authMethod === "password" ? (
          <div className={styles.sectionStack}>
            <div className={styles.formField}>
              <label className={`text-body-tertiary ${styles.sectionLabel}`}>
                Password
              </label>
              <input
                type="password"
                value={openServer.password}
                onChange={(event) =>
                  onUpdateServer(openServer.alias, {
                    password: event.target.value,
                  })
                }
                placeholder="Enter password"
                autoComplete="off"
                className={styles.inputControl}
              />
              {formErrors.password ? (
                <p className={`text-danger ${styles.errorTextTop}`}>{formErrors.password}</p>
              ) : null}
              <input
                type="password"
                value={passwordConfirm}
                onChange={(event) => onPasswordConfirmChange(event.target.value)}
                placeholder="Confirm password"
                autoComplete="off"
                className={styles.inputControl}
              />
              <div className={styles.buttonRow}>
                <button
                  onClick={() => onTriggerVaultPrompt("store-password", true)}
                  disabled={!workspaceId}
                  className={styles.subtleButton}
                >
                  Store in vault
                </button>
              </div>
            </div>
          </div>
        ) : null}

        {openServer.authMethod === "private_key" ? (
          <div className={styles.sectionStack}>
            <div className={styles.formField}>
              <label className={`text-body-tertiary ${styles.sectionLabel}`}>
                Private key
              </label>
              <textarea
                value={openServer.privateKey}
                onChange={(event) =>
                  onUpdateServer(openServer.alias, {
                    privateKey: event.target.value,
                  })
                }
                placeholder="Paste SSH private key"
                rows={6}
                autoComplete="off"
                spellCheck={false}
                className={styles.textAreaControl}
              />
              {formErrors.privateKey ? (
                <p className={`text-danger ${styles.errorTextTop}`}>
                  {formErrors.privateKey}
                </p>
              ) : null}
            </div>

            <div className={styles.generatorCard}>
              <div className={styles.generatorHeader}>
                <span className={styles.generatorTitle}>SSH key generator</span>
                <button
                  onClick={() =>
                    passphraseEnabled
                      ? onTriggerVaultPrompt("keygen", true)
                      : onGenerateKey()
                  }
                  disabled={keygenBusy || !workspaceId}
                  className={styles.primaryButton}
                >
                  {keygenBusy ? "Generating..." : "Generate key"}
                </button>
              </div>
              <div className={styles.formField}>
                <label className={`text-body-tertiary ${styles.sectionLabel}`}>
                  Algorithm
                </label>
                <select
                  value={openServer.keyAlgorithm || "ed25519"}
                  onChange={(event) =>
                    onUpdateServer(openServer.alias, {
                      keyAlgorithm: event.target.value,
                    })
                  }
                  className={styles.selectControl}
                >
                  <option value="ed25519">ed25519 (recommended)</option>
                  <option value="rsa">rsa 4096</option>
                  <option value="ecdsa">ecdsa</option>
                </select>
              </div>
              <label className={`text-body-secondary ${styles.checkLabel}`}>
                <input
                  type="checkbox"
                  checked={passphraseEnabled}
                  onChange={(event) => onPassphraseEnabledChange(event.target.checked)}
                />
                Generate passphrase (stored in credentials vault)
              </label>
              <div className={styles.formField}>
                <label className={`text-body-tertiary ${styles.sectionLabel}`}>
                  Public key
                </label>
                <textarea
                  readOnly
                  value={openServer.publicKey || ""}
                  placeholder="Public key will appear here"
                  rows={3}
                  className={`${styles.textAreaControl} ${styles.inputDisabledBg}`}
                />
                <div className={styles.buttonRow}>
                  <button
                    onClick={onCopyPublicKey}
                    disabled={!openServer.publicKey}
                    className={styles.subtleButton}
                  >
                    Copy public key
                  </button>
                </div>
              </div>
            </div>

            {keygenError ? <p className="text-danger">{keygenError}</p> : null}
            {keygenStatus ? <p className="text-success">{keygenStatus}</p> : null}
          </div>
        ) : null}

        <div className={styles.statusRow}>
          <button
            disabled={!openServerValid}
            className={`${styles.saveButton} ${
              openServerValid ? styles.saveButtonActive : styles.saveButtonDisabled
            }`}
          >
            Save credentials
          </button>
          {!openServerValid ? (
            <span className={`text-danger ${styles.smallText}`}>
              Fix the fields highlighted below.
            </span>
          ) : null}
        </div>

        {Object.keys(formErrors).length > 0 ? (
          <div className={styles.errorList}>
            {Object.entries(formErrors).map(([key, message]) => (
              <div key={key}>
                <strong>{FIELD_LABELS[key] ?? key}:</strong> {message}
              </div>
            ))}
          </div>
        ) : null}
      </div>
    </div>
  );
}
