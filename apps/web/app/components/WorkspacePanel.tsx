"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import type { ChangeEvent } from "react";
import { createPortal } from "react-dom";
import { json as jsonLang } from "@codemirror/lang-json";
import { yaml as yamlLang } from "@codemirror/lang-yaml";
import { python as pythonLang } from "@codemirror/lang-python";
import { EditorView } from "@codemirror/view";
import YAML from "yaml";
import { marked } from "marked";
import TurndownService from "turndown";
import WorkspaceSwitcher from "./workspace-panel/WorkspaceSwitcher";
import WorkspacePanelHeader from "./workspace-panel/WorkspacePanelHeader";
import WorkspacePanelOverlays from "./workspace-panel/WorkspacePanelOverlays";
import WorkspacePanelCards from "./workspace-panel/WorkspacePanelCards";
import WorkspacePanelFileEditor from "./workspace-panel/WorkspacePanelFileEditor";
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
  extractRolesByAlias,
  normalizeRoles,
  rolesByAliasKey,
  sanitizeAliasFilename,
  pickHostVarsPath,
} from "./workspace-panel/utils";
import type {
  FileEntry,
  KdbxEntryView,
  VaultBlock,
  WorkspaceListEntry,
  WorkspacePanelProps,
} from "./workspace-panel/types";

const USERS_GROUP_VARS_PATH = "group_vars/all.yml";
const PRICING_USERS_STORAGE_KEY = "infinito.pricing.users.v1";
const PRICING_USERS_UPDATED_EVENT = "infinito:pricing-users-updated";
const USERNAME_PATTERN = /^[a-z0-9]+$/;

type WorkspaceUser = {
  username: string;
  firstname: string;
  lastname: string;
  email?: string;
  password?: string;
  uid?: number;
  gid?: number;
  roles?: string[];
  tokens?: Record<string, unknown>;
  authorized_keys?: string[];
  reserved?: boolean;
  description?: string;
};

type WorkspaceUserForm = {
  username: string;
  firstname: string;
  lastname: string;
  email: string;
  password: string;
  uid: string;
  gid: string;
  roles: string;
  tokens: string;
  authorized_keys: string;
  reserved: "" | "true" | "false";
  description: string;
};

type UsersAction =
  | "overview"
  | "add"
  | "import-csv"
  | "import-yaml"
  | "export-csv"
  | "export-yaml";

type HistoryOpenIntent = "history" | "diff-current" | "restore";

type WorkspaceHistoryFileChange = {
  status: string;
  path: string;
  old_path?: string | null;
};

type WorkspaceHistoryCommit = {
  sha: string;
  created_at?: string | null;
  summary: string;
  files: WorkspaceHistoryFileChange[];
};

const USER_CSV_HEADERS = [
  "username",
  "firstname",
  "lastname",
  "email",
  "password",
  "uid",
  "gid",
  "roles",
  "tokens",
  "authorized_keys",
  "reserved",
  "description",
];

function emptyUserForm(): WorkspaceUserForm {
  return {
    username: "",
    firstname: "",
    lastname: "",
    email: "",
    password: "",
    uid: "",
    gid: "",
    roles: "",
    tokens: "",
    authorized_keys: "",
    reserved: "",
    description: "",
  };
}

function userToForm(user: WorkspaceUser): WorkspaceUserForm {
  const reservedValue: "" | "true" | "false" =
    typeof user.reserved === "boolean"
      ? (String(user.reserved) as "true" | "false")
      : "";
  return {
    username: user.username,
    firstname: user.firstname,
    lastname: user.lastname,
    email: user.email ?? "",
    password: user.password ?? "",
    uid: user.uid !== undefined ? String(user.uid) : "",
    gid: user.gid !== undefined ? String(user.gid) : "",
    roles: user.roles ? user.roles.join(",") : "",
    tokens: user.tokens ? YAML.stringify(user.tokens).trim() : "",
    authorized_keys: user.authorized_keys ? user.authorized_keys.join("\n") : "",
    reserved: reservedValue,
    description: user.description ?? "",
  };
}

