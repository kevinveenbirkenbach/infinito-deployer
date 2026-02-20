"use client";

import { createPortal } from "react-dom";
import { useEffect, useMemo, useState } from "react";
import type {
  CSSProperties,
  ChangeEvent as ReactChangeEvent,
  MouseEvent as ReactMouseEvent,
} from "react";
import type { FocusEvent as ReactFocusEvent } from "react";
import data from "@emoji-mart/data";
import Picker from "@emoji-mart/react";
import CountryFlagSelectPlugin from "./CountryFlagSelectPlugin";
import { SERVER_VIEW_CONFIG } from "./types";
import styles from "./styles.module.css";
import {
  hexToRgba,
  normalizeDeviceColor,
  normalizeDeviceEmoji,
} from "./device-visuals";
import type {
  ConnectionResult,
  ServerState,
  ServerViewMode,
} from "./types";

type ServerCollectionViewProps = {
  viewMode: ServerViewMode;
  deviceMode?: "customer" | "expert";
  onOpenDetailSearch?: (alias?: string) => void;
  paginatedServers: ServerState[];
  computedColumns: number;
  aliasCounts: Record<string, number>;
  testResults: Record<string, ConnectionResult>;
  workspaceId: string | null;
  onAliasChange: (alias: string, nextAlias: string) => void;
  onPatchServer: (alias: string, patch: Partial<ServerState>) => void;
  onOpenDetail: (alias: string) => void;
  onGenerateKey: (alias: string) => Promise<void> | void;
  onCredentialFieldBlur: (payload: {
    server: ServerState;
    field:
      | "host"
      | "port"
      | "user"
      | "password"
      | "passwordConfirm"
      | "privateKey"
      | "keyPassphrase"
      | "primaryDomain";
    passwordConfirm?: string;
  }) => Promise<void> | void;
  onRequestDelete: (aliases: string[]) => void;
  onRequestPurge: (aliases: string[]) => void;
  requestedDetailAlias?: string | null;
  onRequestedDetailAliasHandled?: () => void;
};

type ValidationState = {
  aliasError: string | null;
  hostMissing: boolean;
  userMissing: boolean;
  portError: string | null;
  colorError: string | null;
  logoMissing: boolean;
  credentialsMissing: boolean;
  passwordConfirmError: string | null;
};

type StatusIndicator = {
  tone: "green" | "yellow" | "orange";
  label: string;
  tooltip: string;
  missingCredentials: boolean;
};

type OverlayMenu = {
  alias: string;
  top: number;
  left: number;
};

type StatusPopover = {
  alias: string;
  top: number;
  left: number;
  label: string;
  tooltip: string;
};

const ALIAS_PATTERN = /^[a-z0-9_-]+$/;

