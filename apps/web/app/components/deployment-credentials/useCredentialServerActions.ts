import { useState } from "react";
import type {
  ConnectionResult,
  ServerState,
} from "./types";
import type {
  CredentialBlurPayload,
  PendingServerAction,
} from "./DeploymentCredentialsForm.types";
import { encodePath, sanitizeAliasFilename } from "../workspace-panel/utils";

type UseCredentialServerActionsArgs = {
  baseUrl: string;
  workspaceId: string | null;
  servers: ServerState[];
  onConnectionResult: (alias: string, result: ConnectionResult) => void;
  onUpdateServer: (alias: string, patch: Partial<ServerState>) => void;
  onRemoveServer: (alias: string) => void | Promise<void>;
  onCleanupServer: (alias: string) => void | Promise<void>;
};

export default function useCredentialServerActions({
  baseUrl,
  workspaceId,
  servers,
  onConnectionResult,
  onUpdateServer,
  onRemoveServer,
  onCleanupServer,
}: UseCredentialServerActionsArgs) {
  const [pendingAction, setPendingAction] = useState<PendingServerAction>(null);
  const [actionBusy, setActionBusy] = useState(false);
  const [actionError, setActionError] = useState<string | null>(null);

  const parseErrorMessage = async (res: Response) => {
    try {
      const data = await res.json();
      if (typeof data?.detail === "string" && data.detail.trim()) {
        return data.detail.trim();
      }
      if (typeof data?.message === "string" && data.message.trim()) {
        return data.message.trim();
      }
    } catch {
      const text = await res.text();
      if (text.trim()) return text.trim();
    }
    return `HTTP ${res.status}`;
  };

  const promptMasterPassword = () => {
    const value = window.prompt("Master password for credentials.kdbx");
    const trimmed = String(value || "").trim();
    if (!trimmed) {
      throw new Error("Master password is required.");
    }
    return trimmed;
  };

  const readWorkspaceFileOrEmpty = async (path: string) => {
    if (!workspaceId) return "";
    const res = await fetch(`${baseUrl}/api/workspaces/${workspaceId}/files/${encodePath(path)}`);
    if (res.status === 404) return "";
    if (!res.ok) {
      throw new Error(await parseErrorMessage(res));
    }
    const data = await res.json();
    return String(data?.content ?? "");
  };

  const writeWorkspaceFile = async (path: string, content: string) => {
    if (!workspaceId) {
      throw new Error("Workspace is not ready.");
    }
    const res = await fetch(`${baseUrl}/api/workspaces/${workspaceId}/files/${encodePath(path)}`, {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ content }),
    });
    if (!res.ok) {
      throw new Error(await parseErrorMessage(res));
    }
  };

  const upsertVaultYamlKey = (yamlText: string, key: string, vaultText: string): string => {
    const content = String(yamlText || "").replace(/\r\n/g, "\n");
    const keyRegex = new RegExp(`^(\\s*)${key}\\s*:\\s*!vault\\s*(\\|[-+]?)?\\s*$`);
    const plainRegex = new RegExp(`^\\s*${key}\\s*:`);
    const lines = content ? content.split("\n") : [];

    let start = -1;
    let end = -1;
    for (let i = 0; i < lines.length; i += 1) {
      const match = lines[i].match(keyRegex);
      if (!match) continue;
      start = i;
      end = i;
      const blockIndent = `${match[1] ?? ""}  `;
      for (let j = i + 1; j < lines.length; j += 1) {
        const next = lines[j];
        if (j === i + 1 && !next.trim().startsWith("$ANSIBLE_VAULT")) {
          break;
        }
        if (next.startsWith(blockIndent) || next.trim().startsWith("$ANSIBLE_VAULT")) {
          end = j;
          continue;
        }
        break;
      }
      break;
    }

    const blockLines = [
      `${key}: !vault |`,
      ...String(vaultText || "")
        .trim()
        .split("\n")
        .filter(Boolean)
        .map((line) => `  ${line}`),
    ];

    let nextLines = [...lines];
    if (start >= 0) {
      nextLines.splice(start, end - start + 1, ...blockLines);
    } else {
      const plainIndex = nextLines.findIndex((line) => plainRegex.test(line));
      if (plainIndex >= 0) {
        nextLines.splice(plainIndex, 1, ...blockLines);
      } else {
        if (nextLines.length > 0 && nextLines[nextLines.length - 1].trim() !== "") {
          nextLines.push("");
        }
        nextLines.push(...blockLines);
      }
    }

    return `${nextLines.join("\n").replace(/\n{3,}/g, "\n\n").trimEnd()}\n`;
  };

  const saveServerPasswordToHostVars = async (alias: string, password: string) => {
    if (!workspaceId) {
      throw new Error("Workspace is not ready.");
    }
    const masterPassword = promptMasterPassword();
    const encryptRes = await fetch(`${baseUrl}/api/workspaces/${workspaceId}/vault/encrypt`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        master_password: masterPassword,
        plaintext: password,
      }),
    });
    if (!encryptRes.ok) {
      throw new Error(await parseErrorMessage(encryptRes));
    }
    const encrypted = await encryptRes.json();
    const vaultText = String(encrypted?.vault_text ?? "").trim();
    if (!vaultText) {
      throw new Error("Failed to encrypt server password.");
    }
    const hostVarsPath = `host_vars/${sanitizeAliasFilename(alias)}.yml`;
    const current = await readWorkspaceFileOrEmpty(hostVarsPath);
    const next = upsertVaultYamlKey(current, "ansible_password", vaultText);
    await writeWorkspaceFile(hostVarsPath, next);
  };

  const saveKeyPassphraseToVault = async (alias: string, keyPassphrase: string) => {
    if (!workspaceId || !keyPassphrase.trim()) return;
    const masterPassword = promptMasterPassword();
    const res = await fetch(`${baseUrl}/api/workspaces/${workspaceId}/vault/entries`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        master_password: masterPassword,
        master_password_confirm: masterPassword,
        create_if_missing: true,
        alias,
        key_passphrase: keyPassphrase,
      }),
    });
    if (!res.ok) {
      throw new Error(await parseErrorMessage(res));
    }
  };

  const canTestConnection = (server: ServerState) => {
    const host = String(server.host || "").trim();
    const user = String(server.user || "").trim();
    const portRaw = String(server.port || "").trim();
    const portValue = Number(portRaw);
    const portValid = Boolean(
      portRaw && Number.isInteger(portValue) && portValue >= 1 && portValue <= 65535
    );
    if (!host || !user || !portValid) return false;
    if (server.authMethod === "private_key") {
      return Boolean(String(server.privateKey || "").trim());
    }
    return Boolean(String(server.password || "").trim());
  };

  const testConnection = async (server: ServerState) => {
    if (!workspaceId) return;
    try {
      const portRaw = String(server.port ?? "").trim();
      const portValue = portRaw ? Number(portRaw) : null;
      const res = await fetch(`${baseUrl}/api/workspaces/${workspaceId}/test-connection`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          host: server.host,
          port: Number.isInteger(portValue) ? portValue : undefined,
          user: server.user,
          auth_method: server.authMethod,
          password: server.password || undefined,
          private_key: server.privateKey || undefined,
          key_passphrase: server.keyPassphrase || undefined,
        }),
      });
      if (!res.ok) {
        const text = await res.text();
        throw new Error(text || `HTTP ${res.status}`);
      }
      const data = await res.json();
      onConnectionResult(server.alias, data);
      return data as ConnectionResult;
    } catch (err: any) {
      const failedResult: ConnectionResult = {
        ping_ok: false,
        ping_error: err?.message ?? "ping failed",
        ssh_ok: false,
        ssh_error: err?.message ?? "ssh failed",
      };
      onConnectionResult(server.alias, failedResult);
      return failedResult;
    }
  };

  const generateServerKey = async (alias: string) => {
    if (!workspaceId) {
      throw new Error("Workspace is not ready.");
    }
    const server = servers.find((entry) => entry.alias === alias);
    if (!server) {
      throw new Error("Device not found.");
    }
    const masterPassword = promptMasterPassword();
    const res = await fetch(`${baseUrl}/api/workspaces/${workspaceId}/ssh-keys`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        alias: server.alias,
        algorithm: server.keyAlgorithm || "ed25519",
        with_passphrase: true,
        master_password: masterPassword,
        master_password_confirm: masterPassword,
        return_passphrase: true,
      }),
    });
    if (!res.ok) {
      throw new Error(await parseErrorMessage(res));
    }
    const data = await res.json();
    onUpdateServer(server.alias, {
      privateKey: data.private_key || "",
      publicKey: data.public_key || "",
      authMethod: "private_key",
      keyPassphrase: data.passphrase || "",
    });
  };

  const handleCredentialFieldBlur = async (payload: CredentialBlurPayload) => {
    const { server, field, passwordConfirm: confirmValue } = payload;

    if (server.authMethod === "password" && (field === "password" || field === "passwordConfirm")) {
      const password = String(server.password || "");
      const confirm = String(confirmValue || "");
      if (password && confirm && password === confirm) {
        await saveServerPasswordToHostVars(server.alias, password);
      } else if (password && confirm && password !== confirm) {
        throw new Error("Password confirmation mismatch.");
      }
    }

    if (server.authMethod === "private_key" && field === "keyPassphrase") {
      const keyPassphrase = String(server.keyPassphrase || "");
      if (keyPassphrase.trim()) {
        await saveKeyPassphraseToVault(server.alias, keyPassphrase);
      }
    }

    if (field === "primaryDomain" && workspaceId) {
      const res = await fetch(`${baseUrl}/api/providers/primary-domain`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          workspace_id: workspaceId,
          alias: server.alias,
          primary_domain: String(server.primaryDomain || "").trim() || null,
        }),
      });
      if (!res.ok) {
        throw new Error(await parseErrorMessage(res));
      }
    }

    if (canTestConnection(server)) {
      await testConnection(server);
    }
  };

  const normalizeAliases = (aliases: string[]) =>
    Array.from(
      new Set(
        (Array.isArray(aliases) ? aliases : [])
          .map((alias) => String(alias || "").trim())
          .filter(Boolean)
      )
    );

  const requestDeleteServers = (aliases: string[]) => {
    const nextAliases = normalizeAliases(aliases);
    if (nextAliases.length === 0) return;
    setActionError(null);
    setPendingAction({ mode: "delete", aliases: nextAliases });
  };

  const requestPurgeServers = (aliases: string[]) => {
    const nextAliases = normalizeAliases(aliases);
    if (nextAliases.length === 0) return;
    setActionError(null);
    setPendingAction({ mode: "purge", aliases: nextAliases });
  };

  const confirmServerAction = async () => {
    if (!pendingAction) return;
    setActionBusy(true);
    setActionError(null);
    try {
      for (const alias of pendingAction.aliases) {
        if (pendingAction.mode === "purge") {
          await onCleanupServer(alias);
        } else {
          await onRemoveServer(alias);
        }
      }
      setPendingAction(null);
    } catch (err: any) {
      setActionError(
        err?.message ??
          (pendingAction.mode === "purge"
            ? "failed to purge device"
            : "failed to delete device")
      );
    } finally {
      setActionBusy(false);
    }
  };

  const handleCancelAction = () => {
    if (actionBusy) return;
    setPendingAction(null);
    setActionError(null);
  };

  return {
    pendingAction,
    actionBusy,
    actionError,
    generateServerKey,
    handleCredentialFieldBlur,
    requestDeleteServers,
    requestPurgeServers,
    confirmServerAction,
    handleCancelAction,
  };
}
