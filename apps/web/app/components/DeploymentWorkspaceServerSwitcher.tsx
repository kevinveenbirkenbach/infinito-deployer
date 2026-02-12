"use client";

import { useRef } from "react";
import styles from "./DeploymentWorkspaceServerSwitcher.module.css";

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

type ServerSwitcherProps = {
  currentAlias: string;
  servers: ServerState[];
  onSelect: (alias: string) => void;
  onCreate: (aliasHint?: string) => void;
  onOpenServerTab: () => void;
};

export default function DeploymentWorkspaceServerSwitcher({
  currentAlias,
  servers,
  onSelect,
  onCreate,
  onOpenServerTab,
}: ServerSwitcherProps) {
  const detailsRef = useRef<HTMLDetailsElement | null>(null);

  const close = () => {
    if (detailsRef.current) {
      detailsRef.current.open = false;
    }
  };

  const handleSelect = (alias: string) => {
    onSelect(alias);
    close();
  };

  const handleCreate = () => {
    onCreate();
    onOpenServerTab();
    close();
  };

  return (
    <details ref={detailsRef} className={styles.switcher}>
      <summary className={styles.trigger}>
        <i className="fa-solid fa-server" aria-hidden="true" />
        <span>Selected for: {currentAlias || "none"}</span>
        <i className="fa-solid fa-chevron-down" aria-hidden="true" />
      </summary>
      <div className={styles.menu}>
        {servers.length === 0 ? (
          <div className={`text-body-secondary ${styles.empty}`}>No servers yet.</div>
        ) : (
          servers.map((server) => (
            <button
              type="button"
              key={server.alias}
              onClick={() => handleSelect(server.alias)}
              className={`${styles.serverButton} ${
                currentAlias === server.alias ? styles.serverButtonActive : ""
              }`}
            >
              {server.alias}
            </button>
          ))
        )}
        <button type="button" onClick={handleCreate} className={styles.newButton}>
          <i className="fa-solid fa-plus" aria-hidden="true" />
          <span>New</span>
        </button>
      </div>
    </details>
  );
}
