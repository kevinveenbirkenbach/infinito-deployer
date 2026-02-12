import { extractVaultText, replaceVaultBlock } from "./utils";

export function createWorkspacePanelVaultActions(ctx: any) {
  const {
    baseUrl,
    workspaceId,
    activeAlias,
    activePath,
    allowEmptyPlain,
    credentialsBusy,
    credentialsScope,
    credentialsRole,
    setValuesText,
    forceOverwrite,
    pendingCredentials,
    vaultPromptMode,
    vaultPasswordDraft,
    vaultPasswordConfirm,
    masterChangeValues,
    keyPassphraseModal,
    keyPassphraseValues,
    vaultValueModal,
    vaultValueInputs,
    editorValue,
    refreshFiles,
    resolveTargetRoles,
    setCredentialsBusy,
    setCredentialsError,
    setCredentialsStatus,
    setPendingCredentials,
    setVaultPromptMode,
    setVaultPromptConfirm,
    setVaultPromptOpen,
    setVaultError,
    setVaultStatus,
    setMasterChangeBusy,
    setMasterChangeError,
    setMasterChangeOpen,
    setMasterChangeValues,
    setKeyPassphraseBusy,
    setKeyPassphraseError,
    setKeyPassphraseModal,
    setKeyPassphraseValues,
    setEditorMenu,
    setVaultValueInputs,
    setVaultValueModal,
    setEditorValue,
    setEditorDirty,
  } = ctx;

  const postCredentials = async (
    targetRoles: string[],
    force: boolean,
    setValues: string[],
    masterPassword: string
  ) => {
    if (!workspaceId || !masterPassword || credentialsBusy) return;
    setCredentialsBusy(true);
    setCredentialsError(null);
    setCredentialsStatus(null);
    try {
      const res = await fetch(`${baseUrl}/api/workspaces/${workspaceId}/credentials`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          master_password: masterPassword,
          selected_roles: targetRoles,
          allow_empty_plain: allowEmptyPlain,
          set_values: setValues.length > 0 ? setValues : undefined,
          force,
          alias: activeAlias || undefined,
        }),
      });
      if (!res.ok) {
        let message = `HTTP ${res.status}`;
        try {
          const data = await res.json();
          if (data?.detail) message = data.detail;
        } catch {
          // ignore
        }
        throw new Error(message);
      }
      setCredentialsStatus("Credentials generated.");
      await refreshFiles(workspaceId);
    } catch (err: any) {
      setCredentialsError(err?.message ?? "credential generation failed");
    } finally {
      setCredentialsBusy(false);
    }
  };

  const generateCredentials = async () => {
    if (!workspaceId || credentialsBusy) return;
    const targetRoles = resolveTargetRoles(credentialsScope, credentialsRole);
    if (targetRoles.length === 0) {
      setCredentialsError("Select a role to generate credentials.");
      return;
    }
    const setValues =
      credentialsScope === "single"
        ? setValuesText
            .split(/[\n,]+/)
            .map((value: string) => value.trim())
            .filter(Boolean)
        : [];
    setPendingCredentials({
      roles: targetRoles,
      force: forceOverwrite,
      setValues,
    });
    setVaultPromptMode("generate");
    setVaultPromptConfirm(false);
    setVaultPromptOpen(true);
  };

  const storeVaultPassword = async (
    masterPassword: string,
    masterConfirm: string | null
  ) => {
    if (!workspaceId) return;
    if (!vaultPasswordDraft) {
      setVaultError("Enter a vault password to store.");
      return;
    }
    if (vaultPasswordDraft !== vaultPasswordConfirm) {
      setVaultError("Vault passwords do not match.");
      return;
    }
    setVaultError(null);
    setVaultStatus(null);
    try {
      const res = await fetch(`${baseUrl}/api/workspaces/${workspaceId}/vault/entries`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          master_password: masterPassword,
          master_password_confirm: masterConfirm || undefined,
          create_if_missing: true,
          vault_password: vaultPasswordDraft,
        }),
      });
      if (!res.ok) {
        const text = await res.text();
        throw new Error(text || `HTTP ${res.status}`);
      }
      setVaultStatus("Vault password stored in credentials.kdbx.");
      ctx.setVaultPasswordDraft("");
      ctx.setVaultPasswordConfirm("");
    } catch (err: any) {
      setVaultError(err?.message ?? "failed to store vault password");
    }
  };

  const handleVaultPromptSubmit = (
    masterPassword: string,
    confirmPassword: string | null
  ) => {
    setVaultPromptOpen(false);
    const mode = vaultPromptMode;
    setVaultPromptMode(null);
    if (mode === "generate" && pendingCredentials) {
      void postCredentials(
        pendingCredentials.roles,
        pendingCredentials.force,
        pendingCredentials.setValues,
        masterPassword
      );
      setPendingCredentials(null);
      return;
    }
    if (mode === "save-vault") {
      void storeVaultPassword(masterPassword, confirmPassword);
    }
  };

  const submitMasterChange = async () => {
    if (!workspaceId) return;
    setMasterChangeBusy(true);
    setMasterChangeError(null);
    try {
      const res = await fetch(
        `${baseUrl}/api/workspaces/${workspaceId}/vault/change-master`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            master_password: masterChangeValues.current,
            new_master_password: masterChangeValues.next,
            new_master_password_confirm: masterChangeValues.confirm,
          }),
        }
      );
      if (!res.ok) {
        const text = await res.text();
        throw new Error(text || `HTTP ${res.status}`);
      }
      setMasterChangeOpen(false);
      setMasterChangeValues({ current: "", next: "", confirm: "" });
    } catch (err: any) {
      setMasterChangeError(err?.message ?? "failed to change master password");
    } finally {
      setMasterChangeBusy(false);
    }
  };

  const submitKeyPassphraseChange = async () => {
    if (!workspaceId || !keyPassphraseModal) return;
    setKeyPassphraseBusy(true);
    setKeyPassphraseError(null);
    try {
      const res = await fetch(
        `${baseUrl}/api/workspaces/${workspaceId}/ssh-keys/change-passphrase`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            alias: keyPassphraseModal.alias,
            master_password: keyPassphraseValues.master,
            new_passphrase: keyPassphraseValues.next,
            new_passphrase_confirm: keyPassphraseValues.confirm,
          }),
        }
      );
      if (!res.ok) {
        const text = await res.text();
        throw new Error(text || `HTTP ${res.status}`);
      }
      setKeyPassphraseModal(null);
      setKeyPassphraseValues({ master: "", next: "", confirm: "" });
    } catch (err: any) {
      setKeyPassphraseError(err?.message ?? "failed to change passphrase");
    } finally {
      setKeyPassphraseBusy(false);
    }
  };

  const openVaultValueModal = (mode: "show" | "change", block: any) => {
    setEditorMenu(null);
    setVaultValueInputs({ master: "", next: "", confirm: "" });
    setVaultValueModal({ mode, block, loading: false, plaintext: "" });
  };

  const submitVaultValue = async () => {
    if (!workspaceId || !vaultValueModal) return;
    const lines = editorValue.split("\n");
    const vaultText = extractVaultText(lines, vaultValueModal.block);
    if (!vaultText) {
      setVaultValueModal({
        ...vaultValueModal,
        error: "No vault block found.",
        loading: false,
      });
      return;
    }
    if (!vaultValueInputs.master) {
      setVaultValueModal({
        ...vaultValueModal,
        error: "Master password is required.",
        loading: false,
      });
      return;
    }

    if (vaultValueModal.mode === "change") {
      if (!vaultValueInputs.next || !vaultValueInputs.confirm) {
        setVaultValueModal({
          ...vaultValueModal,
          error: "Enter the new value twice.",
          loading: false,
        });
        return;
      }
      if (vaultValueInputs.next !== vaultValueInputs.confirm) {
        setVaultValueModal({
          ...vaultValueModal,
          error: "Values do not match.",
          loading: false,
        });
        return;
      }
    }

    setVaultValueModal({ ...vaultValueModal, loading: true, error: null });
    try {
      if (vaultValueModal.mode === "show") {
        const res = await fetch(`${baseUrl}/api/workspaces/${workspaceId}/vault/decrypt`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            master_password: vaultValueInputs.master,
            vault_text: vaultText,
          }),
        });
        if (!res.ok) {
          const text = await res.text();
          throw new Error(text || `HTTP ${res.status}`);
        }
        const data = await res.json();
        setVaultValueModal({
          ...vaultValueModal,
          plaintext: String(data?.plaintext ?? ""),
          loading: false,
        });
        return;
      }

      const res = await fetch(`${baseUrl}/api/workspaces/${workspaceId}/vault/encrypt`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          master_password: vaultValueInputs.master,
          plaintext: vaultValueInputs.next,
        }),
      });
      if (!res.ok) {
        const text = await res.text();
        throw new Error(text || `HTTP ${res.status}`);
      }
      const data = await res.json();
      const nextContent = replaceVaultBlock(
        lines,
        vaultValueModal.block,
        String(data?.vault_text ?? "")
      );
      setEditorValue(nextContent);
      setEditorDirty(true);
      setVaultValueModal(null);
    } catch (err: any) {
      setVaultValueModal({
        ...vaultValueModal,
        loading: false,
        error: err?.message ?? "vault operation failed",
      });
    }
  };

  return {
    postCredentials,
    generateCredentials,
    storeVaultPassword,
    handleVaultPromptSubmit,
    submitMasterChange,
    submitKeyPassphraseChange,
    openVaultValueModal,
    submitVaultValue,
  };
}
