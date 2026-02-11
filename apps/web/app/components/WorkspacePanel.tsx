"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import type { ChangeEvent, MouseEvent } from "react";
import CodeMirror from "@uiw/react-codemirror";
import { json as jsonLang } from "@codemirror/lang-json";
import { yaml as yamlLang } from "@codemirror/lang-yaml";
import { python as pythonLang } from "@codemirror/lang-python";
import YAML from "yaml";
import { marked } from "marked";
import TurndownService from "turndown";
import dynamic from "next/dynamic";

const ReactQuill = dynamic(() => import("react-quill"), { ssr: false });

type FileEntry = {
  path: string;
  is_dir: boolean;
  size?: number | null;
  modified_at?: string | null;
};

type CredentialsState = {
  alias: string;
  host: string;
  user: string;
  authMethod: string;
};

type WorkspacePanelProps = {
  baseUrl: string;
  selectedRolesByAlias: Record<string, string[]>;
  credentials: CredentialsState;
  onCredentialsPatch?: (patch: Partial<CredentialsState>) => void;
  onInventoryReadyChange?: (ready: boolean) => void;
  onSelectedRolesByAliasChange?: (rolesByAlias: Record<string, string[]>) => void;
  onWorkspaceIdChange?: (id: string | null) => void;
  aliasRenames?: { from: string; to: string }[];
  onAliasRenamesHandled?: (count: number) => void;
  selectionTouched?: boolean;
};

type TreeNode = {
  name: string;
  path: string;
  isDir: boolean;
  size?: number | null;
  children: Map<string, TreeNode>;
};

type TreeItem = {
  name: string;
  path: string;
  isDir: boolean;
  depth: number;
  size?: number | null;
};

const WORKSPACE_STORAGE_KEY = "infinito.workspace_id";

function buildTree(entries: FileEntry[]) {
  const root: TreeNode = {
    name: "",
    path: "",
    isDir: true,
    children: new Map(),
  };

  entries.forEach((entry) => {
    const parts = entry.path.split("/").filter(Boolean);
    let node = root;
    parts.forEach((part, idx) => {
      const isLast = idx === parts.length - 1;
      const nextPath = node.path ? `${node.path}/${part}` : part;
      let child = node.children.get(part);
      if (!child) {
        child = {
          name: part,
          path: nextPath,
          isDir: isLast ? entry.is_dir : true,
          size: isLast ? entry.size ?? null : null,
          children: new Map(),
        };
        node.children.set(part, child);
      } else if (isLast) {
        child.isDir = entry.is_dir;
        child.size = entry.size ?? null;
      }
      node = child;
    });
  });

  return root;
}

function flattenTree(root: TreeNode, openDirs: Set<string>) {
  const items: TreeItem[] = [];

  const walk = (node: TreeNode, depth: number) => {
    const children = Array.from(node.children.values()).sort((a, b) => {
      if (a.isDir !== b.isDir) return a.isDir ? -1 : 1;
      return a.name.localeCompare(b.name);
    });
    children.forEach((child) => {
      items.push({
        name: child.name,
        path: child.path,
        isDir: child.isDir,
        depth,
        size: child.size ?? null,
      });
      if (child.isDir && openDirs.has(child.path)) {
        walk(child, depth + 1);
      }
    });
  };

  walk(root, 0);
  return items;
}

function extensionForPath(path: string) {
  const lower = path.toLowerCase();
  if (lower.endsWith(".json")) return "json";
  if (lower.endsWith(".yml") || lower.endsWith(".yaml")) return "yaml";
  if (lower.endsWith(".md") || lower.endsWith(".markdown")) return "markdown";
  if (lower.endsWith(".py")) return "python";
  if (lower.endsWith(".sh") || lower.endsWith(".bash")) return "text";
  return "text";
}

function encodePath(path: string) {
  return path
    .split("/")
    .map((segment) => encodeURIComponent(segment))
    .join("/");
}

function hostVarsAliasesFromFiles(entries: FileEntry[]) {
  return entries
    .filter(
      (entry) =>
        entry.path.startsWith("host_vars/") &&
        !entry.is_dir &&
        (entry.path.endsWith(".yml") || entry.path.endsWith(".yaml"))
    )
    .map((entry) => entry.path.split("/").pop() || "")
    .map((name) => name.replace(/\.ya?ml$/i, ""))
    .map((alias) => alias.trim())
    .filter(Boolean);
}

function normalizeRoles(roles: string[]) {
  return roles.map((role) => role.trim()).filter(Boolean);
}

function rolesKey(roles: string[]) {
  return normalizeRoles(roles).sort().join("|");
}

function rolesByAliasKey(map: Record<string, string[]>) {
  const entries: Array<[string, string[]]> = Object.entries(map || {}).map(
    ([alias, roles]) => [
      alias,
      normalizeRoles(Array.isArray(roles) ? roles : []).sort(),
    ]
  );
  entries.sort(([a], [b]) => a.localeCompare(b));
  return JSON.stringify(entries);
}

function sanitizeAliasFilename(alias: string) {
  const cleaned = alias.trim().replace(/[^A-Za-z0-9._-]/g, "_");
  return cleaned || "host";
}

function pickHostVarsPath(entries: FileEntry[], alias: string) {
  const hostVars = entries.filter(
    (entry) =>
      entry.path.startsWith("host_vars/") &&
      (entry.path.endsWith(".yml") || entry.path.endsWith(".yaml"))
  );
  if (alias) {
    const candidate = `host_vars/${sanitizeAliasFilename(alias)}.yml`;
    if (hostVars.some((entry) => entry.path === candidate)) {
      return candidate;
    }
    return null;
  }
  const sorted = hostVars
    .map((entry) => entry.path)
    .sort((a, b) => a.localeCompare(b));
  return sorted[0] ?? null;
}