function asTrimmed(value: unknown): string {
  return String(value ?? "").trim();
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

function parseOptionalInt(value: unknown): number | undefined {
  const raw = asTrimmed(value);
  if (!raw) return undefined;
  const parsed = Number(raw);
  if (!Number.isFinite(parsed)) return undefined;
  const normalized = Math.floor(parsed);
  return normalized >= 0 ? normalized : undefined;
}

function parseStringList(value: unknown): string[] | undefined {
  if (Array.isArray(value)) {
    const values = value.map((entry) => asTrimmed(entry)).filter(Boolean);
    return values.length > 0 ? values : undefined;
  }
  const raw = asTrimmed(value);
  if (!raw) return undefined;
  try {
    const parsed = YAML.parse(raw);
    if (Array.isArray(parsed)) {
      const values = parsed.map((entry) => asTrimmed(entry)).filter(Boolean);
      return values.length > 0 ? values : undefined;
    }
  } catch {
    // fall back to separator parsing
  }
  const values = raw
    .split(/[\n,|]/g)
    .map((entry) => entry.trim())
    .filter(Boolean);
  return values.length > 0 ? values : undefined;
}

function parseOptionalObject(value: unknown): Record<string, unknown> | undefined {
  if (isRecord(value)) return { ...value };
  const raw = asTrimmed(value);
  if (!raw) return undefined;
  try {
    const parsed = YAML.parse(raw);
    if (isRecord(parsed)) return parsed;
  } catch {
    // not a valid object
  }
  return undefined;
}

function normalizeWorkspaceUser(
  value: unknown,
  fallbackUsername?: string
): WorkspaceUser | null {
  if (!isRecord(value)) return null;

  const username = asTrimmed(value.username ?? fallbackUsername).toLowerCase();
  const firstname = asTrimmed(value.firstname);
  const lastname = asTrimmed(value.lastname);
  if (!USERNAME_PATTERN.test(username) || !firstname || !lastname) return null;

  const user: WorkspaceUser = {
    username,
    firstname,
    lastname,
  };

  const email = asTrimmed(value.email);
  if (email) user.email = email;

  const password = asTrimmed(value.password);
  if (password) user.password = password;

  const uid = parseOptionalInt(value.uid);
  if (uid !== undefined) user.uid = uid;

  const gid = parseOptionalInt(value.gid);
  if (gid !== undefined) user.gid = gid;

  const roles = parseStringList(value.roles);
  if (roles?.length) user.roles = roles;

  const tokens = parseOptionalObject(value.tokens);
  if (tokens && Object.keys(tokens).length > 0) {
    user.tokens = tokens;
  }

  const authorizedKeys = parseStringList(
    value.authorized_keys ?? value.authorizedKeys
  );
  if (authorizedKeys?.length) user.authorized_keys = authorizedKeys;

  if (typeof value.reserved === "boolean") {
    user.reserved = value.reserved;
  } else {
    const reservedRaw = asTrimmed(value.reserved).toLowerCase();
    if (reservedRaw === "true") user.reserved = true;
    if (reservedRaw === "false") user.reserved = false;
  }

  const description = asTrimmed(value.description);
  if (description) user.description = description;

  return user;
}

function dedupeWorkspaceUsers(users: WorkspaceUser[]): WorkspaceUser[] {
  const next = new Map<string, WorkspaceUser>();
  users.forEach((user) => {
    if (!user.username) return;
    if (next.has(user.username)) {
      next.delete(user.username);
    }
    next.set(user.username, user);
  });
  return Array.from(next.values());
}

function extractWorkspaceUsers(value: unknown): WorkspaceUser[] {
  if (Array.isArray(value)) {
    return dedupeWorkspaceUsers(
      value
        .map((entry) => normalizeWorkspaceUser(entry))
        .filter((entry): entry is WorkspaceUser => Boolean(entry))
    );
  }

  if (!isRecord(value)) return [];

  if ("users" in value) {
    return extractWorkspaceUsers(value.users);
  }

  if ("username" in value || "firstname" in value || "lastname" in value) {
    const single = normalizeWorkspaceUser(value);
    return single ? [single] : [];
  }

  const users: WorkspaceUser[] = [];
  Object.entries(value).forEach(([username, entry]) => {
    if (!isRecord(entry)) return;
    const normalized = normalizeWorkspaceUser(
      { ...entry, username: entry.username ?? username },
      username
    );
    if (normalized) users.push(normalized);
  });
  return dedupeWorkspaceUsers(users);
}

function toYamlUserEntry(user: WorkspaceUser): Record<string, unknown> {
  const entry: Record<string, unknown> = {
    username: user.username,
    firstname: user.firstname,
    lastname: user.lastname,
  };
  if (user.email) entry.email = user.email;
  if (user.password) entry.password = user.password;
  if (user.uid !== undefined) entry.uid = user.uid;
  if (user.gid !== undefined) entry.gid = user.gid;
  if (user.roles && user.roles.length > 0) entry.roles = user.roles;
  if (user.tokens && Object.keys(user.tokens).length > 0) entry.tokens = user.tokens;
  if (user.authorized_keys && user.authorized_keys.length > 0) {
    entry.authorized_keys = user.authorized_keys;
  }
  if (typeof user.reserved === "boolean") entry.reserved = user.reserved;
  if (user.description) entry.description = user.description;
  return entry;
}

function escapeCsvCell(value: unknown): string {
  const text = String(value ?? "");
  if (/[",\n]/.test(text)) {
    return `"${text.replace(/"/g, "\"\"")}"`;
  }
  return text;
}

function parseCsvRows(content: string): string[][] {
  const rows: string[][] = [];
  let row: string[] = [];
  let cell = "";
  let inQuotes = false;

  for (let i = 0; i < content.length; i += 1) {
    const char = content[i];
    const next = content[i + 1];

    if (char === "\"") {
      if (inQuotes && next === "\"") {
        cell += "\"";
        i += 1;
      } else {
        inQuotes = !inQuotes;
      }
      continue;
    }

    if (!inQuotes && char === ",") {
      row.push(cell);
      cell = "";
      continue;
    }

    if (!inQuotes && (char === "\n" || char === "\r")) {
      if (char === "\r" && next === "\n") {
        i += 1;
      }
      row.push(cell);
      cell = "";
      rows.push(row);
      row = [];
      continue;
    }

    cell += char;
  }

  row.push(cell);
  rows.push(row);

  return rows
    .map((entries) => entries.map((entry) => entry.replace(/^\uFEFF/, "")))
    .filter((entries) => entries.some((entry) => asTrimmed(entry).length > 0));
}

function parseUsersFromCsv(content: string): WorkspaceUser[] {
  const rows = parseCsvRows(content);
  if (rows.length === 0) return [];

  const headers = rows[0].map((header) =>
    asTrimmed(header)
      .toLowerCase()
      .replace(/\s+/g, "_")
  );

  const users: WorkspaceUser[] = [];
  rows.slice(1).forEach((cells) => {
    const record: Record<string, unknown> = {};
    headers.forEach((header, index) => {
      if (!header) return;
      record[header] = cells[index] ?? "";
    });

    const user = normalizeWorkspaceUser({
      username: record.username ?? record.user ?? record.login,
      firstname: record.firstname ?? record.first_name,
      lastname: record.lastname ?? record.last_name,
      email: record.email,
      password: record.password,
      uid: record.uid,
      gid: record.gid,
      roles: record.roles,
      tokens: record.tokens,
      authorized_keys:
        record.authorized_keys ?? record.authorizedkeys ?? record.authorized_key,
      reserved: record.reserved,
      description: record.description,
    });
    if (user) users.push(user);
  });

  return dedupeWorkspaceUsers(users);
}

function usersToCsv(users: WorkspaceUser[]): string {
  const lines: string[] = [USER_CSV_HEADERS.join(",")];
  users.forEach((user) => {
    const row = [
      user.username,
      user.firstname,
      user.lastname,
      user.email ?? "",
      user.password ?? "",
      user.uid ?? "",
      user.gid ?? "",
      user.roles ? JSON.stringify(user.roles) : "",
      user.tokens ? JSON.stringify(user.tokens) : "",
      user.authorized_keys ? JSON.stringify(user.authorized_keys) : "",
      typeof user.reserved === "boolean" ? String(user.reserved) : "",
      user.description ?? "",
    ].map(escapeCsvCell);
    lines.push(row.join(","));
  });
  return lines.join("\n");
}

function syncPricingUsersStorage(users: WorkspaceUser[]) {
  if (typeof window === "undefined") return;
  const payload = users.map((user) => ({
    username: user.username,
    firstname: user.firstname,
    lastname: user.lastname,
    ...(user.email ? { email: user.email } : {}),
  }));
  window.localStorage.setItem(PRICING_USERS_STORAGE_KEY, JSON.stringify(payload));
  window.dispatchEvent(new Event(PRICING_USERS_UPDATED_EVENT));
}

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
  const [historyOpen, setHistoryOpen] = useState(false);
  const [historyLoading, setHistoryLoading] = useState(false);
  const [historyDiffLoading, setHistoryDiffLoading] = useState(false);
  const [historyRestoreBusy, setHistoryRestoreBusy] = useState(false);
  const [historyError, setHistoryError] = useState<string | null>(null);
  const [historyStatus, setHistoryStatus] = useState<string | null>(null);
  const [historyScopePath, setHistoryScopePath] = useState<string | null>(null);
  const [historyScopeIsDir, setHistoryScopeIsDir] = useState(false);
  const [historyOpenIntent, setHistoryOpenIntent] = useState<HistoryOpenIntent>("history");
  const [historyAgainstCurrent, setHistoryAgainstCurrent] = useState(false);
  const [historyCommits, setHistoryCommits] = useState<WorkspaceHistoryCommit[]>([]);
  const [historySelectedSha, setHistorySelectedSha] = useState<string | null>(null);
  const [historyDiff, setHistoryDiff] = useState("");
  const [historyDiffFiles, setHistoryDiffFiles] = useState<WorkspaceHistoryFileChange[]>([]);
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

  const [orphanCleanupOpen, setOrphanCleanupOpen] = useState(false);
  const [orphanCleanupLoading, setOrphanCleanupLoading] = useState(false);
  const [orphanCleanupBusy, setOrphanCleanupBusy] = useState(false);
  const [orphanCleanupItems, setOrphanCleanupItems] = useState<
    { path: string; alias: string; kind: "host_vars" | "ssh_key_private" | "ssh_key_public" }[]
  >([]);
  const [orphanCleanupSelected, setOrphanCleanupSelected] = useState<
    Record<string, boolean>
  >({});
  const [orphanCleanupError, setOrphanCleanupError] = useState<string | null>(null);
  const [orphanCleanupStatus, setOrphanCleanupStatus] = useState<string | null>(null);
  const [usersOverviewOpen, setUsersOverviewOpen] = useState(false);
  const [usersLoading, setUsersLoading] = useState(false);
  const [usersSaving, setUsersSaving] = useState(false);
  const [usersError, setUsersError] = useState<string | null>(null);
  const [usersStatus, setUsersStatus] = useState<string | null>(null);
  const [usersDraft, setUsersDraft] = useState<WorkspaceUser[]>([]);
  const [usersSelection, setUsersSelection] = useState<Record<string, boolean>>({});
  const [usersDoc, setUsersDoc] = useState<Record<string, unknown>>({});
  const [userForm, setUserForm] = useState<WorkspaceUserForm>(() => emptyUserForm());
  const [usersEditorMode, setUsersEditorMode] = useState<"create" | "edit">("create");
  const [editingUsername, setEditingUsername] = useState<string | null>(null);
  const [userEntryModalOpen, setUserEntryModalOpen] = useState(false);
  const usersImportInputRef = useRef<HTMLInputElement | null>(null);
  const usersImportFormatRef = useRef<"csv" | "yaml" | null>(null);

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
  const historySelectedCommit = useMemo(
    () => historyCommits.find((entry) => entry.sha === historySelectedSha) ?? null,
    [historyCommits, historySelectedSha]
  );
  const historyDisplayedFiles = useMemo(
    () =>
      historyDiffFiles.length > 0
        ? historyDiffFiles
        : historySelectedCommit?.files ?? [],
    [historyDiffFiles, historySelectedCommit]
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
    if (rolesByAliasKey(merged) !== rolesByAliasKey(selectedRolesByAlias)) {
      onSelectedRolesByAliasChange(merged);
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

  const collectOrphanCleanupItems = async () => {
    if (!workspaceId) {
      throw new Error("Workspace is not ready.");
    }

    const inventoryAliases = new Set<string>();
    if (files.some((entry) => entry.path === "inventory.yml")) {
      const res = await fetch(
        `${baseUrl}/api/workspaces/${workspaceId}/files/${encodePath("inventory.yml")}`,
        { cache: "no-store" }
      );
      if (!res.ok) {
        throw new Error(`Inventory read failed (HTTP ${res.status}).`);
      }
      const data = await res.json();
      const content = String(data?.content ?? "");
      const rolesByAlias = extractRolesByAlias(content);
      Object.keys(rolesByAlias).forEach((alias) => {
        const key = String(alias || "").trim();
        if (key) inventoryAliases.add(key);
      });
    }

    const items: {
      path: string;
      alias: string;
      kind: "host_vars" | "ssh_key_private" | "ssh_key_public";
    }[] = [];

    files.forEach((entry) => {
      if (entry.is_dir) return;
      const hostVarsMatch = entry.path.match(/^host_vars\/([^/]+)\.ya?ml$/i);
      if (hostVarsMatch) {
        const alias = String(hostVarsMatch[1] || "").trim();
        if (alias && !inventoryAliases.has(alias)) {
          items.push({ path: entry.path, alias, kind: "host_vars" });
        }
        return;
      }
      const keyMatch = entry.path.match(/^secrets\/ssh_keys\/([^/]+?)(\.pub)?$/i);
      if (keyMatch) {
        const alias = String(keyMatch[1] || "").trim();
        if (alias && !inventoryAliases.has(alias)) {
          items.push({
            path: entry.path,
            alias,
            kind: keyMatch[2] ? "ssh_key_public" : "ssh_key_private",
          });
        }
      }
    });

    items.sort((a, b) => a.path.localeCompare(b.path));
    return items;
  };

  const openOrphanCleanupDialog = async () => {
    if (!workspaceId) return;
    setOrphanCleanupOpen(true);
    setOrphanCleanupLoading(true);
    setOrphanCleanupError(null);
    setOrphanCleanupStatus(null);
    try {
      const items = await collectOrphanCleanupItems();
      setOrphanCleanupItems(items);
      const nextSelection: Record<string, boolean> = {};
      items.forEach((item) => {
        nextSelection[item.path] = true;
      });
      setOrphanCleanupSelected(nextSelection);
    } catch (err: any) {
      setOrphanCleanupItems([]);
      setOrphanCleanupSelected({});
      setOrphanCleanupError(
        err?.message ?? "Failed to detect orphan host_vars and SSH key files."
      );
    } finally {
      setOrphanCleanupLoading(false);
    }
  };

  const toggleOrphanSelection = (path: string, checked: boolean) => {
    setOrphanCleanupSelected((prev) => ({ ...prev, [path]: checked }));
  };

  const setOrphanSelectionAll = (checked: boolean) => {
    setOrphanCleanupSelected((prev) => {
      const next = { ...prev };
      orphanCleanupItems.forEach((item) => {
        next[item.path] = checked;
      });
      return next;
    });
  };

  const deleteOrphanCleanupSelection = async () => {
    if (!workspaceId) return;
    const selectedPaths = orphanCleanupItems
      .map((item) => item.path)
      .filter((path) => orphanCleanupSelected[path]);
    if (selectedPaths.length === 0) {
      setOrphanCleanupError("Select at least one file to delete.");
      return;
    }
    const confirmDelete = window.confirm(
      `Delete ${selectedPaths.length} orphan file(s)? This permanently removes host_vars and/or SSH key files from this workspace and cannot be undone.`
    );
    if (!confirmDelete) return;

    setOrphanCleanupBusy(true);
    setOrphanCleanupError(null);
    setOrphanCleanupStatus(null);
    try {
      for (const path of selectedPaths) {
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
            // ignore response parse errors
          }
          throw new Error(message);
        }
        if (activePath === path) {
          setActivePath(null);
          setEditorValue("");
          setEditorDirty(false);
        }
      }
      await refreshFiles(workspaceId);
      const nextItems = orphanCleanupItems.filter(
        (item) => !selectedPaths.includes(item.path)
      );
      setOrphanCleanupItems(nextItems);
      const nextSelection: Record<string, boolean> = {};
      nextItems.forEach((item) => {
        nextSelection[item.path] = true;
      });
      setOrphanCleanupSelected(nextSelection);
      setOrphanCleanupStatus(`Deleted ${selectedPaths.length} orphan file(s).`);
    } catch (err: any) {
      setOrphanCleanupError(
        err?.message ?? "Failed to delete orphan host_vars and SSH key files."
      );
    } finally {
      setOrphanCleanupBusy(false);
    }
  };

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

  const fetchHistoryCommits = useCallback(
    async (scopePath: string | null, preserveSelection = false) => {
      if (!workspaceId) return;
      setHistoryLoading(true);
      setHistoryError(null);
      try {
        const params = new URLSearchParams();
        params.set("limit", "200");
        if (scopePath) {
          params.set("path", scopePath);
        }
        const res = await fetch(
          `${baseUrl}/api/workspaces/${workspaceId}/history?${params.toString()}`,
          { cache: "no-store" }
        );
        if (!res.ok) {
          throw new Error(await readApiDetail(res));
        }
        const data = await res.json();
        const commits: WorkspaceHistoryCommit[] = Array.isArray(data?.commits)
          ? data.commits.map((item: any) => ({
              sha: String(item?.sha || ""),
              created_at: item?.created_at ? String(item.created_at) : null,
              summary: String(item?.summary || ""),
              files: Array.isArray(item?.files)
                ? item.files.map((file: any) => ({
                    status: String(file?.status || "M"),
                    path: String(file?.path || ""),
                    old_path: file?.old_path ? String(file.old_path) : null,
                  }))
                : [],
            }))
          : [];

        setHistoryCommits(commits.filter((entry) => entry.sha));
        setHistorySelectedSha((prev) => {
          if (
            preserveSelection &&
            prev &&
            commits.some((entry) => entry.sha === prev)
          ) {
            return prev;
          }
          return commits[0]?.sha ?? null;
        });
        if (commits.length === 0) {
          setHistoryDiff("");
          setHistoryDiffFiles([]);
        }
      } catch (err: any) {
        setHistoryCommits([]);
        setHistorySelectedSha(null);
        setHistoryDiff("");
        setHistoryDiffFiles([]);
        setHistoryError(err?.message ?? "Failed to load history.");
      } finally {
        setHistoryLoading(false);
      }
    },
    [baseUrl, readApiDetail, workspaceId]
  );

  const loadHistoryDiff = useCallback(
    async (sha: string, againstCurrent: boolean, scopePath: string | null) => {
      if (!workspaceId || !sha) return;
      setHistoryDiffLoading(true);
      setHistoryError(null);
      try {
        const params = new URLSearchParams();
        if (scopePath) {
          params.set("path", scopePath);
        }
        if (againstCurrent) {
          params.set("against_current", "true");
        }
        const query = params.toString();
        const res = await fetch(
          `${baseUrl}/api/workspaces/${workspaceId}/history/${encodeURIComponent(
            sha
          )}/diff${query ? `?${query}` : ""}`,
          { cache: "no-store" }
        );
        if (!res.ok) {
          throw new Error(await readApiDetail(res));
        }
        const data = await res.json();
        setHistoryDiff(String(data?.diff ?? ""));
        setHistoryDiffFiles(
          Array.isArray(data?.files)
            ? data.files.map((file: any) => ({
                status: String(file?.status || "M"),
                path: String(file?.path || ""),
                old_path: file?.old_path ? String(file.old_path) : null,
              }))
            : []
        );
      } catch (err: any) {
        setHistoryDiff("");
        setHistoryDiffFiles([]);
        setHistoryError(err?.message ?? "Failed to load diff.");
      } finally {
        setHistoryDiffLoading(false);
      }
    },
    [baseUrl, readApiDetail, workspaceId]
  );

  const openHistory = useCallback(
    (path: string | null = null, isDir = false, intent: HistoryOpenIntent = "history") => {
      const normalizedPath = String(path || "")
        .trim()
        .replace(/^\/+/, "");
      const nextPath = normalizedPath || null;
      setHistoryScopePath(nextPath);
      setHistoryScopeIsDir(Boolean(nextPath) && isDir);
      setHistoryOpenIntent(intent);
      setHistoryAgainstCurrent(intent === "diff-current");
      setHistoryError(null);
      setHistoryStatus(null);
      setHistoryOpen(true);
      void fetchHistoryCommits(nextPath, false);
    },
    [fetchHistoryCommits]
  );

  const restoreHistoryWorkspace = useCallback(async () => {
    if (!workspaceId || !historySelectedSha || historyRestoreBusy) return;
    const confirmed = window.confirm(
      `Restore entire workspace to commit ${historySelectedSha.slice(0, 12)}?`
    );
    if (!confirmed) return;

    setHistoryRestoreBusy(true);
    setHistoryError(null);
    setHistoryStatus(null);
    try {
      const res = await fetch(
        `${baseUrl}/api/workspaces/${workspaceId}/history/${encodeURIComponent(
          historySelectedSha
        )}/restore`,
        { method: "POST" }
      );
      if (!res.ok) {
        throw new Error(await readApiDetail(res));
      }
      await refreshFiles(workspaceId);
      if (activePath) {
        await loadFile(activePath);
      }
      setEditorDirty(false);
      setHistoryStatus("Workspace restored.");
      await fetchHistoryCommits(historyScopePath, true);
    } catch (err: any) {
      setHistoryError(err?.message ?? "Workspace restore failed.");
    } finally {
      setHistoryRestoreBusy(false);
    }
  }, [
    activePath,
    baseUrl,
    fetchHistoryCommits,
    historyRestoreBusy,
    historyScopePath,
    historySelectedSha,
    loadFile,
    readApiDetail,
    refreshFiles,
    workspaceId,
  ]);

  const restoreHistoryPath = useCallback(async () => {
    if (!workspaceId || !historySelectedSha || !historyScopePath || historyRestoreBusy) {
      return;
    }
    const label = historyScopeIsDir ? "folder" : "file";
    const confirmed = window.confirm(
      `Restore ${label} '${historyScopePath}' from commit ${historySelectedSha.slice(0, 12)}?`
    );
    if (!confirmed) return;

    setHistoryRestoreBusy(true);
    setHistoryError(null);
    setHistoryStatus(null);
    try {
      const res = await fetch(
        `${baseUrl}/api/workspaces/${workspaceId}/history/${encodeURIComponent(
          historySelectedSha
        )}/restore-file`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ path: historyScopePath }),
        }
      );
      if (!res.ok) {
        throw new Error(await readApiDetail(res));
      }
      await refreshFiles(workspaceId);
      if (activePath) {
        if (
          activePath === historyScopePath ||
          (historyScopeIsDir && activePath.startsWith(`${historyScopePath}/`))
        ) {
          await loadFile(activePath);
        }
      }
      setEditorDirty(false);
      setHistoryStatus(`${label[0].toUpperCase()}${label.slice(1)} restored.`);
      await fetchHistoryCommits(historyScopePath, true);
    } catch (err: any) {
      setHistoryError(err?.message ?? "Path restore failed.");
    } finally {
      setHistoryRestoreBusy(false);
    }
  }, [
    activePath,
    baseUrl,
    fetchHistoryCommits,
    historyRestoreBusy,
    historyScopeIsDir,
    historyScopePath,
    historySelectedSha,
    loadFile,
    readApiDetail,
    refreshFiles,
    workspaceId,
  ]);

  useEffect(() => {
    if (!historyOpen || !historySelectedSha) return;
    void loadHistoryDiff(historySelectedSha, historyAgainstCurrent, historyScopePath);
  }, [
    historyAgainstCurrent,
    historyOpen,
    historyScopePath,
    historySelectedSha,
    loadHistoryDiff,
  ]);

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

  const readWorkspaceUsers = async (): Promise<{
    doc: Record<string, unknown>;
    users: WorkspaceUser[];
  }> => {
    if (!workspaceId) {
      throw new Error("Workspace is not ready.");
    }
    const res = await fetch(
      `${baseUrl}/api/workspaces/${workspaceId}/files/${encodePath(USERS_GROUP_VARS_PATH)}`,
      { cache: "no-store" }
    );
    if (res.status === 404) {
      return { doc: {}, users: [] };
    }
    if (!res.ok) {
      throw new Error(await readApiDetail(res));
    }
    const data = await res.json();
    const content = String(data?.content ?? "");
    if (!content.trim()) {
      return { doc: {}, users: [] };
    }
    let parsed: unknown = {};
    try {
      parsed = YAML.parse(content) ?? {};
    } catch {
      throw new Error("group_vars/all.yml is not valid YAML.");
    }
    const doc = isRecord(parsed) ? { ...parsed } : {};
    return {
      doc,
      users: extractWorkspaceUsers(doc.users),
    };
  };

  const openUsersEditor = async (action: UsersAction = "overview") => {
    if (!workspaceId) return;
    setUsersOverviewOpen(action !== "add");
    setUsersLoading(true);
    setUsersSaving(false);
    setUsersError(null);
    setUsersStatus(null);
    setUsersEditorMode("create");
    setEditingUsername(null);
    setUserEntryModalOpen(false);
    setUserForm(emptyUserForm());
    try {
      const { doc, users } = await readWorkspaceUsers();
      setUsersDoc(doc);
      setUsersDraft(users);
      const nextSelection: Record<string, boolean> = {};
      users.forEach((user) => {
        nextSelection[user.username] = false;
      });
      setUsersSelection(nextSelection);
      syncPricingUsersStorage(users);
      if (action === "export-csv") {
        exportUsersCsv(users);
        setUsersStatus("Users exported as CSV.");
      } else if (action === "export-yaml") {
        exportUsersYaml(users);
        setUsersStatus("Users exported as YML.");
      } else if (action === "import-csv") {
        triggerUsersImport("csv");
      } else if (action === "import-yaml") {
        triggerUsersImport("yaml");
      } else if (action === "add") {
        startCreateUserEditor();
      }
    } catch (err: any) {
      setUsersDoc({});
      setUsersDraft([]);
      setUsersError(err?.message ?? "Failed to load users from group_vars/all.yml.");
    } finally {
      setUsersLoading(false);
    }
  };

  const closeUsersEditor = () => {
    if (usersSaving) return;
    setUsersOverviewOpen(false);
    setUsersLoading(false);
    setUsersError(null);
    setUsersStatus(null);
    setUsersEditorMode("create");
    setEditingUsername(null);
    setUserEntryModalOpen(false);
    setUserForm(emptyUserForm());
    usersImportFormatRef.current = null;
    if (usersImportInputRef.current) {
      usersImportInputRef.current.value = "";
    }
  };

  const startCreateUserEditor = () => {
    setUsersEditorMode("create");
    setEditingUsername(null);
    setUserForm(emptyUserForm());
    setUserEntryModalOpen(true);
    setUsersError(null);
    setUsersStatus("Create a new user.");
  };

  const startEditUserEditor = (username: string) => {
    const target = usersDraft.find((entry) => entry.username === username);
    if (!target) {
      setUsersError(`User '${username}' not found.`);
      return;
    }
    setUsersEditorMode("edit");
    setEditingUsername(target.username);
    setUserForm(userToForm(target));
    setUserEntryModalOpen(true);
    setUsersError(null);
    setUsersStatus(`Editing user '${target.username}'.`);
  };

  const closeUserEntryModal = () => {
    if (usersSaving) return;
    setUserEntryModalOpen(false);
  };

  const applyUserEditor = () => {
    const username = asTrimmed(userForm.username).toLowerCase();
    const firstname = asTrimmed(userForm.firstname);
    const lastname = asTrimmed(userForm.lastname);
    if (!USERNAME_PATTERN.test(username)) {
      setUsersError("Username must match a-z0-9.");
      return;
    }
    if (!firstname || !lastname) {
      setUsersError("Firstname and lastname are required.");
      return;
    }

    const email = asTrimmed(userForm.email);
    const password = asTrimmed(userForm.password);
    const uid = parseOptionalInt(userForm.uid);
    const gid = parseOptionalInt(userForm.gid);
    const roles = parseStringList(userForm.roles);
    const authorizedKeys = parseStringList(userForm.authorized_keys);
    const tokens = parseOptionalObject(userForm.tokens);
    if (asTrimmed(userForm.tokens) && !tokens) {
      setUsersError("Tokens must be a YAML/JSON object.");
      return;
    }
    const description = asTrimmed(userForm.description);

    const nextUser: WorkspaceUser = {
      username,
      firstname,
      lastname,
      ...(email ? { email } : {}),
      ...(password ? { password } : {}),
      ...(uid !== undefined ? { uid } : {}),
      ...(gid !== undefined ? { gid } : {}),
      ...(roles?.length ? { roles } : {}),
      ...(tokens ? { tokens } : {}),
      ...(authorizedKeys?.length ? { authorized_keys: authorizedKeys } : {}),
      ...(userForm.reserved === "true"
        ? { reserved: true }
        : userForm.reserved === "false"
          ? { reserved: false }
          : {}),
      ...(description ? { description } : {}),
    };

    const editingKey = usersEditorMode === "edit" ? editingUsername : null;
    if (editingKey) {
      if (
        username !== editingKey &&
        usersDraft.some((entry) => entry.username === username)
      ) {
        setUsersError(`User '${username}' already exists.`);
        return;
      }
    } else if (usersDraft.some((entry) => entry.username === username)) {
      setUsersError(`User '${username}' already exists.`);
      return;
    }

    let nextDraft: WorkspaceUser[];
    if (editingKey) {
      nextDraft = usersDraft.map((entry) =>
        entry.username === editingKey ? nextUser : entry
      );
      setUsersEditorMode("edit");
      setEditingUsername(nextUser.username);
      setUsersStatus(`User '${nextUser.username}' updated. Save to persist changes.`);
    } else {
      nextDraft = [...usersDraft, nextUser];
      setUsersEditorMode("create");
      setEditingUsername(null);
      setUserForm(emptyUserForm());
      setUsersStatus(`User '${nextUser.username}' added. Save to persist changes.`);
    }

    setUsersDraft(nextDraft);
    setUsersSelection((prev) => {
      const next = { ...prev };
      if (editingKey && editingKey !== nextUser.username) {
        delete next[editingKey];
      }
      if (!Object.prototype.hasOwnProperty.call(next, nextUser.username)) {
        next[nextUser.username] = false;
      }
      return next;
    });
    syncPricingUsersStorage(nextDraft);
    setUsersError(null);
    setUserEntryModalOpen(false);
  };

  const removeUserDraft = (username: string) => {
    setUsersDraft((prev) => {
      const next = prev.filter((entry) => entry.username !== username);
      syncPricingUsersStorage(next);
      return next;
    });
    setUsersSelection((prev) => {
      const next = { ...prev };
      delete next[username];
      return next;
    });
    setUsersError(null);
    setUsersStatus(`User '${username}' removed. Save to persist changes.`);
    if (editingUsername === username) {
      setUsersEditorMode("create");
      setEditingUsername(null);
      setUserForm(emptyUserForm());
      setUserEntryModalOpen(false);
    }
  };

  const toggleUserSelection = (username: string, checked: boolean) => {
    setUsersSelection((prev) => ({ ...prev, [username]: checked }));
  };

  const setUsersSelectionAll = (checked: boolean) => {
    setUsersSelection((prev) => {
      const next = { ...prev };
      usersDraft.forEach((user) => {
        next[user.username] = checked;
      });
      return next;
    });
  };

  const deleteSelectedUsers = () => {
    const selected = usersDraft
      .map((user) => user.username)
      .filter((username) => Boolean(usersSelection[username]));
    if (selected.length === 0) {
      setUsersError("No users selected.");
      return;
    }
    setUsersDraft((prev) => {
      const next = prev.filter((entry) => !selected.includes(entry.username));
      syncPricingUsersStorage(next);
      return next;
    });
    setUsersSelection((prev) => {
      const next = { ...prev };
      selected.forEach((username) => {
        delete next[username];
      });
      return next;
    });
    setUsersError(null);
    setUsersStatus(`${selected.length} user(s) removed. Save to persist changes.`);
    if (editingUsername && selected.includes(editingUsername)) {
      setUsersEditorMode("create");
      setEditingUsername(null);
      setUserForm(emptyUserForm());
      setUserEntryModalOpen(false);
    }
  };

  const triggerUsersImport = (format: "csv" | "yaml") => {
    usersImportFormatRef.current = format;
    window.setTimeout(() => {
      usersImportInputRef.current?.click();
    }, 0);
  };

  const handleUsersImportSelect = async (event: ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    event.target.value = "";
    if (!file) return;

    const fileName = file.name.toLowerCase();
    const format =
      usersImportFormatRef.current ||
      (fileName.endsWith(".csv") ? "csv" : "yaml");

    setUsersError(null);
    setUsersStatus(null);
    try {
      const text = await file.text();
      let importedUsers: WorkspaceUser[] = [];
      if (format === "csv") {
        importedUsers = parseUsersFromCsv(text);
      } else {
        const parsed = YAML.parse(text);
        if (isRecord(parsed) && "users" in parsed) {
          importedUsers = extractWorkspaceUsers(parsed.users);
        } else {
          importedUsers = extractWorkspaceUsers(parsed);
        }
      }
      const uniqueUsers = dedupeWorkspaceUsers(importedUsers);
      if (uniqueUsers.length === 0) {
        setUsersError("Import contains no valid users.");
        return;
      }
      setUsersDraft(uniqueUsers);
      const nextSelection: Record<string, boolean> = {};
      uniqueUsers.forEach((user) => {
        nextSelection[user.username] = false;
      });
      setUsersSelection(nextSelection);
      syncPricingUsersStorage(uniqueUsers);
      setUsersEditorMode("create");
      setEditingUsername(null);
      setUserForm(emptyUserForm());
      setUsersStatus(
        `Imported ${uniqueUsers.length} user(s). Save to write ${USERS_GROUP_VARS_PATH}.`
      );
    } catch {
      setUsersError("Failed to import users. Check file format.");
    } finally {
      usersImportFormatRef.current = null;
    }
  };

  const downloadUsersExport = (filename: string, content: string, mimeType: string) => {
    if (typeof window === "undefined") return;
    const blob = new Blob([content], { type: mimeType });
    const url = window.URL.createObjectURL(blob);
    const anchor = document.createElement("a");
    anchor.href = url;
    anchor.download = filename;
    document.body.appendChild(anchor);
    anchor.click();
    anchor.remove();
    window.setTimeout(() => {
      window.URL.revokeObjectURL(url);
    }, 0);
  };

  const exportUsersYaml = (users: WorkspaceUser[] = usersDraft) => {
    const yamlExport = YAML.stringify({
      users: users.map((user) => toYamlUserEntry(user)),
    });
    downloadUsersExport("users.yml", yamlExport, "application/x-yaml");
  };

  const exportUsersCsv = (users: WorkspaceUser[] = usersDraft) => {
    downloadUsersExport("users.csv", usersToCsv(users), "text/csv;charset=utf-8");
  };

  const saveWorkspaceUsers = async () => {
    if (!workspaceId) return;
    const uniqueUsers = dedupeWorkspaceUsers(
      usersDraft
        .map((entry) => normalizeWorkspaceUser(entry))
        .filter((entry): entry is WorkspaceUser => Boolean(entry))
    );
    const invalidCount = usersDraft.length - uniqueUsers.length;
    if (invalidCount > 0) {
      setUsersError("Fix invalid users first (username a-z0-9, firstname, lastname).");
      return;
    }

    const nextDoc = isRecord(usersDoc) ? { ...usersDoc } : {};
    nextDoc.users = uniqueUsers.map((entry) => toYamlUserEntry(entry));
    const content = YAML.stringify(nextDoc);

    setUsersSaving(true);
    setUsersError(null);
    setUsersStatus(null);
    try {
      const res = await fetch(
        `${baseUrl}/api/workspaces/${workspaceId}/files/${encodePath(USERS_GROUP_VARS_PATH)}`,
        {
          method: "PUT",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ content }),
        }
      );
      if (!res.ok) {
        throw new Error(await readApiDetail(res));
      }
      setUsersDoc(nextDoc);
      setUsersDraft(uniqueUsers);
      const nextSelection: Record<string, boolean> = {};
      uniqueUsers.forEach((user) => {
        nextSelection[user.username] = false;
      });
      setUsersSelection(nextSelection);
      syncPricingUsersStorage(uniqueUsers);
      await refreshFiles(workspaceId);
      setUsersStatus(`Saved ${uniqueUsers.length} user(s) to ${USERS_GROUP_VARS_PATH}.`);
    } catch (err: any) {
      setUsersError(err?.message ?? "Failed to save users.");
    } finally {
      setUsersSaving(false);
    }
  };

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

  const selectedUsersCount = usersDraft.reduce(
    (sum, user) => sum + (usersSelection[user.username] ? 1 : 0),
    0
  );

  const usersEditorOverrideContent = usersOverviewOpen ? (
    <div className={styles.usersEditorHost}>
      <div className={styles.usersEditorTopbar}>
        <span className={`text-body-secondary ${styles.usersHint}`}>
          Users overview from <code>{USERS_GROUP_VARS_PATH}</code>
        </span>
        <div className={styles.usersToolbar}>
          <button
            type="button"
            onClick={() => setUsersSelectionAll(true)}
            disabled={usersLoading || usersDraft.length === 0}
            className={styles.usersSecondaryButton}
          >
            Select all
          </button>
          <button
            type="button"
            onClick={() => setUsersSelectionAll(false)}
            disabled={usersLoading || usersDraft.length === 0}
            className={styles.usersSecondaryButton}
          >
            Deselect all
          </button>
          <button
            type="button"
            onClick={deleteSelectedUsers}
            disabled={usersLoading || usersSaving || selectedUsersCount === 0}
            className={styles.usersDeleteButton}
          >
            Delete selected ({selectedUsersCount})
          </button>
          <button
            type="button"
            onClick={() => {
              void saveWorkspaceUsers();
            }}
            disabled={usersLoading || usersSaving}
            className={styles.usersPrimaryButton}
          >
            {usersSaving ? "Saving..." : "Save users"}
          </button>
          <button
            type="button"
            onClick={closeUsersEditor}
            disabled={usersSaving}
            className={styles.usersSecondaryButton}
          >
            Close overview
          </button>
        </div>
      </div>

      {usersLoading ? (
        <p className={`text-body-secondary ${styles.usersHint}`}>Loading users...</p>
      ) : (
        <div className={styles.usersWorkspace}>
          <section className={styles.usersOverview}>
            <div className={styles.usersSectionHeader}>
              <h4 className={styles.usersSectionTitle}>Overview</h4>
              <button
                type="button"
                onClick={startCreateUserEditor}
                disabled={usersSaving}
                className={styles.usersSecondaryButton}
              >
                New
              </button>
            </div>
            <div className={styles.usersTableWrap}>
              {usersDraft.length === 0 ? (
                <p className={`text-body-secondary ${styles.usersHint}`}>No users added.</p>
              ) : (
                <table className={styles.usersTable}>
                  <thead>
                    <tr>
                      <th />
                      <th>Username</th>
                      <th>Firstname</th>
                      <th>Lastname</th>
                      <th>Email</th>
                      <th>Actions</th>
                    </tr>
                  </thead>
                  <tbody>
                    {usersDraft.map((user) => (
                      <tr key={user.username}>
                        <td>
                          <input
                            type="checkbox"
                            checked={Boolean(usersSelection[user.username])}
                            onChange={(event) =>
                              toggleUserSelection(user.username, event.target.checked)
                            }
                          />
                        </td>
                        <td>{user.username}</td>
                        <td>{user.firstname}</td>
                        <td>{user.lastname}</td>
                        <td>{user.email || "-"}</td>
                        <td>
                          <div className={styles.usersListActions}>
                            <button
                              type="button"
                              onClick={() => startEditUserEditor(user.username)}
                              disabled={usersSaving}
                              className={styles.usersSecondaryButton}
                            >
                              Edit
                            </button>
                            <button
                              type="button"
                              onClick={() => removeUserDraft(user.username)}
                              disabled={usersSaving}
                              className={styles.usersDeleteButton}
                            >
                              Delete
                            </button>
                          </div>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              )}
            </div>
          </section>

        </div>
      )}

      {usersError ? (
        <p className={`text-danger ${styles.usersMessage}`}>{usersError}</p>
      ) : null}
      {usersStatus ? (
        <p className={`text-success ${styles.usersMessage}`}>{usersStatus}</p>
      ) : null}
      <input
        ref={usersImportInputRef}
        type="file"
        accept=".csv,.yaml,.yml,text/csv,application/x-yaml,text/yaml"
        onChange={(event) => {
          void handleUsersImportSelect(event);
        }}
        className={styles.usersHiddenInput}
      />
    </div>
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
      {orphanCleanupOpen ? (
        <div
          onClick={() => {
            if (orphanCleanupBusy || orphanCleanupLoading) return;
            setOrphanCleanupOpen(false);
          }}
          className={styles.cleanupOverlay}
        >
          <div
            onClick={(event) => event.stopPropagation()}
            className={styles.cleanupModal}
          >
            <div className={styles.cleanupHeader}>
              <h3 className={styles.cleanupTitle}>Inventory cleanup</h3>
              <button
                type="button"
                onClick={() => {
                  if (orphanCleanupBusy || orphanCleanupLoading) return;
                  setOrphanCleanupOpen(false);
                }}
                className={styles.cleanupCloseButton}
              >
                Close
              </button>
            </div>
            <p className={`text-body-secondary ${styles.cleanupHint}`}>
              This scans for orphan `host_vars` and SSH key files that are not referenced
              by `inventory.yml`. Deleting removes them permanently.
            </p>
            {orphanCleanupLoading ? (
              <p className={`text-body-secondary ${styles.cleanupHint}`}>
                Scanning workspace files...
              </p>
            ) : orphanCleanupItems.length === 0 ? (
              <p className={`text-body-secondary ${styles.cleanupHint}`}>
                No orphan files found.
              </p>
            ) : (
              <>
                <div className={styles.cleanupToolbar}>
                  <button
                    type="button"
                    onClick={() => setOrphanSelectionAll(true)}
                    className={styles.cleanupActionButton}
                  >
                    Select all
                  </button>
                  <button
                    type="button"
                    onClick={() => setOrphanSelectionAll(false)}
                    className={styles.cleanupActionButton}
                  >
                    Deselect all
                  </button>
                </div>
                <div className={styles.cleanupList}>
                  {orphanCleanupItems.map((item) => (
                    <label key={item.path} className={styles.cleanupItem}>
                      <input
                        type="checkbox"
                        checked={Boolean(orphanCleanupSelected[item.path])}
                        onChange={(event) =>
                          toggleOrphanSelection(item.path, event.target.checked)
                        }
                      />
                      <span className={styles.cleanupItemMeta}>
                        <strong>{item.alias}</strong>
                        <code>{item.path}</code>
                      </span>
                    </label>
                  ))}
                </div>
              </>
            )}
            {orphanCleanupError ? (
              <p className={`text-danger ${styles.cleanupMessage}`}>{orphanCleanupError}</p>
            ) : null}
            {orphanCleanupStatus ? (
              <p className={`text-success ${styles.cleanupMessage}`}>{orphanCleanupStatus}</p>
            ) : null}
            <div className={styles.cleanupFooter}>
              <button
                type="button"
                onClick={() => {
                  void openOrphanCleanupDialog();
                }}
                disabled={orphanCleanupBusy || orphanCleanupLoading}
                className={styles.cleanupActionButton}
              >
                Rescan
              </button>
              <button
                type="button"
                onClick={() => {
                  void deleteOrphanCleanupSelection();
                }}
                disabled={orphanCleanupBusy || orphanCleanupLoading}
                className={styles.cleanupDeleteButton}
              >
                {orphanCleanupBusy ? "Deleting..." : "Delete selected"}
              </button>
            </div>
          </div>
        </div>
      ) : null}
      {userEntryModalOpen ? (
        <div
          className={styles.usersOverlay}
          onClick={closeUserEntryModal}
        >
          <div
            className={styles.usersModal}
            onClick={(event) => event.stopPropagation()}
          >
            <div className={styles.usersHeader}>
              <h3 className={styles.usersTitle}>
                {usersEditorMode === "edit" && editingUsername
                  ? `Edit user: ${editingUsername}`
                  : "Add user"}
              </h3>
              <button
                type="button"
                onClick={closeUserEntryModal}
                disabled={usersSaving}
                className={styles.usersSecondaryButton}
              >
                Close
              </button>
            </div>

            <div className={styles.usersFormGrid}>
              <label className={styles.usersField}>
                <span>Username* (a-z0-9)</span>
                <input
                  value={userForm.username}
                  onChange={(event) =>
                    setUserForm((prev) => ({
                      ...prev,
                      username: asTrimmed(event.target.value).toLowerCase(),
                    }))
                  }
                  className={styles.usersInput}
                  placeholder="admin"
                />
              </label>
              <label className={styles.usersField}>
                <span>Firstname*</span>
                <input
                  value={userForm.firstname}
                  onChange={(event) =>
                    setUserForm((prev) => ({ ...prev, firstname: event.target.value }))
                  }
                  className={styles.usersInput}
                  placeholder="Admin"
                />
              </label>
              <label className={styles.usersField}>
                <span>Lastname*</span>
                <input
                  value={userForm.lastname}
                  onChange={(event) =>
                    setUserForm((prev) => ({ ...prev, lastname: event.target.value }))
                  }
                  className={styles.usersInput}
                  placeholder="User"
                />
              </label>
              <label className={styles.usersField}>
                <span>Email (optional)</span>
                <input
                  value={userForm.email}
                  onChange={(event) =>
                    setUserForm((prev) => ({ ...prev, email: event.target.value }))
                  }
                  className={styles.usersInput}
                  placeholder="admin@example.org"
                />
              </label>
              <label className={styles.usersField}>
                <span>Password (optional)</span>
                <input
                  value={userForm.password}
                  onChange={(event) =>
                    setUserForm((prev) => ({ ...prev, password: event.target.value }))
                  }
                  className={styles.usersInput}
                  placeholder="{{ 42 | strong_password }}"
                />
              </label>
              <label className={styles.usersField}>
                <span>Reserved (optional)</span>
                <select
                  value={userForm.reserved}
                  onChange={(event) =>
                    setUserForm((prev) => ({
                      ...prev,
                      reserved: event.target.value as "" | "true" | "false",
                    }))
                  }
                  className={styles.usersInput}
                >
                  <option value="">not set</option>
                  <option value="true">true</option>
                  <option value="false">false</option>
                </select>
              </label>
              <label className={styles.usersField}>
                <span>UID (optional)</span>
                <input
                  value={userForm.uid}
                  onChange={(event) =>
                    setUserForm((prev) => ({ ...prev, uid: event.target.value }))
                  }
                  className={styles.usersInput}
                  placeholder="1028"
                />
              </label>
              <label className={styles.usersField}>
                <span>GID (optional)</span>
                <input
                  value={userForm.gid}
                  onChange={(event) =>
                    setUserForm((prev) => ({ ...prev, gid: event.target.value }))
                  }
                  className={styles.usersInput}
                  placeholder="1028"
                />
              </label>
              <label className={styles.usersField}>
                <span>Roles (optional)</span>
                <input
                  value={userForm.roles}
                  onChange={(event) =>
                    setUserForm((prev) => ({ ...prev, roles: event.target.value }))
                  }
                  className={styles.usersInput}
                  placeholder="role-a,role-b"
                />
              </label>
              <label className={`${styles.usersField} ${styles.usersFieldWide}`}>
                <span>Authorized keys (optional, one per line)</span>
                <textarea
                  rows={2}
                  value={userForm.authorized_keys}
                  onChange={(event) =>
                    setUserForm((prev) => ({
                      ...prev,
                      authorized_keys: event.target.value,
                    }))
                  }
                  className={styles.usersTextArea}
                />
              </label>
              <label className={`${styles.usersField} ${styles.usersFieldWide}`}>
                <span>Tokens (optional YAML/JSON object)</span>
                <textarea
                  rows={2}
                  value={userForm.tokens}
                  onChange={(event) =>
                    setUserForm((prev) => ({ ...prev, tokens: event.target.value }))
                  }
                  className={styles.usersTextArea}
                />
              </label>
              <label className={`${styles.usersField} ${styles.usersFieldWide}`}>
                <span>Description (optional)</span>
                <input
                  value={userForm.description}
                  onChange={(event) =>
                    setUserForm((prev) => ({ ...prev, description: event.target.value }))
                  }
                  className={styles.usersInput}
                  placeholder="Generic reserved username"
                />
              </label>
            </div>

            <div className={styles.usersFooter}>
              <button
                type="button"
                onClick={closeUserEntryModal}
                disabled={usersSaving}
                className={styles.usersSecondaryButton}
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={applyUserEditor}
                disabled={usersSaving}
                className={styles.usersPrimaryButton}
              >
                {usersEditorMode === "edit" ? "Apply changes" : "Add user"}
              </button>
            </div>
          </div>
        </div>
      ) : null}
      {historyOpen ? (
        <div
          className={styles.historyOverlay}
          onClick={() => {
            if (historyRestoreBusy) return;
            setHistoryOpen(false);
          }}
        >
          <div
            className={styles.historyModal}
            onClick={(event) => event.stopPropagation()}
          >
            <div className={styles.historyHeader}>
              <div>
                <h3 className={styles.historyTitle}>Workspace History</h3>
                <p className={`text-body-secondary ${styles.historyHint}`}>
                  {historyScopePath
                    ? `Scope: ${historyScopePath}${historyScopeIsDir ? " (recursive)" : ""}`
                    : "Scope: entire workspace"}
                </p>
              </div>
              <button
                type="button"
                onClick={() => setHistoryOpen(false)}
                disabled={historyRestoreBusy}
                className={styles.historyActionButton}
              >
                Close
              </button>
            </div>

            <div className={styles.historyToolbar}>
              <button
                type="button"
                onClick={() => setHistoryAgainstCurrent(false)}
                className={`${styles.historyActionButton} ${
                  !historyAgainstCurrent ? styles.historyActionButtonActive : ""
                }`}
              >
                Commit diff
              </button>
              <button
                type="button"
                onClick={() => setHistoryAgainstCurrent(true)}
                className={`${styles.historyActionButton} ${
                  historyAgainstCurrent ? styles.historyActionButtonActive : ""
                }`}
              >
                Diff vs current
              </button>
              <button
                type="button"
                onClick={() => {
                  void fetchHistoryCommits(historyScopePath, true);
                }}
                disabled={historyLoading}
                className={styles.historyActionButton}
              >
                {historyLoading ? "Refreshing..." : "Refresh"}
              </button>
              {historyScopePath ? (
                <button
                  type="button"
                  onClick={() => {
                    void restoreHistoryPath();
                  }}
                  disabled={!historySelectedSha || historyRestoreBusy}
                  className={styles.historyDangerButton}
                >
                  {historyRestoreBusy && historyOpenIntent === "restore"
                    ? "Restoring..."
                    : "Restore this"}
                </button>
              ) : null}
              <button
                type="button"
                onClick={() => {
                  void restoreHistoryWorkspace();
                }}
                disabled={!historySelectedSha || historyRestoreBusy}
                className={styles.historyDangerButton}
              >
                {historyRestoreBusy ? "Restoring..." : "Restore workspace"}
              </button>
            </div>

            {historyError ? (
              <p className={`text-danger ${styles.historyMessage}`}>{historyError}</p>
            ) : null}
            {historyStatus ? (
              <p className={`text-success ${styles.historyMessage}`}>{historyStatus}</p>
            ) : null}

            <div className={styles.historyBody}>
              <aside className={styles.historyCommitColumn}>
                {historyLoading ? (
                  <p className={`text-body-secondary ${styles.historyHint}`}>
                    Loading commits...
                  </p>
                ) : historyCommits.length === 0 ? (
                  <p className={`text-body-secondary ${styles.historyHint}`}>
                    No commits found for this scope.
                  </p>
                ) : (
                  <div className={styles.historyCommitList}>
                    {historyCommits.map((entry) => (
                      <button
                        key={entry.sha}
                        type="button"
                        onClick={() => setHistorySelectedSha(entry.sha)}
                        className={`${styles.historyCommitButton} ${
                          historySelectedSha === entry.sha
                            ? styles.historyCommitButtonActive
                            : ""
                        }`}
                      >
                        <span className={styles.historyCommitSummary}>{entry.summary}</span>
                        <span className={styles.historyCommitMeta}>
                          {entry.sha.slice(0, 12)}
                          {entry.created_at
                            ? ` • ${new Date(entry.created_at).toLocaleString()}`
                            : ""}
                        </span>
                      </button>
                    ))}
                  </div>
                )}
              </aside>

              <section className={styles.historyDiffColumn}>
                {historySelectedCommit ? (
                  <>
                    <div className={styles.historySelectedMeta}>
                      <strong>{historySelectedCommit.summary}</strong>
                      <span className={`text-body-secondary ${styles.historyHint}`}>
                        {historySelectedCommit.sha}
                      </span>
                    </div>
                    {historyDisplayedFiles.length > 0 ? (
                      <ul className={styles.historyFileList}>
                        {historyDisplayedFiles.map((file, index) => (
                          <li key={`${file.status}:${file.path}:${index}`}>
                            <code>{file.status}</code>{" "}
                            {file.old_path
                              ? `${file.old_path} -> ${file.path}`
                              : file.path}
                          </li>
                        ))}
                      </ul>
                    ) : (
                      <p className={`text-body-secondary ${styles.historyHint}`}>
                        No file-level changes in this view.
                      </p>
                    )}
                    <div className={styles.historyDiffWrap}>
                      {historyDiffLoading ? (
                        <p className={`text-body-secondary ${styles.historyHint}`}>
                          Loading diff...
                        </p>
                      ) : historyDiff ? (
                        <pre className={styles.historyDiffText}>{historyDiff}</pre>
                      ) : (
                        <p className={`text-body-secondary ${styles.historyHint}`}>
                          No diff output available.
                        </p>
                      )}
                    </div>
                  </>
                ) : (
                  <p className={`text-body-secondary ${styles.historyHint}`}>
                    Select a commit to inspect details.
                  </p>
                )}
              </section>
            </div>
          </div>
        </div>
      ) : null}
      {leaveGuardOpen ? (
        <div
          className={styles.leaveGuardOverlay}
          onClick={cancelPendingLeaveAction}
        >
          <div
            className={styles.leaveGuardModal}
            onClick={(event) => event.stopPropagation()}
          >
            <h3 className={styles.leaveGuardTitle}>Unsaved changes</h3>
            <p className={`text-body-secondary ${styles.leaveGuardHint}`}>
              {leaveGuardMessage || "Unsaved changes detected. Save and leave?"}
            </p>
            {lastSaveAckAt ? (
              <p className={`text-body-secondary ${styles.leaveGuardHint}`}>
                Last save acknowledged at {new Date(lastSaveAckAt).toLocaleTimeString()}.
              </p>
            ) : null}
            <div className={styles.leaveGuardActions}>
              <button
                type="button"
                onClick={() => {
                  void saveAndExecutePendingLeaveAction();
                }}
                disabled={saveInProgress}
                className={styles.leaveGuardSaveButton}
              >
                {saveInProgress ? "Saving..." : "Save and leave"}
              </button>
              <button
                type="button"
                onClick={cancelPendingLeaveAction}
                className={styles.leaveGuardCancelButton}
              >
                Cancel
              </button>
            </div>
          </div>
        </div>
      ) : null}
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
