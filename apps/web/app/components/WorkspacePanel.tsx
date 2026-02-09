"use client";

import { useEffect, useMemo, useState } from "react";
import type { MouseEvent } from "react";
import CodeMirror from "@uiw/react-codemirror";
import { json as jsonLang } from "@codemirror/lang-json";
import { yaml as yamlLang } from "@codemirror/lang-yaml";
import { markdown as markdownLang } from "@codemirror/lang-markdown";
import { python as pythonLang } from "@codemirror/lang-python";
import YAML from "yaml";
import ReactMarkdown from "react-markdown";

type FileEntry = {
  path: string;
  is_dir: boolean;
  size?: number | null;
  modified_at?: string | null;
};

type CredentialsState = {
  deployTarget: string;
  host: string;
  user: string;
  authMethod: string;
};

type WorkspacePanelProps = {
  baseUrl: string;
  selectedRoles: string[];
  credentials: CredentialsState;
  inventoryVars: Record<string, any> | null;
  onInventoryReadyChange?: (ready: boolean) => void;
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

export default function WorkspacePanel({
  baseUrl,
  selectedRoles,
  credentials,
  inventoryVars,
  onInventoryReadyChange,
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
  const [markdownPreview, setMarkdownPreview] = useState(false);

  const [openDirs, setOpenDirs] = useState<Set<string>>(new Set());

  const [vaultPassword, setVaultPassword] = useState("");
  const [allowEmptyPlain, setAllowEmptyPlain] = useState(false);
  const [forceOverwrite, setForceOverwrite] = useState(false);
  const [setValuesText, setSetValuesText] = useState("");
  const [credentialsBusy, setCredentialsBusy] = useState(false);
  const [credentialsError, setCredentialsError] = useState<string | null>(null);
  const [credentialsStatus, setCredentialsStatus] = useState<string | null>(null);

  const [zipBusy, setZipBusy] = useState(false);
  const [zipError, setZipError] = useState<string | null>(null);

  const [generateBusy, setGenerateBusy] = useState(false);
  const [generateError, setGenerateError] = useState<string | null>(null);

  const [fileOpError, setFileOpError] = useState<string | null>(null);
  const [contextMenu, setContextMenu] = useState<{
    x: number;
    y: number;
    path?: string;
    isDir: boolean;
  } | null>(null);

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
      case "markdown":
        return [markdownLang()];
      case "python":
        return [pythonLang()];
      default:
        return [];
    }
  }, [activeExtension]);

  useEffect(() => {
    if (activeExtension !== "markdown") {
      setMarkdownPreview(false);
    }
  }, [activeExtension]);

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

  const syncInventoryReady = (nextFiles: FileEntry[]) => {
    const ready = nextFiles.some((f) => f.path === "inventory.yml");
    setInventoryReady(ready);
    onInventoryReadyChange?.(ready);
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
            if (alive) setWorkspaceId(id);
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
  }, [baseUrl]);

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
      setEditorDirty(false);
      setEditorStatus("Saved.");
      await refreshFiles(workspaceId);
    } catch (err: any) {
      setEditorError(err?.message ?? "failed to save");
    } finally {
      setEditorLoading(false);
    }
  };

  const canGenerate =
    !!workspaceId &&
    selectedRoles.length > 0 &&
    credentials.deployTarget &&
    credentials.host &&
    credentials.user;

  const generateInventory = async () => {
    if (!workspaceId || !canGenerate) return;
    setGenerateBusy(true);
    setGenerateError(null);
    try {
      const payload = {
        deploy_target: credentials.deployTarget,
        host: credentials.host,
        user: credentials.user,
        auth_method: credentials.authMethod || null,
        selected_roles: selectedRoles,
        inventory_vars: inventoryVars ?? {},
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
      setGenerateError(err?.message ?? "failed to generate inventory");
    } finally {
      setGenerateBusy(false);
    }
  };

  const generateCredentials = async () => {
    if (!workspaceId || !vaultPassword || credentialsBusy) return;
    setCredentialsBusy(true);
    setCredentialsError(null);
    setCredentialsStatus(null);
    try {
      const setValues = setValuesText
        .split(/[\n,]+/)
        .map((value) => value.trim())
        .filter(Boolean);
      const res = await fetch(
        `${baseUrl}/api/workspaces/${workspaceId}/credentials`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            vault_password: vaultPassword,
            selected_roles: selectedRoles,
            allow_empty_plain: allowEmptyPlain,
            set_values: setValues.length > 0 ? setValues : undefined,
            force: forceOverwrite,
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
      setVaultPassword("");
      await refreshFiles(workspaceId);
    } catch (err: any) {
      setCredentialsError(err?.message ?? "credential generation failed");
    } finally {
      setCredentialsBusy(false);
    }
  };

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
          background:
            "linear-gradient(120deg, rgba(244, 244, 255, 0.92), rgba(236, 253, 245, 0.9))",
          border: "1px solid rgba(15, 23, 42, 0.08)",
          boxShadow: "0 18px 40px rgba(15, 23, 42, 0.08)",
        }}
      >
      <div style={{ display: "flex", flexWrap: "wrap", gap: 16 }}>
        <div style={{ flex: "1 1 320px" }}>
          <h2
            style={{
              margin: 0,
              fontFamily: "var(--font-display)",
              fontSize: 26,
              letterSpacing: "-0.02em",
              color: "#0f172a",
            }}
          >
            Workspace & Files
          </h2>
          <p style={{ margin: "8px 0 0", color: "#475569" }}>
            Step-by-step: select roles → generate inventory → edit files →
            generate credentials → export ZIP or deploy.
          </p>
        </div>
        <div
          style={{
            flex: "1 1 240px",
            alignSelf: "center",
            textAlign: "right",
            color: "#475569",
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
        <div style={{ marginTop: 12, color: "#b91c1c", fontSize: 12 }}>
          {workspaceError}
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
          style={{
            padding: 16,
            borderRadius: 18,
            background: "#fff",
            border: "1px solid rgba(15, 23, 42, 0.1)",
          }}
        >
          <label style={{ fontSize: 12, color: "#64748b" }}>
            Inventory generation
          </label>
          <div style={{ marginTop: 8, display: "flex", gap: 8 }}>
            <button
              onClick={generateInventory}
              disabled={!canGenerate || generateBusy || workspaceLoading}
              style={{
                padding: "8px 14px",
                borderRadius: 999,
                border: "1px solid #0f172a",
                background: canGenerate ? "#0f172a" : "#e2e8f0",
                color: canGenerate ? "#fff" : "#64748b",
                cursor: canGenerate ? "pointer" : "not-allowed",
                fontSize: 12,
              }}
            >
              {generateBusy ? "Generating..." : "Generate inventory"}
            </button>
            <button
              onClick={() => workspaceId && refreshFiles(workspaceId)}
              disabled={!workspaceId}
              style={{
                padding: "8px 12px",
                borderRadius: 999,
                border: "1px solid #cbd5e1",
                background: "#fff",
                color: "#334155",
                cursor: workspaceId ? "pointer" : "not-allowed",
                fontSize: 12,
              }}
            >
              Refresh files
            </button>
          </div>
          {!canGenerate ? (
            <p style={{ margin: "8px 0 0", color: "#b91c1c", fontSize: 12 }}>
              Select roles and fill host/user to enable inventory generation.
            </p>
          ) : null}
          {generateError ? (
            <p style={{ margin: "8px 0 0", color: "#b91c1c", fontSize: 12 }}>
              {generateError}
            </p>
          ) : null}
        </div>

        <div
          style={{
            padding: 16,
            borderRadius: 18,
            background: "#fff",
            border: "1px solid rgba(15, 23, 42, 0.1)",
          }}
        >
          <label style={{ fontSize: 12, color: "#64748b" }}>
            Credentials & export
          </label>
          <div style={{ marginTop: 8, display: "flex", gap: 8 }}>
            <button
              onClick={generateCredentials}
              disabled={!inventoryReady || !vaultPassword || credentialsBusy}
              style={{
                padding: "8px 12px",
                borderRadius: 999,
                border: "1px solid #0f172a",
                background:
                  inventoryReady && vaultPassword ? "#0f172a" : "#e2e8f0",
                color:
                  inventoryReady && vaultPassword ? "#fff" : "#64748b",
                cursor:
                  inventoryReady && vaultPassword ? "pointer" : "not-allowed",
                fontSize: 12,
              }}
            >
              {credentialsBusy ? "Working..." : "Generate credentials"}
            </button>
            <button
              onClick={downloadZip}
              disabled={!inventoryReady || zipBusy}
              style={{
                padding: "8px 12px",
                borderRadius: 999,
                border: "1px solid #cbd5e1",
                background: "#fff",
                color: "#334155",
                cursor: inventoryReady ? "pointer" : "not-allowed",
                fontSize: 12,
              }}
            >
              {zipBusy ? "Preparing..." : "Download ZIP"}
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
                border: "1px solid #cbd5e1",
                fontSize: 12,
              }}
            />
            <input
              value={setValuesText}
              onChange={(e) => setSetValuesText(e.target.value)}
              placeholder="Optional --set values (key=value, comma or newline)"
              style={{
                padding: "8px 10px",
                borderRadius: 10,
                border: "1px solid #cbd5e1",
                fontSize: 12,
              }}
            />
            <label
              style={{
                display: "flex",
                alignItems: "center",
                gap: 8,
                fontSize: 12,
                color: "#475569",
              }}
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
                color: "#475569",
              }}
            >
              <input
                type="checkbox"
                checked={forceOverwrite}
                onChange={(e) => setForceOverwrite(e.target.checked)}
              />
              Overwrite existing credentials
            </label>
          </div>
          {credentialsError ? (
            <p style={{ margin: "8px 0 0", color: "#b91c1c", fontSize: 12 }}>
              {credentialsError}
            </p>
          ) : null}
          {credentialsStatus ? (
            <p style={{ margin: "8px 0 0", color: "#0f766e", fontSize: 12 }}>
              {credentialsStatus}
            </p>
          ) : null}
          {zipError ? (
            <p style={{ margin: "8px 0 0", color: "#b91c1c", fontSize: 12 }}>
              {zipError}
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
          style={{
            padding: 16,
            borderRadius: 18,
            background: "#fff",
            border: "1px solid rgba(15, 23, 42, 0.1)",
            minHeight: 320,
          }}
        >
          <label style={{ fontSize: 12, color: "#64748b" }}>Files</label>
          <div style={{ marginTop: 8, fontSize: 12, color: "#64748b" }}>
            Right-click to create files or folders.
          </div>
          <div
            style={{ marginTop: 8 }}
            onContextMenu={(event) => openContextMenu(event, null, false)}
          >
            {treeItems.length === 0 ? (
              <p style={{ color: "#64748b", fontSize: 12 }}>
                No files yet. Generate inventory to create workspace files.
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
                        ? "#0f172a"
                        : "transparent",
                    color:
                      !item.isDir && item.path === activePath
                        ? "#fff"
                        : "#0f172a",
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
            <p style={{ marginTop: 8, color: "#b91c1c", fontSize: 12 }}>
              {fileOpError}
            </p>
          ) : null}
        </div>

        <div
          style={{
            padding: 16,
            borderRadius: 18,
            background: "#fff",
            border: "1px solid rgba(15, 23, 42, 0.1)",
            minHeight: 320,
          }}
        >
          <label style={{ fontSize: 12, color: "#64748b" }}>Editor</label>
          <div style={{ marginTop: 8 }}>
            {!activePath ? (
              <p style={{ color: "#64748b", fontSize: 12 }}>
                Select a file from the workspace to edit it.
              </p>
            ) : (
              <>
                <div
                  style={{
                    display: "flex",
                    justifyContent: "space-between",
                    alignItems: "center",
                    marginBottom: 8,
                    fontSize: 12,
                    color: "#475569",
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
                        border: "1px solid #0f172a",
                        background: editorDirty ? "#0f172a" : "#e2e8f0",
                        color: editorDirty ? "#fff" : "#64748b",
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
                        border: "1px solid #cbd5e1",
                        background: "#fff",
                        color: "#334155",
                        cursor: "pointer",
                        fontSize: 12,
                      }}
                    >
                      Reload
                    </button>
                    {activeExtension === "markdown" ? (
                      <button
                        onClick={() => setMarkdownPreview((prev) => !prev)}
                        style={{
                          padding: "6px 10px",
                          borderRadius: 999,
                          border: "1px solid #cbd5e1",
                          background: markdownPreview ? "#0f172a" : "#fff",
                          color: markdownPreview ? "#fff" : "#334155",
                          cursor: "pointer",
                          fontSize: 12,
                        }}
                      >
                        {markdownPreview ? "Edit" : "Preview"}
                      </button>
                    ) : null}
                  </div>
                </div>
                {activeExtension === "markdown" && markdownPreview ? (
                  <div
                    style={{
                      minHeight: 360,
                      borderRadius: 12,
                      border: "1px solid #e2e8f0",
                      padding: 12,
                      background: "#f8fafc",
                      color: "#0f172a",
                      fontSize: 14,
                      lineHeight: 1.6,
                    }}
                  >
                    <ReactMarkdown>{editorValue}</ReactMarkdown>
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
                    style={{
                      marginTop: 8,
                      color: "#b91c1c",
                      fontSize: 12,
                    }}
                  >
                    {editorError}
                  </p>
                ) : null}
                {editorStatus ? (
                  <p
                    style={{
                      marginTop: 8,
                      color: "#0f766e",
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
            background: "#fff",
            borderRadius: 12,
            border: "1px solid rgba(15, 23, 42, 0.15)",
            boxShadow: "0 10px 30px rgba(15, 23, 42, 0.15)",
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
                background: "rgba(15, 23, 42, 0.08)",
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
              style={{
                width: "100%",
                textAlign: "left",
                padding: "6px 10px",
                borderRadius: 8,
                border: "none",
                background: "transparent",
                cursor: "pointer",
                fontSize: 12,
                color: "#b91c1c",
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
