"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { createPortal } from "react-dom";
import styles from "./DeploymentCredentialsForm.module.css";
import DeploymentCredentialsFormTemplate from "./deployment-credentials/DeploymentCredentialsFormTemplate";
import {
  HW_QUERY_KEYS,
  LANE_SERVER_VIEW_MODES,
  LIST_LIKE_SERVER_VIEW_MODES,
  ROW_FILTER_OPTIONS,
  SERVER_VIEW_MODE_SET,
  SINGLE_COLUMN_SERVER_VIEW_MODES,
} from "./deployment-credentials/DeploymentCredentialsForm.constants";
import type {
  CredentialBlurPayload,
  DeploymentCredentialsFormProps,
  PendingServerAction,
} from "./deployment-credentials/DeploymentCredentialsForm.types";
import { SERVER_VIEW_CONFIG } from "./deployment-credentials/types";
import type {
  ConnectionResult,
  ServerState,
  ServerViewMode,
} from "./deployment-credentials/types";
import { encodePath, sanitizeAliasFilename } from "./workspace-panel/utils";

export default function DeploymentCredentialsForm({
  baseUrl,
  workspaceId,
  servers,
  connectionResults,
  activeAlias,
  onActiveAliasChange,
  onUpdateServer,
  onConnectionResult,
  onRemoveServer,
  onCleanupServer,
  onAddServer,
  openCredentialsAlias = null,
  onOpenCredentialsAliasHandled,
  deviceMode,
  onDeviceModeChange,
  onOpenDetailSearch,
  primaryDomainOptions = [],
  onRequestAddPrimaryDomain,
  compact = false,
}: DeploymentCredentialsFormProps) {
  const Wrapper = compact ? "div" : "section";
  const wrapperClassName = compact
    ? styles.root
    : `${styles.root} ${styles.wrapper}`;

  const [requestedDetailAlias, setRequestedDetailAlias] = useState<string | null>(
    null
  );
  const [query, setQuery] = useState("");
  const [queryDraft, setQueryDraft] = useState("");
  const [viewMode, setViewMode] = useState<ServerViewMode>("list");
  const [rowsOverride, setRowsOverride] = useState<number | null>(null);
  const [page, setPage] = useState(1);
  const scrollRef = useRef<HTMLDivElement | null>(null);
  const controlsRef = useRef<HTMLDivElement | null>(null);
  const contentRef = useRef<HTMLDivElement | null>(null);
  const filtersButtonRef = useRef<HTMLButtonElement | null>(null);
  const filtersPopoverRef = useRef<HTMLDivElement | null>(null);
  const viewButtonRef = useRef<HTMLButtonElement | null>(null);
  const viewPopoverRef = useRef<HTMLDivElement | null>(null);
  const [gridSize, setGridSize] = useState({ width: 0, height: 0 });
  const [listAutoMetrics, setListAutoMetrics] = useState({
    wrapHeight: 0,
    headHeight: 0,
    rowHeight: 0,
  });
  const [cardAutoRowHeight, setCardAutoRowHeight] = useState(0);
  const [filtersOpen, setFiltersOpen] = useState(false);
  const [filtersPos, setFiltersPos] = useState({ top: 0, left: 0 });
  const [viewMenuOpen, setViewMenuOpen] = useState(false);

  const [pendingAction, setPendingAction] = useState<PendingServerAction>(null);
  const [actionBusy, setActionBusy] = useState(false);
  const [actionError, setActionError] = useState<string | null>(null);
  const uiQueryReadyRef = useRef(false);

  useEffect(() => {
    if (!openCredentialsAlias) return;
    if (!servers.some((server) => server.alias === openCredentialsAlias)) {
      onOpenCredentialsAliasHandled?.();
      return;
    }
    setQuery("");
    setQueryDraft("");
    setPage(1);
    setRequestedDetailAlias(openCredentialsAlias);
    if (activeAlias !== openCredentialsAlias) {
      onActiveAliasChange(openCredentialsAlias);
    }
    onOpenCredentialsAliasHandled?.();
  }, [
    activeAlias,
    onActiveAliasChange,
    onOpenCredentialsAliasHandled,
    openCredentialsAlias,
    servers,
  ]);

  useEffect(() => {
    if (typeof window === "undefined") return;
    const params = new URLSearchParams(window.location.search);
    const rawView = String(params.get(HW_QUERY_KEYS.view) || "")
      .trim()
      .toLowerCase();
    const normalizedView = rawView === "selection" ? "detail" : rawView;
    if (SERVER_VIEW_MODE_SET.has(normalizedView as ServerViewMode)) {
      setViewMode(normalizedView as ServerViewMode);
    }

    const rowsParam = String(params.get(HW_QUERY_KEYS.rows) || "")
      .trim()
      .toLowerCase();
    if (rowsParam) {
      if (rowsParam === "auto") {
        setRowsOverride(null);
      } else {
        const parsed = Number(rowsParam);
        if (Number.isFinite(parsed) && parsed > 0) {
          setRowsOverride(Math.floor(parsed));
        }
      }
    }
    uiQueryReadyRef.current = true;
  }, []);

  useEffect(() => {
    if (typeof window === "undefined") return;
    if (!uiQueryReadyRef.current) return;
    const url = new URL(window.location.href);
    url.searchParams.set(HW_QUERY_KEYS.view, viewMode);
    url.searchParams.set(HW_QUERY_KEYS.rows, rowsOverride ? String(rowsOverride) : "auto");
    window.history.replaceState({}, "", url.toString());
  }, [viewMode, rowsOverride]);

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

  const normalizedQuery = query.trim().toLowerCase();
  const filteredServers = useMemo(() => {
    if (!normalizedQuery) return servers;
    return servers.filter((server) => {
      const haystack = [
        server.alias,
        server.description,
        server.host,
        server.user,
        server.port,
        server.color,
        server.logoEmoji,
        server.authMethod,
      ]
        .map((value) => String(value || "").toLowerCase())
        .join(" ");
      return haystack.includes(normalizedQuery);
    });
  }, [servers, normalizedQuery]);

  const viewConfig = SERVER_VIEW_CONFIG[viewMode];
  const gridGap = 16;
  const isSingleColumnView = SINGLE_COLUMN_SERVER_VIEW_MODES.has(viewMode);
  const isListLikeView = LIST_LIKE_SERVER_VIEW_MODES.has(viewMode);
  const isLaneView = LANE_SERVER_VIEW_MODES.has(viewMode);
  const computedColumns =
    isSingleColumnView
      ? 1
      : Math.max(
          1,
          Math.floor((gridSize.width + gridGap) / (viewConfig.minWidth + gridGap))
        );
  const laneGap = 14;
  const contentHeightBuffer = viewMode === "mini" ? 24 : 8;
  const computedRows = useMemo(() => {
    if (isListLikeView) {
      const wrapHeight = listAutoMetrics.wrapHeight || Math.max(0, gridSize.height);
      const headHeight = listAutoMetrics.headHeight || 44;
      const rowHeight = listAutoMetrics.rowHeight || viewConfig.minHeight;
      const safetyPx = 2;
      const bodyHeight = Math.max(0, wrapHeight - headHeight);
      return Math.max(
        1,
        Math.floor(Math.max(0, bodyHeight - safetyPx) / Math.max(1, rowHeight))
      );
    }
    if (isLaneView) {
      const laneMinSize = viewMode === "row" ? 188 : 220;
      const rowAxisSize = viewMode === "column" ? gridSize.width : gridSize.height;
      return Math.max(
        1,
        Math.floor(
          (Math.max(0, rowAxisSize) + laneGap) / (laneMinSize + laneGap)
        )
      );
    }
    const measuredCardHeight = cardAutoRowHeight || viewConfig.minHeight;
    const safetyPx = 2;
    return Math.max(
      1,
      Math.floor(
        (Math.max(0, gridSize.height - contentHeightBuffer - safetyPx) + gridGap) /
          (measuredCardHeight + gridGap)
      )
    );
  }, [
    isListLikeView,
    isLaneView,
    listAutoMetrics.wrapHeight,
    listAutoMetrics.headHeight,
    listAutoMetrics.rowHeight,
    cardAutoRowHeight,
    viewMode,
    gridSize.width,
    gridSize.height,
    laneGap,
    viewConfig.minHeight,
    contentHeightBuffer,
  ]);
  const rows = Math.max(1, rowsOverride ?? computedRows);
  const laneCount = Math.max(1, rows);
  const laneGapTotal = Math.max(0, laneGap * (laneCount - 1));
  const rowLaneSize = Math.max(
    188,
    Math.floor(Math.max(0, gridSize.height - laneGapTotal) / laneCount)
  );
  const columnLaneSize = Math.max(
    220,
    Math.floor(Math.max(0, gridSize.width - laneGapTotal) / laneCount)
  );
  const laneSize = viewMode === "row" ? rowLaneSize : columnLaneSize;
  const pageSize = Math.max(1, computedColumns * rows);
  const rowOptions = useMemo(() => {
    const maxRows = Math.max(
      1,
      Math.ceil(filteredServers.length / Math.max(1, computedColumns))
    );
    const next = ROW_FILTER_OPTIONS.filter((value) => value <= maxRows);
    if (rowsOverride && !next.includes(rowsOverride)) {
      next.push(rowsOverride);
    }
    return next.sort((a, b) => a - b);
  }, [filteredServers.length, computedColumns, rowsOverride]);
  const pageCount = Math.max(1, Math.ceil(filteredServers.length / pageSize));
  const currentPage = Math.min(page, pageCount);
  const paginatedServers = useMemo(() => {
    const start = (currentPage - 1) * pageSize;
    return filteredServers.slice(start, start + pageSize);
  }, [filteredServers, currentPage, pageSize]);

  useEffect(() => {
    setPage(1);
  }, [query, viewMode, rowsOverride]);

  useEffect(() => {
    if (typeof window === "undefined") return;
    if (!isListLikeView) return;
    const container = contentRef.current;
    if (!container) return;

    const measure = () => {
      const wrap = container.querySelector<HTMLElement>("[data-server-list-wrap]");
      if (!wrap) return;
      const head = wrap.querySelector<HTMLElement>("thead");
      const rows = Array.from(wrap.querySelectorAll<HTMLElement>("tbody tr"));
      const rowHeight = rows.reduce(
        (max, row) => Math.max(max, row.getBoundingClientRect().height),
        0
      );
      const next = {
        wrapHeight: wrap.clientHeight || 0,
        headHeight: head ? head.getBoundingClientRect().height : 0,
        rowHeight,
      };
      setListAutoMetrics((prev) => {
        if (
          Math.abs(prev.wrapHeight - next.wrapHeight) < 1 &&
          Math.abs(prev.headHeight - next.headHeight) < 1 &&
          Math.abs(prev.rowHeight - next.rowHeight) < 1
        ) {
          return prev;
        }
        return next;
      });
    };

    measure();
    const raf = window.requestAnimationFrame(measure);
    let observer: ResizeObserver | null = null;
    if (typeof ResizeObserver !== "undefined") {
      observer = new ResizeObserver(() => measure());
      observer.observe(container);
      const wrap = container.querySelector<HTMLElement>("[data-server-list-wrap]");
      if (wrap) {
        observer.observe(wrap);
        const table = wrap.querySelector<HTMLElement>("table");
        const head = wrap.querySelector<HTMLElement>("thead");
        if (table) observer.observe(table);
        if (head) observer.observe(head);
      }
    } else {
      window.addEventListener("resize", measure);
    }
    return () => {
      window.cancelAnimationFrame(raf);
      observer?.disconnect();
      if (!observer) {
        window.removeEventListener("resize", measure);
      }
    };
  }, [isListLikeView, filteredServers.length, currentPage, deviceMode]);

  useEffect(() => {
    if (typeof window === "undefined") return;
    if (isListLikeView || isLaneView) return;
    const container = contentRef.current;
    if (!container) return;

    const measure = () => {
      const cards = Array.from(
        container.querySelectorAll<HTMLElement>("[data-server-card]")
      );
      const next = cards.reduce(
        (max, card) => Math.max(max, card.getBoundingClientRect().height),
        0
      );
      setCardAutoRowHeight((prev) => {
        if (Math.abs(prev - next) < 1) return prev;
        return next;
      });
    };

    measure();
    const raf = window.requestAnimationFrame(measure);
    let observer: ResizeObserver | null = null;
    if (typeof ResizeObserver !== "undefined") {
      observer = new ResizeObserver(() => measure());
      observer.observe(container);
    } else {
      window.addEventListener("resize", measure);
    }
    return () => {
      window.cancelAnimationFrame(raf);
      observer?.disconnect();
      if (!observer) {
        window.removeEventListener("resize", measure);
      }
    };
  }, [isListLikeView, isLaneView, filteredServers.length, currentPage, deviceMode]);

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
    onAddServer();
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

  useEffect(() => {
    if (!viewMenuOpen) return;
    const handleClickOutside = (event: MouseEvent) => {
      const target = event.target as Node | null;
      if (!target) return;
      if (viewPopoverRef.current?.contains(target)) return;
      if (viewButtonRef.current?.contains(target)) return;
      setViewMenuOpen(false);
    };
    const handleEscape = (event: KeyboardEvent) => {
      if (event.key === "Escape") setViewMenuOpen(false);
    };
    document.addEventListener("mousedown", handleClickOutside);
    document.addEventListener("keydown", handleEscape);
    return () => {
      document.removeEventListener("mousedown", handleClickOutside);
      document.removeEventListener("keydown", handleEscape);
    };
  }, [viewMenuOpen]);

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
                {rowOptions.map((value) => (
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
  };

  const openDetailViewForAlias = (alias: string) => {
    if (alias && activeAlias !== alias) {
      onActiveAliasChange(alias);
    }
    setRequestedDetailAlias(alias || null);
  };

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
    const res = await fetch(
      `${baseUrl}/api/workspaces/${workspaceId}/files/${encodePath(path)}`
    );
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
    const res = await fetch(
      `${baseUrl}/api/workspaces/${workspaceId}/files/${encodePath(path)}`,
      {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ content }),
      }
    );
    if (!res.ok) {
      throw new Error(await parseErrorMessage(res));
    }
  };

  const upsertVaultYamlKey = (
    yamlText: string,
    key: string,
    vaultText: string
  ): string => {
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
    const portValid = Boolean(portRaw && Number.isInteger(portValue) && portValue >= 1 && portValue <= 65535);
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
    updateServer(server.alias, {
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
  const handleQueryDraftChange = (value: string) => {
    setQueryDraft(value);
    setQuery(value);
  };

  const toggleFilters = () => {
    if (filtersOpen) {
      setFiltersOpen(false);
    } else {
      openFilters();
    }
  };

  const toggleViewMenu = () => {
    setViewMenuOpen((prev) => !prev);
  };

  const selectViewMode = (mode: ServerViewMode) => {
    setViewMode(mode);
    setViewMenuOpen(false);
  };

  const handleCancelAction = () => {
    if (actionBusy) return;
    setPendingAction(null);
    setActionError(null);
  };

  return (
    <DeploymentCredentialsFormTemplate
      compact={compact}
      baseUrl={baseUrl}
      wrapperTag={Wrapper}
      wrapperClassName={wrapperClassName}
      scrollRef={scrollRef}
      controlsRef={controlsRef}
      contentRef={contentRef}
      filtersButtonRef={filtersButtonRef}
      viewButtonRef={viewButtonRef}
      viewPopoverRef={viewPopoverRef}
      queryDraft={queryDraft}
      onQueryDraftChange={handleQueryDraftChange}
      onApplySearch={applySearch}
      filtersOpen={filtersOpen}
      onToggleFilters={toggleFilters}
      onAddServer={addServerFromSearch}
      deviceMode={deviceMode}
      onDeviceModeChange={onDeviceModeChange}
      viewMode={viewMode}
      viewMenuOpen={viewMenuOpen}
      onToggleViewMenu={toggleViewMenu}
      onSelectViewMode={selectViewMode}
      paginatedServers={paginatedServers}
      computedColumns={computedColumns}
      laneCount={laneCount}
      laneSize={laneSize}
      aliasCounts={aliasCounts}
      connectionResults={connectionResults}
      workspaceId={workspaceId}
      onAliasChange={handleAliasChange}
      onPatchServer={updateServer}
      onOpenDetail={openDetailViewForAlias}
      onGenerateKey={generateServerKey}
      onCredentialFieldBlur={handleCredentialFieldBlur}
      onRequestDelete={requestDeleteServers}
      onRequestPurge={requestPurgeServers}
      requestedDetailAlias={requestedDetailAlias}
      onRequestedDetailAliasHandled={() => setRequestedDetailAlias(null)}
      onOpenDetailSearch={onOpenDetailSearch}
      primaryDomainOptions={primaryDomainOptions}
      onRequestAddPrimaryDomain={onRequestAddPrimaryDomain}
      currentPage={currentPage}
      pageCount={pageCount}
      onPrevPage={() => setPage((prev) => Math.max(1, prev - 1))}
      onNextPage={() => setPage((prev) => Math.min(pageCount, prev + 1))}
      pendingAction={pendingAction}
      actionBusy={actionBusy}
      actionError={actionError}
      onCancelAction={handleCancelAction}
      onConfirmAction={() => {
        void confirmServerAction();
      }}
      filtersOverlay={filtersOverlay}
    />
  );
}
