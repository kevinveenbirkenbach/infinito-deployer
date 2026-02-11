"use client";

import { useEffect, useMemo, useState } from "react";
import { AUTH_METHODS, validateForm } from "../lib/deploy_form";
import VaultPasswordModal from "./VaultPasswordModal";

type ServerState = {
  alias: string;
  host: string;
  port: string;
  user: string;
  authMethod: string;
  password: string;
  privateKey: string;
  publicKey: string;
  keyAlgorithm: string;
  keyPassphrase: string;
};

type FormState = {
  alias: string;
  host: string;
  port: string;
  user: string;
  authMethod: string;
  password: string;
  privateKey: string;
};

type FormErrors = Partial<Record<keyof FormState, string>>;

type ConnectionResult = {
  ping_ok: boolean;
  ping_error?: string | null;
  ssh_ok: boolean;
  ssh_error?: string | null;
};

const FIELD_LABELS: Record<string, string> = {
  alias: "Alias",
  host: "Host",
  port: "Port",
  user: "User",
  authMethod: "Auth method",
  password: "Password",
  privateKey: "Private key",
};

export default function DeploymentCredentialsForm({
  baseUrl,
  workspaceId,
  servers,
  activeAlias,
  onActiveAliasChange,
  onUpdateServer,
  onRemoveServer,
  onAddServer,
}: {
  baseUrl: string;
  workspaceId: string | null;
  servers: ServerState[];
  activeAlias: string;
  onActiveAliasChange: (alias: string) => void;
  onUpdateServer: (alias: string, patch: Partial<ServerState>) => void;
  onRemoveServer: (alias: string) => Promise<void> | void;
  onAddServer: () => void;
}) {
  const [openAlias, setOpenAlias] = useState<string | null>(null);
  const [testBusy, setTestBusy] = useState<Record<string, boolean>>({});
  const [testResults, setTestResults] = useState<Record<string, ConnectionResult>>(
    {}
  );

  const [keygenBusy, setKeygenBusy] = useState(false);
  const [keygenError, setKeygenError] = useState<string | null>(null);
  const [keygenStatus, setKeygenStatus] = useState<string | null>(null);
  const [passphraseEnabled, setPassphraseEnabled] = useState(false);
  const [passwordConfirm, setPasswordConfirm] = useState("");
  const [removeTarget, setRemoveTarget] = useState<string | null>(null);
  const [removeBusy, setRemoveBusy] = useState(false);
  const [removeError, setRemoveError] = useState<string | null>(null);

  const [vaultPromptOpen, setVaultPromptOpen] = useState(false);
  const [vaultPromptConfirm, setVaultPromptConfirm] = useState(false);
  const [vaultPromptAction, setVaultPromptAction] = useState<
    "keygen" | "store-password" | null
  >(null);

  const openServer = useMemo(() => {
    if (!openAlias) return null;
    return servers.find((server) => server.alias === openAlias) ?? null;
  }, [openAlias, servers]);

  useEffect(() => {
    if (!openAlias) return;
    if (!servers.some((server) => server.alias === openAlias)) {
      setOpenAlias(null);
    }
  }, [openAlias, servers]);

  useEffect(() => {
    if (!openServer) return;
    setKeygenError(null);
    setKeygenStatus(null);
    setKeygenBusy(false);
    setPassphraseEnabled(false);
    setPasswordConfirm("");
  }, [openServer?.alias]);

  const aliasCounts = useMemo(() => {
    const counts: Record<string, number> = {};
    servers.forEach((server) => {
      const key = (server.alias || "").trim();
      if (!key) return;
      counts[key] = (counts[key] ?? 0) + 1;
    });
    return counts;
  }, [servers]);

  const validationTarget: FormState | null = useMemo(() => {
    if (!openServer) return null;
    return {
      alias: openServer.alias ?? "",
      host: openServer.host ?? "",
      port: openServer.port ?? "",
      user: openServer.user ?? "",
      authMethod: openServer.authMethod ?? "password",
      password: openServer.password ?? "",
      privateKey: openServer.privateKey ?? "",
    };
  }, [openServer]);

  const formErrors: FormErrors = useMemo(() => {
    if (!validationTarget) return {};
    return validateForm(validationTarget);
  }, [validationTarget]);

  const openServerValid =
    Object.keys(formErrors).length === 0 && validationTarget !== null;

  const updateServer = (alias: string, patch: Partial<ServerState>) => {
    onUpdateServer(alias, patch);
  };

  const onAuthChange = (alias: string, next: string) => {
    if (next === "password") {
      updateServer(alias, { authMethod: next, privateKey: "", publicKey: "" });
    } else {
      updateServer(alias, { authMethod: next, password: "" });
    }
  };

  const triggerVaultPrompt = (
    action: "keygen" | "store-password",
    requireConfirm = false
  ) => {
    setVaultPromptAction(action);
    setVaultPromptConfirm(requireConfirm);
    setVaultPromptOpen(true);
  };

  const handleKeygen = async (
    masterPassword: string | null,
    masterConfirm: string | null
  ) => {
    if (!openServer || !workspaceId) return;

    if (openServer.privateKey) {
      const ok = window.confirm("Regenerate SSH keypair for this server?");
      if (!ok) return;
    }

    setKeygenBusy(true);
    setKeygenError(null);
    setKeygenStatus(null);
    try {
      const res = await fetch(
        `${baseUrl}/api/workspaces/${workspaceId}/ssh-keys`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            alias: openServer.alias,
            algorithm: openServer.keyAlgorithm || "ed25519",
            with_passphrase: passphraseEnabled,
            master_password: masterPassword || undefined,
            master_password_confirm: masterConfirm || undefined,
            return_passphrase: true,
          }),
        }
      );
      if (!res.ok) {
        const text = await res.text();
        throw new Error(text || `HTTP ${res.status}`);
      }
      const data = await res.json();
      updateServer(openServer.alias, {
        privateKey: data.private_key || "",
        publicKey: data.public_key || "",
        authMethod: "private_key",
        keyPassphrase: data.passphrase || "",
      });
      setKeygenStatus("SSH keypair generated.");
    } catch (err: any) {
      setKeygenError(err?.message ?? "key generation failed");
    } finally {
      setKeygenBusy(false);
    }
  };

  const handleVaultPromptSubmit = (
    masterPassword: string,
    confirmPassword: string | null
  ) => {
    setVaultPromptOpen(false);
    const action = vaultPromptAction;
    setVaultPromptAction(null);
    if (!action) return;
    if (action === "keygen") {
      void handleKeygen(masterPassword, confirmPassword);
      return;
    }
    if (action === "store-password") {
      void storeServerPassword(masterPassword, confirmPassword);
    }
  };

  const storeServerPassword = async (
    masterPassword: string | null,
    confirmPassword: string | null
  ) => {
    if (!openServer || !workspaceId) return;
    const serverPassword = openServer.password || "";
    if (!serverPassword) {
      setKeygenError("Set a server password before storing it in the vault.");
      return;
    }
    if (serverPassword !== passwordConfirm) {
      setKeygenError("Server passwords do not match.");
      return;
    }
    setKeygenError(null);
    setKeygenStatus(null);
    try {
      const res = await fetch(
        `${baseUrl}/api/workspaces/${workspaceId}/vault/entries`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            master_password: masterPassword,
            master_password_confirm: confirmPassword,
            create_if_missing: true,
            alias: openServer.alias,
            server_password: serverPassword,
          }),
        }
      );
      if (!res.ok) {
        const text = await res.text();
        throw new Error(text || `HTTP ${res.status}`);
      }
      setKeygenStatus("Server password stored in credentials vault.");
    } catch (err: any) {
      setKeygenError(err?.message ?? "failed to store password in vault");
    }
  };

  const testConnection = async (server: ServerState) => {
    if (!workspaceId) return;
    setTestBusy((prev) => ({ ...prev, [server.alias]: true }));
    try {
      const portRaw = String(server.port ?? "").trim();
      const portValue = portRaw ? Number(portRaw) : null;
      const res = await fetch(
        `${baseUrl}/api/workspaces/${workspaceId}/test-connection`,
        {
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
        }
      );
      if (!res.ok) {
        const text = await res.text();
        throw new Error(text || `HTTP ${res.status}`);
      }
      const data = await res.json();
      setTestResults((prev) => ({ ...prev, [server.alias]: data }));
    } catch (err: any) {
      setTestResults((prev) => ({
        ...prev,
        [server.alias]: {
          ping_ok: false,
          ping_error: err?.message ?? "ping failed",
          ssh_ok: false,
          ssh_error: err?.message ?? "ssh failed",
        },
      }));
    } finally {
      setTestBusy((prev) => ({ ...prev, [server.alias]: false }));
    }
  };

  const copyPublicKey = async () => {
    if (!openServer?.publicKey) return;
    try {
      await navigator.clipboard.writeText(openServer.publicKey);
      setKeygenStatus("Public key copied to clipboard.");
    } catch (err) {
      setKeygenError("Failed to copy public key.");
    }
  };

  const confirmRemoveServer = async () => {
    if (!removeTarget) return;
    setRemoveBusy(true);
    setRemoveError(null);
    try {
      await onRemoveServer(removeTarget);
      setRemoveTarget(null);
    } catch (err: any) {
      setRemoveError(err?.message ?? "failed to delete server");
    } finally {
      setRemoveBusy(false);
    }
  };

  return (
    <section
      style={{
        marginTop: 28,
        padding: 24,
        borderRadius: 24,
        background: "var(--deployer-panel-credentials-bg)",
        border: "1px solid var(--bs-border-color-translucent)",
        boxShadow: "var(--deployer-shadow)",
      }}
    >
      <div style={{ display: "flex", flexWrap: "wrap", gap: 16 }}>
        <div style={{ flex: "1 1 300px" }}>
          <h2
            className="text-body"
            style={{
              margin: 0,
              fontFamily: "var(--font-display)",
              fontSize: 26,
              letterSpacing: "-0.02em",
            }}
          >
            Deployment Credentials
          </h2>
          <p className="text-body-secondary" style={{ margin: "8px 0 0" }}>
            Credentials are used to establish the SSH session during deployment.
            Secrets can be stored in the workspace vault and are never persisted
            in browser storage.
          </p>
        </div>
        <div
          className="text-body-secondary"
          style={{
            flex: "1 1 240px",
            alignSelf: "center",
            textAlign: "right",
            fontSize: 13,
          }}
        >
          API Base: <code>{baseUrl}</code>
        </div>
      </div>

      <div style={{ marginTop: 20, display: "flex", gap: 12 }}>
        <button
          onClick={onAddServer}
          style={{
            padding: "8px 12px",
            borderRadius: 999,
            border: "1px solid var(--bs-body-color)",
            background: "var(--bs-body-color)",
            color: "var(--bs-body-bg)",
            fontSize: 12,
            cursor: "pointer",
          }}
        >
          Add server
        </button>
      </div>

      <div
        style={{
          marginTop: 16,
          display: "grid",
          gridTemplateColumns: "repeat(auto-fit, minmax(260px, 1fr))",
          gap: 16,
        }}
      >
        {servers.map((server) => {
          const alias = (server.alias || "").trim();
          const aliasError = !alias
            ? "Alias is required."
            : aliasCounts[alias] > 1
            ? "Alias already exists."
            : null;
          const status = testResults[server.alias];
          return (
            <div
              key={server.alias}
              className="bg-body border"
              style={{
                padding: 16,
                borderRadius: 18,
                display: "grid",
                gap: 12,
              }}
            >
              <div
                style={{
                  display: "flex",
                  justifyContent: "space-between",
                  alignItems: "center",
                }}
              >
                <label
                  className="text-body-secondary"
                  style={{ display: "flex", alignItems: "center", gap: 8 }}
                >
                  <input
                    type="radio"
                    checked={activeAlias === server.alias}
                    onChange={() => onActiveAliasChange(server.alias)}
                  />
                  Active
                </label>
                <div style={{ display: "flex", gap: 8 }}>
                  <button
                    onClick={() => setOpenAlias(server.alias)}
                    style={{
                      padding: "6px 10px",
                      borderRadius: 999,
                      border: "1px solid var(--bs-body-color)",
                      background: "var(--bs-body-color)",
                      color: "var(--bs-body-bg)",
                      fontSize: 12,
                      cursor: "pointer",
                    }}
                  >
                    Credentials
                  </button>
                  <button
                    onClick={() => testConnection(server)}
                    disabled={testBusy[server.alias] || !workspaceId}
                    style={{
                      padding: "6px 10px",
                      borderRadius: 999,
                      border: "1px solid var(--bs-border-color)",
                      background: "var(--bs-body-bg)",
                      color: "var(--deployer-muted-ink)",
                      fontSize: 12,
                      cursor: "pointer",
                    }}
                  >
                    {testBusy[server.alias] ? "Testing..." : "Test connection"}
                  </button>
                  <button
                    onClick={() => {
                      setRemoveError(null);
                      setRemoveTarget(server.alias);
                    }}
                    title="Remove server"
                    aria-label="Remove server"
                    style={{
                      width: 32,
                      height: 32,
                      borderRadius: 999,
                      border: "1px solid var(--bs-border-color)",
                      background: "var(--bs-body-bg)",
                      color: "var(--bs-danger-text-emphasis)",
                      display: "grid",
                      placeItems: "center",
                      cursor: "pointer",
                    }}
                  >
                    <i className="fa-solid fa-trash" aria-hidden="true" />
                  </button>
                </div>
              </div>

              <div style={{ display: "grid", gap: 10 }}>
                <div>
                  <label className="text-body-tertiary" style={{ fontSize: 12 }}>
                    Alias
                  </label>
                  <input
                    value={server.alias}
                    onChange={(event) =>
                      (() => {
                        const nextAlias = event.target.value;
                        updateServer(server.alias, { alias: nextAlias });
                        if (openAlias === server.alias) {
                          setOpenAlias(nextAlias);
                        }
                      })()
                    }
                    placeholder="main"
                    style={{
                      width: "100%",
                      marginTop: 6,
                      padding: "8px 10px",
                      borderRadius: 10,
                      border: "1px solid var(--bs-border-color)",
                      background: "var(--bs-body-bg)",
                      fontSize: 12,
                    }}
                  />
                  {aliasError ? (
                    <p className="text-danger" style={{ margin: "6px 0 0" }}>
                      {aliasError}
                    </p>
                  ) : null}
                </div>
                <div>
                  <label className="text-body-tertiary" style={{ fontSize: 12 }}>
                    Host
                  </label>
                  <input
                    value={server.host}
                    onChange={(event) =>
                      updateServer(server.alias, { host: event.target.value })
                    }
                    placeholder="example.com"
                    style={{
                      width: "100%",
                      marginTop: 6,
                      padding: "8px 10px",
                      borderRadius: 10,
                      border: "1px solid var(--bs-border-color)",
                      background: "var(--bs-body-bg)",
                      fontSize: 12,
                    }}
                  />
                </div>
                <div>
                  <label className="text-body-tertiary" style={{ fontSize: 12 }}>
                    Port
                  </label>
                  <input
                    value={server.port}
                    onChange={(event) =>
                      updateServer(server.alias, { port: event.target.value })
                    }
                    placeholder="22"
                    inputMode="numeric"
                    style={{
                      width: "100%",
                      marginTop: 6,
                      padding: "8px 10px",
                      borderRadius: 10,
                      border: "1px solid var(--bs-border-color)",
                      background: "var(--bs-body-bg)",
                      fontSize: 12,
                    }}
                  />
                </div>
                <div>
                  <label className="text-body-tertiary" style={{ fontSize: 12 }}>
                    User
                  </label>
                  <input
                    value={server.user}
                    onChange={(event) =>
                      updateServer(server.alias, { user: event.target.value })
                    }
                    placeholder="root"
                    style={{
                      width: "100%",
                      marginTop: 6,
                      padding: "8px 10px",
                      borderRadius: 10,
                      border: "1px solid var(--bs-border-color)",
                      background: "var(--bs-body-bg)",
                      fontSize: 12,
                    }}
                  />
                </div>
              </div>

              {status ? (
                <div
                  style={{
                    padding: 10,
                    borderRadius: 12,
                    background: "var(--deployer-card-bg-soft)",
                    fontSize: 12,
                    display: "grid",
                    gap: 4,
                  }}
                >
                  <div>
                    Ping: {status.ping_ok ? "ok" : "failed"}
                    {status.ping_ok ? "" : ` (${status.ping_error})`}
                  </div>
                  <div>
                    SSH: {status.ssh_ok ? "ok" : "failed"}
                    {status.ssh_ok ? "" : ` (${status.ssh_error})`}
                  </div>
                </div>
              ) : null}
            </div>
          );
        })}
      </div>

      {openServer ? (
        <div
          onClick={() => setOpenAlias(null)}
          style={{
            position: "fixed",
            inset: 0,
            background: "rgba(8, 12, 20, 0.65)",
            backdropFilter: "blur(6px)",
            display: "grid",
            placeItems: "center",
            zIndex: 70,
          }}
        >
          <div
            onClick={(event) => event.stopPropagation()}
            style={{
              width: "min(720px, 95vw)",
              background: "var(--bs-body-bg)",
              borderRadius: 18,
              border: "1px solid var(--bs-border-color-translucent)",
              boxShadow: "var(--deployer-shadow)",
              padding: 18,
              display: "grid",
              gap: 14,
            }}
          >
            <div
              style={{
                display: "flex",
                justifyContent: "space-between",
                alignItems: "center",
              }}
            >
              <div>
                <h3 style={{ margin: 0, fontSize: 18 }}>
                  Credentials · {openServer.alias}
                </h3>
                <p
                  className="text-body-secondary"
                  style={{ margin: "6px 0 0", fontSize: 12 }}
                >
                  Configure auth method, passwords, and SSH keys for this
                  server.
                </p>
              </div>
              <button
                onClick={() => setOpenAlias(null)}
                style={{
                  padding: "6px 10px",
                  borderRadius: 999,
                  border: "1px solid var(--bs-border-color)",
                  background: "var(--bs-body-bg)",
                  cursor: "pointer",
                  fontSize: 12,
                }}
              >
                Close
              </button>
            </div>

            <div>
              <label className="text-body-tertiary" style={{ fontSize: 12 }}>
                Auth method
              </label>
              <div style={{ display: "flex", gap: 8, marginTop: 8 }}>
                {AUTH_METHODS.map((method) => (
                  <button
                    key={method}
                    onClick={() => onAuthChange(openServer.alias, method)}
                    style={{
                      padding: "6px 10px",
                      borderRadius: 999,
                      border:
                        openServer.authMethod === method
                          ? "1px solid var(--bs-body-color)"
                          : "1px solid var(--bs-border-color)",
                      background:
                        openServer.authMethod === method
                          ? "var(--bs-body-color)"
                          : "var(--bs-body-bg)",
                      color:
                        openServer.authMethod === method
                          ? "var(--bs-body-bg)"
                          : "var(--deployer-muted-ink)",
                      fontSize: 12,
                      cursor: "pointer",
                    }}
                  >
                    {method.replace("_", " ")}
                  </button>
                ))}
              </div>
              {formErrors.authMethod ? (
                <p className="text-danger" style={{ margin: "8px 0 0" }}>
                  {formErrors.authMethod}
                </p>
              ) : null}
            </div>

            <div
              style={{
                display: "grid",
                gridTemplateColumns: "repeat(auto-fit, minmax(220px, 1fr))",
                gap: 16,
              }}
            >
              <div>
                <label className="text-body-tertiary" style={{ fontSize: 12 }}>
                  Password
                </label>
                <input
                  type="password"
                  value={openServer.password}
                  onChange={(event) =>
                    updateServer(openServer.alias, {
                      password: event.target.value,
                    })
                  }
                  disabled={openServer.authMethod !== "password"}
                  placeholder={
                    openServer.authMethod === "password"
                      ? "Enter password"
                      : "Disabled for key auth"
                  }
                  autoComplete="off"
                  style={{
                    width: "100%",
                    marginTop: 8,
                    padding: "10px 12px",
                    borderRadius: 12,
                    border: "1px solid var(--bs-border-color)",
                    background:
                      openServer.authMethod === "password"
                        ? "var(--bs-body-bg)"
                        : "var(--deployer-input-disabled-bg)",
                  }}
                />
                {formErrors.password ? (
                  <p className="text-danger" style={{ margin: "8px 0 0" }}>
                    {formErrors.password}
                  </p>
                ) : null}
                {openServer.authMethod === "password" ? (
                  <input
                    type="password"
                    value={passwordConfirm}
                    onChange={(event) => setPasswordConfirm(event.target.value)}
                    placeholder="Confirm password"
                    autoComplete="off"
                    style={{
                      width: "100%",
                      marginTop: 8,
                      padding: "10px 12px",
                      borderRadius: 12,
                      border: "1px solid var(--bs-border-color)",
                      background: "var(--bs-body-bg)",
                    }}
                  />
                ) : null}
                <div style={{ marginTop: 8, display: "flex", gap: 8 }}>
                  <button
                    onClick={() => triggerVaultPrompt("store-password", true)}
                    disabled={openServer.authMethod !== "password" || !workspaceId}
                    style={{
                      padding: "6px 10px",
                      borderRadius: 999,
                      border: "1px solid var(--bs-border-color)",
                      background: "var(--bs-body-bg)",
                      color: "var(--deployer-muted-ink)",
                      fontSize: 12,
                      cursor: "pointer",
                    }}
                  >
                    Store in vault
                  </button>
                </div>
              </div>

              <div>
                <label className="text-body-tertiary" style={{ fontSize: 12 }}>
                  Private key
                </label>
                <textarea
                  value={openServer.privateKey}
                  onChange={(event) =>
                    updateServer(openServer.alias, {
                      privateKey: event.target.value,
                    })
                  }
                  disabled={openServer.authMethod !== "private_key"}
                  placeholder={
                    openServer.authMethod === "private_key"
                      ? "Paste SSH private key"
                      : "Disabled for password auth"
                  }
                  rows={5}
                  autoComplete="off"
                  spellCheck={false}
                  style={{
                    width: "100%",
                    marginTop: 8,
                    padding: "10px 12px",
                    borderRadius: 12,
                    border: "1px solid var(--bs-border-color)",
                    background:
                      openServer.authMethod === "private_key"
                        ? "var(--bs-body-bg)"
                        : "var(--deployer-input-disabled-bg)",
                    resize: "vertical",
                    fontFamily:
                      "ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, 'Liberation Mono', 'Courier New', monospace",
                    fontSize: 12,
                  }}
                />
                {formErrors.privateKey ? (
                  <p className="text-danger" style={{ margin: "8px 0 0" }}>
                    {formErrors.privateKey}
                  </p>
                ) : null}
              </div>
            </div>

            <div
              style={{
                padding: 12,
                borderRadius: 12,
                border: "1px solid var(--bs-border-color-translucent)",
                background: "var(--deployer-card-bg-soft)",
                display: "grid",
                gap: 10,
              }}
            >
              <div
                style={{
                  display: "flex",
                  justifyContent: "space-between",
                  alignItems: "center",
                }}
              >
                <span style={{ fontSize: 12, fontWeight: 600 }}>
                  SSH key generator
                </span>
                <button
                  onClick={() =>
                    passphraseEnabled
                      ? triggerVaultPrompt("keygen", true)
                      : handleKeygen(null, null)
                  }
                  disabled={keygenBusy || !workspaceId}
                  style={{
                    padding: "6px 10px",
                    borderRadius: 999,
                    border: "1px solid var(--bs-body-color)",
                    background: "var(--bs-body-color)",
                    color: "var(--bs-body-bg)",
                    fontSize: 12,
                    cursor: "pointer",
                  }}
                >
                  {keygenBusy ? "Generating..." : "Generate key"}
                </button>
              </div>
              <div style={{ display: "grid", gap: 8 }}>
                <label className="text-body-tertiary" style={{ fontSize: 12 }}>
                  Algorithm
                </label>
                <select
                  value={openServer.keyAlgorithm || "ed25519"}
                  onChange={(event) =>
                    updateServer(openServer.alias, {
                      keyAlgorithm: event.target.value,
                    })
                  }
                  style={{
                    padding: "8px 10px",
                    borderRadius: 10,
                    border: "1px solid var(--bs-border-color)",
                    background: "var(--bs-body-bg)",
                    fontSize: 12,
                  }}
                >
                  <option value="ed25519">ed25519 (recommended)</option>
                  <option value="rsa">rsa 4096</option>
                  <option value="ecdsa">ecdsa</option>
                </select>
              </div>
              <label
                className="text-body-secondary"
                style={{ display: "flex", gap: 8, alignItems: "center" }}
              >
                <input
                  type="checkbox"
                  checked={passphraseEnabled}
                  onChange={(event) => setPassphraseEnabled(event.target.checked)}
                />
                Generate passphrase (stored in credentials vault)
              </label>
              <div>
                <label className="text-body-tertiary" style={{ fontSize: 12 }}>
                  Public key
                </label>
                <textarea
                  readOnly
                  value={openServer.publicKey || ""}
                  placeholder="Public key will appear here"
                  rows={3}
                  style={{
                    width: "100%",
                    marginTop: 8,
                    padding: "10px 12px",
                    borderRadius: 12,
                    border: "1px solid var(--bs-border-color)",
                    background: "var(--deployer-input-disabled-bg)",
                    resize: "vertical",
                    fontFamily:
                      "ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, 'Liberation Mono', 'Courier New', monospace",
                    fontSize: 12,
                  }}
                />
                <div style={{ marginTop: 8, display: "flex", gap: 8 }}>
                  <button
                    onClick={copyPublicKey}
                    disabled={!openServer.publicKey}
                    style={{
                      padding: "6px 10px",
                      borderRadius: 999,
                      border: "1px solid var(--bs-border-color)",
                      background: "var(--bs-body-bg)",
                      color: "var(--deployer-muted-ink)",
                      fontSize: 12,
                      cursor: "pointer",
                    }}
                  >
                    Copy public key
                  </button>
                </div>
              </div>
            </div>

            {keygenError ? (
              <p className="text-danger" style={{ margin: 0, fontSize: 12 }}>
                {keygenError}
              </p>
            ) : null}
            {keygenStatus ? (
              <p className="text-success" style={{ margin: 0, fontSize: 12 }}>
                {keygenStatus}
              </p>
            ) : null}

            <div style={{ display: "flex", gap: 12, alignItems: "center" }}>
              <button
                disabled={!openServerValid}
                style={{
                  padding: "10px 16px",
                  borderRadius: 999,
                  border: "1px solid var(--bs-body-color)",
                  background: openServerValid
                    ? "var(--bs-body-color)"
                    : "var(--deployer-disabled-bg)",
                  color: openServerValid
                    ? "var(--bs-body-bg)"
                    : "var(--deployer-disabled-text)",
                  cursor: openServerValid ? "pointer" : "not-allowed",
                }}
              >
                Save credentials
              </button>
              {!openServerValid ? (
                <span className="text-danger" style={{ fontSize: 12 }}>
                  Fix the fields highlighted below.
                </span>
              ) : null}
            </div>

            {Object.keys(formErrors).length > 0 ? (
              <div
                style={{
                  padding: 12,
                  borderRadius: 12,
                  background: "var(--bs-danger-bg-subtle)",
                  color: "var(--bs-danger-text-emphasis)",
                  fontSize: 12,
                }}
              >
                {Object.entries(formErrors).map(([key, message]) => (
                  <div key={key}>
                    <strong>{FIELD_LABELS[key] ?? key}:</strong> {message}
                  </div>
                ))}
              </div>
            ) : null}
          </div>
        </div>
      ) : null}

      <VaultPasswordModal
        open={vaultPromptOpen}
        title="Unlock credentials vault"
        requireConfirm={vaultPromptConfirm}
        confirmLabel="Confirm master password"
        helperText="The master password is required to write to credentials.kdbx."
        onSubmit={handleVaultPromptSubmit}
        onClose={() => {
          setVaultPromptOpen(false);
          setVaultPromptAction(null);
        }}
      />

      {removeTarget ? (
        <div
          onClick={() => {
            if (!removeBusy) {
              setRemoveTarget(null);
              setRemoveError(null);
            }
          }}
          style={{
            position: "fixed",
            inset: 0,
            background: "rgba(8, 12, 20, 0.65)",
            backdropFilter: "blur(6px)",
            display: "grid",
            placeItems: "center",
            zIndex: 80,
          }}
        >
          <div
            onClick={(event) => event.stopPropagation()}
            style={{
              width: "min(420px, 92vw)",
              background: "var(--bs-body-bg)",
              borderRadius: 18,
              border: "1px solid var(--bs-border-color-translucent)",
              boxShadow: "var(--deployer-shadow)",
              padding: 18,
              display: "grid",
              gap: 12,
            }}
          >
            <div>
              <h3 style={{ margin: 0, fontSize: 18 }}>Delete server</h3>
              <p
                className="text-body-secondary"
                style={{ margin: "6px 0 0", fontSize: 12 }}
              >
                Remove <strong>{removeTarget}</strong> from inventory and delete
                its host_vars file?
              </p>
            </div>
            {removeError ? (
              <p className="text-danger" style={{ margin: 0, fontSize: 12 }}>
                {removeError}
              </p>
            ) : null}
            <div style={{ display: "flex", justifyContent: "flex-end", gap: 8 }}>
              <button
                onClick={() => {
                  if (!removeBusy) {
                    setRemoveTarget(null);
                    setRemoveError(null);
                  }
                }}
                style={{
                  padding: "8px 12px",
                  borderRadius: 999,
                  border: "1px solid var(--bs-border-color)",
                  background: "var(--bs-body-bg)",
                  color: "var(--deployer-muted-ink)",
                  fontSize: 12,
                  cursor: "pointer",
                }}
              >
                Cancel
              </button>
              <button
                onClick={confirmRemoveServer}
                disabled={removeBusy}
                style={{
                  padding: "8px 12px",
                  borderRadius: 999,
                  border: "1px solid var(--bs-danger-text-emphasis)",
                  background: "var(--bs-danger-text-emphasis)",
                  color: "var(--bs-body-bg)",
                  fontSize: 12,
                  cursor: removeBusy ? "not-allowed" : "pointer",
                }}
              >
                {removeBusy ? "Deleting..." : "Delete"}
              </button>
            </div>
          </div>
        </div>
      ) : null}
    </section>
  );
}
