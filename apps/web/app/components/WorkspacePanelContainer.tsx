"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { json as jsonLang } from "@codemirror/lang-json";
import { yaml as yamlLang } from "@codemirror/lang-yaml";
import { python as pythonLang } from "@codemirror/lang-python";
import { EditorView } from "@codemirror/view";
import { marked } from "marked";
import TurndownService from "turndown";
import WorkspaceSwitcher from "./workspace-panel/WorkspaceSwitcher";
import WorkspacePanelHeader from "./workspace-panel/WorkspacePanelHeader";
import WorkspacePanelOverlays from "./workspace-panel/WorkspacePanelOverlays";
import WorkspacePanelCards from "./workspace-panel/WorkspacePanelCards";
import WorkspacePanelFileEditor from "./workspace-panel/WorkspacePanelFileEditor";
import UsersOverviewPanel from "./workspace-panel/UsersOverviewPanel";
import UserEntryModal from "./workspace-panel/UserEntryModal";
import OrphanCleanupModal from "./workspace-panel/OrphanCleanupModal";
import HistoryModal from "./workspace-panel/HistoryModal";
import LeaveGuardModal from "./workspace-panel/LeaveGuardModal";
import { useWorkspaceUsers } from "./workspace-panel/useWorkspaceUsers";
import { useWorkspaceHistory } from "./workspace-panel/useWorkspaceHistory";
import { useOrphanCleanup } from "./workspace-panel/useOrphanCleanup";
import styles from "./WorkspacePanel.module.css";
import { createWorkspacePanelCoreActions } from "./workspace-panel/actions-core";
import { createWorkspacePanelFileActions } from "./workspace-panel/actions-files";
import { createWorkspacePanelVaultActions } from "./workspace-panel/actions-vault";
import {
  WORKSPACE_STORAGE_KEY,
  USER_STORAGE_KEY,
  USER_WORKSPACE_CURRENT_PREFIX,
  readQueryParam,
  loadWorkspaceList,
  saveWorkspaceList,
  buildTree,
  flattenTree,
  extensionForPath,
  encodePath,
  hostVarsAliasesFromFiles,
  normalizeRoles,
  rolesByAliasKey,
  sanitizeAliasFilename,
  pickHostVarsPath,
} from "./workspace-panel/utils";
import type {
  FileEntry,
  KdbxEntryView,
  UsersAction,
  VaultBlock,
  WorkspaceListEntry,
  WorkspacePanelProps,
} from "./workspace-panel/types";
import {
  USERS_GROUP_VARS_PATH,
} from "./workspace-panel/users-utils";