function extractRolesByAlias(content: string): Record<string, string[]> {
  const out: Record<string, string[]> = {};
  try {
    const data = YAML.parse(content) ?? {};
    const children = (data as any)?.all?.children;
    if (!children || typeof children !== "object") return out;
    Object.entries(children).forEach(([roleId, roleValue]) => {
      if (!roleId || typeof roleId !== "string") return;
      const hosts = (roleValue as any)?.hosts;
      if (!hosts || typeof hosts !== "object") return;
      Object.keys(hosts).forEach((alias) => {
        const trimmed = String(alias || "").trim();
        if (!trimmed) return;
        if (!out[trimmed]) out[trimmed] = [];
        out[trimmed].push(roleId);
      });
    });
  } catch {
    return out;
  }
  return out;
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
  selectionTouched,
}: WorkspacePanelProps) {
  const [workspaceId, setWorkspaceId] = useState<string | null>(null);
  const [workspaceError, setWorkspaceError] = useState<string | null>(null);
  const [workspaceLoading, setWorkspaceLoading] = useState(false);
  const [files, setFiles] = useState<FileEntry[]>([]);
  const [inventoryReady, setInventoryReady] = useState(false);

  const [activePath, setActivePath] = useState<string | null>(null);
  const [editorValue, setEditorValue] = useState("");
  const [editorDirty, setEditorDirty] = useState(false);
  const [editorLoading, setEditorLoading] = useState(false);
  const [editorError, setEditorError] = useState<string | null>(null);
  const [editorStatus, setEditorStatus] = useState<string | null>(null);
  const [markdownHtml, setMarkdownHtml] = useState("");

  const [openDirs, setOpenDirs] = useState<Set<string>>(new Set());

  const [vaultPassword, setVaultPassword] = useState("");
  const [allowEmptyPlain, setAllowEmptyPlain] = useState(false);
  const [forceOverwrite, setForceOverwrite] = useState(false);
  const [setValuesText, setSetValuesText] = useState("");
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
  const autoCredentialsKeyRef = useRef("");
  const hostVarsSyncRef = useRef(false);
  const inventorySeededRef = useRef(false);
  const markdownSyncRef = useRef(false);

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

  const activeRoles = useMemo(
    () => normalizeRoles(selectedRolesByAlias[activeAlias] ?? []),
    [selectedRolesByAlias, activeAlias]
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

  useEffect(() => {
    if (!onSelectedRolesByAliasChange) return;
    if (hostVarsAliases.length === 0) return;
    const merged = mergeRolesByAlias(selectedRolesByAlias);
    if (rolesByAliasKey(merged) !== rolesByAliasKey(selectedRolesByAlias)) {
      onSelectedRolesByAliasChange(merged);
    }
  }, [hostVarsAliases, onSelectedRolesByAliasChange, selectedRolesByAlias]);

  const syncInventoryReady = (nextFiles: FileEntry[]) => {
    const ready = nextFiles.some((f) => f.path === "inventory.yml");
    setInventoryReady(ready);
    onInventoryReadyChange?.(ready);
  };

  const mergeRolesByAlias = (
    incoming: Record<string, string[]>
  ): Record<string, string[]> => {
    const merged: Record<string, string[]> = {};
    Object.keys(selectedRolesByAlias || {}).forEach((alias) => {
      merged[alias] = incoming?.[alias] ? normalizeRoles(incoming[alias]) : [];
    });
    Object.entries(incoming || {}).forEach(([alias, roles]) => {
      if (!merged[alias]) {
        merged[alias] = normalizeRoles(roles || []);
      }
    });
    hostVarsAliases.forEach((alias) => {
      if (!merged[alias]) {
        merged[alias] = [];
      }
    });
    if (activeAlias && !merged[activeAlias]) {
      merged[activeAlias] = [];
    }
    return merged;
  };

  const refreshFiles = async (id: string) => {
    const res = await fetch(`${baseUrl}/api/workspaces/${id}/files`, {
      cache: "no-store",
    });
    if (!res.ok) {
      throw new Error(`HTTP ${res.status}`);
    }
    const data = await res.json();
    const nextFiles = Array.isArray(data?.files) ? data.files : [];
    setFiles(nextFiles);
    syncInventoryReady(nextFiles);
    if (openDirs.size === 0) {
      const dirs = new Set<string>(
        nextFiles
          .filter((f: FileEntry) => f.is_dir)
          .map((f: FileEntry) => f.path)
      );
      setOpenDirs(dirs);
    }
  };

  const readWorkspaceFile = async (path: string) => {
    if (!workspaceId) {
      throw new Error("workspace not ready");
    }
    const res = await fetch(
      `${baseUrl}/api/workspaces/${workspaceId}/files/${encodePath(path)}`,
      { cache: "no-store" }
    );
    if (!res.ok) {
      throw new Error(`HTTP ${res.status}`);
    }
    const data = await res.json();
    return String(data?.content ?? "");
  };

  const writeWorkspaceFile = async (path: string, content: string) => {
    if (!workspaceId) {
      throw new Error("workspace not ready");
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
      throw new Error(`HTTP ${res.status}`);
    }
  };

  const renameWorkspaceFile = async (path: string, newPath: string) => {
    if (!workspaceId) {
      throw new Error("workspace not ready");
    }
    const res = await fetch(
      `${baseUrl}/api/workspaces/${workspaceId}/files/${encodePath(path)}/rename`,
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ new_path: newPath }),
      }
    );
    if (!res.ok) {
      throw new Error(`HTTP ${res.status}`);
    }
  };

  const createWorkspace = async () => {
    setWorkspaceLoading(true);
    setWorkspaceError(null);
    try {
      const res = await fetch(`${baseUrl}/api/workspaces`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
      });
      if (!res.ok) {
        throw new Error(`HTTP ${res.status}`);
      }
      const data = await res.json();
      const id = String(data?.workspace_id ?? "");
      if (!id) {
        throw new Error("workspace id missing");
      }
      if (typeof window !== "undefined") {
        window.localStorage.setItem(WORKSPACE_STORAGE_KEY, id);
      }
      setWorkspaceId(id);
      onWorkspaceIdChange?.(id);
      await refreshFiles(id);
    } catch (err: any) {
      setWorkspaceError(err?.message ?? "failed to create workspace");
    } finally {
      setWorkspaceLoading(false);
    }
  };

  useEffect(() => {
    let alive = true;
    const init = async () => {
      setWorkspaceLoading(true);
      setWorkspaceError(null);
      try {
        let id: string | null = null;
        if (typeof window !== "undefined") {
          id = window.localStorage.getItem(WORKSPACE_STORAGE_KEY);
        }
        if (id) {
          try {
            await refreshFiles(id);
            if (alive) {
              setWorkspaceId(id);
              onWorkspaceIdChange?.(id);
            }
            return;
          } catch {
            if (typeof window !== "undefined") {
              window.localStorage.removeItem(WORKSPACE_STORAGE_KEY);
            }
          }
        }
        await createWorkspace();
      } catch (err: any) {
        if (alive) {
          setWorkspaceError(err?.message ?? "workspace init failed");
        }
      } finally {
        if (alive) setWorkspaceLoading(false);
      }
    };
    init();
    return () => {
      alive = false;
    };
  }, [baseUrl, onWorkspaceIdChange]);

  const toggleDir = (path: string) => {
    setOpenDirs((prev) => {
      const next = new Set(prev);
      if (next.has(path)) {
        next.delete(path);
      } else {
        next.add(path);
      }
      return next;
    });
  };

  const loadFile = async (path: string) => {
    if (!workspaceId) return;
    setEditorLoading(true);
    setEditorError(null);
    setEditorStatus(null);
    try {
      const res = await fetch(
        `${baseUrl}/api/workspaces/${workspaceId}/files/${encodePath(path)}`,
        { cache: "no-store" }
      );
      if (!res.ok) {
        throw new Error(`HTTP ${res.status}`);
      }
      const data = await res.json();
      setActivePath(path);
      setEditorValue(String(data?.content ?? ""));
      setEditorDirty(false);
    } catch (err: any) {
      setEditorError(err?.message ?? "failed to load file");
    } finally {
      setEditorLoading(false);
    }
  };

  const validateEditor = () => {
    if (!activePath) return null;
    const kind = extensionForPath(activePath);
    try {
      if (kind === "json") {
        JSON.parse(editorValue);
      } else if (kind === "yaml") {
        YAML.parse(editorValue);
      }
      return null;
    } catch (err: any) {
      return err?.message ?? "invalid content";
    }
  };

  const saveFile = async () => {
    if (!workspaceId || !activePath) return;
    const validationError = validateEditor();
    if (validationError) {
      setEditorError(validationError);
      return;
    }
    setEditorLoading(true);
    setEditorError(null);
    setEditorStatus(null);
    try {
      const res = await fetch(
        `${baseUrl}/api/workspaces/${workspaceId}/files/${encodePath(
          activePath
        )}`,
        {
          method: "PUT",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ content: editorValue }),
        }
      );
      if (!res.ok) {
        throw new Error(`HTTP ${res.status}`);
      }
      if (activePath === "inventory.yml") {
        inventorySeededRef.current = false;
      }
      setEditorDirty(false);
      setEditorStatus("Saved.");
      await refreshFiles(workspaceId);
      if (activePath === "inventory.yml" && onSelectedRolesByAliasChange) {
        const rolesByAlias = extractRolesByAlias(editorValue);
        const merged = mergeRolesByAlias(rolesByAlias);
        if (rolesByAliasKey(merged) !== rolesByAliasKey(selectedRolesByAlias)) {
          onSelectedRolesByAliasChange(merged);
        }
      }
    } catch (err: any) {
      setEditorError(err?.message ?? "failed to save");
    } finally {
      setEditorLoading(false);
    }
  };

  const canGenerate =
    !!workspaceId &&
    !inventoryReady &&
    activeAlias &&
    activeRoles.length > 0 &&
    credentials.host &&
    credentials.user;

  const generateInventory = async () => {
    if (!workspaceId || !canGenerate) return;
    setGenerateBusy(true);
    setInventorySyncError(null);
    try {
      const payload = {
        alias: activeAlias,
        host: credentials.host,
        user: credentials.user,
        auth_method: credentials.authMethod || null,
        selected_roles: activeRoles,
      };
      const res = await fetch(
        `${baseUrl}/api/workspaces/${workspaceId}/generate-inventory`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(payload),
        }
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
      await refreshFiles(workspaceId);
    } catch (err: any) {
      setInventorySyncError(
        err?.message
          ? `Inventory creation failed: ${err.message}`
          : "Inventory creation failed."
      );
    } finally {
      setGenerateBusy(false);
    }
  };

  const resolveTargetRoles = () => {
    if (credentialsScope === "single") {
      return credentialsRole ? [credentialsRole] : [];
    }
    return activeRoles;
  };

  const renameAliasInInventory = async (fromAlias: string, toAlias: string) => {
    if (!workspaceId || !inventoryReady) return;
    const content = await readWorkspaceFile("inventory.yml");
    const data = (YAML.parse(content) ?? {}) as Record<string, any>;
    const allNode = data.all && typeof data.all === "object" ? data.all : {};
    const childrenNode =
      allNode.children && typeof allNode.children === "object"
        ? allNode.children
        : {};

    let changed = false;
    const nextChildren: Record<string, any> = { ...childrenNode };

    Object.entries(childrenNode).forEach(([roleId, entryValue]) => {
      if (!entryValue || typeof entryValue !== "object") return;
      const entry = { ...(entryValue as Record<string, any>) };
      const hosts =
        entry.hosts && typeof entry.hosts === "object"
          ? { ...entry.hosts }
          : null;
      if (!hosts) return;
      if (!Object.prototype.hasOwnProperty.call(hosts, fromAlias)) return;
      if (!Object.prototype.hasOwnProperty.call(hosts, toAlias)) {
        hosts[toAlias] = hosts[fromAlias];
      }
      delete hosts[fromAlias];
      entry.hosts = hosts;
      nextChildren[roleId] = entry;
      changed = true;
    });

    if (!changed) return;

    const nextAll = { ...allNode, children: nextChildren };
    const nextData = { ...data, all: nextAll };
    const nextYaml = YAML.stringify(nextData);
    await writeWorkspaceFile("inventory.yml", nextYaml);
    if (activePath === "inventory.yml") {
      setEditorValue(nextYaml);
      setEditorDirty(false);
    }
  };

  const syncInventoryWithSelection = async () => {
    if (!workspaceId || !inventoryReady) return;
    if (!activeAlias) return;
    if (activePath === "inventory.yml" && editorDirty) return;

    try {
      if (inventorySyncError) {
        setInventorySyncError(null);
      }
      const content = await readWorkspaceFile("inventory.yml");
      const data = (YAML.parse(content) ?? {}) as Record<string, any>;
      const allNode =
        data.all && typeof data.all === "object" ? data.all : {};
      const childrenNode =
        allNode.children && typeof allNode.children === "object"
          ? allNode.children
          : {};

      const desiredRoles = new Set(activeRoles);
      let changed = false;
      const nextChildren: Record<string, any> = { ...childrenNode };

      activeRoles.forEach((roleId) => {
        const existing = childrenNode?.[roleId];
        const nextEntry =
          existing && typeof existing === "object" ? { ...existing } : {};
        const hosts =
          nextEntry.hosts && typeof nextEntry.hosts === "object"
            ? { ...nextEntry.hosts }
            : {};
        if (!hosts[activeAlias]) {
          hosts[activeAlias] = {};
          changed = true;
        }
        nextEntry.hosts = hosts;
        nextChildren[roleId] = nextEntry;
      });

      Object.keys(nextChildren).forEach((roleId) => {
        const entry = nextChildren[roleId];
        if (!entry || typeof entry !== "object") return;
        const hosts =
          entry.hosts && typeof entry.hosts === "object"
            ? { ...entry.hosts }
            : null;
        if (!hosts) return;
        if (desiredRoles.has(roleId)) return;
        if (Object.prototype.hasOwnProperty.call(hosts, activeAlias)) {
          delete hosts[activeAlias];
          changed = true;
        }
        if (Object.keys(hosts).length === 0) {
          delete nextChildren[roleId];
          changed = true;
        } else {
          nextChildren[roleId] = { ...entry, hosts };
        }
      });

      if (!changed) return;

      const nextAll = { ...allNode, children: nextChildren };
      const nextData = { ...data, all: nextAll };
      const nextYaml = YAML.stringify(nextData);

      await writeWorkspaceFile("inventory.yml", nextYaml);
      if (activePath === "inventory.yml") {
        setEditorValue(nextYaml);
        setEditorDirty(false);
      }
      await refreshFiles(workspaceId);
    } catch (err: any) {
      setInventorySyncError(
        err?.message
          ? `Inventory sync failed: ${err.message}`
          : "Inventory sync failed."
      );
    }
  };

  const syncSelectionFromInventory = async () => {
    if (
      !workspaceId ||
      !inventoryReady ||
      !onSelectedRolesByAliasChange ||
      (activePath === "inventory.yml" && editorDirty)
    )
      return;

    try {
      const content = await readWorkspaceFile("inventory.yml");
      const rolesByAlias = extractRolesByAlias(content);
      const merged = mergeRolesByAlias(rolesByAlias);
      if (rolesByAliasKey(merged) !== rolesByAliasKey(selectedRolesByAlias)) {
        onSelectedRolesByAliasChange(merged);
      }
    } catch {
      // ignore
    }
  };

  const syncHostVarsFromCredentials = async () => {
    if (!workspaceId) return;
    if (hostVarsSyncRef.current) return;
    if (!activeAlias) return;
    const host = credentials.host?.trim() || "";
    const user = credentials.user?.trim() || "";
    const targetPath =
      hostVarsPath ||
      (activeAlias
        ? `host_vars/${sanitizeAliasFilename(activeAlias)}.yml`
        : null);
    if (!targetPath) return;
    if (activePath === targetPath && editorDirty) return;
    if (!host && !user) return;

    try {
      let data: Record<string, any> = {};
      try {
        const content = await readWorkspaceFile(targetPath);
        data = (YAML.parse(content) ?? {}) as Record<string, any>;
      } catch {
        data = {};
      }
      let changed = false;
      if (host && data.ansible_host !== host) {
        data.ansible_host = host;
        changed = true;
      }
      if (user && data.ansible_user !== user) {
        data.ansible_user = user;
        changed = true;
      }
      if (!changed) return;
      const nextYaml = YAML.stringify(data);
      hostVarsSyncRef.current = true;
      await writeWorkspaceFile(targetPath, nextYaml);
      if (activePath === targetPath) {
        setEditorValue(nextYaml);
        setEditorDirty(false);
      }
      await refreshFiles(workspaceId);
    } catch {
      // ignore
    } finally {
      hostVarsSyncRef.current = false;
    }
  };

  const syncCredentialsFromHostVars = async () => {
    if (!workspaceId || !hostVarsPath) return;
    if (!onCredentialsPatch) return;
    if (hostVarsSyncRef.current) return;
    if (activePath === hostVarsPath && editorDirty) return;
    try {
      const content = await readWorkspaceFile(hostVarsPath);
      const data = (YAML.parse(content) ?? {}) as Record<string, any>;
      const nextHost =
        typeof data.ansible_host === "string" ? data.ansible_host : "";
      const nextUser =
        typeof data.ansible_user === "string" ? data.ansible_user : "";
      const patch: Partial<CredentialsState> = {};
      if (nextHost && nextHost !== credentials.host) {
        patch.host = nextHost;
      }
      if (nextUser && nextUser !== credentials.user) {
        patch.user = nextUser;
      }
      if (Object.keys(patch).length > 0) {
        onCredentialsPatch(patch);
      }
    } catch {
      // ignore
    }
  };

  const postCredentials = async (
    targetRoles: string[],
    force: boolean,
    setValues: string[]
  ) => {
    if (!workspaceId || !vaultPassword || credentialsBusy) return;
    setCredentialsBusy(true);
    setCredentialsError(null);
    setCredentialsStatus(null);
    try {
      const res = await fetch(
        `${baseUrl}/api/workspaces/${workspaceId}/credentials`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            vault_password: vaultPassword,
            selected_roles: targetRoles,
            allow_empty_plain: allowEmptyPlain,
            set_values: setValues.length > 0 ? setValues : undefined,
            force,
            alias: activeAlias || undefined,
          }),
        }
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
      setCredentialsStatus("Credentials generated.");
      await refreshFiles(workspaceId);
    } catch (err: any) {
      setCredentialsError(err?.message ?? "credential generation failed");
    } finally {
      setCredentialsBusy(false);
    }
  };

  const generateCredentials = async () => {
    if (!workspaceId || !vaultPassword || credentialsBusy) return;
    const targetRoles = resolveTargetRoles();
    if (targetRoles.length === 0) {
      setCredentialsError("Select a role to generate credentials.");
      return;
    }
    const setValues =
      credentialsScope === "single"
        ? setValuesText
            .split(/[\n,]+/)
            .map((value) => value.trim())
            .filter(Boolean)
        : [];
    autoCredentialsKeyRef.current = [
      "auto",
      activeAlias || "",
      rolesKey(targetRoles),
      allowEmptyPlain ? "1" : "0",
      forceOverwrite ? "1" : "0",
      setValues.join(","),
    ].join("|");
    await postCredentials(targetRoles, forceOverwrite, setValues);
  };

  useEffect(() => {
    if (!workspaceId) return;
    if (autoSyncRef.current) return;
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
        await syncInventoryWithSelection();
      } finally {
        autoSyncRef.current = false;
      }
    };

    run();
  }, [
    workspaceId,
    inventoryReady,
    canGenerate,
    generateBusy,
    workspaceLoading,
    activeRoles,
    activeAlias,
    activePath,
    editorDirty,
  ]);

  useEffect(() => {
    if (!workspaceId || !inventoryReady) return;
    if (!onSelectedRolesByAliasChange) return;
    if (autoSyncRef.current) return;
    if (activePath === "inventory.yml" && editorDirty) return;

    const run = async () => {
      autoSyncRef.current = true;
      try {
        await syncSelectionFromInventory();
      } finally {
        autoSyncRef.current = false;
        inventorySeededRef.current = true;
      }
    };

    void run();
  }, [
    workspaceId,
    inventoryReady,
    inventoryModifiedAt,
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
        const fromPath = `host_vars/${sanitizeAliasFilename(from)}.yml`;
        const toPath = `host_vars/${sanitizeAliasFilename(to)}.yml`;
        const fromExists = files.some((entry) => entry.path === fromPath);
        const toExists = files.some((entry) => entry.path === toPath);
        if (fromExists && !toExists) {
          await renameWorkspaceFile(fromPath, toPath);
          if (activePath === fromPath) {
            setActivePath(toPath);
          }
        }
        await refreshFiles(workspaceId);
      } catch (err: any) {
        setInventorySyncError(
          err?.message
            ? `Alias rename failed: ${err.message}`
            : "Alias rename failed."
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
    void syncHostVarsFromCredentials();
  }, [
    workspaceId,
    credentials.host,
    credentials.user,
    hostVarsPath,
    activePath,
    editorDirty,
  ]);

  useEffect(() => {
    if (!workspaceId) return;
    void syncCredentialsFromHostVars();
  }, [
    workspaceId,
    hostVarsPath,
    hostVarsModifiedAt,
    activePath,
    editorDirty,
  ]);

  useEffect(() => {
    if (!inventoryReady || !workspaceId || credentialsBusy) return;
    if (!vaultPassword) return;

    const targetRoles = resolveTargetRoles();
    if (targetRoles.length === 0) return;

    const setValues =
      credentialsScope === "single"
        ? setValuesText
            .split(/[\n,]+/)
            .map((value) => value.trim())
            .filter(Boolean)
        : [];

    const key = [
      "auto",
      activeAlias || "",
      rolesKey(targetRoles),
      allowEmptyPlain ? "1" : "0",
      forceOverwrite ? "1" : "0",
      setValues.join(","),
    ].join("|");

    if (autoCredentialsKeyRef.current === key) return;
    autoCredentialsKeyRef.current = key;

    void postCredentials(targetRoles, forceOverwrite, setValues);
  }, [
    inventoryReady,
    workspaceId,
    vaultPassword,
    credentialsBusy,
    activeRoles,
    activeAlias,
    credentialsScope,
    credentialsRole,
    allowEmptyPlain,
    forceOverwrite,
    setValuesText,
  ]);

  const canGenerateCredentials =
    inventoryReady &&
    !!vaultPassword &&
    !credentialsBusy &&
    (credentialsScope === "all"
      ? activeRoles.length > 0
      : !!credentialsRole);

  const downloadZip = async () => {
    if (!workspaceId) return;
    setZipBusy(true);
    setZipError(null);
    try {
      const res = await fetch(
        `${baseUrl}/api/workspaces/${workspaceId}/download.zip`
      );
      if (!res.ok) {
        throw new Error(`HTTP ${res.status}`);
      }
      const blob = await res.blob();
      const url = window.URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = `workspace-${workspaceId}.zip`;
      document.body.appendChild(a);
      a.click();
      a.remove();
      window.URL.revokeObjectURL(url);
    } catch (err: any) {
      setZipError(err?.message ?? "failed to download zip");
    } finally {
      setZipBusy(false);
    }
  };

  const uploadZip = async (file: File) => {
    if (!workspaceId || uploadBusy) return;
    const name = file?.name || "";
    if (!name.toLowerCase().endsWith(".zip")) {
      setUploadError("Please select a .zip file.");
      return;
    }
    setUploadBusy(true);
    setUploadError(null);
    setUploadStatus(null);
    try {
      const form = new FormData();
      form.append("file", file);
      const res = await fetch(
        `${baseUrl}/api/workspaces/${workspaceId}/upload.zip`,
        {
          method: "POST",
          body: form,
        }
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
      setUploadStatus("Workspace loaded.");
      await refreshFiles(workspaceId);
    } catch (err: any) {
      setUploadError(err?.message ?? "failed to upload zip");
    } finally {
      setUploadBusy(false);
    }
  };

  const onUploadSelect = (event: ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (file) {
      void uploadZip(file);
    }
    event.target.value = "";
  };

  const openUploadPicker = () => {
    uploadInputRef.current?.click();
  };

  const createFile = async (baseDir?: string) => {
    if (!workspaceId) return;
    const prefix = baseDir ? `${baseDir}/` : "";
    const input = window.prompt("Create file", prefix);
    if (!input) return;
    const raw = input.trim().replace(/^\/+/, "");
    if (!raw || raw.endsWith("/")) {
      setFileOpError("Provide a valid file path.");
      return;
    }
    const finalPath =
      baseDir && !raw.includes("/") ? `${baseDir}/${raw}` : raw;

    setFileOpError(null);
    try {
      const res = await fetch(
        `${baseUrl}/api/workspaces/${workspaceId}/files/${encodePath(finalPath)}`,
        {
          method: "PUT",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ content: "" }),
        }
      );
      if (!res.ok) {
        throw new Error(`HTTP ${res.status}`);
      }
      await refreshFiles(workspaceId);
      await loadFile(finalPath);
    } catch (err: any) {
      setFileOpError(err?.message ?? "failed to create file");
    }
  };

  const createDirectory = async (baseDir?: string) => {
    if (!workspaceId) return;
    const prefix = baseDir ? `${baseDir}/` : "";
    const input = window.prompt("Create folder", prefix);
    if (!input) return;
    const raw = input.trim().replace(/^\/+/, "");
    if (!raw) {
      setFileOpError("Provide a valid folder path.");
      return;
    }
    const normalized = raw.replace(/\/+$/, "");
    const finalPath =
      baseDir && !normalized.includes("/")
        ? `${baseDir}/${normalized}`
        : normalized;

    setFileOpError(null);
    try {
      const res = await fetch(
        `${baseUrl}/api/workspaces/${workspaceId}/files/${encodePath(
          finalPath
        )}/mkdir`,
        { method: "POST" }
      );
      if (!res.ok) {
        throw new Error(`HTTP ${res.status}`);
      }
      await refreshFiles(workspaceId);
    } catch (err: any) {
      setFileOpError(err?.message ?? "failed to create folder");
    }
  };

  const renameFile = async (path: string, isDir = false) => {
    if (!workspaceId) return;
    const currentName = path.split("/").pop() || path;
    const nextName = window.prompt(
      isDir ? "Rename folder" : "Rename file",
      currentName
    );
    if (!nextName) return;
    const trimmed = nextName.trim();
    if (!trimmed) return;
    const dir = path.split("/").slice(0, -1).join("/");
    const normalized = trimmed.replace(/^\/+/, "");
    const nextPath = normalized.includes("/")
      ? normalized
      : dir
      ? `${dir}/${normalized}`
      : normalized;
    if (nextPath === path) return;

    setFileOpError(null);
    try {
      const res = await fetch(
        `${baseUrl}/api/workspaces/${workspaceId}/files/${encodePath(
          path
        )}/rename`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ new_path: nextPath }),
        }
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
      await refreshFiles(workspaceId);
      if (activePath === path) {
        await loadFile(nextPath);
      }
    } catch (err: any) {
      setFileOpError(err?.message ?? "failed to rename file");
    }
  };

  const deleteFile = async (path: string, isDir = false) => {
    if (!workspaceId) return;
    if (
      !window.confirm(
        isDir ? `Delete folder ${path}?` : `Delete file ${path}?`
      )
    )
      return;
    setFileOpError(null);
    try {
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
      if (
        activePath &&
        (activePath === path ||
          (isDir && activePath.startsWith(`${path}/`)))
      ) {
        setActivePath(null);
        setEditorValue("");
        setEditorDirty(false);
      }
      await refreshFiles(workspaceId);
    } catch (err: any) {
      setFileOpError(err?.message ?? "failed to delete file");
    }
  };

  const openContextMenu = (
    event: MouseEvent,
    path: string | null,
    isDir: boolean
  ) => {
    event.preventDefault();
    event.stopPropagation();
    setContextMenu({
      x: event.clientX,
      y: event.clientY,
      path: path ?? undefined,
      isDir,
    });
  };

  return (
    <>
      <section
        style={{
          marginTop: 28,
          padding: 24,
          borderRadius: 24,
          background: "var(--deployer-panel-workspace-bg)",
          border: "1px solid var(--bs-border-color-translucent)",
          boxShadow: "var(--deployer-shadow)",
        }}
      >
      <div style={{ display: "flex", flexWrap: "wrap", gap: 16 }}>
        <div style={{ flex: "1 1 320px" }}>
          <h2
            className="text-body"
            style={{
              margin: 0,
              fontFamily: "var(--font-display)",
              fontSize: 26,
              letterSpacing: "-0.02em",
            }}
          >
            Workspace & Files
          </h2>
          <p className="text-body-secondary" style={{ margin: "8px 0 0" }}>
            Step-by-step: select roles → edit files → generate credentials →
            export ZIP or deploy.
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
          Workspace:{" "}
          <strong>{workspaceId ? workspaceId : "creating..."}</strong>
          <br />
          Inventory:{" "}
          <strong>{inventoryReady ? "ready" : "not generated"}</strong>
        </div>
      </div>

      {workspaceError ? (
        <div className="text-danger" style={{ marginTop: 12, fontSize: 12 }}>
          {workspaceError}
        </div>
      ) : null}
      {inventorySyncError ? (
        <div className="text-danger" style={{ marginTop: 8, fontSize: 12 }}>
          {inventorySyncError}
        </div>
      ) : null}

      <div
        style={{
          marginTop: 18,
          display: "grid",
          gridTemplateColumns: "repeat(auto-fit, minmax(240px, 1fr))",
          gap: 16,
        }}
      >
        <div
          className="bg-body border"
          style={{
            padding: 16,
            borderRadius: 18,
          }}
        >
          <label className="text-body-tertiary" style={{ fontSize: 12 }}>
            Credentials
          </label>
          <div style={{ marginTop: 8, display: "flex", gap: 8 }}>
            <button
              onClick={generateCredentials}
              disabled={!canGenerateCredentials}
              style={{
                padding: "8px 12px",
                borderRadius: 999,
                border: "1px solid var(--bs-body-color)",
                background: canGenerateCredentials
                  ? "var(--bs-body-color)"
                  : "var(--deployer-disabled-bg)",
                color: canGenerateCredentials
                  ? "var(--bs-body-bg)"
                  : "var(--deployer-disabled-text)",
                cursor:
                  canGenerateCredentials ? "pointer" : "not-allowed",
                fontSize: 12,
              }}
            >
              {credentialsBusy ? "Working..." : "Generate credentials"}
            </button>
          </div>
          <div style={{ marginTop: 10, display: "grid", gap: 8 }}>
            <input
              type="password"
              value={vaultPassword}
              onChange={(e) => setVaultPassword(e.target.value)}
              placeholder="Vault password (never stored)"
              style={{
                padding: "8px 10px",
                borderRadius: 10,
                border: "1px solid var(--bs-border-color)",
                background: "var(--bs-body-bg)",
                fontSize: 12,
              }}
            />
            {credentialsScope === "single" ? (
              <input
                value={setValuesText}
                onChange={(e) => setSetValuesText(e.target.value)}
                placeholder="Optional --set values (key=value, comma or newline)"
                style={{
                  padding: "8px 10px",
                  borderRadius: 10,
                  border: "1px solid var(--bs-border-color)",
                  background: "var(--bs-body-bg)",
                  fontSize: 12,
                }}
              />
            ) : null}
            <div style={{ display: "grid", gap: 6 }}>
              <span className="text-body-tertiary" style={{ fontSize: 12 }}>
                Generate for
              </span>
              <label
                style={{
                  display: "flex",
                  alignItems: "center",
                  gap: 8,
                  fontSize: 12,
                }}
                className="text-body-secondary"
              >
                <input
                  type="radio"
                  name="credentials-scope"
                  checked={credentialsScope === "all"}
                  onChange={() => setCredentialsScope("all")}
                />
                All selected roles
              </label>
              <label
                style={{
                  display: "flex",
                  alignItems: "center",
                  gap: 8,
                  fontSize: 12,
                }}
                className="text-body-secondary"
              >
                <input
                  type="radio"
                  name="credentials-scope"
                  checked={credentialsScope === "single"}
                  onChange={() => setCredentialsScope("single")}
                />
                Single role
              </label>
              {credentialsScope === "single" ? (
                <select
                  value={credentialsRole}
                  onChange={(e) => setCredentialsRole(e.target.value)}
                  disabled={activeRoles.length === 0}
                  style={{
                    padding: "8px 10px",
                    borderRadius: 10,
                    border: "1px solid var(--bs-border-color)",
                    fontSize: 12,
                    background: activeRoles.length
                      ? "var(--bs-body-bg)"
                      : "var(--deployer-disabled-bg)",
                    color: activeRoles.length
                      ? "var(--bs-body-color)"
                      : "var(--deployer-disabled-text)",
                  }}
                >
                  {activeRoles.length === 0 ? (
                    <option value="">No roles selected</option>
                  ) : null}
                  {activeRoles.map((roleId) => (
                    <option key={roleId} value={roleId}>
                      {roleId}
                    </option>
                  ))}
                </select>
              ) : null}
            </div>
            <label
              style={{
                display: "flex",
                alignItems: "center",
                gap: 8,
                fontSize: 12,
              }}
              className="text-body-secondary"
            >
              <input
                type="checkbox"
                checked={allowEmptyPlain}
                onChange={(e) => setAllowEmptyPlain(e.target.checked)}
              />
              Allow empty plain values
            </label>
            <label
              style={{
                display: "flex",
                alignItems: "center",
                gap: 8,
                fontSize: 12,
              }}
              className="text-body-secondary"
            >
              <input
                type="checkbox"
                checked={forceOverwrite}
                onChange={(e) => setForceOverwrite(e.target.checked)}
              />
              Overwrite existing credentials
            </label>
            <span className="text-body-tertiary" style={{ fontSize: 11 }}>
              Auto sync runs when a vault password is set. Overwrite applies to
              both auto and manual runs.
            </span>
          </div>
          {credentialsError ? (
            <p className="text-danger" style={{ margin: "8px 0 0", fontSize: 12 }}>
              {credentialsError}
            </p>
          ) : null}
          {credentialsStatus ? (
            <p className="text-success" style={{ margin: "8px 0 0", fontSize: 12 }}>
              {credentialsStatus}
            </p>
          ) : null}
        </div>

        <div
          className="bg-body border"
          style={{
            padding: 16,
            borderRadius: 18,
          }}
        >
          <label className="text-body-tertiary" style={{ fontSize: 12 }}>
            Workspace import/export
          </label>
          <div style={{ marginTop: 8, display: "flex", gap: 8 }}>
            <button
              onClick={downloadZip}
              disabled={!workspaceId || zipBusy}
              style={{
                padding: "8px 12px",
                borderRadius: 999,
                border: "1px solid var(--bs-border-color)",
                background: "var(--bs-body-bg)",
                color: "var(--deployer-muted-ink)",
                cursor: workspaceId ? "pointer" : "not-allowed",
                fontSize: 12,
              }}
            >
              {zipBusy ? "Preparing..." : "Download ZIP"}
            </button>
            <button
              onClick={openUploadPicker}
              disabled={!workspaceId || uploadBusy}
              style={{
                padding: "8px 12px",
                borderRadius: 999,
                border: "1px solid var(--bs-body-color)",
                background: workspaceId
                  ? "var(--bs-body-color)"
                  : "var(--deployer-disabled-bg)",
                color: workspaceId
                  ? "var(--bs-body-bg)"
                  : "var(--deployer-disabled-text)",
                cursor: workspaceId ? "pointer" : "not-allowed",
                fontSize: 12,
              }}
            >
              {uploadBusy ? "Uploading..." : "Upload ZIP"}
            </button>
            <input
              ref={uploadInputRef}
              type="file"
              accept=".zip,application/zip"
              onChange={onUploadSelect}
              style={{ display: "none" }}
            />
          </div>
          {uploadError ? (
            <p className="text-danger" style={{ margin: "8px 0 0", fontSize: 12 }}>
              {uploadError}
            </p>
          ) : null}
          {zipError ? (
            <p className="text-danger" style={{ margin: "8px 0 0", fontSize: 12 }}>
              {zipError}
            </p>
          ) : null}
          {uploadStatus ? (
            <p className="text-success" style={{ margin: "8px 0 0", fontSize: 12 }}>
              {uploadStatus}
            </p>
          ) : null}
        </div>
      </div>

      <div
        style={{
          marginTop: 20,
          display: "grid",
          gridTemplateColumns: "minmax(200px, 1fr) minmax(320px, 2fr)",
          gap: 16,
        }}
      >
        <div
          className="bg-body border"
          style={{
            padding: 16,
            borderRadius: 18,
            minHeight: 320,
          }}
        >
          <label className="text-body-tertiary" style={{ fontSize: 12 }}>
            Files
          </label>
          <div className="text-body-tertiary" style={{ marginTop: 8, fontSize: 12 }}>
            Right-click to create files or folders.
          </div>
          <div
            style={{ marginTop: 8 }}
            onContextMenu={(event) => openContextMenu(event, null, false)}
          >
            {treeItems.length === 0 ? (
              <p className="text-body-tertiary" style={{ fontSize: 12 }}>
                No files yet. Inventory will appear once roles and host/user
                are set.
              </p>
            ) : (
              treeItems.map((item) => (
                <div
                  key={item.path}
                  onClick={() =>
                    item.isDir ? toggleDir(item.path) : loadFile(item.path)
                  }
                  onContextMenu={(event) => {
                    openContextMenu(event, item.path, item.isDir);
                  }}
                  style={{
                    display: "flex",
                    alignItems: "center",
                    gap: 6,
                    padding: "4px 6px",
                    marginLeft: item.depth * 12,
                    borderRadius: 8,
                    cursor: "pointer",
                    background:
                      !item.isDir && item.path === activePath
                        ? "var(--bs-body-color)"
                        : "transparent",
                    color:
                      !item.isDir && item.path === activePath
                        ? "var(--bs-body-bg)"
                        : "var(--bs-body-color)",
                    fontSize: 12,
                  }}
                >
                  <span style={{ width: 14, textAlign: "center" }}>
                    {item.isDir ? (openDirs.has(item.path) ? "▾" : "▸") : "•"}
                  </span>
                  <span>{item.name}</span>
                </div>
              ))
            )}
          </div>
          {fileOpError ? (
            <p className="text-danger" style={{ marginTop: 8, fontSize: 12 }}>
              {fileOpError}
            </p>
          ) : null}
        </div>

        <div
          className="bg-body border"
          style={{
            padding: 16,
            borderRadius: 18,
            minHeight: 320,
          }}
        >
          <label className="text-body-tertiary" style={{ fontSize: 12 }}>
            Editor
          </label>
          <div style={{ marginTop: 8 }}>
            {!activePath ? (
              <p className="text-body-tertiary" style={{ fontSize: 12 }}>
                Select a file from the workspace to edit it.
              </p>
            ) : (
              <>
                <div
                  className="text-body-secondary"
                  style={{
                    display: "flex",
                    justifyContent: "space-between",
                    alignItems: "center",
                    marginBottom: 8,
                    fontSize: 12,
                  }}
                >
                  <span>
                    {activePath} · {activeExtension.toUpperCase()}
                  </span>
                  <div style={{ display: "flex", gap: 8 }}>
                    <button
                      onClick={saveFile}
                      disabled={!editorDirty || editorLoading}
                      style={{
                        padding: "6px 10px",
                        borderRadius: 999,
                        border: "1px solid var(--bs-body-color)",
                        background: editorDirty
                          ? "var(--bs-body-color)"
                          : "var(--deployer-disabled-bg)",
                        color: editorDirty
                          ? "var(--bs-body-bg)"
                          : "var(--deployer-disabled-text)",
                        cursor: editorDirty ? "pointer" : "not-allowed",
                        fontSize: 12,
                      }}
                    >
                      {editorLoading ? "Saving..." : "Save"}
                    </button>
                    <button
                      onClick={() => activePath && loadFile(activePath)}
                      disabled={editorLoading}
                      style={{
                        padding: "6px 10px",
                        borderRadius: 999,
                        border: "1px solid var(--bs-border-color)",
                        background: "var(--bs-body-bg)",
                        color: "var(--deployer-muted-ink)",
                        cursor: "pointer",
                        fontSize: 12,
                      }}
                    >
                      Reload
                    </button>
                  </div>
                </div>
                {activeExtension === "markdown" ? (
                  <div
                    style={{
                      minHeight: 360,
                      borderRadius: 12,
                      border: "1px solid var(--bs-border-color)",
                      background: "var(--bs-body-bg)",
                    }}
                  >
                    <ReactQuill
                      theme="snow"
                      value={markdownHtml}
                      onChange={(value) => {
                        markdownSyncRef.current = true;
                        setMarkdownHtml(value);
                        const nextMarkdown = turndown.turndown(value || "");
                        setEditorValue(nextMarkdown);
                        setEditorDirty(true);
                        setEditorStatus(null);
                        setEditorError(null);
                      }}
                      modules={quillModules}
                      style={{ minHeight: 360 }}
                    />
                  </div>
                ) : (
                  <CodeMirror
                    value={editorValue}
                    height="360px"
                    extensions={editorExtensions}
                    onChange={(value) => {
                      setEditorValue(value);
                      setEditorDirty(true);
                      setEditorStatus(null);
                      setEditorError(null);
                    }}
                  />
                )}
                {editorError ? (
                  <p
                    className="text-danger"
                    style={{
                      marginTop: 8,
                      fontSize: 12,
                    }}
                  >
                    {editorError}
                  </p>
                ) : null}
                {editorStatus ? (
                  <p
                    className="text-success"
                    style={{
                      marginTop: 8,
                      fontSize: 12,
                    }}
                  >
                    {editorStatus}
                  </p>
                ) : null}
              </>
            )}
          </div>
        </div>
      </div>
    </section>
      {contextMenu ? (
        <div
          onClick={(event) => event.stopPropagation()}
          onContextMenu={(event) => {
            event.preventDefault();
            event.stopPropagation();
          }}
          style={{
            position: "fixed",
            top:
              typeof window !== "undefined"
                ? Math.min(contextMenu.y, window.innerHeight - 120)
                : contextMenu.y,
            left:
              typeof window !== "undefined"
                ? Math.min(contextMenu.x, window.innerWidth - 180)
                : contextMenu.x,
            background: "var(--bs-body-bg)",
            borderRadius: 12,
            border: "1px solid var(--bs-border-color-translucent)",
            boxShadow: "var(--deployer-shadow)",
            padding: 8,
            zIndex: 50,
            minWidth: 160,
          }}
        >
          <button
            onClick={() => {
              const base =
                contextMenu.path && contextMenu.isDir
                  ? contextMenu.path
                  : contextMenu.path
                  ? contextMenu.path.split("/").slice(0, -1).join("/")
                  : "";
              setContextMenu(null);
              createFile(base);
            }}
            style={{
              width: "100%",
              textAlign: "left",
              padding: "6px 10px",
              borderRadius: 8,
              border: "none",
              background: "transparent",
              cursor: "pointer",
              fontSize: 12,
            }}
          >
            New file…
          </button>
          <button
            onClick={() => {
              const base =
                contextMenu.path && contextMenu.isDir
                  ? contextMenu.path
                  : contextMenu.path
                  ? contextMenu.path.split("/").slice(0, -1).join("/")
                  : "";
              setContextMenu(null);
              createDirectory(base);
            }}
            style={{
              width: "100%",
              textAlign: "left",
              padding: "6px 10px",
              borderRadius: 8,
              border: "none",
              background: "transparent",
              cursor: "pointer",
              fontSize: 12,
            }}
          >
            New folder…
          </button>
          {contextMenu.path ? (
            <div
              style={{
                height: 1,
                background: "var(--bs-border-color-translucent)",
                margin: "6px 0",
              }}
            />
          ) : null}
          {contextMenu.path ? (
            <button
              onClick={() => {
                const path = contextMenu.path;
                if (!path) return;
                setContextMenu(null);
                renameFile(path, contextMenu.isDir);
              }}
              style={{
                width: "100%",
                textAlign: "left",
                padding: "6px 10px",
                borderRadius: 8,
                border: "none",
                background: "transparent",
                cursor: "pointer",
                fontSize: 12,
              }}
            >
              Rename{contextMenu.isDir ? " folder" : ""}
            </button>
          ) : null}
          {contextMenu.path ? (
            <button
              onClick={() => {
                const path = contextMenu.path;
                if (!path) return;
                setContextMenu(null);
                deleteFile(path, contextMenu.isDir);
              }}
              className="text-danger"
              style={{
                width: "100%",
                textAlign: "left",
                padding: "6px 10px",
                borderRadius: 8,
                border: "none",
                background: "transparent",
                cursor: "pointer",
                fontSize: 12,
              }}
            >
              Delete{contextMenu.isDir ? " folder" : ""}
            </button>
          ) : null}
        </div>
      ) : null}
    </>
  );
}
