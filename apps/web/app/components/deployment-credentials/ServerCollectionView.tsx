"use client";

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

  const listGridStyle = {
    "--server-list-columns": listColumns,
  } as CSSProperties;

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
              className={`${styles.listGrid} ${styles.listRow} ${styles.rowDefault}`}
              style={listGridStyle}
            >
              <div className={styles.fieldColumn}>
                <input
                  value={server.alias}
                  onChange={(event) => onAliasChange(server.alias, event.target.value)}
                  placeholder="main"
                  className={`${styles.inputSmall} ${
                    aliasError ? styles.inputError : ""
                  }`}
                />
                {aliasError ? (
                  <span className={`text-danger ${styles.aliasErrorText}`}>
                    {aliasError}
                  </span>
                ) : null}
              </div>
              <input
                value={server.host}
                onChange={(event) =>
                  onPatchServer(server.alias, { host: event.target.value })
                }
                placeholder="example.com"
                className={styles.inputSmall}
              />
              <input
                value={server.port}
                onChange={(event) =>
                  onPatchServer(server.alias, { port: event.target.value })
                }
                placeholder="22"
                inputMode="numeric"
                className={styles.inputSmall}
              />
              <input
                value={server.user}
                onChange={(event) =>
                  onPatchServer(server.alias, { user: event.target.value })
                }
                placeholder="root"
                className={styles.inputSmall}
              />
              <div className={`text-body-secondary ${styles.statusHint}`}>
                {status
                  ? `Ping ${status.ping_ok ? "ok" : "fail"} · SSH ${
                      status.ssh_ok ? "ok" : "fail"
                    }`
                  : "Not tested"}
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
        const alias = (server.alias || "").trim();
        const aliasError = !alias
          ? "Alias is required."
          : aliasCounts[alias] > 1
          ? "Alias already exists."
          : null;
        const status = testResults[server.alias];
        const dense = viewConfig.dense;

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
            className={`${styles.serverCard} ${styles.cardDefault}`}
            style={cardStyle}
          >
            <div className={styles.cardHeader}>
              <div className={styles.cardHeaderMeta}>
                <span className={`text-body-secondary ${styles.cardLabel}`}>Server</span>
              </div>
              <div className={styles.cardActions}>
                <button
                  onClick={() => onOpenCredentials(server.alias)}
                  className={styles.actionButtonPrimary}
                >
                  Credentials
                </button>
                <button
                  onClick={() => onTestConnection(server)}
                  disabled={testBusy[server.alias] || !workspaceId}
                  className={styles.actionButtonSecondary}
                >
                  {testBusy[server.alias] ? "Testing..." : "Test"}
                </button>
                <button
                  onClick={() => onRequestRemove(server.alias)}
                  title="Remove server"
                  aria-label="Remove server"
                  className={styles.trashButtonCard}
                >
                  <i className="fa-solid fa-trash" aria-hidden="true" />
                </button>
              </div>
            </div>

            <div className={styles.fieldGrid}>
              <div className={styles.fieldWrap}>
                <label className={`text-body-tertiary ${styles.fieldLabel}`}>Alias</label>
                <input
                  value={server.alias}
                  onChange={(event) => onAliasChange(server.alias, event.target.value)}
                  placeholder="main"
                  className={`${styles.fieldInput} ${
                    aliasError ? styles.inputError : ""
                  }`}
                />
                {aliasError ? (
                  <p className="text-danger">{aliasError}</p>
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
                  className={styles.fieldInput}
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
                  className={styles.fieldInput}
                />
              </div>
              <div className={styles.fieldWrap}>
                <label className={`text-body-tertiary ${styles.fieldLabel}`}>User</label>
                <input
                  value={server.user}
                  onChange={(event) =>
                    onPatchServer(server.alias, { user: event.target.value })
                  }
                  placeholder="root"
                  className={styles.fieldInput}
                />
              </div>
            </div>

            {!dense && status ? (
              <div className={styles.statusCard}>
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
  );
}
