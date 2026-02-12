"use client";

import { useEffect, useState } from "react";
import type { CSSProperties } from "react";
import { SERVER_VIEW_CONFIG } from "./types";
import styles from "./styles.module.css";
import type {
  ConnectionResult,
  ServerState,
  ServerViewMode,
} from "./types";

type ServerCollectionViewProps = {
  viewMode: ServerViewMode;
  paginatedServers: ServerState[];
  listColumns: string;
  computedColumns: number;
  aliasCounts: Record<string, number>;
  testBusy: Record<string, boolean>;
  testResults: Record<string, ConnectionResult>;
  workspaceId: string | null;
  onAliasChange: (alias: string, nextAlias: string) => void;
  onPatchServer: (alias: string, patch: Partial<ServerState>) => void;
  onOpenCredentials: (alias: string) => void;
  onTestConnection: (server: ServerState) => void;
  onRequestRemove: (alias: string) => void;
};

type ValidationState = {
  aliasError: string | null;
  hostMissing: boolean;
  userMissing: boolean;
  portError: string | null;
  credentialsMissing: boolean;
};

const ALIAS_PATTERN = /^[a-z0-9_]+$/;

export default function ServerCollectionView({
  viewMode,
  paginatedServers,
  listColumns,
  computedColumns,
  aliasCounts,
  testBusy,
  testResults,
  workspaceId,
  onAliasChange,
  onPatchServer,
  onOpenCredentials,
  onTestConnection,
  onRequestRemove,
}: ServerCollectionViewProps) {
  const viewConfig = SERVER_VIEW_CONFIG[viewMode];
  const [aliasDrafts, setAliasDrafts] = useState<Record<string, string>>({});

  const listGridStyle = {
    "--server-list-columns": listColumns,
  } as CSSProperties;

  useEffect(() => {
    setAliasDrafts((prev) => {
      const next: Record<string, string> = {};
      paginatedServers.forEach((server) => {
        next[server.alias] = prev[server.alias] ?? server.alias;
      });
      return next;
    });
  }, [paginatedServers]);

  const updateAliasDraft = (alias: string, value: string) => {
    setAliasDrafts((prev) => ({ ...prev, [alias]: value }));
  };

  const getAliasErrorFor = (aliasValue: string, currentAlias: string) => {
    if (!aliasValue) return "Alias is required.";
    if (!ALIAS_PATTERN.test(aliasValue)) {
      return "Alias allows only a-z, 0-9 and _.";
    }
    const duplicateCount = aliasCounts[aliasValue] ?? 0;
    const duplicates =
      aliasValue === currentAlias ? duplicateCount > 1 : duplicateCount > 0;
    if (duplicates) return "Alias already exists.";
    return null;
  };

  const getAliasError = (server: ServerState) => {
    const aliasValue = String(aliasDrafts[server.alias] ?? server.alias).trim();
    return getAliasErrorFor(aliasValue, server.alias);
  };

  const getPortError = (portValue: string) => {
    const value = String(portValue ?? "").trim();
    if (!value) return null;
    if (!/^\d+$/.test(value)) return "Port must be an integer.";
    const parsed = Number(value);
    if (parsed < 1 || parsed > 65535) return "Port must be between 1 and 65535.";
    return null;
  };

  const hasCredentials = (server: ServerState) => {
    if (server.authMethod === "private_key") {
      return Boolean(String(server.privateKey || "").trim());
    }
    return Boolean(String(server.password || "").trim());
  };

  const getValidationState = (server: ServerState): ValidationState => {
    const aliasError = getAliasError(server);
    return {
      aliasError,
      hostMissing: !String(server.host || "").trim(),
      userMissing: !String(server.user || "").trim(),
      portError: getPortError(server.port),
      credentialsMissing: !hasCredentials(server),
    };
  };

  const getVisualState = (
    validation: ValidationState,
    status: ConnectionResult | undefined
  ) => {
    if (validation.credentialsMissing) {
      return {
        cardClass: styles.cardStateDanger,
        rowClass: styles.rowStateDanger,
        label: "Missing credentials",
        iconClass: "fa-solid fa-key",
        iconTone: styles.iconDanger,
      };
    }
    if (
      validation.aliasError ||
      validation.hostMissing ||
      validation.userMissing ||
      validation.portError
    ) {
      return {
        cardClass: styles.cardStateDanger,
        rowClass: styles.rowStateDanger,
        label: "Invalid configuration",
        iconClass: "fa-solid fa-circle-exclamation",
        iconTone: styles.iconDanger,
      };
    }
    if (status?.ping_ok && status?.ssh_ok) {
      return {
        cardClass: styles.cardStateSuccess,
        rowClass: styles.rowStateSuccess,
        label: "Reachable",
        iconClass: "fa-solid fa-circle-check",
        iconTone: styles.iconSuccess,
      };
    }
    if (!status) {
      return {
        cardClass: styles.cardStateWarning,
        rowClass: styles.rowStateWarning,
        label: "Not tested",
        iconClass: "fa-solid fa-bolt",
        iconTone: styles.iconWarning,
      };
    }
    if (!status.ping_ok) {
      return {
        cardClass: styles.cardStateWarning,
        rowClass: styles.rowStateWarning,
        label: "Ping failed",
        iconClass: "fa-solid fa-bolt",
        iconTone: styles.iconWarning,
      };
    }
    if (!status.ssh_ok) {
      return {
        cardClass: styles.cardStateWarning,
        rowClass: styles.rowStateWarning,
        label: "Connection failed",
        iconClass: "fa-solid fa-bolt",
        iconTone: styles.iconWarning,
      };
    }
    return {
      cardClass: styles.cardStateWarning,
      rowClass: styles.rowStateWarning,
      label: "Connection unavailable",
      iconClass: "fa-solid fa-bolt",
      iconTone: styles.iconWarning,
    };
  };

  const getPingState = (status: ConnectionResult | undefined) => {
    if (!status) {
      return {
        label: "not tested",
        iconClass: "fa-solid fa-circle-question",
        tone: styles.iconMuted,
      };
    }
    if (status.ping_ok) {
      return {
        label: "ok",
        iconClass: "fa-solid fa-circle-check",
        tone: styles.iconSuccess,
      };
    }
    return {
      label: "failed",
      iconClass: "fa-solid fa-circle-xmark",
      tone: styles.iconDanger,
    };
  };

  const getSshState = (status: ConnectionResult | undefined) => {
    if (!status) {
      return {
        label: "not tested",
        iconClass: "fa-solid fa-circle-question",
        tone: styles.iconMuted,
      };
    }
    if (status.ssh_ok) {
      return {
        label: "ok",
        iconClass: "fa-solid fa-circle-check",
        tone: styles.iconSuccess,
      };
    }
    return {
      label: "failed",
      iconClass: "fa-solid fa-circle-xmark",
      tone: styles.iconDanger,
    };
  };

  const commitAlias = (server: ServerState) => {
    const draft = String(aliasDrafts[server.alias] ?? server.alias);
    const trimmed = draft.trim();
    const error = getAliasErrorFor(trimmed, server.alias);
    if (error || trimmed === server.alias) {
      setAliasDrafts((prev) => ({ ...prev, [server.alias]: trimmed || server.alias }));
      return;
    }
    onAliasChange(server.alias, trimmed);
    setAliasDrafts((prev) => {
      const next = { ...prev };
      delete next[server.alias];
      next[trimmed] = trimmed;
      return next;
    });
  };

  if (viewMode === "list") {
    return (
      <div className={styles.listRoot}>
        <div className={`${styles.listGrid} ${styles.listHeader}`} style={listGridStyle}>
          <span>Alias</span>
          <span>Host</span>
          <span>Port</span>
          <span>User</span>
          <span>Status</span>
          <span>Actions</span>
        </div>
        {paginatedServers.map((server) => {
          const validation = getValidationState(server);
          const status = testResults[server.alias];
          const visual = getVisualState(validation, status);
          const pingState = getPingState(status);
          const sshState = getSshState(status);
          const aliasValue = aliasDrafts[server.alias] ?? server.alias;
          return (
            <div
              key={server.alias}
              className={`${styles.listGrid} ${styles.listRow} ${styles.rowDefault} ${visual.rowClass}`}
              style={listGridStyle}
            >
              <div className={styles.fieldColumn}>
                <input
                  value={aliasValue}
                  onChange={(event) => updateAliasDraft(server.alias, event.target.value)}
                  onBlur={() => commitAlias(server)}
                  onKeyDown={(event) => {
                    if (event.key === "Enter") {
                      event.preventDefault();
                      commitAlias(server);
                    }
                  }}
                  placeholder="server"
                  className={`${styles.inputSmall} ${
                    validation.aliasError ? styles.inputError : ""
                  }`}
                />
                {validation.aliasError ? (
                  <span className={`text-danger ${styles.aliasErrorText}`}>
                    {validation.aliasError}
                  </span>
                ) : null}
              </div>
              <input
                value={server.host}
                onChange={(event) =>
                  onPatchServer(server.alias, { host: event.target.value })
                }
                placeholder="example.com"
                className={`${styles.inputSmall} ${
                  validation.hostMissing ? styles.inputError : ""
                }`}
              />
              <input
                value={server.port}
                onChange={(event) =>
                  onPatchServer(server.alias, { port: event.target.value })
                }
                placeholder="22"
                inputMode="numeric"
                className={`${styles.inputSmall} ${
                  validation.portError ? styles.inputError : ""
                }`}
              />
              <input
                value={server.user}
                onChange={(event) =>
                  onPatchServer(server.alias, { user: event.target.value })
                }
                placeholder="root"
                className={`${styles.inputSmall} ${
                  validation.userMissing ? styles.inputError : ""
                }`}
              />
              <div className={`${styles.statusHint} ${styles.statusHintWithIcon}`}>
                <i
                  className={`${visual.iconClass} ${visual.iconTone}`}
                  aria-hidden="true"
                />
                <span>{visual.label}</span>
                <span className={styles.statusDetailInline}>
                  Ping {pingState.label} · SSH {sshState.label}
                </span>
              </div>
              <div className={styles.actionRow}>
                <button
                  onClick={() => onOpenCredentials(server.alias)}
                  className={styles.actionButtonSolid}
                >
                  Credentials
                </button>
                <button
                  onClick={() => onTestConnection(server)}
                  disabled={testBusy[server.alias] || !workspaceId}
                  className={styles.actionButtonSoft}
                >
                  {testBusy[server.alias] ? "Testing..." : "Test"}
                </button>
                <button
                  onClick={() => onRequestRemove(server.alias)}
                  title="Remove server"
                  aria-label="Remove server"
                  className={styles.trashButton}
                >
                  <i className="fa-solid fa-trash" aria-hidden="true" />
                </button>
              </div>
            </div>
          );
        })}
      </div>
    );
  }

  const gridStyle = {
    "--server-grid-columns": computedColumns,
  } as CSSProperties;

  return (
    <div className={styles.cardGrid} style={gridStyle}>
      {paginatedServers.map((server) => {
        const dense = viewConfig.dense;
        const status = testResults[server.alias];
        const validation = getValidationState(server);
        const visual = getVisualState(validation, status);
        const pingState = getPingState(status);
        const sshState = getSshState(status);
        const aliasValue = aliasDrafts[server.alias] ?? server.alias;

        const cardStyle = {
          "--server-card-padding": dense ? "12px" : "16px",
          "--server-card-gap": dense ? "10px" : "12px",
          "--server-fields-gap": dense ? "8px" : "10px",
          "--server-input-padding": dense ? "6px 8px" : "8px 10px",
          "--server-input-font": dense ? "12px" : "13px",
          "--server-action-padding": dense ? "5px 8px" : "6px 10px",
          "--server-action-font": dense ? "11px" : "12px",
          "--server-trash-size": dense ? "28px" : "32px",
        } as CSSProperties;

        return (
          <div
            key={server.alias}
            className={`${styles.serverCard} ${styles.cardDefault} ${visual.cardClass}`}
            style={cardStyle}
          >
            <div className={styles.cardHeader}>
              <div className={styles.cardHeaderMeta}>
                <span className={`text-body-secondary ${styles.cardLabel}`}>Server</span>
              </div>
              <button
                type="button"
                onClick={() => {
                  if (!window.confirm(`Delete server "${server.alias}"?`)) return;
                  onRequestRemove(server.alias);
                }}
                className={styles.cardDeleteButton}
                title="Delete server"
                aria-label="Delete server"
              >
                <i className="fa-solid fa-trash" aria-hidden="true" />
              </button>
            </div>

            <div className={styles.fieldGrid}>
              <div className={styles.fieldWrap}>
                <label className={`text-body-tertiary ${styles.fieldLabel}`}>Alias</label>
                <input
                  value={aliasValue}
                  onChange={(event) => updateAliasDraft(server.alias, event.target.value)}
                  onBlur={() => commitAlias(server)}
                  onKeyDown={(event) => {
                    if (event.key === "Enter") {
                      event.preventDefault();
                      commitAlias(server);
                    }
                  }}
                  placeholder="server"
                  className={`${styles.fieldInput} ${
                    validation.aliasError ? styles.inputError : ""
                  }`}
                />
                {validation.aliasError ? (
                  <p className="text-danger">{validation.aliasError}</p>
                ) : null}
              </div>
              <div className={styles.fieldWrap}>
                <label className={`text-body-tertiary ${styles.fieldLabel}`}>Host</label>
                <input
                  value={server.host}
                  onChange={(event) =>
                    onPatchServer(server.alias, { host: event.target.value })
                  }
                  placeholder="example.com"
                  className={`${styles.fieldInput} ${
                    validation.hostMissing ? styles.inputError : ""
                  }`}
                />
              </div>
              <div className={styles.fieldWrap}>
                <label className={`text-body-tertiary ${styles.fieldLabel}`}>Port</label>
                <input
                  value={server.port}
                  onChange={(event) =>
                    onPatchServer(server.alias, { port: event.target.value })
                  }
                  placeholder="22"
                  inputMode="numeric"
                  className={`${styles.fieldInput} ${
                    validation.portError ? styles.inputError : ""
                  }`}
                />
                {validation.portError ? <p className="text-danger">{validation.portError}</p> : null}
              </div>
              <div className={styles.fieldWrap}>
                <label className={`text-body-tertiary ${styles.fieldLabel}`}>User</label>
                <input
                  value={server.user}
                  onChange={(event) =>
                    onPatchServer(server.alias, { user: event.target.value })
                  }
                  placeholder="root"
                  className={`${styles.fieldInput} ${
                    validation.userMissing ? styles.inputError : ""
                  }`}
                />
              </div>
            </div>

            <div className={styles.statusCard}>
              <div className={styles.statusHeadline}>
                <i className={`${visual.iconClass} ${visual.iconTone}`} aria-hidden="true" />
                <span>{visual.label}</span>
              </div>
              <div className={styles.statusLine}>
                <div className={styles.statusLineText}>
                  <i className={`${pingState.iconClass} ${pingState.tone}`} aria-hidden="true" />
                  <span>Ping: {pingState.label}</span>
                </div>
                <button
                  type="button"
                  onClick={() => onTestConnection(server)}
                  disabled={testBusy[server.alias] || !workspaceId}
                  className={styles.refreshInlineButton}
                  title="Refresh test"
                  aria-label="Refresh test"
                >
                  <i
                    className={testBusy[server.alias] ? "fa-solid fa-spinner fa-spin" : "fa-solid fa-rotate-right"}
                    aria-hidden="true"
                  />
                </button>
              </div>
              <div className={styles.statusLine}>
                <div className={styles.statusLineText}>
                  <i className={`${sshState.iconClass} ${sshState.tone}`} aria-hidden="true" />
                  <span>Connection: {sshState.label}</span>
                </div>
                <button
                  type="button"
                  onClick={() => onTestConnection(server)}
                  disabled={testBusy[server.alias] || !workspaceId}
                  className={styles.refreshInlineButton}
                  title="Refresh test"
                  aria-label="Refresh test"
                >
                  <i
                    className={testBusy[server.alias] ? "fa-solid fa-spinner fa-spin" : "fa-solid fa-rotate-right"}
                    aria-hidden="true"
                  />
                </button>
              </div>
            </div>

            <div className={styles.cardFooter}>
              <button
                onClick={() => onOpenCredentials(server.alias)}
                className={styles.actionButtonPrimary}
              >
                Credentials
              </button>
            </div>
          </div>
        );
      })}
    </div>
  );
}