export default function ServerCollectionView({
  viewMode,
  deviceMode = "customer",
  onOpenDetailSearch,
  paginatedServers,
  computedColumns,
  aliasCounts,
  testResults,
  workspaceId,
  onAliasChange,
  onPatchServer,
  onOpenDetail,
  onGenerateKey,
  onCredentialFieldBlur,
  onRequestDelete,
  onRequestPurge,
  requestedDetailAlias = null,
  onRequestedDetailAliasHandled,
}: ServerCollectionViewProps) {
  const viewConfig = SERVER_VIEW_CONFIG[viewMode];
  const isCustomerMode = deviceMode === "customer";

  const [aliasDrafts, setAliasDrafts] = useState<Record<string, string>>({});
  const [passwordConfirmDrafts, setPasswordConfirmDrafts] = useState<
    Record<string, string>
  >({});
  const [openEmojiAlias, setOpenEmojiAlias] = useState<string | null>(null);
  const [detailAlias, setDetailAlias] = useState<string | null>(null);
  const [selectedAliases, setSelectedAliases] = useState<Set<string>>(new Set());
  const [actionMenu, setActionMenu] = useState<OverlayMenu | null>(null);
  const [bulkMenu, setBulkMenu] = useState<{ top: number; left: number } | null>(
    null
  );
  const [statusPopover, setStatusPopover] = useState<StatusPopover | null>(null);
  const [detailActionBusy, setDetailActionBusy] = useState<"keygen" | null>(null);
  const [detailActionError, setDetailActionError] = useState<string | null>(null);
  const [detailActionStatus, setDetailActionStatus] = useState<string | null>(null);
  const [keyInputModeByAlias, setKeyInputModeByAlias] = useState<
    Record<string, "import" | "generate">
  >({});

  useEffect(() => {
    setAliasDrafts((prev) => {
      const next: Record<string, string> = {};
      paginatedServers.forEach((server) => {
        next[server.alias] = prev[server.alias] ?? server.alias;
      });
      return next;
    });
    setPasswordConfirmDrafts((prev) => {
      const next: Record<string, string> = {};
      paginatedServers.forEach((server) => {
        next[server.alias] = prev[server.alias] ?? "";
      });
      return next;
    });
    setKeyInputModeByAlias((prev) => {
      const next: Record<string, "import" | "generate"> = {};
      paginatedServers.forEach((server) => {
        next[server.alias] = prev[server.alias] ?? "import";
      });
      return next;
    });

    const aliases = new Set(paginatedServers.map((server) => server.alias));
    setSelectedAliases((prev) => {
      const next = new Set<string>();
      prev.forEach((alias) => {
        if (aliases.has(alias)) next.add(alias);
      });
      return next;
    });

    if (openEmojiAlias && !aliases.has(openEmojiAlias)) {
      setOpenEmojiAlias(null);
    }
    if (detailAlias && !aliases.has(detailAlias)) {
      setDetailAlias(null);
    }
    if (actionMenu && !aliases.has(actionMenu.alias)) {
      setActionMenu(null);
    }
    if (statusPopover && !aliases.has(statusPopover.alias)) {
      setStatusPopover(null);
    }
  }, [
    paginatedServers,
    openEmojiAlias,
    detailAlias,
    actionMenu,
    statusPopover,
  ]);

  useEffect(() => {
    setDetailActionError(null);
    setDetailActionStatus(null);
    setDetailActionBusy(null);
  }, [detailAlias]);

  useEffect(() => {
    if (!requestedDetailAlias) return;
    if (isCustomerMode) {
      setDetailAlias(null);
      onRequestedDetailAliasHandled?.();
      return;
    }
    const exists = paginatedServers.some(
      (server) => server.alias === requestedDetailAlias
    );
    if (exists) {
      setDetailAlias(requestedDetailAlias);
    }
    onRequestedDetailAliasHandled?.();
  }, [
    requestedDetailAlias,
    paginatedServers,
    onRequestedDetailAliasHandled,
    isCustomerMode,
  ]);

  useEffect(() => {
    const handleOutsideClick = (event: MouseEvent) => {
      const target = event.target as Node | null;
      if (!target) return;
      const inPickerShell = Boolean(
        (target as HTMLElement).closest(`.${styles.emojiPickerShell}`)
      );
      if (!inPickerShell) {
        setOpenEmojiAlias(null);
      }
      const inActionPortal = Boolean(
        (target as HTMLElement).closest(`.${styles.actionOverlayMenu}`)
      );
      const inActionTrigger = Boolean(
        (target as HTMLElement).closest(`.${styles.actionMenuTrigger}`)
      );
      if (!inActionPortal && !inActionTrigger) {
        setActionMenu(null);
      }

      const inBulkPortal = Boolean(
        (target as HTMLElement).closest(`.${styles.bulkOverlayMenu}`)
      );
      const inBulkTrigger = Boolean(
        (target as HTMLElement).closest(`.${styles.bulkActionTrigger}`)
      );
      if (!inBulkPortal && !inBulkTrigger) {
        setBulkMenu(null);
      }
    };

    const handleEscape = (event: KeyboardEvent) => {
      if (event.key !== "Escape") return;
      setOpenEmojiAlias(null);
      setActionMenu(null);
      setBulkMenu(null);
      setStatusPopover(null);
      setDetailAlias(null);
    };

    const closeFloatingOverlays = () => {
      setActionMenu(null);
      setBulkMenu(null);
      setStatusPopover(null);
    };

    document.addEventListener("mousedown", handleOutsideClick);
    document.addEventListener("keydown", handleEscape);
    window.addEventListener("resize", closeFloatingOverlays);
    window.addEventListener("scroll", closeFloatingOverlays, true);
    return () => {
      document.removeEventListener("mousedown", handleOutsideClick);
      document.removeEventListener("keydown", handleEscape);
      window.removeEventListener("resize", closeFloatingOverlays);
      window.removeEventListener("scroll", closeFloatingOverlays, true);
    };
  }, []);

  const visibleAliases = useMemo(
    () =>
      paginatedServers
        .map((server) => String(server.alias || "").trim())
        .filter(Boolean),
    [paginatedServers]
  );

  const selectedCount = selectedAliases.size;
  const selectedVisibleCount = visibleAliases.filter((alias) =>
    selectedAliases.has(alias)
  ).length;
  const allVisibleSelected =
    visibleAliases.length > 0 && selectedVisibleCount === visibleAliases.length;

  const detailServer = useMemo(
    () =>
      detailAlias
        ? paginatedServers.find((server) => server.alias === detailAlias) ?? null
        : null,
    [detailAlias, paginatedServers]
  );

  const updateAliasDraft = (alias: string, value: string) => {
    setAliasDrafts((prev) => ({ ...prev, [alias]: value }));
  };

  const getAliasErrorFor = (aliasValue: string, currentAlias: string) => {
    if (!aliasValue) return "Alias is required.";
    if (!ALIAS_PATTERN.test(aliasValue)) {
      return "Alias allows only a-z, 0-9, _ and -.";
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
    if (!value) return "Port is required.";
    if (!/^\d+$/.test(value)) return "Port must be an integer.";
    const parsed = Number(value);
    if (parsed < 1 || parsed > 65535) return "Port must be between 1 and 65535.";
    return null;
  };

  const getPasswordConfirmError = (
    server: ServerState,
    enforcePasswordConfirm: boolean
  ) => {
    if (!enforcePasswordConfirm) return null;
    if (server.authMethod !== "password") return null;
    const password = String(server.password || "");
    if (!password) return null;
    const confirm = String(passwordConfirmDrafts[server.alias] ?? "");
    if (!confirm) return "Please confirm the password.";
    if (confirm !== password) return "Passwords do not match.";
    return null;
  };

  const normalizePortValue = (
    value: string | number | null | undefined
  ): string => {
    const digits = String(value ?? "").replace(/[^\d]/g, "");
    if (!digits) return "";
    const parsed = Number.parseInt(digits, 10);
    if (!Number.isInteger(parsed)) return "";
    return String(Math.min(65535, Math.max(1, parsed)));
  };

  const patchPort = (alias: string, value: string) => {
    onPatchServer(alias, { port: normalizePortValue(value) });
  };

  const ensurePortDefault = (alias: string, value: string) => {
    const normalized = normalizePortValue(value);
    onPatchServer(alias, { port: normalized || "22" });
  };

  const getColorError = (colorValue: string) => {
    const normalized = normalizeDeviceColor(colorValue);
    if (!normalized) return "Color must be a HEX value (e.g. #87CEEB).";
    return null;
  };

  const getLogoError = (logoValue: string) => {
    const normalized = normalizeDeviceEmoji(logoValue);
    if (!normalized) return "Logo emoji is required.";
    return null;
  };

  const hasCredentials = (server: ServerState) => {
    if (server.authMethod === "private_key") {
      return Boolean(String(server.privateKey || "").trim());
    }
    return Boolean(String(server.password || "").trim());
  };

  const getValidationState = (
    server: ServerState,
    options?: { enforcePasswordConfirm?: boolean }
  ): ValidationState => {
    const aliasError = getAliasError(server);
    const passwordConfirmError = getPasswordConfirmError(
      server,
      Boolean(options?.enforcePasswordConfirm)
    );
    return {
      aliasError,
      hostMissing: !String(server.host || "").trim(),
      userMissing: !String(server.user || "").trim(),
      portError: getPortError(server.port),
      colorError: getColorError(server.color),
      logoMissing: Boolean(getLogoError(server.logoEmoji)),
      credentialsMissing: !hasCredentials(server),
      passwordConfirmError,
    };
  };

  const hasFormIssues = (validation: ValidationState) =>
    Boolean(
      validation.aliasError ||
        validation.hostMissing ||
        validation.userMissing ||
        validation.portError ||
        validation.colorError ||
        validation.logoMissing ||
        validation.passwordConfirmError
    );

  const getStatusIndicator = (
    validation: ValidationState,
    status: ConnectionResult | undefined
  ): StatusIndicator => {
    if (validation.credentialsMissing) {
      return {
        tone: "orange",
        label: "Missing credentials",
        tooltip:
          "No credentials configured. Set a password or private key before testing.",
        missingCredentials: true,
      };
    }

    if (hasFormIssues(validation)) {
      return {
        tone: "orange",
        label: "Invalid configuration",
        tooltip: "Fix alias, host, user, port, color and logo fields first.",
        missingCredentials: false,
      };
    }

    if (!status) {
      return {
        tone: "yellow",
        label: "Not tested",
        tooltip: "No connection test result yet.",
        missingCredentials: false,
      };
    }

    if (status.ping_ok && status.ssh_ok) {
      return {
        tone: "green",
        label: "Reachable",
        tooltip: "Ping and SSH checks succeeded.",
        missingCredentials: false,
      };
    }

    const detail: string[] = [];
    if (!status.ping_ok) {
      detail.push(status.ping_error?.trim() || "Ping check failed.");
    }
    if (!status.ssh_ok) {
      detail.push(status.ssh_error?.trim() || "SSH check failed.");
    }

    return {
      tone: "orange",
      label: !status.ping_ok ? "Ping failed" : "Connection failed",
      tooltip: detail.join(" ") || "Connection test failed.",
      missingCredentials: false,
    };
  };

  const getVisualState = (
    validation: ValidationState,
    indicator: StatusIndicator
  ) => {
    if (validation.credentialsMissing || hasFormIssues(validation)) {
      return {
        cardClass: styles.cardStateDanger,
        rowClass: styles.rowStateDanger,
      };
    }
    if (indicator.tone === "green") {
      return {
        cardClass: styles.cardStateSuccess,
        rowClass: styles.rowStateSuccess,
      };
    }
    return {
      cardClass: styles.cardStateWarning,
      rowClass: styles.rowStateWarning,
    };
  };

  const getTintStyle = (
    colorValue: string,
    tintable: boolean
  ): CSSProperties | undefined => {
    if (!tintable) return undefined;
    const background = hexToRgba(colorValue, 0.16);
    const border = hexToRgba(colorValue, 0.58);
    const status = hexToRgba(colorValue, 0.22);
    if (!background && !border) return undefined;
    return {
      ...(background
        ? { "--device-row-bg": background, "--device-card-bg": background }
        : {}),
      ...(border
        ? {
            "--device-row-border": border,
            "--device-card-border": border,
          }
        : {}),
      ...(status ? { "--device-status-bg": status } : {}),
    } as CSSProperties;
  };

  const syncAliasDraftState = (fromAlias: string, toAlias: string) => {
    setAliasDrafts((prev) => {
      const next = { ...prev };
      delete next[fromAlias];
      next[toAlias] = toAlias;
      return next;
    });
    setPasswordConfirmDrafts((prev) => {
      const next = { ...prev };
      const previousConfirm = next[fromAlias] ?? "";
      delete next[fromAlias];
      next[toAlias] = previousConfirm;
      return next;
    });
    setDetailAlias((prev) => (prev === fromAlias ? toAlias : prev));
    setSelectedAliases((prev) => {
      if (!prev.has(fromAlias)) return prev;
      const next = new Set(prev);
      next.delete(fromAlias);
      next.add(toAlias);
      return next;
    });
    setActionMenu((prev) => {
      if (!prev || prev.alias !== fromAlias) return prev;
      return { ...prev, alias: toAlias };
    });
    setStatusPopover((prev) => {
      if (!prev || prev.alias !== fromAlias) return prev;
      return { ...prev, alias: toAlias };
    });
  };

  const tryRenameAlias = (server: ServerState, rawValue: string) => {
    const trimmed = String(rawValue ?? "").trim();
    const error = getAliasErrorFor(trimmed, server.alias);
    if (error || trimmed === server.alias) return false;
    onAliasChange(server.alias, trimmed);
    syncAliasDraftState(server.alias, trimmed);
    return true;
  };

  const commitAlias = (server: ServerState) => {
    const draft = String(aliasDrafts[server.alias] ?? server.alias);
    if (tryRenameAlias(server, draft)) return;
    const trimmed = draft.trim();
    setAliasDrafts((prev) => ({
      ...prev,
      [server.alias]: trimmed || server.alias,
    }));
  };

  const onAliasTyping = (server: ServerState, value: string) => {
    updateAliasDraft(server.alias, value);
  };

  const updateAuthMethod = (server: ServerState, method: "password" | "private_key") => {
    setPasswordConfirmDrafts((prev) => ({
      ...prev,
      [server.alias]: "",
    }));
    if (method === "password") {
      onPatchServer(server.alias, {
        authMethod: method,
        privateKey: "",
        publicKey: "",
      });
      return;
    }
    onPatchServer(server.alias, {
      authMethod: method,
      password: "",
    });
  };

  const statusDotClass = (tone: StatusIndicator["tone"]) => {
    if (tone === "green") return styles.statusDotGreen;
    if (tone === "yellow") return styles.statusDotYellow;
    return styles.statusDotOrange;
  };

  const toggleAliasSelection = (alias: string, checked: boolean) => {
    setSelectedAliases((prev) => {
      const next = new Set(prev);
      if (checked) {
        next.add(alias);
      } else {
        next.delete(alias);
      }
      return next;
    });
  };

  const toggleSelectAllVisible = (checked: boolean) => {
    setSelectedAliases((prev) => {
      const next = new Set(prev);
      if (checked) {
        visibleAliases.forEach((alias) => next.add(alias));
      } else {
        visibleAliases.forEach((alias) => next.delete(alias));
      }
      return next;
    });
  };

  const openDetailModal = (alias: string) => {
    onOpenDetail(alias);
    setDetailAlias(alias);
    setActionMenu(null);
    setBulkMenu(null);
  };

  const openActionMenuFor = (alias: string, event: ReactMouseEvent<HTMLButtonElement>) => {
    const rect = event.currentTarget.getBoundingClientRect();
    const width = 220;
    setActionMenu({
      alias,
      top: rect.bottom + 8,
      left: Math.max(12, rect.right - width),
    });
    setBulkMenu(null);
  };

  const openBulkMenu = (event: ReactMouseEvent<HTMLButtonElement>) => {
    const rect = event.currentTarget.getBoundingClientRect();
    const width = 230;
    setBulkMenu({
      top: rect.bottom + 8,
      left: Math.max(12, rect.right - width),
    });
    setActionMenu(null);
  };

  const runBulkAction = (mode: "delete" | "purge") => {
    const aliases = Array.from(selectedAliases);
    if (aliases.length === 0) return;
    if (mode === "purge") {
      onRequestPurge(aliases);
    } else {
      onRequestDelete(aliases);
    }
    setSelectedAliases(new Set());
    setBulkMenu(null);
  };

  const openStatusPopoverFor = (
    alias: string,
    indicator: StatusIndicator,
    event: ReactMouseEvent<HTMLElement> | ReactFocusEvent<HTMLElement>
  ) => {
    const rect = event.currentTarget.getBoundingClientRect();
    setStatusPopover({
      alias,
      top: rect.bottom + 10,
      left: rect.left + rect.width / 2,
      label: indicator.label,
      tooltip: indicator.tooltip,
    });
  };

  const closeStatusPopoverFor = (alias: string) => {
    setStatusPopover((prev) => {
      if (!prev || prev.alias !== alias) return prev;
      return null;
    });
  };

  const runDetailKeygen = async (server: ServerState) => {
    setDetailActionError(null);
    setDetailActionStatus(null);
    setDetailActionBusy("keygen");
    try {
      await onGenerateKey(server.alias);
      setDetailActionStatus("SSH keypair generated.");
    } catch (err: any) {
      setDetailActionError(err?.message ?? "SSH key generation failed.");
    } finally {
      setDetailActionBusy(null);
    }
  };

  const emitCredentialBlur = (
    server: ServerState,
    field:
      | "host"
      | "port"
      | "user"
      | "password"
      | "passwordConfirm"
      | "privateKey"
      | "keyPassphrase"
      | "primaryDomain",
    passwordConfirm?: string
  ) => {
    setDetailActionError(null);
    void Promise.resolve(
      onCredentialFieldBlur({
        server,
        field,
        passwordConfirm,
      })
    ).catch((err: any) => {
      setDetailActionError(err?.message ?? "Automatic credential sync failed.");
    });
  };

  const onPortFieldBlur = (server: ServerState) => {
    const normalizedPort = normalizePortValue(server.port) || "22";
    ensurePortDefault(server.alias, server.port);
    emitCredentialBlur({ ...server, port: normalizedPort }, "port");
  };

  const setKeyInputMode = (alias: string, mode: "import" | "generate") => {
    setKeyInputModeByAlias((prev) => ({ ...prev, [alias]: mode }));
  };

  const handlePrivateKeyUpload = (
    server: ServerState,
    event: ReactChangeEvent<HTMLInputElement>
  ) => {
    const file = event.target.files?.[0];
    event.target.value = "";
    if (!file) return;
    const reader = new FileReader();
    reader.onload = () => {
      const text = String(reader.result || "").replace(/\r\n/g, "\n");
      onPatchServer(server.alias, { privateKey: text });
      emitCredentialBlur({ ...server, privateKey: text }, "privateKey");
      setKeyInputMode(server.alias, "import");
    };
    reader.onerror = () => {
      setDetailActionError("Failed to read private key file.");
    };
    reader.readAsText(file);
  };

  const renderStatusCell = (server: ServerState, indicator: StatusIndicator) => (
    <div className={styles.listStatusCell}>
      <button
        type="button"
        className={styles.statusDotButton}
        onMouseEnter={(event) => openStatusPopoverFor(server.alias, indicator, event)}
        onMouseLeave={() => closeStatusPopoverFor(server.alias)}
        onFocus={(event) => openStatusPopoverFor(server.alias, indicator, event)}
        onBlur={() => closeStatusPopoverFor(server.alias)}
        aria-label={`Status: ${indicator.label}`}
      >
        <span
          className={`${styles.statusDot} ${statusDotClass(indicator.tone)}`}
          aria-hidden="true"
        />
      </button>
    </div>
  );

  const renderActionCell = (server: ServerState) => (
    <div className={styles.rowActions}>
      <button
        type="button"
        onClick={() => openDetailModal(server.alias)}
        className={styles.detailInfoButton}
      >
        <i className="fa-solid fa-circle-info" aria-hidden="true" />
        <span>Detail</span>
      </button>
      <button
        type="button"
        onClick={(event) => {
          if (actionMenu?.alias === server.alias) {
            setActionMenu(null);
          } else {
            openActionMenuFor(server.alias, event);
          }
        }}
        className={styles.actionMenuTrigger}
      >
        <span>Action</span>
        <i className="fa-solid fa-chevron-down" aria-hidden="true" />
      </button>
    </div>
  );

  const gridStyle = {
    "--server-grid-columns": computedColumns,
  } as CSSProperties;

  const actionMenuOverlay =
    actionMenu && typeof document !== "undefined"
      ? createPortal(
          <div
            className={styles.actionOverlayMenu}
            style={{ top: actionMenu.top, left: actionMenu.left }}
            role="menu"
          >
            <button
              type="button"
              className={styles.actionDropdownItem}
              onClick={() => {
                onRequestDelete([actionMenu.alias]);
                setActionMenu(null);
              }}
            >
              <i className="fa-solid fa-trash" aria-hidden="true" />
              <span>Delete</span>
            </button>
            <button
              type="button"
              className={`${styles.actionDropdownItem} ${styles.actionDropdownDanger}`}
              onClick={() => {
                onRequestPurge([actionMenu.alias]);
                setActionMenu(null);
              }}
            >
              <i className="fa-solid fa-broom" aria-hidden="true" />
              <span>Purge</span>
            </button>
          </div>,
          document.body
        )
      : null;

  const bulkMenuOverlay =
    bulkMenu && typeof document !== "undefined"
      ? createPortal(
          <div
            className={styles.bulkOverlayMenu}
            style={{ top: bulkMenu.top, left: bulkMenu.left }}
            role="menu"
          >
            <button
              type="button"
              className={styles.actionDropdownItem}
              disabled={selectedCount === 0}
              onClick={() => runBulkAction("delete")}
            >
              <i className="fa-solid fa-trash" aria-hidden="true" />
              <span>Delete selected</span>
            </button>
            <button
              type="button"
              className={`${styles.actionDropdownItem} ${styles.actionDropdownDanger}`}
              disabled={selectedCount === 0}
              onClick={() => runBulkAction("purge")}
            >
              <i className="fa-solid fa-broom" aria-hidden="true" />
              <span>Purge selected</span>
            </button>
          </div>,
          document.body
        )
      : null;

  const statusPopoverOverlay =
    statusPopover && typeof document !== "undefined"
      ? createPortal(
          <div
            className={styles.statusPopoverOverlay}
            style={{ top: statusPopover.top, left: statusPopover.left }}
            role="tooltip"
          >
            <strong>{statusPopover.label}</strong>
            <span>{statusPopover.tooltip}</span>
          </div>,
          document.body
        )
      : null;

  const detailValidation = detailServer
    ? getValidationState(detailServer, { enforcePasswordConfirm: true })
    : null;
  const detailIndicator =
    detailServer && detailValidation
      ? getStatusIndicator(detailValidation, testResults[detailServer.alias])
      : null;
  const detailConnectionResult = detailServer
    ? testResults[detailServer.alias]
    : undefined;

  const detailModal =
    !isCustomerMode && detailServer && typeof document !== "undefined"
      ? createPortal(
          <div
            className={`${styles.modalOverlay} ${styles.serverModalOverlay}`}
            onClick={() => setDetailAlias(null)}
          >
            <div
              className={`${styles.modalCard} ${styles.serverModalCard} ${styles.detailModalCard}`}
              onClick={(event) => event.stopPropagation()}
            >
              <div className={styles.modalHeader}>
                <div>
                  <h3 className={styles.modalTitle}>
                    <i className="fa-solid fa-circle-info" aria-hidden="true" />{" "}
                    Device detail · {detailServer.alias}
                  </h3>
                  <p className={`text-body-secondary ${styles.modalHint}`}>
                    Edit identity, connectivity and credentials in one place.
                  </p>
                </div>
                <button
                  type="button"
                  className={styles.closeButton}
                  onClick={() => setDetailAlias(null)}
                >
                  Close
                </button>
              </div>

              <div className={styles.fieldGrid}>
                <div className={styles.fieldWrap}>
                  <label className={`text-body-tertiary ${styles.fieldLabel}`}>Identity</label>
                  <div className={styles.aliasInputRow}>
                    <input
                      type="color"
                      value={normalizeDeviceColor(detailServer.color) || "#89CFF0"}
                      onChange={(event) =>
                        onPatchServer(detailServer.alias, { color: event.target.value })
                      }
                      className={styles.colorPickerInput}
                      aria-label="Device color"
                    />
                    <div className={styles.emojiPickerShell}>
                      <button
                        type="button"
                        className={`${styles.emojiPickerTrigger} ${
                          openEmojiAlias === detailServer.alias
                            ? styles.emojiPickerTriggerOpen
                            : ""
                        }`}
                        onClick={() =>
                          setOpenEmojiAlias((prev) =>
                            prev === detailServer.alias ? null : detailServer.alias
                          )
                        }
                        title="Choose device emoji"
                        aria-label="Choose device emoji"
                      >
                        <span className={styles.aliasEmojiPreview} aria-hidden="true">
                          {detailServer.logoEmoji || "💻"}
                        </span>
                      </button>
                      {openEmojiAlias === detailServer.alias ? (
                        <div className={styles.emojiPickerMenu}>
                          <Picker
                            data={data}
                            theme="dark"
                            previewPosition="none"
                            navPosition="bottom"
                            searchPosition="sticky"
                            perLine={8}
                            maxFrequentRows={2}
                            onEmojiSelect={(emoji: any) => {
                              const nextEmoji = String(emoji?.native || "").trim();
                              if (!nextEmoji) return;
                              onPatchServer(detailServer.alias, { logoEmoji: nextEmoji });
                              setOpenEmojiAlias(null);
                            }}
                          />
                        </div>
                      ) : null}
                    </div>
                    <input
                      value={aliasDrafts[detailServer.alias] ?? detailServer.alias}
                      onChange={(event) =>
                        onAliasTyping(detailServer, event.target.value)
                      }
                      onBlur={() => commitAlias(detailServer)}
                      onKeyDown={(event) => {
                        if (event.key === "Enter") {
                          event.preventDefault();
                          commitAlias(detailServer);
                        }
                      }}
                      placeholder="device"
                      className={`${styles.fieldInput} ${styles.identityAliasInput} ${
                        detailValidation?.aliasError ? styles.inputError : ""
                      }`}
                    />
                  </div>
                  {detailValidation?.aliasError ? (
                    <p className="text-danger">{detailValidation.aliasError}</p>
                  ) : null}
                </div>

                <div className={styles.fieldWrap}>
                  <label className={`text-body-tertiary ${styles.fieldLabel}`}>Description</label>
                  <input
                    value={detailServer.description}
                    onChange={(event) =>
                      onPatchServer(detailServer.alias, {
                        description: event.target.value,
                      })
                    }
                    placeholder="Optional description"
                    className={styles.fieldInput}
                  />
                </div>

                <div className={styles.fieldWrap}>
                  <label className={`text-body-tertiary ${styles.fieldLabel}`}>
                    Primary domain
                  </label>
                  <input
                    value={detailServer.primaryDomain || ""}
                    onChange={(event) =>
                      onPatchServer(detailServer.alias, {
                        primaryDomain: event.target.value,
                      })
                    }
                    onBlur={() => emitCredentialBlur(detailServer, "primaryDomain")}
                    placeholder="example.org"
                    className={styles.fieldInput}
                  />
                </div>

                <div className={styles.fieldWrap}>
                  <label className={`text-body-tertiary ${styles.fieldLabel}`}>Host</label>
                  <input
                    value={detailServer.host}
                    onChange={(event) =>
                      onPatchServer(detailServer.alias, { host: event.target.value })
                    }
                    onBlur={() => emitCredentialBlur(detailServer, "host")}
                    placeholder="example.com"
                    className={`${styles.fieldInput} ${
                      detailValidation?.hostMissing ? styles.inputError : ""
                    }`}
                  />
                  {detailValidation?.hostMissing ? (
                    <p className="text-danger">Host is required.</p>
                  ) : null}
                </div>

                <div className={styles.fieldWrap}>
                  <label className={`text-body-tertiary ${styles.fieldLabel}`}>Port</label>
                  <input
                    type="number"
                    value={detailServer.port}
                    onChange={(event) =>
                      patchPort(detailServer.alias, event.target.value)
                    }
                    onBlur={() => onPortFieldBlur(detailServer)}
                    placeholder="22"
                    min={1}
                    max={65535}
                    step={1}
                    inputMode="numeric"
                    className={`${styles.fieldInput} ${
                      detailValidation?.portError ? styles.inputError : ""
                    }`}
                  />
                  {detailValidation?.portError ? (
                    <p className="text-danger">{detailValidation.portError}</p>
                  ) : null}
                </div>

                <div className={styles.fieldWrap}>
                  <label className={`text-body-tertiary ${styles.fieldLabel}`}>User</label>
                  <input
                    value={detailServer.user}
                    onChange={(event) =>
                      onPatchServer(detailServer.alias, { user: event.target.value })
                    }
                    onBlur={() => emitCredentialBlur(detailServer, "user")}
                    placeholder="root"
                    className={`${styles.fieldInput} ${
                      detailValidation?.userMissing ? styles.inputError : ""
                    }`}
                  />
                  {detailValidation?.userMissing ? (
                    <p className="text-danger">User is required.</p>
                  ) : null}
                </div>

                <div className={styles.fieldWrap}>
                  <label className={`text-body-tertiary ${styles.fieldLabel}`}>
                    Credential type
                  </label>
                  <div className={styles.segmentedButtons}>
                    <button
                      type="button"
                      onClick={() => updateAuthMethod(detailServer, "password")}
                      className={`${styles.segmentedButton} ${
                        detailServer.authMethod === "password"
                          ? styles.segmentedButtonActive
                          : ""
                      }`}
                    >
                      Password
                    </button>
                    <button
                      type="button"
                      onClick={() => updateAuthMethod(detailServer, "private_key")}
                      className={`${styles.segmentedButton} ${
                        detailServer.authMethod === "private_key"
                          ? styles.segmentedButtonActive
                          : ""
                      }`}
                    >
                      SSH key
                    </button>
                  </div>
                </div>

                {detailServer.authMethod === "password" ? (
                  <div className={styles.fieldWrap}>
                    <label className={`text-body-tertiary ${styles.fieldLabel}`}>
                      Password
                    </label>
                    <input
                      type="password"
                      value={detailServer.password}
                      onChange={(event) =>
                        onPatchServer(detailServer.alias, {
                          password: event.target.value,
                        })
                      }
                      onBlur={() =>
                        emitCredentialBlur(
                          detailServer,
                          "password",
                          passwordConfirmDrafts[detailServer.alias] ?? ""
                        )
                      }
                      placeholder="Enter password"
                      autoComplete="off"
                      className={`${styles.fieldInput} ${
                        detailValidation?.credentialsMissing ? styles.inputError : ""
                      }`}
                    />
                    <input
                      type="password"
                      value={passwordConfirmDrafts[detailServer.alias] ?? ""}
                      onChange={(event) =>
                        setPasswordConfirmDrafts((prev) => ({
                          ...prev,
                          [detailServer.alias]: event.target.value,
                        }))
                      }
                      onBlur={(event) =>
                        emitCredentialBlur(
                          detailServer,
                          "passwordConfirm",
                          event.currentTarget.value
                        )
                      }
                      placeholder="Confirm password"
                      autoComplete="off"
                      className={`${styles.fieldInput} ${
                        detailValidation?.passwordConfirmError ? styles.inputError : ""
                      }`}
                    />
                    {detailValidation?.passwordConfirmError ? (
                      <p className="text-danger">{detailValidation.passwordConfirmError}</p>
                    ) : null}
                  </div>
                ) : (
                  <>
                    <div className={styles.fieldWrap}>
                      <label className={`text-body-tertiary ${styles.fieldLabel}`}>
                        Algorithm
                      </label>
                      <select
                        value={detailServer.keyAlgorithm || "ed25519"}
                        onChange={(event) =>
                          onPatchServer(detailServer.alias, {
                            keyAlgorithm: event.target.value,
                          })
                        }
                        className={styles.selectControl}
                      >
                        <option value="ed25519">ed25519 (recommended)</option>
                        <option value="rsa">rsa 4096</option>
                        <option value="ecdsa">ecdsa</option>
                      </select>
                      {!String(detailServer.privateKey || "").trim() ? (
                        <div className={styles.segmentedButtons}>
                          <button
                            type="button"
                            onClick={() => setKeyInputMode(detailServer.alias, "import")}
                            className={`${styles.segmentedButton} ${
                              (keyInputModeByAlias[detailServer.alias] ?? "import") ===
                              "import"
                                ? styles.segmentedButtonActive
                                : ""
                            }`}
                          >
                            Import
                          </button>
                          <button
                            type="button"
                            onClick={() => setKeyInputMode(detailServer.alias, "generate")}
                            className={`${styles.segmentedButton} ${
                              (keyInputModeByAlias[detailServer.alias] ?? "import") ===
                              "generate"
                                ? styles.segmentedButtonActive
                                : ""
                            }`}
                          >
                            Generate
                          </button>
                        </div>
                      ) : null}
                      {!String(detailServer.privateKey || "").trim() &&
                      (keyInputModeByAlias[detailServer.alias] ?? "import") ===
                        "generate" ? (
                        <button
                          type="button"
                          onClick={() => {
                            void runDetailKeygen(detailServer);
                          }}
                          disabled={detailActionBusy === "keygen" || !workspaceId}
                          className={styles.actionButtonSecondary}
                        >
                          <i className="fa-solid fa-key" aria-hidden="true" />
                          <span>
                            {detailActionBusy === "keygen"
                              ? "Generating..."
                              : "Generate key"}
                          </span>
                        </button>
                      ) : null}
                      {!String(detailServer.privateKey || "").trim() &&
                      (keyInputModeByAlias[detailServer.alias] ?? "import") ===
                        "generate" ? (
                        <p className={`text-body-secondary ${styles.statusHint}`}>
                          Generates a new keypair with random passphrase protection.
                        </p>
                      ) : null}
                    </div>
                    {(String(detailServer.privateKey || "").trim() ||
                      (keyInputModeByAlias[detailServer.alias] ?? "import") ===
                        "import") && (
                      <div className={styles.fieldWrap}>
                        <label className={`text-body-tertiary ${styles.fieldLabel}`}>
                          Private key
                        </label>
                        <textarea
                          value={detailServer.privateKey}
                          onChange={(event) =>
                            onPatchServer(detailServer.alias, {
                              privateKey: event.target.value,
                            })
                          }
                          onBlur={() => emitCredentialBlur(detailServer, "privateKey")}
                          placeholder="Paste SSH private key"
                          rows={6}
                          autoComplete="off"
                          spellCheck={false}
                          className={`${styles.textAreaControl} ${
                            detailValidation?.credentialsMissing ? styles.inputError : ""
                          }`}
                        />
                        <label className={styles.uploadKeyButton}>
                          <i className="fa-solid fa-upload" aria-hidden="true" />
                          <span>Upload private key</span>
                          <input
                            type="file"
                            accept=".pem,.key,.txt,text/plain"
                            onChange={(event) => handlePrivateKeyUpload(detailServer, event)}
                            className={styles.fileInputHidden}
                          />
                        </label>
                        {detailValidation?.credentialsMissing ? (
                          <p className="text-danger">Private key is required.</p>
                        ) : null}
                      </div>
                    )}
                    <div className={styles.fieldWrap}>
                      <label className={`text-body-tertiary ${styles.fieldLabel}`}>
                        Key passphrase (optional)
                      </label>
                      <input
                        type="password"
                        value={detailServer.keyPassphrase}
                        onChange={(event) =>
                          onPatchServer(detailServer.alias, {
                            keyPassphrase: event.target.value,
                          })
                        }
                        onBlur={() => emitCredentialBlur(detailServer, "keyPassphrase")}
                        placeholder="Optional key passphrase"
                        autoComplete="off"
                        className={styles.fieldInput}
                      />
                    </div>
                    <div className={styles.fieldWrap}>
                      <label className={`text-body-tertiary ${styles.fieldLabel}`}>
                        Public key
                      </label>
                      <textarea
                        readOnly
                        value={detailServer.publicKey || ""}
                        placeholder="Public key will appear here"
                        rows={3}
                        className={`${styles.textAreaControl} ${styles.inputDisabledBg}`}
                      />
                    </div>
                  </>
                )}
              </div>

              <div className={styles.detailStatusBlock}>
                <div
                  className={styles.statusHeadline}
                  onMouseEnter={(event) => {
                    if (!detailIndicator) return;
                    openStatusPopoverFor(detailServer.alias, detailIndicator, event);
                  }}
                  onMouseLeave={() => closeStatusPopoverFor(detailServer.alias)}
                >
                  <span
                    className={`${styles.statusDot} ${statusDotClass(
                      detailIndicator?.tone ?? "orange"
                    )}`}
                    aria-hidden="true"
                  />
                  <span>{detailIndicator?.label ?? "Unknown status"}</span>
                </div>
                <div className={styles.statusSummary}>
                  {detailIndicator?.tooltip ?? "No status available."}
                </div>
                {detailConnectionResult ? (
                  <div className={styles.detailResultGrid}>
                    <span>
                      Ping:{" "}
                      {detailConnectionResult.ping_ok ? "ok" : detailConnectionResult.ping_error || "failed"}
                    </span>
                    <span>
                      SSH:{" "}
                      {detailConnectionResult.ssh_ok ? "ok" : detailConnectionResult.ssh_error || "failed"}
                    </span>
                  </div>
                ) : null}
                {detailActionError ? (
                  <p className="text-danger">{detailActionError}</p>
                ) : null}
                {detailActionStatus ? (
                  <p className="text-success">{detailActionStatus}</p>
                ) : null}
              </div>

              <div className={styles.detailModalFooter}>
                <button
                  type="button"
                  onClick={() => {
                    onRequestDelete([detailServer.alias]);
                    setDetailAlias(null);
                  }}
                  className={styles.actionButtonDangerSoft}
                >
                  <i className="fa-solid fa-trash" aria-hidden="true" />
                  <span>Delete</span>
                </button>
                <button
                  type="button"
                  onClick={() => {
                    onRequestPurge([detailServer.alias]);
                    setDetailAlias(null);
                  }}
                  className={styles.actionButtonDanger}
                >
                  <i className="fa-solid fa-broom" aria-hidden="true" />
                  <span>Purge</span>
                </button>
              </div>
            </div>
          </div>,
          document.body
        )
      : null;

  if (viewMode === "list") {
    if (isCustomerMode) {
      return (
        <div className={styles.listRoot}>
          <div className={styles.listTableWrap}>
            <table className={styles.listTable}>
              <thead>
                <tr>
                  <th>Alias</th>
                  <th>Server type</th>
                  <th>Storage (GB)</th>
                  <th>Location</th>
                  <th className={styles.colCompare}>Compare</th>
                </tr>
              </thead>
              <tbody>
                {paginatedServers.map((server) => {
                  const validation = getValidationState(server);
                  const aliasValue = aliasDrafts[server.alias] ?? server.alias;
                  return (
                    <tr key={server.alias} className={styles.listTableRow}>
                      <td>
                        <div className={styles.fieldColumn}>
                          <div className={styles.aliasInputRow}>
                            <input
                              type="color"
                              value={normalizeDeviceColor(server.color) || "#89CFF0"}
                              onChange={(event) =>
                                onPatchServer(server.alias, { color: event.target.value })
                              }
                              className={styles.colorPickerInput}
                              aria-label="Device color"
                            />
                            <div className={styles.emojiPickerShell}>
                              <button
                                type="button"
                                className={`${styles.emojiPickerTrigger} ${
                                  openEmojiAlias === server.alias
                                    ? styles.emojiPickerTriggerOpen
                                    : ""
                                }`}
                                onClick={() =>
                                  setOpenEmojiAlias((prev) =>
                                    prev === server.alias ? null : server.alias
                                  )
                                }
                                title="Choose device emoji"
                                aria-label="Choose device emoji"
                              >
                                <span className={styles.aliasEmojiPreview} aria-hidden="true">
                                  {server.logoEmoji || "💻"}
                                </span>
                              </button>
                              {openEmojiAlias === server.alias ? (
                                <div className={styles.emojiPickerMenu}>
                                  <Picker
                                    data={data}
                                    theme="dark"
                                    previewPosition="none"
                                    navPosition="bottom"
                                    searchPosition="sticky"
                                    perLine={8}
                                    maxFrequentRows={2}
                                    onEmojiSelect={(emoji: any) => {
                                      const nextEmoji = String(emoji?.native || "").trim();
                                      if (!nextEmoji) return;
                                      onPatchServer(server.alias, { logoEmoji: nextEmoji });
                                      setOpenEmojiAlias(null);
                                    }}
                                  />
                                </div>
                              ) : null}
                            </div>
                            <input
                              value={aliasValue}
                              onChange={(event) =>
                                onAliasTyping(server, event.target.value)
                              }
                              onBlur={() => commitAlias(server)}
                              onKeyDown={(event) => {
                                if (event.key === "Enter") {
                                  event.preventDefault();
                                  commitAlias(server);
                                }
                              }}
                              placeholder="device"
                              className={`${styles.inputSmall} ${
                                validation.aliasError ? styles.inputError : ""
                              }`}
                            />
                          </div>
                          {validation.aliasError ? (
                            <span className={`text-danger ${styles.aliasErrorText}`}>
                              {validation.aliasError}
                            </span>
                          ) : null}
                        </div>
                      </td>
                      <td>
                        <select
                          value={server.requirementServerType || "vps"}
                          onChange={(event) =>
                            onPatchServer(server.alias, {
                              requirementServerType: event.target.value,
                            })
                          }
                          className={styles.selectControl}
                        >
                          <option value="vps">VPS</option>
                          <option value="dedicated">Dedicated</option>
                          <option value="managed">Managed</option>
                        </select>
                      </td>
                      <td>
                        <input
                          type="number"
                          value={server.requirementStorageGb || "200"}
                          onChange={(event) =>
                            onPatchServer(server.alias, {
                              requirementStorageGb: event.target.value,
                            })
                          }
                          min={20}
                          step={1}
                          inputMode="numeric"
                          placeholder="200"
                          className={styles.inputSmall}
                        />
                      </td>
                      <td>
                        <CountryFlagSelectPlugin
                          value={server.requirementLocation || "Germany"}
                          onChange={(nextLocation) =>
                            onPatchServer(server.alias, {
                              requirementLocation: nextLocation,
                            })
                          }
                          className={styles.selectControl}
                          aria-label={`Location requirement for ${server.alias}`}
                        />
                      </td>
                      <td className={styles.listCompareCell}>
                        {onOpenDetailSearch ? (
                          <button
                            type="button"
                            onClick={() => onOpenDetailSearch(server.alias)}
                            className={styles.listCompareButton}
                          >
                            <i className="fa-solid fa-scale-balanced" aria-hidden="true" />
                            <span>Compare</span>
                          </button>
                        ) : (
                          <span className="text-body-secondary">—</span>
                        )}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </div>
      );
    }

    return (
      <>
        <div className={styles.listRoot}>
          <div className={styles.listToolbar}>
            <button
              type="button"
              className={styles.bulkActionTrigger}
              onClick={(event) => {
                if (bulkMenu) {
                  setBulkMenu(null);
                } else {
                  openBulkMenu(event);
                }
              }}
            >
              Selected ({selectedCount})
              <i className="fa-solid fa-chevron-down" aria-hidden="true" />
            </button>
            <span className={`text-body-secondary ${styles.listToolbarMeta}`}>
              {selectedCount} selected
            </span>
          </div>

          <div className={styles.listTableWrap}>
            <table className={styles.listTable}>
              <thead>
                <tr>
                  <th className={styles.colSelect}>
                    <input
                      type="checkbox"
                      checked={allVisibleSelected}
                      onChange={(event) =>
                        toggleSelectAllVisible(event.target.checked)
                      }
                      aria-label="Select all visible devices"
                    />
                  </th>
                  <th>Identity</th>
                  <th>Host</th>
                  <th>Port</th>
                  <th>User</th>
                  <th>Primary domain</th>
                  <th>Status</th>
                  <th>Action</th>
                </tr>
              </thead>
              <tbody>
                {paginatedServers.map((server) => {
                  const validation = getValidationState(server);
                  const indicator = getStatusIndicator(
                    validation,
                    testResults[server.alias]
                  );
                  const visual = getVisualState(validation, indicator);
                  const tintStyle = getTintStyle(
                    server.color,
                    visual.rowClass !== styles.rowStateDanger
                  );
                  const aliasValue = aliasDrafts[server.alias] ?? server.alias;

                  return (
                    <tr
                      key={server.alias}
                      className={`${styles.listTableRow} ${visual.rowClass} ${
                        tintStyle ? styles.rowTinted : ""
                      }`}
                      style={tintStyle}
                    >
                      <td className={styles.colSelect}>
                        <input
                          type="checkbox"
                          checked={selectedAliases.has(server.alias)}
                          onChange={(event) =>
                            toggleAliasSelection(server.alias, event.target.checked)
                          }
                          aria-label={`Select ${server.alias}`}
                        />
                      </td>
                      <td>
                        <div className={styles.fieldColumn}>
                          <div className={styles.aliasInputRow}>
                            <span className={styles.aliasEmojiPreview} aria-hidden="true">
                              {server.logoEmoji || "💻"}
                            </span>
                            <input
                              value={aliasValue}
                              onChange={(event) =>
                                onAliasTyping(server, event.target.value)
                              }
                              onBlur={() => commitAlias(server)}
                              onKeyDown={(event) => {
                                if (event.key === "Enter") {
                                  event.preventDefault();
                                  commitAlias(server);
                                }
                              }}
                              placeholder="device"
                              className={`${styles.inputSmall} ${
                                validation.aliasError ? styles.inputError : ""
                              }`}
                            />
                          </div>
                          {validation.aliasError ? (
                            <span className={`text-danger ${styles.aliasErrorText}`}>
                              {validation.aliasError}
                            </span>
                          ) : null}
                        </div>
                      </td>
                      <td>
                        <input
                          value={server.host}
                          onChange={(event) =>
                            onPatchServer(server.alias, { host: event.target.value })
                          }
                          onBlur={() => emitCredentialBlur(server, "host")}
                          placeholder="example.com"
                          className={`${styles.inputSmall} ${
                            validation.hostMissing ? styles.inputError : ""
                          }`}
                        />
                      </td>
                      <td>
                        <input
                          type="number"
                          value={server.port}
                          onChange={(event) => patchPort(server.alias, event.target.value)}
                          onBlur={() => onPortFieldBlur(server)}
                          placeholder="22"
                          min={1}
                          max={65535}
                          step={1}
                          inputMode="numeric"
                          className={`${styles.inputSmall} ${
                            validation.portError ? styles.inputError : ""
                          }`}
                        />
                      </td>
                      <td>
                        <input
                          value={server.user}
                          onChange={(event) =>
                            onPatchServer(server.alias, { user: event.target.value })
                          }
                          onBlur={() => emitCredentialBlur(server, "user")}
                          placeholder="root"
                          className={`${styles.inputSmall} ${
                            validation.userMissing ? styles.inputError : ""
                          }`}
                        />
                      </td>
                      <td>
                        <input
                          value={server.primaryDomain || ""}
                          onChange={(event) =>
                            onPatchServer(server.alias, { primaryDomain: event.target.value })
                          }
                          onBlur={() => emitCredentialBlur(server, "primaryDomain")}
                          placeholder="example.org"
                          className={styles.inputSmall}
                        />
                      </td>
                      <td>{renderStatusCell(server, indicator)}</td>
                      <td>{renderActionCell(server)}</td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </div>
        {actionMenuOverlay}
        {bulkMenuOverlay}
        {statusPopoverOverlay}
        {detailModal}
      </>
    );
  }

  if (isCustomerMode) {
    return (
      <div className={styles.cardGrid} style={gridStyle}>
        {paginatedServers.map((server) => {
          const dense = viewConfig.dense;
          const aliasValue = aliasDrafts[server.alias] ?? server.alias;
          const validation = getValidationState(server);
          const tintStyle = getTintStyle(server.color, true);
          const cardStyle = {
            "--server-card-padding": dense ? "12px" : "16px",
            "--server-card-gap": dense ? "10px" : "12px",
            "--server-fields-gap": dense ? "8px" : "10px",
            "--server-input-padding": dense ? "6px 8px" : "8px 10px",
            "--server-input-font": dense ? "12px" : "13px",
            ...(tintStyle ?? {}),
          } as CSSProperties;
          return (
            <div
              key={server.alias}
              className={`${styles.serverCard} ${styles.cardDefault} ${
                tintStyle ? styles.cardTinted : ""
              }`}
              style={cardStyle}
            >
              <div className={styles.fieldGrid}>
                <div className={styles.fieldWrap}>
                  <label className={`text-body-tertiary ${styles.fieldLabel}`}>Identity</label>
                  <div className={styles.aliasInputRow}>
                    <input
                      type="color"
                      value={normalizeDeviceColor(server.color) || "#89CFF0"}
                      onChange={(event) =>
                        onPatchServer(server.alias, { color: event.target.value })
                      }
                      className={styles.colorPickerInput}
                      aria-label="Device color"
                    />
                    <div className={styles.emojiPickerShell}>
                      <button
                        type="button"
                        className={`${styles.emojiPickerTrigger} ${
                          openEmojiAlias === server.alias
                            ? styles.emojiPickerTriggerOpen
                            : ""
                        }`}
                        onClick={() =>
                          setOpenEmojiAlias((prev) =>
                            prev === server.alias ? null : server.alias
                          )
                        }
                        title="Choose device emoji"
                        aria-label="Choose device emoji"
                      >
                        <span className={styles.aliasEmojiPreview} aria-hidden="true">
                          {server.logoEmoji || "💻"}
                        </span>
                      </button>
                      {openEmojiAlias === server.alias ? (
                        <div className={styles.emojiPickerMenu}>
                          <Picker
                            data={data}
                            theme="dark"
                            previewPosition="none"
                            navPosition="bottom"
                            searchPosition="sticky"
                            perLine={8}
                            maxFrequentRows={2}
                            onEmojiSelect={(emoji: any) => {
                              const nextEmoji = String(emoji?.native || "").trim();
                              if (!nextEmoji) return;
                              onPatchServer(server.alias, { logoEmoji: nextEmoji });
                              setOpenEmojiAlias(null);
                            }}
                          />
                        </div>
                      ) : null}
                    </div>
                    <input
                      value={aliasValue}
                      onChange={(event) => onAliasTyping(server, event.target.value)}
                      onBlur={() => commitAlias(server)}
                      onKeyDown={(event) => {
                        if (event.key === "Enter") {
                          event.preventDefault();
                          commitAlias(server);
                        }
                      }}
                      placeholder="device"
                      className={`${styles.fieldInput} ${styles.identityAliasInput} ${
                        validation.aliasError ? styles.inputError : ""
                      }`}
                    />
                  </div>
                  {validation.aliasError ? (
                    <p className="text-danger">{validation.aliasError}</p>
                  ) : null}
                </div>
                <div className={styles.fieldWrap}>
                  <label className={`text-body-tertiary ${styles.fieldLabel}`}>
                    Server type
                  </label>
                  <select
                    value={server.requirementServerType || "vps"}
                    onChange={(event) =>
                      onPatchServer(server.alias, {
                        requirementServerType: event.target.value,
                      })
                    }
                    className={styles.selectControl}
                  >
                    <option value="vps">VPS</option>
                    <option value="dedicated">Dedicated</option>
                    <option value="managed">Managed</option>
                  </select>
                </div>
                <div className={styles.fieldWrap}>
                  <label className={`text-body-tertiary ${styles.fieldLabel}`}>
                    Storage (GB)
                  </label>
                  <input
                    type="number"
                    value={server.requirementStorageGb || "200"}
                    onChange={(event) =>
                      onPatchServer(server.alias, {
                        requirementStorageGb: event.target.value,
                      })
                    }
                    min={20}
                    step={1}
                    inputMode="numeric"
                    placeholder="200"
                    className={styles.fieldInput}
                  />
                </div>
                <div className={styles.fieldWrap}>
                  <label className={`text-body-tertiary ${styles.fieldLabel}`}>
                    Location
                  </label>
                  <CountryFlagSelectPlugin
                    value={server.requirementLocation || "Germany"}
                    onChange={(nextLocation) =>
                      onPatchServer(server.alias, {
                        requirementLocation: nextLocation,
                      })
                    }
                    className={styles.selectControl}
                    aria-label={`Location requirement for ${server.alias}`}
                  />
                </div>
              </div>
              {onOpenDetailSearch ? (
                <div className={styles.cardFooter}>
                  <button
                    type="button"
                    onClick={() => onOpenDetailSearch(server.alias)}
                    className={`${styles.actionButtonSecondary} ${styles.customerCompareButton}`}
                  >
                    <i className="fa-solid fa-scale-balanced" aria-hidden="true" />
                    <span>Compare</span>
                  </button>
                </div>
              ) : null}
            </div>
          );
        })}
      </div>
    );
  }

  return (
    <>
      <div className={styles.cardGrid} style={gridStyle}>
        {paginatedServers.map((server) => {
          const dense = viewConfig.dense;
          const validation = getValidationState(server);
          const indicator = getStatusIndicator(validation, testResults[server.alias]);
          const visual = getVisualState(validation, indicator);
          const tintStyle = getTintStyle(
            server.color,
            visual.cardClass !== styles.cardStateDanger
          );

          const cardStyle = {
            "--server-card-padding": dense ? "12px" : "16px",
            "--server-card-gap": dense ? "10px" : "12px",
            "--server-fields-gap": dense ? "8px" : "10px",
            "--server-input-padding": dense ? "6px 8px" : "8px 10px",
            "--server-input-font": dense ? "12px" : "13px",
            ...(tintStyle ?? {}),
          } as CSSProperties;

          return (
            <div
              key={server.alias}
              className={`${styles.serverCard} ${styles.cardDefault} ${
                visual.cardClass
              } ${tintStyle ? styles.cardTinted : ""}`}
              style={cardStyle}
            >
              <div className={styles.fieldGrid}>
                <div className={styles.fieldWrap}>
                  <label className={`text-body-tertiary ${styles.fieldLabel}`}>Identity</label>
                  <div className={styles.aliasInputRow}>
                    <input
                      type="color"
                      value={normalizeDeviceColor(server.color) || "#89CFF0"}
                      onChange={(event) =>
                        onPatchServer(server.alias, { color: event.target.value })
                      }
                      className={styles.colorPickerInput}
                      aria-label="Device color"
                    />
                    <div className={styles.emojiPickerShell}>
                      <button
                        type="button"
                        className={`${styles.emojiPickerTrigger} ${
                          openEmojiAlias === server.alias
                            ? styles.emojiPickerTriggerOpen
                            : ""
                        }`}
                        onClick={() =>
                          setOpenEmojiAlias((prev) =>
                            prev === server.alias ? null : server.alias
                          )
                        }
                        title="Choose device emoji"
                        aria-label="Choose device emoji"
                      >
                        <span className={styles.aliasEmojiPreview} aria-hidden="true">
                          {server.logoEmoji || "💻"}
                        </span>
                      </button>
                      {openEmojiAlias === server.alias ? (
                        <div className={styles.emojiPickerMenu}>
                          <Picker
                            data={data}
                            theme="dark"
                            previewPosition="none"
                            navPosition="bottom"
                            searchPosition="sticky"
                            perLine={8}
                            maxFrequentRows={2}
                            onEmojiSelect={(emoji: any) => {
                              const nextEmoji = String(emoji?.native || "").trim();
                              if (!nextEmoji) return;
                              onPatchServer(server.alias, { logoEmoji: nextEmoji });
                              setOpenEmojiAlias(null);
                            }}
                          />
                        </div>
                      ) : null}
                    </div>
                    <input
                      value={aliasDrafts[server.alias] ?? server.alias}
                      onChange={(event) => onAliasTyping(server, event.target.value)}
                      onBlur={() => commitAlias(server)}
                      onKeyDown={(event) => {
                        if (event.key === "Enter") {
                          event.preventDefault();
                          commitAlias(server);
                        }
                      }}
                      placeholder="device"
                      className={`${styles.fieldInput} ${styles.identityAliasInput} ${
                        validation.aliasError ? styles.inputError : ""
                      }`}
                    />
                  </div>
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
                    onBlur={() => emitCredentialBlur(server, "host")}
                    placeholder="example.com"
                    className={`${styles.fieldInput} ${
                      validation.hostMissing ? styles.inputError : ""
                    }`}
                  />
                  {validation.hostMissing ? (
                    <p className="text-danger">Host is required.</p>
                  ) : null}
                </div>

                <div className={styles.fieldWrap}>
                  <label className={`text-body-tertiary ${styles.fieldLabel}`}>Port</label>
                  <input
                    type="number"
                    value={server.port}
                    onChange={(event) => patchPort(server.alias, event.target.value)}
                    onBlur={() => onPortFieldBlur(server)}
                    placeholder="22"
                    min={1}
                    max={65535}
                    step={1}
                    inputMode="numeric"
                    className={`${styles.fieldInput} ${
                      validation.portError ? styles.inputError : ""
                    }`}
                  />
                  {validation.portError ? (
                    <p className="text-danger">{validation.portError}</p>
                  ) : null}
                </div>

                <div className={styles.fieldWrap}>
                  <label className={`text-body-tertiary ${styles.fieldLabel}`}>User</label>
                  <input
                    value={server.user}
                    onChange={(event) =>
                      onPatchServer(server.alias, { user: event.target.value })
                    }
                    onBlur={() => emitCredentialBlur(server, "user")}
                    placeholder="root"
                    className={`${styles.fieldInput} ${
                      validation.userMissing ? styles.inputError : ""
                    }`}
                  />
                  {validation.userMissing ? (
                    <p className="text-danger">User is required.</p>
                  ) : null}
                </div>

                <div className={styles.fieldWrap}>
                  <label className={`text-body-tertiary ${styles.fieldLabel}`}>
                    Primary domain
                  </label>
                  <input
                    value={server.primaryDomain || ""}
                    onChange={(event) =>
                      onPatchServer(server.alias, { primaryDomain: event.target.value })
                    }
                    onBlur={() => emitCredentialBlur(server, "primaryDomain")}
                    placeholder="example.org"
                    className={styles.fieldInput}
                  />
                </div>
              </div>

              <div className={styles.statusCard}>
                <div className={styles.statusHeadline}>
                  <span
                    className={`${styles.statusDot} ${statusDotClass(indicator.tone)}`}
                    aria-hidden="true"
                  />
                  <span>{indicator.label}</span>
                </div>
                <div className={styles.statusSummary}>{indicator.tooltip}</div>
              </div>

              <div className={styles.cardFooter}>
                {renderActionCell(server)}
              </div>
            </div>
          );
        })}
      </div>
      {actionMenuOverlay}
      {bulkMenuOverlay}
      {statusPopoverOverlay}
      {detailModal}
    </>
  );
}