export default function WorkspacePanel({
  baseUrl,
  selectedRolesByAlias,
  credentials,
  onCredentialsPatch,
  onInventoryReadyChange,
  onSelectedRolesByAliasChange,
  onWorkspaceIdChange,
  aliasRenames,
  onAliasRenamesHandled,
  aliasDeletes,
  onAliasDeletesHandled,
  aliasCleanups,
  onAliasCleanupsHandled,
  selectionTouched,
  compact = false,
}: WorkspacePanelProps) {
  const Wrapper = compact ? "div" : "section";
  const wrapperClassName = compact
    ? `${styles.root} ${styles.compactRoot}`
    : `${styles.root} ${styles.wrapper}`;
  const [userId, setUserId] = useState<string | null>(null);
  const [workspaceList, setWorkspaceList] = useState<WorkspaceListEntry[]>([]);
  const [workspaceSwitcherTarget, setWorkspaceSwitcherTarget] =
    useState<HTMLElement | null>(null);
  const [workspaceId, setWorkspaceId] = useState<string | null>(null);
  const [workspaceError, setWorkspaceError] = useState<string | null>(null);
  const [workspaceLoading, setWorkspaceLoading] = useState(false);
  const [deletingWorkspaceId, setDeletingWorkspaceId] = useState<string | null>(
    null
  );
  const [files, setFiles] = useState<FileEntry[]>([]);
  const [inventoryReady, setInventoryReady] = useState(false);

  const [activePath, setActivePath] = useState<string | null>(null);
  const [editorValue, setEditorValue] = useState("");
  const [editorDirty, setEditorDirty] = useState(false);
  const [editorLoading, setEditorLoading] = useState(false);
  const [editorError, setEditorError] = useState<string | null>(null);
  const [editorStatus, setEditorStatus] = useState<string | null>(null);
  const [markdownHtml, setMarkdownHtml] = useState("");
  const [kdbxEntries, setKdbxEntries] = useState<KdbxEntryView[]>([]);
  const [kdbxError, setKdbxError] = useState<string | null>(null);
  const [kdbxLoading, setKdbxLoading] = useState(false);
  const [kdbxPromptOpen, setKdbxPromptOpen] = useState(false);
  const [kdbxRevealed, setKdbxRevealed] = useState<Record<string, boolean>>(
    {}
  );
  const kdbxPasswordRef = useRef<string>("");
  const kdbxArgonReadyRef = useRef(false);

  const [openDirs, setOpenDirs] = useState<Set<string>>(new Set());

  const [vaultPromptOpen, setVaultPromptOpen] = useState(false);
  const [vaultPromptMode, setVaultPromptMode] = useState<
    "generate" | "vault-reset" | null
  >(null);
  const [vaultPromptConfirm, setVaultPromptConfirm] = useState(false);
  const [pendingCredentials, setPendingCredentials] = useState<{
    roles: string[];
    force: boolean;
    setValues: string[];
    alias?: string;
    targets?: { alias: string; targetRoles: string[] }[];
  } | null>(null);
  const allowEmptyPlain = false;
  const [forceOverwrite, setForceOverwrite] = useState(false);
  const [credentialsScope, setCredentialsScope] = useState<"all" | "single">(
    "all"
  );
  const [credentialsRole, setCredentialsRole] = useState<string>("");
  const [credentialsBusy, setCredentialsBusy] = useState(false);
  const [credentialsError, setCredentialsError] = useState<string | null>(null);
  const [credentialsStatus, setCredentialsStatus] = useState<string | null>(null);

  const [zipBusy, setZipBusy] = useState(false);
  const [zipError, setZipError] = useState<string | null>(null);
  const [uploadBusy, setUploadBusy] = useState(false);
  const [uploadError, setUploadError] = useState<string | null>(null);
  const [uploadStatus, setUploadStatus] = useState<string | null>(null);
  const uploadInputRef = useRef<HTMLInputElement | null>(null);
  const autoSyncRef = useRef(false);
  const hostVarsSyncRef = useRef(false);
  const lastPortRef = useRef<string>("");
  const inventorySeededRef = useRef(false);
  const initialRolesSyncDoneRef = useRef(false);
  const markdownSyncRef = useRef(false);
  const deleteSyncRef = useRef(false);

  useEffect(() => {
    if (typeof document === "undefined") return;
    setWorkspaceSwitcherTarget(
      document.getElementById("workspace-switcher-slot")
    );
  }, []);

  useEffect(() => {
    if (typeof window === "undefined") return;
    const fromQuery =
      readQueryParam("user") || readQueryParam("workspace_user");
    const stored = window.localStorage.getItem(USER_STORAGE_KEY);
    const resolved = fromQuery || stored;
    if (resolved) {
      if (fromQuery && fromQuery !== stored) {
        window.localStorage.setItem(USER_STORAGE_KEY, resolved);
      }
      setUserId(resolved);
    } else {
      setUserId(null);
    }
  }, []);

  useEffect(() => {
    if (!userId) {
      setWorkspaceList([]);
    }
  }, [userId]);

  const [generateBusy, setGenerateBusy] = useState(false);
  const [inventorySyncError, setInventorySyncError] = useState<string | null>(
    null
  );

  const [fileOpError, setFileOpError] = useState<string | null>(null);
  const [contextMenu, setContextMenu] = useState<{
    x: number;
    y: number;
    path?: string;
    isDir: boolean;
  } | null>(null);
  const [editorMenu, setEditorMenu] = useState<{
    x: number;
    y: number;
    block: VaultBlock;
  } | null>(null);
  const editorViewRef = useRef<EditorView | null>(null);
  const [saveInProgress, setSaveInProgress] = useState(false);
  const [lastSaveAckAt, setLastSaveAckAt] = useState<string | null>(null);
  const [leaveGuardOpen, setLeaveGuardOpen] = useState(false);
  const [leaveGuardMessage, setLeaveGuardMessage] = useState<string | null>(null);
  const autosaveTimerRef = useRef<number | null>(null);
  const hostVarsSyncTimerRef = useRef<number | null>(null);
  const pendingLeaveActionRef = useRef<(() => void) | null>(null);
  const bypassLeaveGuardRef = useRef(false);

  const [masterChangeOpen, setMasterChangeOpen] = useState(false);
  const [masterChangeError, setMasterChangeError] = useState<string | null>(null);
  const [masterChangeBusy, setMasterChangeBusy] = useState(false);
  const [masterChangeMode, setMasterChangeMode] = useState<"set" | "reset">(
    "reset"
  );
  const [masterChangeValues, setMasterChangeValues] = useState({
    current: "",
    next: "",
    confirm: "",
  });

  const [keyPassphraseModal, setKeyPassphraseModal] = useState<{
    alias: string;
  } | null>(null);
  const [keyPassphraseError, setKeyPassphraseError] = useState<string | null>(
    null
  );
  const [keyPassphraseBusy, setKeyPassphraseBusy] = useState(false);
  const [keyPassphraseValues, setKeyPassphraseValues] = useState({
    master: "",
    next: "",
    confirm: "",
  });

  const [vaultValueModal, setVaultValueModal] = useState<{
    mode: "show" | "change";
    block: VaultBlock;
    plaintext?: string;
    loading: boolean;
    error?: string | null;
  } | null>(null);
  const [vaultValueInputs, setVaultValueInputs] = useState({
    master: "",
    next: "",
    confirm: "",
  });

  const activeAlias = (credentials.alias || "").trim();

  const inventoryEntry = useMemo(
    () => files.find((entry) => entry.path === "inventory.yml") ?? null,
    [files]
  );
  const inventoryModifiedAt = inventoryEntry?.modified_at ?? null;
  const hostVarsPath = useMemo(
    () => pickHostVarsPath(files, activeAlias),
    [files, activeAlias]
  );
  const hostVarsEntry = useMemo(
    () =>
      hostVarsPath
        ? files.find((entry) => entry.path === hostVarsPath) ?? null
        : null,
    [files, hostVarsPath]
  );
  const hostVarsModifiedAt = hostVarsEntry?.modified_at ?? null;
  const hostVarsAliases = useMemo(
    () => hostVarsAliasesFromFiles(files),
    [files]
  );
  const hasCredentialsVault = useMemo(
    () => files.some((entry) => entry.path === "secrets/credentials.kdbx"),
    [files]
  );

  const activeRoles = useMemo(
    () => normalizeRoles(selectedRolesByAlias[activeAlias] ?? []),
    [selectedRolesByAlias, activeAlias]
  );
  const serverRolesByAlias = useMemo(() => {
    const map: Record<string, string[]> = {};
    const aliases = new Set<string>();
    if (activeAlias) aliases.add(activeAlias);
    hostVarsAliases.forEach((alias) => {
      const key = String(alias || "").trim();
      if (key) aliases.add(key);
    });
    Object.keys(selectedRolesByAlias || {}).forEach((alias) => {
      const key = String(alias || "").trim();
      if (key) aliases.add(key);
    });
    aliases.forEach((alias) => {
      map[alias] = normalizeRoles(selectedRolesByAlias[alias] ?? []);
    });
    return map;
  }, [activeAlias, hostVarsAliases, selectedRolesByAlias]);
  const credentialServerAliases = useMemo(
    () => Object.keys(serverRolesByAlias),
    [serverRolesByAlias]
  );
  const tree = useMemo(() => buildTree(files), [files]);
  const treeItems = useMemo(
    () => flattenTree(tree, openDirs),
    [tree, openDirs]
  );

  const activeExtension = useMemo(
    () => (activePath ? extensionForPath(activePath) : "text"),
    [activePath]
  );
  const isKdbx = activeExtension === "kdbx";

  const editorExtensions = useMemo(() => {
    switch (activeExtension) {
      case "json":
        return [jsonLang()];
      case "yaml":
        return [yamlLang()];
      case "python":
        return [pythonLang()];
      default:
        return [];
    }
  }, [activeExtension]);

  const turndown = useMemo(
    () =>
      new TurndownService({
        codeBlockStyle: "fenced",
        emDelimiter: "*",
        strongDelimiter: "**",
      }),
    []
  );

  const quillModules = useMemo(
    () => ({
      toolbar: [
        [{ header: [1, 2, 3, false] }],
        ["bold", "italic", "underline", "strike"],
        [{ list: "ordered" }, { list: "bullet" }],
        ["blockquote", "code-block", "link"],
        ["clean"],
      ],
    }),
    []
  );

  useEffect(() => {
    if (activeExtension !== "markdown") return;
    if (markdownSyncRef.current) {
      markdownSyncRef.current = false;
      return;
    }
    let alive = true;
    const source = editorValue ?? "";
    try {
      const result = marked.parse(source);
      if (typeof result === "string") {
        if (alive) setMarkdownHtml(result);
      } else {
        void result
          .then((html) => {
            if (alive) setMarkdownHtml(html);
          })
          .catch(() => {
            if (alive) setMarkdownHtml(source);
          });
      }
    } catch {
      if (alive) setMarkdownHtml(source);
    }
    return () => {
      alive = false;
    };
  }, [activeExtension, editorValue]);

  useEffect(() => {
    if (!contextMenu) return;
    const close = () => setContextMenu(null);
    const onKey = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        setContextMenu(null);
      }
    };
    window.addEventListener("click", close);
    window.addEventListener("contextmenu", close);
    window.addEventListener("keydown", onKey);
    return () => {
      window.removeEventListener("click", close);
      window.removeEventListener("contextmenu", close);
      window.removeEventListener("keydown", onKey);
    };
  }, [contextMenu]);

  useEffect(() => {
    if (!editorMenu) return;
    const close = () => setEditorMenu(null);
    const onKey = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        setEditorMenu(null);
      }
    };
    window.addEventListener("click", close);
    window.addEventListener("contextmenu", close);
    window.addEventListener("keydown", onKey);
    return () => {
      window.removeEventListener("click", close);
      window.removeEventListener("contextmenu", close);
      window.removeEventListener("keydown", onKey);
    };
  }, [editorMenu]);

  useEffect(() => {
    if (credentialsScope !== "single") return;
    setCredentialsRole((prev) =>
      activeRoles.includes(prev) ? prev : activeRoles[0] ?? ""
    );
  }, [activeRoles, credentialsScope]);

  useEffect(() => {
    inventorySeededRef.current = false;
    initialRolesSyncDoneRef.current = false;
  }, [workspaceId]);

  useEffect(() => {
    if (!inventoryReady) {
      inventorySeededRef.current = false;
    }
  }, [inventoryReady]);

  useEffect(() => {
    if (activeAlias) {
      inventorySeededRef.current = false;
    }
  }, [activeAlias]);

  useEffect(() => {
    if (!workspaceId || !inventoryReady) return;
    if (!onSelectedRolesByAliasChange) {
      inventorySeededRef.current = true;
    }
  }, [workspaceId, inventoryReady, onSelectedRolesByAliasChange]);

  useEffect(() => {
    if (selectionTouched) {
      inventorySeededRef.current = true;
    }
  }, [selectionTouched]);

  const hasPendingAliasMutations =
    (aliasRenames?.length ?? 0) > 0 ||
    (aliasDeletes?.length ?? 0) > 0 ||
    (aliasCleanups?.length ?? 0) > 0;

  useEffect(() => {
    if (!workspaceId) return;
    if (!onSelectedRolesByAliasChange) return;
    if (hasPendingAliasMutations) return;
    const merged = mergeRolesByAlias(selectedRolesByAlias);
    const changed =
      rolesByAliasKey(merged) !== rolesByAliasKey(selectedRolesByAlias);
    if (changed || !initialRolesSyncDoneRef.current) {
      onSelectedRolesByAliasChange(merged);
      initialRolesSyncDoneRef.current = true;
    }
  }, [
    hasPendingAliasMutations,
    workspaceId,
    hostVarsAliases,
    onSelectedRolesByAliasChange,
    selectedRolesByAlias,
  ]);


  const canGenerate =
    !!workspaceId &&
    !inventoryReady &&
    activeAlias &&
    activeRoles.length > 0 &&
    credentials.host &&
    credentials.user;

  const {
    mergeRolesByAlias,
    refreshFiles,
    selectWorkspace,
    renameWorkspaceFile,
    createWorkspace,
    initWorkspace,
    deleteWorkspace,
    toggleDir,
    lockKdbx,
    handleKdbxSubmit,
    loadFile,
    saveFile,
    generateInventory,
    resolveTargetRoles,
    renameAliasInInventory,
    removeAliasFromInventory,
    syncInventoryWithSelection,
    syncSelectionFromInventory,
    syncHostVarsFromCredentials,
    syncCredentialsFromHostVars,
  } = createWorkspacePanelCoreActions({
    baseUrl,
    userId,
    openDirs,
    workspaceId,
    activePath,
    selectedRolesByAlias,
    activeAlias,
    activeRoles,
    credentials,
    hostVarsAliases,
    hostVarsPath,
    inventoryReady,
    canGenerate,
    inventorySyncError,
    onInventoryReadyChange,
    onWorkspaceIdChange,
    onSelectedRolesByAliasChange,
    onCredentialsPatch,
    setUserId,
    setWorkspaceList,
    setWorkspaceId,
    setFiles,
    setOpenDirs,
    setActivePath,
    setEditorValue,
    setEditorDirty,
    setEditorLoading,
    setEditorError,
    setEditorStatus,
    setMarkdownHtml,
    setKdbxEntries,
    setKdbxError,
    setKdbxLoading,
    setKdbxPromptOpen,
    setKdbxRevealed,
    setInventoryReady,
    setWorkspaceLoading,
    setWorkspaceError,
    setGenerateBusy,
    setInventorySyncError,
    kdbxPasswordRef,
    kdbxArgonReadyRef,
    inventorySeededRef,
    markdownSyncRef,
    hostVarsSyncRef,
    lastPortRef,
    readQueryParam,
    loadWorkspaceList,
    saveWorkspaceList,
    WORKSPACE_STORAGE_KEY,
    USER_WORKSPACE_CURRENT_PREFIX,
  });

  const {
    generateCredentials,
    resetVaultPassword,
    handleVaultPromptSubmit,
    submitMasterChange,
    submitKeyPassphraseChange,
    openVaultValueModal,
    submitVaultValue,
  } = createWorkspacePanelVaultActions({
    baseUrl,
    workspaceId,
    activeAlias,
    activePath,
    allowEmptyPlain,
    credentialsBusy,
    credentialsScope,
    credentialsRole,
    forceOverwrite,
    pendingCredentials,
    vaultPromptMode,
    masterChangeValues,
    masterChangeMode,
    keyPassphraseModal,
    keyPassphraseValues,
    vaultValueModal,
    vaultValueInputs,
    editorValue,
    inventorySyncError,
    refreshFiles,
    resolveTargetRoles,
    setCredentialsBusy,
    setCredentialsError,
    setCredentialsStatus,
    setPendingCredentials,
    setVaultPromptMode,
    setVaultPromptConfirm,
    setVaultPromptOpen,
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
  });

  const {
    downloadZip,
    downloadFile,
    onUploadSelect,
    openUploadPicker,
    createFile,
    createDirectory,
    renameFile,
    deleteFile,
    openContextMenu,
  } = createWorkspacePanelFileActions({
    baseUrl,
    workspaceId,
    uploadBusy,
    activePath,
    uploadInputRef,
    setZipBusy,
    setZipError,
    setWorkspaceError,
    setUploadBusy,
    setUploadError,
    setUploadStatus,
    setFileOpError,
    setActivePath,
    setEditorValue,
    setEditorDirty,
    setContextMenu,
    setEditorMenu,
    refreshFiles,
    loadFile,
  });

  useEffect(() => {
    let alive = true;
    void (async () => {
      if (!alive) return;
      await initWorkspace();
    })();
    return () => {
      alive = false;
    };
  }, [baseUrl, onWorkspaceIdChange, userId]);

  const openMasterPasswordDialog = () => {
    setMasterChangeMode(hasCredentialsVault ? "reset" : "set");
    setMasterChangeError(null);
    setMasterChangeValues({ current: "", next: "", confirm: "" });
    setMasterChangeOpen(true);
  };

  useEffect(() => {
    if (isKdbx) return;
    setKdbxEntries([]);
    setKdbxError(null);
    setKdbxLoading(false);
    setKdbxRevealed({});
    kdbxPasswordRef.current = "";
  }, [isKdbx]);

  useEffect(() => {
    if (!workspaceId) return;
    if (autoSyncRef.current) return;
    if (hasPendingAliasMutations) return;
    if (activePath === "inventory.yml" && editorDirty) return;

    const run = async () => {
      autoSyncRef.current = true;
      try {
        if (!inventoryReady) {
          if (canGenerate && !generateBusy && !workspaceLoading) {
            await generateInventory();
          }
          return;
        }
        if (!inventorySeededRef.current) {
          return;
        }
        await syncInventoryWithSelection(editorDirty);
      } finally {
        autoSyncRef.current = false;
      }
    };

    void run();
  }, [
    hasPendingAliasMutations,
    workspaceId,
    inventoryReady,
    canGenerate,
    generateBusy,
    workspaceLoading,
    selectedRolesByAlias,
    hostVarsAliases,
    activePath,
    editorDirty,
  ]);

  useEffect(() => {
    if (!workspaceId || !inventoryReady) return;
    if (!onSelectedRolesByAliasChange) return;
    if (autoSyncRef.current) return;
    if (hasPendingAliasMutations) return;
    if (activePath === "inventory.yml" && editorDirty) return;

    const run = async () => {
      autoSyncRef.current = true;
      try {
        await syncSelectionFromInventory(editorDirty);
      } finally {
        autoSyncRef.current = false;
        inventorySeededRef.current = true;
      }
    };

    void run();
  }, [
    hasPendingAliasMutations,
    workspaceId,
    inventoryReady,
    inventoryModifiedAt,
    hostVarsAliases,
    onSelectedRolesByAliasChange,
    activeAlias,
    activePath,
    editorDirty,
  ]);

  useEffect(() => {
    if (!workspaceId) return;
    if (!aliasRenames || aliasRenames.length === 0) return;
    if (autoSyncRef.current) return;

    const { from, to } = aliasRenames[0] || {};
    if (!from || !to || from === to) {
      onAliasRenamesHandled?.(1);
      return;
    }

    const run = async () => {
      autoSyncRef.current = true;
      try {
        if (inventoryReady) {
          await renameAliasInInventory(from, to);
        }
        const fromSafe = sanitizeAliasFilename(from);
        const toSafe = sanitizeAliasFilename(to);

        const tryRename = async (fromPath: string, toPath: string) => {
          const fromExists = files.some((entry) => entry.path === fromPath);
          const toExists = files.some((entry) => entry.path === toPath);
          if (!fromExists || toExists) return;
          await renameWorkspaceFile(fromPath, toPath);
          if (activePath === fromPath) {
            setActivePath(toPath);
          }
        };

        await tryRename(`host_vars/${fromSafe}.yml`, `host_vars/${toSafe}.yml`);
        await tryRename(
          `secrets/ssh_keys/${fromSafe}`,
          `secrets/ssh_keys/${toSafe}`
        );
        await tryRename(
          `secrets/ssh_keys/${fromSafe}.pub`,
          `secrets/ssh_keys/${toSafe}.pub`
        );
        await refreshFiles(workspaceId);
      } catch (err: any) {
        setInventorySyncError(
          err?.message ? `Alias rename failed: ${err.message}` : "Alias rename failed."
        );
      } finally {
        autoSyncRef.current = false;
        onAliasRenamesHandled?.(1);
      }
    };

    void run();
  }, [
    workspaceId,
    inventoryReady,
    aliasRenames,
    files,
    activePath,
    onAliasRenamesHandled,
  ]);

  useEffect(() => {
    if (!workspaceId) return;
    if (!aliasDeletes || aliasDeletes.length === 0) return;
    if (deleteSyncRef.current) return;

    const alias = aliasDeletes[0];
    if (!alias) {
      onAliasDeletesHandled?.(1);
      return;
    }

    const run = async () => {
      deleteSyncRef.current = true;
      try {
        if (inventoryReady) {
          await removeAliasFromInventory(alias);
        }
        await refreshFiles(workspaceId);
      } catch (err: any) {
        setInventorySyncError(
          err?.message ? `Device delete failed: ${err.message}` : "Device delete failed."
        );
      } finally {
        deleteSyncRef.current = false;
        onAliasDeletesHandled?.(1);
      }
    };

    void run();
  }, [
    workspaceId,
    inventoryReady,
    aliasDeletes,
    onAliasDeletesHandled,
  ]);

  useEffect(() => {
    if (!workspaceId) return;
    if (!aliasCleanups || aliasCleanups.length === 0) return;
    if (deleteSyncRef.current) return;

    const alias = aliasCleanups[0];
    if (!alias) {
      onAliasCleanupsHandled?.(1);
      return;
    }

    const deleteFileIfExists = async (path: string) => {
      if (!files.some((entry) => entry.path === path)) return;
      const res = await fetch(
        `${baseUrl}/api/workspaces/${workspaceId}/files/${encodePath(path)}`,
        { method: "DELETE" }
      );
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
      if (activePath === path) {
        setActivePath(null);
        setEditorValue("");
        setEditorDirty(false);
      }
    };

    const run = async () => {
      deleteSyncRef.current = true;
      try {
        if (inventoryReady) {
          await removeAliasFromInventory(alias);
        }
        const safeAlias = sanitizeAliasFilename(alias);
        await deleteFileIfExists(`host_vars/${safeAlias}.yml`);
        await deleteFileIfExists(`secrets/ssh_keys/${safeAlias}`);
        await deleteFileIfExists(`secrets/ssh_keys/${safeAlias}.pub`);
        await refreshFiles(workspaceId);
      } catch (err: any) {
        setInventorySyncError(
          err?.message ? `Device cleanup failed: ${err.message}` : "Device cleanup failed."
        );
      } finally {
        deleteSyncRef.current = false;
        onAliasCleanupsHandled?.(1);
      }
    };

    void run();
  }, [
    workspaceId,
    inventoryReady,
    aliasCleanups,
    files,
    activePath,
    onAliasCleanupsHandled,
  ]);

  useEffect(() => {
    if (hostVarsSyncTimerRef.current != null) {
      window.clearTimeout(hostVarsSyncTimerRef.current);
      hostVarsSyncTimerRef.current = null;
    }
    if (!workspaceId) return;

    hostVarsSyncTimerRef.current = window.setTimeout(() => {
      void syncHostVarsFromCredentials(editorDirty);
    }, 1400);

    return () => {
      if (hostVarsSyncTimerRef.current == null) return;
      window.clearTimeout(hostVarsSyncTimerRef.current);
      hostVarsSyncTimerRef.current = null;
    };
  }, [
    workspaceId,
    credentials.description,
    credentials.primaryDomain,
    credentials.host,
    credentials.port,
    credentials.user,
    credentials.color,
    credentials.logoEmoji,
    hostVarsPath,
    activePath,
    editorDirty,
  ]);

  useEffect(() => {
    if (!workspaceId) return;
    void syncCredentialsFromHostVars(editorDirty);
  }, [
    workspaceId,
    hostVarsPath,
    hostVarsModifiedAt,
    activePath,
    editorDirty,
  ]);

  const {
    orphanCleanupOpen,
    orphanCleanupLoading,
    orphanCleanupBusy,
    orphanCleanupItems,
    orphanCleanupSelected,
    orphanCleanupError,
    orphanCleanupStatus,
    setOrphanCleanupOpen,
    openOrphanCleanupDialog,
    toggleOrphanSelection,
    setOrphanSelectionAll,
    deleteOrphanCleanupSelection,
  } = useOrphanCleanup({
    baseUrl,
    workspaceId,
    files,
    activePath,
    setActivePath,
    setEditorValue,
    setEditorDirty,
    refreshFiles,
  });

  const readApiDetail = useCallback(async (res: Response): Promise<string> => {
    let message = `HTTP ${res.status}`;
    try {
      const data = await res.json();
      if (data?.detail) message = String(data.detail);
    } catch {
      // ignore response parse errors
    }
    return message;
  }, []);

  const hasUnsavedChanges = editorDirty || saveInProgress;

  const clearAutosaveTimer = useCallback(() => {
    if (autosaveTimerRef.current == null) return;
    window.clearTimeout(autosaveTimerRef.current);
    autosaveTimerRef.current = null;
  }, []);

  const flushPendingEditorSave = useCallback(async (): Promise<boolean> => {
    clearAutosaveTimer();
    if (!workspaceId || !activePath || isKdbx) {
      return true;
    }
    if (!editorDirty) {
      return true;
    }
    setSaveInProgress(true);
    try {
      const ok = await saveFile(editorValue, editorDirty);
      if (ok) {
        setLastSaveAckAt(new Date().toISOString());
      }
      return Boolean(ok);
    } finally {
      setSaveInProgress(false);
    }
  }, [
    activePath,
    clearAutosaveTimer,
    editorDirty,
    editorValue,
    isKdbx,
    saveFile,
    workspaceId,
  ]);

  const queueLeaveAction = useCallback(
    (action: () => void, message?: string) => {
      if (!hasUnsavedChanges) {
        action();
        return;
      }
      pendingLeaveActionRef.current = action;
      setLeaveGuardMessage(
        message || "Unsaved changes detected. Save your changes before leaving?"
      );
      setLeaveGuardOpen(true);
    },
    [hasUnsavedChanges]
  );

  const executePendingLeaveAction = useCallback(() => {
    const action = pendingLeaveActionRef.current;
    pendingLeaveActionRef.current = null;
    setLeaveGuardOpen(false);
    setLeaveGuardMessage(null);
    action?.();
  }, []);

  const cancelPendingLeaveAction = useCallback(() => {
    pendingLeaveActionRef.current = null;
    setLeaveGuardOpen(false);
    setLeaveGuardMessage(null);
  }, []);

  const saveAndExecutePendingLeaveAction = useCallback(async () => {
    const ok = await flushPendingEditorSave();
    if (!ok) {
      setLeaveGuardMessage(
        "Saving failed. Fix validation or API errors and try again."
      );
      return;
    }
    executePendingLeaveAction();
  }, [executePendingLeaveAction, flushPendingEditorSave]);

  const {
    historyOpen,
    historyLoading,
    historyDiffLoading,
    historyRestoreBusy,
    historyError,
    historyStatus,
    historyScopePath,
    historyScopeIsDir,
    historyOpenIntent,
    historyAgainstCurrent,
    historyCommits,
    historySelectedSha,
    historySelectedCommit,
    historyDisplayedFiles,
    historyDiff,
    setHistoryOpen,
    setHistoryAgainstCurrent,
    setHistorySelectedSha,
    fetchHistoryCommits,
    openHistory,
    restoreHistoryWorkspace,
    restoreHistoryPath,
  } = useWorkspaceHistory({
    baseUrl,
    workspaceId,
    readApiDetail,
    refreshFiles,
    activePath,
    loadFile,
    setEditorDirty,
  });

  useEffect(() => {
    if (!workspaceId || !activePath || isKdbx) {
      clearAutosaveTimer();
      return;
    }
    if (!editorDirty) {
      clearAutosaveTimer();
      return;
    }
    clearAutosaveTimer();
    autosaveTimerRef.current = window.setTimeout(() => {
      void flushPendingEditorSave();
    }, 1000);
    return () => {
      clearAutosaveTimer();
    };
  }, [
    activePath,
    clearAutosaveTimer,
    editorDirty,
    editorValue,
    flushPendingEditorSave,
    isKdbx,
    workspaceId,
  ]);

  useEffect(() => {
    return () => {
      clearAutosaveTimer();
      if (hostVarsSyncTimerRef.current == null) return;
      window.clearTimeout(hostVarsSyncTimerRef.current);
      hostVarsSyncTimerRef.current = null;
    };
  }, [clearAutosaveTimer]);

  useEffect(() => {
    const onBeforeUnload = (event: BeforeUnloadEvent) => {
      if (!hasUnsavedChanges) return;
      event.preventDefault();
      event.returnValue = "";
    };
    window.addEventListener("beforeunload", onBeforeUnload);
    return () => {
      window.removeEventListener("beforeunload", onBeforeUnload);
    };
  }, [hasUnsavedChanges]);

  useEffect(() => {
    const onCaptureClick = (event: MouseEvent) => {
      if (!hasUnsavedChanges || bypassLeaveGuardRef.current) return;
      const target = event.target as Element | null;
      if (!target) return;

      const tabButton = target.closest('button[role="tab"]') as HTMLButtonElement | null;
      if (tabButton && tabButton.getAttribute("aria-selected") !== "true") {
        event.preventDefault();
        event.stopPropagation();
        queueLeaveAction(() => {
          bypassLeaveGuardRef.current = true;
          tabButton.click();
          window.setTimeout(() => {
            bypassLeaveGuardRef.current = false;
          }, 0);
        });
        return;
      }

      const link = target.closest("a[href]") as HTMLAnchorElement | null;
      if (!link) return;
      if (link.target && link.target !== "_self") return;
      const href = link.getAttribute("href") || "";
      if (!href || href.startsWith("#") || href.toLowerCase().startsWith("javascript:")) {
        return;
      }

      event.preventDefault();
      event.stopPropagation();
      queueLeaveAction(() => {
        bypassLeaveGuardRef.current = true;
        window.location.assign(link.href);
      });
    };

    document.addEventListener("click", onCaptureClick, true);
    return () => {
      document.removeEventListener("click", onCaptureClick, true);
    };
  }, [hasUnsavedChanges, queueLeaveAction]);

  const {
    usersOverviewOpen,
    usersLoading,
    usersSaving,
    usersError,
    usersStatus,
    usersDraft,
    usersSelection,
    userForm,
    usersEditorMode,
    editingUsername,
    userEntryModalOpen,
    usersImportInputRef,
    selectedUsersCount,
    openUsersEditor,
    closeUsersEditor,
    startCreateUserEditor,
    startEditUserEditor,
    closeUserEntryModal,
    applyUserEditor,
    removeUserDraft,
    toggleUserSelection,
    setUsersSelectionAll,
    deleteSelectedUsers,
    handleUsersImportSelect,
    saveWorkspaceUsers,
    setUserForm,
  } = useWorkspaceUsers({
    baseUrl,
    workspaceId,
    readApiDetail,
    refreshFiles,
  });

  const canGenerateCredentials =
    inventoryReady &&
    !!workspaceId &&
    !credentialsBusy &&
    credentialServerAliases.some((alias) => (serverRolesByAlias[alias] ?? []).length > 0);

  const workspaceSwitcher =
    userId && workspaceSwitcherTarget
      ? createPortal(
          <WorkspaceSwitcher
            currentId={workspaceId}
            workspaces={workspaceList}
            onSelect={(id) => {
              queueLeaveAction(() => {
                void selectWorkspace(id);
              });
            }}
            onCreate={() => {
              queueLeaveAction(() => {
                void createWorkspace();
              });
            }}
          />,
          workspaceSwitcherTarget
        )
      : null;

  const usersEditorOverrideContent = usersOverviewOpen ? (
    <UsersOverviewPanel
      open={usersOverviewOpen}
      usersGroupVarsPath={USERS_GROUP_VARS_PATH}
      usersLoading={usersLoading}
      usersSaving={usersSaving}
      usersDraft={usersDraft}
      usersSelection={usersSelection}
      selectedUsersCount={selectedUsersCount}
      usersError={usersError}
      usersStatus={usersStatus}
      usersImportInputRef={usersImportInputRef}
      onSetUsersSelectionAll={setUsersSelectionAll}
      onDeleteSelectedUsers={deleteSelectedUsers}
      onSaveWorkspaceUsers={() => {
        void saveWorkspaceUsers();
      }}
      onCloseUsersEditor={closeUsersEditor}
      onStartCreateUserEditor={startCreateUserEditor}
      onToggleUserSelection={toggleUserSelection}
      onStartEditUserEditor={startEditUserEditor}
      onRemoveUserDraft={removeUserDraft}
      onHandleUsersImportSelect={(event) => {
        void handleUsersImportSelect(event);
      }}
    />
  ) : null;
  return (
    <>
      {workspaceSwitcher}
      <Wrapper className={wrapperClassName}>
        <WorkspacePanelHeader
          compact={compact}
          userId={userId}
          workspaceId={workspaceId}
          inventoryReady={inventoryReady}
          workspaceList={workspaceList}
          workspaceError={workspaceError}
          inventorySyncError={inventorySyncError}
          workspaceLoading={workspaceLoading}
          deletingWorkspaceId={deletingWorkspaceId}
          onCreateWorkspace={() => {
            queueLeaveAction(() => {
              void createWorkspace();
            });
          }}
          onSelectWorkspace={(id) => {
            queueLeaveAction(() => {
              void selectWorkspace(id);
            });
          }}
          onDeleteWorkspace={(id) => {
            queueLeaveAction(() => {
              void (async () => {
                const targetId = String(id || "").trim();
                if (!targetId) return;
                const confirmed = window.confirm(
                  `Delete workspace '${targetId}'? This action cannot be undone.`
                );
                if (!confirmed) return;
                setWorkspaceError(null);
                setDeletingWorkspaceId(targetId);
                try {
                  await deleteWorkspace(targetId);
                } catch (err: any) {
                  setWorkspaceError(err?.message ?? "failed to delete workspace");
                } finally {
                  setDeletingWorkspaceId(null);
                }
              })();
            });
          }}
        />
        <div className={styles.editorSection}>
          <WorkspacePanelFileEditor
            activePath={activePath}
            activeExtension={activeExtension}
            isKdbx={isKdbx}
            editorDirty={editorDirty}
            editorLoading={editorLoading}
            saveFile={() => {
              void flushPendingEditorSave();
            }}
            loadFile={(path: string) => {
              void loadFile(path);
            }}
            kdbxPasswordRef={kdbxPasswordRef}
            lockKdbx={lockKdbx}
            setKdbxPromptOpen={setKdbxPromptOpen}
            editorValue={editorValue}
            setEditorValue={setEditorValue}
            setEditorDirty={setEditorDirty}
            setEditorStatus={setEditorStatus}
            setEditorError={setEditorError}
            editorExtensions={editorExtensions}
            editorViewRef={editorViewRef}
            setContextMenu={setContextMenu}
            setEditorMenu={setEditorMenu}
            markdownHtml={markdownHtml}
            setMarkdownHtml={setMarkdownHtml}
            markdownSyncRef={markdownSyncRef}
            turndown={turndown}
            quillModules={quillModules}
            kdbxLoading={kdbxLoading}
            kdbxError={kdbxError}
            kdbxEntries={kdbxEntries}
            kdbxRevealed={kdbxRevealed}
            setKdbxRevealed={setKdbxRevealed}
            editorError={editorError}
            editorStatus={editorStatus}
            openDirs={openDirs}
            treeItems={treeItems}
            toggleDir={toggleDir}
            fileOpError={fileOpError}
            openContextMenu={openContextMenu}
            editorOverrideContent={usersEditorOverrideContent}
          />
        </div>
        <div className={styles.bottomBar}>
          <WorkspacePanelCards
            generateCredentials={generateCredentials}
            resetVaultPassword={resetVaultPassword}
            openMasterPasswordDialog={openMasterPasswordDialog}
            hasCredentialsVault={hasCredentialsVault}
            canGenerateCredentials={canGenerateCredentials}
            credentialsBusy={credentialsBusy}
            workspaceId={workspaceId}
            activeAlias={activeAlias}
            serverAliases={credentialServerAliases}
            serverRolesByAlias={serverRolesByAlias}
            credentialsScope={credentialsScope}
            activeRoles={activeRoles}
            credentialsRole={credentialsRole}
            setCredentialsRole={setCredentialsRole}
            setCredentialsScope={setCredentialsScope}
            forceOverwrite={forceOverwrite}
            setForceOverwrite={setForceOverwrite}
            credentialsError={credentialsError}
            credentialsStatus={credentialsStatus}
            downloadZip={downloadZip}
            zipBusy={zipBusy}
            openUploadPicker={openUploadPicker}
            uploadBusy={uploadBusy}
            uploadInputRef={uploadInputRef}
            onUploadSelect={onUploadSelect}
            uploadError={uploadError}
            zipError={zipError}
            uploadStatus={uploadStatus}
            openInventoryCleanup={openOrphanCleanupDialog}
            inventoryCleanupBusy={orphanCleanupLoading || orphanCleanupBusy}
            onOpenHistory={() => {
              openHistory(null, false, "history");
            }}
            onUsersAction={(action: UsersAction) => {
              void openUsersEditor(action);
            }}
          />
        </div>
      </Wrapper>
      <OrphanCleanupModal
        open={orphanCleanupOpen}
        loading={orphanCleanupLoading}
        busy={orphanCleanupBusy}
        items={orphanCleanupItems}
        selected={orphanCleanupSelected}
        error={orphanCleanupError}
        status={orphanCleanupStatus}
        onClose={() => setOrphanCleanupOpen(false)}
        onRescan={() => {
          void openOrphanCleanupDialog();
        }}
        onDeleteSelected={() => {
          void deleteOrphanCleanupSelection();
        }}
        onSetSelectionAll={setOrphanSelectionAll}
        onToggleSelection={toggleOrphanSelection}
      />
      <UserEntryModal
        open={userEntryModalOpen}
        usersSaving={usersSaving}
        usersEditorMode={usersEditorMode}
        editingUsername={editingUsername}
        userForm={userForm}
        setUserForm={setUserForm}
        onClose={closeUserEntryModal}
        onApply={applyUserEditor}
      />
      <HistoryModal
        open={historyOpen}
        restoreBusy={historyRestoreBusy}
        historyLoading={historyLoading}
        historyDiffLoading={historyDiffLoading}
        historyError={historyError}
        historyStatus={historyStatus}
        historyScopePath={historyScopePath}
        historyScopeIsDir={historyScopeIsDir}
        historyOpenIntent={historyOpenIntent}
        historyAgainstCurrent={historyAgainstCurrent}
        historyCommits={historyCommits}
        historySelectedSha={historySelectedSha}
        historySelectedCommit={historySelectedCommit}
        historyDisplayedFiles={historyDisplayedFiles}
        historyDiff={historyDiff}
        onClose={() => setHistoryOpen(false)}
        onSetAgainstCurrent={setHistoryAgainstCurrent}
        onRefresh={() => {
          void fetchHistoryCommits(historyScopePath, true);
        }}
        onRestorePath={() => {
          void restoreHistoryPath();
        }}
        onRestoreWorkspace={() => {
          void restoreHistoryWorkspace();
        }}
        onSelectCommit={setHistorySelectedSha}
      />
      <LeaveGuardModal
        open={leaveGuardOpen}
        saveInProgress={saveInProgress}
        leaveGuardMessage={leaveGuardMessage}
        lastSaveAckAt={lastSaveAckAt}
        onSaveAndLeave={() => {
          void saveAndExecutePendingLeaveAction();
        }}
        onCancel={cancelPendingLeaveAction}
      />
      <WorkspacePanelOverlays
        contextMenu={contextMenu}
        setContextMenu={setContextMenu}
        createFile={createFile}
        createDirectory={createDirectory}
        renameFile={renameFile}
        downloadFile={downloadFile}
        deleteFile={deleteFile}
        openHistoryForPath={(path: string, isDir: boolean) => {
          openHistory(path, isDir, "history");
        }}
        openDiffCurrentForPath={(path: string, isDir: boolean) => {
          openHistory(path, isDir, "diff-current");
        }}
        openRestoreForPath={(path: string, isDir: boolean) => {
          openHistory(path, isDir, "restore");
        }}
        setMasterChangeOpen={setMasterChangeOpen}
        setMasterChangeMode={setMasterChangeMode}
        setMasterChangeError={setMasterChangeError}
        setKeyPassphraseModal={setKeyPassphraseModal}
        setKeyPassphraseError={setKeyPassphraseError}
        editorMenu={editorMenu}
        setEditorMenu={setEditorMenu}
        openVaultValueModal={openVaultValueModal}
        kdbxPromptOpen={kdbxPromptOpen}
        handleKdbxSubmit={handleKdbxSubmit}
        setKdbxPromptOpen={setKdbxPromptOpen}
        setEditorLoading={setEditorLoading}
        vaultPromptOpen={vaultPromptOpen}
        vaultPromptConfirm={vaultPromptConfirm}
        handleVaultPromptSubmit={handleVaultPromptSubmit}
        setVaultPromptOpen={setVaultPromptOpen}
        setVaultPromptMode={setVaultPromptMode}
        setPendingCredentials={setPendingCredentials}
        masterChangeOpen={masterChangeOpen}
        masterChangeMode={masterChangeMode}
        masterChangeValues={masterChangeValues}
        setMasterChangeValues={setMasterChangeValues}
        masterChangeError={masterChangeError}
        submitMasterChange={submitMasterChange}
        masterChangeBusy={masterChangeBusy}
        keyPassphraseModal={keyPassphraseModal}
        keyPassphraseValues={keyPassphraseValues}
        setKeyPassphraseValues={setKeyPassphraseValues}
        keyPassphraseError={keyPassphraseError}
        submitKeyPassphraseChange={submitKeyPassphraseChange}
        keyPassphraseBusy={keyPassphraseBusy}
        vaultValueModal={vaultValueModal}
        setVaultValueModal={setVaultValueModal}
        vaultValueInputs={vaultValueInputs}
        setVaultValueInputs={setVaultValueInputs}
        submitVaultValue={submitVaultValue}
      />
    </>
  );
}
