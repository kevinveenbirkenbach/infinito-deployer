"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { validateForm } from "../lib/deploy_form";
import styles from "./DeploymentCredentialsForm.module.css";
import RemoveServerModal from "./deployment-credentials/RemoveServerModal";
import ServerCollectionView from "./deployment-credentials/ServerCollectionView";
import ServerCredentialsModal from "./deployment-credentials/ServerCredentialsModal";
import {
  SERVER_VIEW_CONFIG,
  SERVER_VIEW_MODES,
} from "./deployment-credentials/types";
import type {
  ConnectionResult,
  FormErrors,
  FormState,
  ServerState,
  ServerViewMode,
} from "./deployment-credentials/types";
import VaultPasswordModal from "./VaultPasswordModal";

type DeploymentCredentialsFormProps = {
  baseUrl: string;
  workspaceId: string | null;
  servers: ServerState[];
  activeAlias: string;
  onActiveAliasChange: (alias: string) => void;
  onUpdateServer: (alias: string, patch: Partial<ServerState>) => void;
  onRemoveServer: (alias: string) => Promise<void> | void;
  onAddServer: (aliasHint?: string) => void;
  compact?: boolean;
};

const SERVER_VIEW_ICONS: Record<ServerViewMode, string> = {
  selection: "fa-solid fa-object-group",
  detail: "fa-solid fa-table-cells-large",
  list: "fa-solid fa-list",
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
  compact = false,
}: DeploymentCredentialsFormProps) {
  const Wrapper = compact ? "div" : "section";
  const wrapperClassName = compact
    ? styles.root
    : `${styles.root} ${styles.wrapper}`;

  const [openAlias, setOpenAlias] = useState<string | null>(null);
  const [testBusy, setTestBusy] = useState<Record<string, boolean>>({});
  const [testResults, setTestResults] = useState<Record<string, ConnectionResult>>({});
  const [query, setQuery] = useState("");
  const [queryDraft, setQueryDraft] = useState("");
  const [viewMode, setViewMode] = useState<ServerViewMode>("detail");
  const [rowsOverride, setRowsOverride] = useState<number | null>(null);
  const [page, setPage] = useState(1);
  const scrollRef = useRef<HTMLDivElement | null>(null);
  const controlsRef = useRef<HTMLDivElement | null>(null);
  const filtersButtonRef = useRef<HTMLButtonElement | null>(null);
  const filtersPopoverRef = useRef<HTMLDivElement | null>(null);
  const [gridSize, setGridSize] = useState({ width: 0, height: 0 });
  const [filtersOpen, setFiltersOpen] = useState(false);
  const [filtersPos, setFiltersPos] = useState({ top: 0, left: 0 });

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

  useEffect(() => {
    const node = scrollRef.current;
    if (!node) return;
    const update = () => {
      const controlsHeight = controlsRef.current?.clientHeight ?? 0;
      setGridSize({
        width: node.clientWidth || 0,
        height: Math.max(0, (node.clientHeight || 0) - controlsHeight),
      });
    };
    update();
    if (typeof ResizeObserver === "undefined") {
      window.addEventListener("resize", update);
      return () => window.removeEventListener("resize", update);
    }
    const observer = new ResizeObserver(() => update());
    observer.observe(node);
    if (controlsRef.current) observer.observe(controlsRef.current);
    return () => observer.disconnect();
  }, []);

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

  const normalizedQuery = query.trim().toLowerCase();
  const filteredServers = useMemo(() => {
    if (!normalizedQuery) return servers;
    return servers.filter((server) => {
      const haystack = [
        server.alias,
        server.host,
        server.user,
        server.port,
        server.authMethod,
      ]
        .map((value) => String(value || "").toLowerCase())
        .join(" ");
      return haystack.includes(normalizedQuery);
    });
  }, [servers, normalizedQuery]);

  const viewConfig = SERVER_VIEW_CONFIG[viewMode];
  const gridGap = 16;
  const computedColumns =
    viewMode === "list"
      ? 1
      : Math.max(
          1,
          Math.floor((gridSize.width + gridGap) / (viewConfig.minWidth + gridGap))
        );
  const computedRows = Math.max(
    1,
    Math.floor((gridSize.height + gridGap) / (viewConfig.minHeight + gridGap))
  );
  const rows = Math.max(1, rowsOverride ?? computedRows);
  const pageSize = Math.max(1, computedColumns * rows);
  const pageCount = Math.max(1, Math.ceil(filteredServers.length / pageSize));
  const currentPage = Math.min(page, pageCount);
  const paginatedServers = useMemo(() => {
    const start = (currentPage - 1) * pageSize;
    return filteredServers.slice(start, start + pageSize);
  }, [filteredServers, currentPage, pageSize]);

  const listColumns =
    "minmax(160px, 1.2fr) minmax(200px, 2fr) minmax(80px, 0.6fr) minmax(120px, 1fr) minmax(160px, 1.2fr) minmax(200px, 1fr)";

  useEffect(() => {
    setPage(1);
  }, [query, viewMode, rowsOverride]);

  useEffect(() => {
    if (page > pageCount) setPage(pageCount);
  }, [page, pageCount]);

  const updateServer = (alias: string, patch: Partial<ServerState>) => {
    onUpdateServer(alias, patch);
  };

  const applySearch = () => {
    setQuery(queryDraft.trim());
  };

  const addServerFromSearch = () => {
    const aliasHint = queryDraft.trim();
    onAddServer(aliasHint || undefined);
  };

  const openFilters = () => {
    const button = filtersButtonRef.current;
    if (!button) return;
    const rect = button.getBoundingClientRect();
    const width = 230;
    setFiltersPos({
      top: rect.bottom + 8,
      left: Math.max(12, rect.right - width),
    });
    setFiltersOpen(true);
  };

  useEffect(() => {
    if (!filtersOpen) return;
    const handleClickOutside = (event: MouseEvent) => {
      const target = event.target as Node | null;
      if (!target) return;
      if (filtersPopoverRef.current?.contains(target)) return;
      if (filtersButtonRef.current?.contains(target)) return;
      setFiltersOpen(false);
    };
    const handleEscape = (event: KeyboardEvent) => {
      if (event.key === "Escape") setFiltersOpen(false);
    };
    const closeOnViewportChange = () => setFiltersOpen(false);

    document.addEventListener("mousedown", handleClickOutside);
    document.addEventListener("keydown", handleEscape);
    window.addEventListener("resize", closeOnViewportChange);
    window.addEventListener("scroll", closeOnViewportChange, true);
    return () => {
      document.removeEventListener("mousedown", handleClickOutside);
      document.removeEventListener("keydown", handleEscape);
      window.removeEventListener("resize", closeOnViewportChange);
      window.removeEventListener("scroll", closeOnViewportChange, true);
    };
  }, [filtersOpen]);

  const filtersOverlay =
    filtersOpen && typeof document !== "undefined"
      ? createPortal(
          <div
            ref={filtersPopoverRef}
            className={styles.dropdownCardOverlay}
            style={{ top: filtersPos.top, left: filtersPos.left }}
          >
            <div className={styles.group}>
              <span className={`text-body-tertiary ${styles.groupTitle}`}>Rows</span>
              <select
                value={rowsOverride ? String(rowsOverride) : "auto"}
                onChange={(event) => {
                  const value = event.target.value;
                  if (value === "auto") {
                    setRowsOverride(null);
                  } else {
                    const parsed = Number(value);
                    setRowsOverride(Number.isFinite(parsed) ? parsed : null);
                  }
                }}
                className={`form-select ${styles.rowSelect}`}
              >
                <option value="auto">Auto ({computedRows})</option>
                {Array.from(new Set([1, 2, 3, 4, 5, 6, computedRows]))
                  .sort((a, b) => a - b)
                  .map((value) => (
                    <option key={value} value={String(value)}>
                      {value} rows
                    </option>
                  ))}
              </select>
            </div>
          </div>,
          document.body
        )
      : null;

  const handleAliasChange = (alias: string, nextAlias: string) => {
    updateServer(alias, { alias: nextAlias });
    if (openAlias === alias) {
      setOpenAlias(nextAlias);
    }
  };

  const onAuthChange = (alias: string, next: string) => {
    if (next === "password") {
      updateServer(alias, { authMethod: next, privateKey: "", publicKey: "" });
    } else {
      updateServer(alias, { authMethod: next, password: "" });
      setPasswordConfirm("");
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
      const res = await fetch(`${baseUrl}/api/workspaces/${workspaceId}/ssh-keys`, {
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
      });
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
      const res = await fetch(`${baseUrl}/api/workspaces/${workspaceId}/vault/entries`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          master_password: masterPassword,
          master_password_confirm: confirmPassword,
          create_if_missing: true,
          alias: openServer.alias,
          server_password: serverPassword,
        }),
      });
      if (!res.ok) {
        const text = await res.text();
        throw new Error(text || `HTTP ${res.status}`);
      }
      setKeygenStatus("Server password stored in credentials vault.");
    } catch (err: any) {
      setKeygenError(err?.message ?? "failed to store password in vault");
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

  const testConnection = async (server: ServerState) => {
    if (!workspaceId) return;
    setTestBusy((prev) => ({ ...prev, [server.alias]: true }));
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

  const requestRemoveServer = (alias: string) => {
    setRemoveError(null);
    setRemoveTarget(alias);
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
    <Wrapper className={wrapperClassName}>
      {!compact ? (
        <div className={styles.header}>
          <div className={styles.headerLeft}>
            <h2 className={`text-body ${styles.title}`}>Server</h2>
            <p className={`text-body-secondary ${styles.subtitle}`}>
              Configure server connections for deployments. Secrets can be stored in
              the workspace vault and are never persisted in browser storage.
            </p>
          </div>
          <div className={`text-body-secondary ${styles.headerRight}`}>
            API Base: <code>{baseUrl}</code>
          </div>
        </div>
      ) : null}

      <div className={`${styles.main} ${compact ? styles.mainCompact : ""}`}>
        <div ref={scrollRef} className={styles.scrollArea}>
          <div ref={controlsRef} className={styles.controls}>
            <div className={styles.controlsRow}>
              <input
                value={queryDraft}
                onChange={(event) => {
                  const value = event.target.value;
                  setQueryDraft(value);
                  setQuery(value);
                }}
                onKeyDown={(event) => {
                  if (event.key === "Enter") {
                    event.preventDefault();
                    applySearch();
                  }
                }}
                placeholder="Search servers"
                aria-label="Search servers"
                className={`form-control ${styles.search}`}
              />
              <button
                ref={filtersButtonRef}
                onClick={() => {
                  if (filtersOpen) {
                    setFiltersOpen(false);
                  } else {
                    openFilters();
                  }
                }}
                className={`${styles.toolbarButton} ${styles.filterButton}`}
                aria-expanded={filtersOpen}
              >
                <i className="fa-solid fa-filter" aria-hidden="true" />
                <span>Filters</span>
              </button>
              <button
                onClick={applySearch}
                className={`${styles.toolbarButton} ${styles.searchButton}`}
              >
                <i className="fa-solid fa-magnifying-glass" aria-hidden="true" />
                <span>Search</span>
              </button>
              <button
                onClick={addServerFromSearch}
                className={`${styles.toolbarButton} ${styles.addButton}`}
              >
                <i className="fa-solid fa-plus" aria-hidden="true" />
                <span>Add</span>
              </button>
              <div className={styles.modeButtons}>
                {SERVER_VIEW_MODES.map((mode) => {
                  const active = viewMode === mode;
                  return (
                    <button
                      key={mode}
                      onClick={() => setViewMode(mode)}
                      className={`${styles.modeButton} ${
                        active ? styles.modeButtonActive : ""
                      }`}
                    >
                      <i className={SERVER_VIEW_ICONS[mode]} aria-hidden="true" />
                      <span>{mode}</span>
                    </button>
                  );
                })}
              </div>
            </div>
          </div>

          <div className={styles.contentWrap}>
            <ServerCollectionView
              viewMode={viewMode}
              paginatedServers={paginatedServers}
              listColumns={listColumns}
              computedColumns={computedColumns}
              aliasCounts={aliasCounts}
              testBusy={testBusy}
              testResults={testResults}
              workspaceId={workspaceId}
              onAliasChange={handleAliasChange}
              onPatchServer={updateServer}
              onOpenCredentials={setOpenAlias}
              onTestConnection={testConnection}
              onRequestRemove={requestRemoveServer}
            />
          </div>
        </div>

        <div className={`text-body-secondary ${styles.pagination}`}>
          <button
            onClick={() => setPage((prev) => Math.max(1, prev - 1))}
            disabled={currentPage <= 1}
            className={`${styles.pageButton} ${
              currentPage <= 1 ? styles.pageButtonDisabled : styles.pageButtonEnabled
            }`}
          >
            Prev
          </button>
          <span>
            Page {currentPage} / {pageCount}
          </span>
          <button
            onClick={() => setPage((prev) => Math.min(pageCount, prev + 1))}
            disabled={currentPage >= pageCount}
            className={`${styles.pageButton} ${
              currentPage >= pageCount ? styles.pageButtonDisabled : styles.pageButtonEnabled
            }`}
          >
            Next
          </button>
        </div>
      </div>

      <ServerCredentialsModal
        openServer={openServer}
        openServerValid={openServerValid}
        formErrors={formErrors}
        passwordConfirm={passwordConfirm}
        onPasswordConfirmChange={setPasswordConfirm}
        passphraseEnabled={passphraseEnabled}
        onPassphraseEnabledChange={setPassphraseEnabled}
        keygenBusy={keygenBusy}
        keygenError={keygenError}
        keygenStatus={keygenStatus}
        workspaceId={workspaceId}
        onClose={() => setOpenAlias(null)}
        onAuthChange={onAuthChange}
        onUpdateServer={updateServer}
        onTriggerVaultPrompt={triggerVaultPrompt}
        onGenerateKey={() => {
          void handleKeygen(null, null);
        }}
        onCopyPublicKey={copyPublicKey}
      />

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

      <RemoveServerModal
        removeTarget={removeTarget}
        removeBusy={removeBusy}
        removeError={removeError}
        onCancel={() => {
          setRemoveTarget(null);
          setRemoveError(null);
        }}
        onConfirm={() => {
          void confirmRemoveServer();
        }}
      />
      {filtersOverlay}
    </Wrapper>
  );
}
