import type {
  FileEntry,
  KdbxEntryView,
  TreeItem,
  TreeNode,
  VaultBlock,
  WorkspaceListEntry,
} from "./types";
import YAML from "yaml";

function unwrapKdbxValue(value: any): string {
  if (value === null || value === undefined) return "";
  if (typeof value === "string") return value;
  if (typeof value.getText === "function") return value.getText();
  try {
    return String(value);
  } catch {
    return "";
  }
}

function readKdbxField(fields: any, key: string): string {
  if (!fields) return "";
  if (typeof fields.get === "function") {
    return unwrapKdbxValue(fields.get(key));
  }
  if (Object.prototype.hasOwnProperty.call(fields, key)) {
    return unwrapKdbxValue(fields[key]);
  }
  const lower = key.toLowerCase();
  if (Object.prototype.hasOwnProperty.call(fields, lower)) {
    return unwrapKdbxValue(fields[lower]);
  }
  return "";
}

export function collectKdbxEntries(
  group: any,
  path: string[],
  out: KdbxEntryView[]
): void {
  if (!group) return;
  const name = group.name || group.title || "Group";
  const nextPath = name ? [...path, name] : path;
  const entries = Array.isArray(group.entries) ? group.entries : [];
  entries.forEach((entry: any, index: number) => {
    const fields = entry?.fields;
    const title = readKdbxField(fields, "Title");
    const username = readKdbxField(fields, "UserName");
    const password = readKdbxField(fields, "Password");
    const url = readKdbxField(fields, "URL");
    const notes = readKdbxField(fields, "Notes");
    const uuid =
      entry?.uuid?.id ||
      (typeof entry?.uuid?.toString === "function"
        ? entry.uuid.toString()
        : "");
    const id = uuid || `${nextPath.join("/")}:${index}`;
    out.push({
      id,
      group: nextPath.join(" / "),
      title: title || "(untitled)",
      username,
      password,
      url,
      notes,
    });
  });
  const groups = Array.isArray(group.groups) ? group.groups : [];
  groups.forEach((child: any) => collectKdbxEntries(child, nextPath, out));
}

export const WORKSPACE_STORAGE_KEY = "infinito.workspace_id";
export const USER_STORAGE_KEY = "infinito.user_id";
export const USER_WORKSPACE_LIST_PREFIX = "infinito.workspaces.";
export const USER_WORKSPACE_CURRENT_PREFIX = "infinito.workspace.current.";

export function readQueryParam(key: string): string | null {
  if (typeof window === "undefined") return null;
  const params = new URLSearchParams(window.location.search);
  const value = params.get(key);
  return value ? value.trim() : null;
}

export function loadWorkspaceList(userId: string): WorkspaceListEntry[] {
  if (typeof window === "undefined") return [];
  const raw = window.localStorage.getItem(`${USER_WORKSPACE_LIST_PREFIX}${userId}`);
  if (!raw) return [];
  try {
    const parsed = JSON.parse(raw);
    if (!Array.isArray(parsed)) return [];
    return parsed
      .map((entry) => ({
        id: String(entry?.id || "").trim(),
        name: entry?.name ? String(entry.name) : undefined,
        state: entry?.state ? String(entry.state) : undefined,
        created_at: entry?.created_at ?? null,
        last_modified_at: entry?.last_modified_at ?? null,
        last_used: entry?.last_used ?? null,
      }))
      .filter((entry) => entry.id);
  } catch {
    return [];
  }
}

export function saveWorkspaceList(userId: string, list: WorkspaceListEntry[]) {
  if (typeof window === "undefined") return;
  window.localStorage.setItem(
    `${USER_WORKSPACE_LIST_PREFIX}${userId}`,
    JSON.stringify(list)
  );
}

export function buildTree(entries: FileEntry[]) {
  const root: TreeNode = {
    name: "",
    path: "",
    isDir: true,
    children: new Map(),
  };

  entries.forEach((entry) => {
    const parts = entry.path.split("/").filter(Boolean);
    let cursor = root;
    parts.forEach((part, idx) => {
      const isLast = idx === parts.length - 1;
      const isDir = isLast ? entry.is_dir : true;
      const nextPath = parts.slice(0, idx + 1).join("/");
      if (!cursor.children.has(part)) {
        cursor.children.set(part, {
          name: part,
          path: nextPath,
          isDir,
          size: isLast ? entry.size ?? null : null,
          children: new Map(),
        });
      }
      const child = cursor.children.get(part)!;
      if (isLast) {
        child.isDir = entry.is_dir;
        child.size = entry.size ?? null;
      }
      cursor = child;
    });
  });

  return root;
}

export function flattenTree(root: TreeNode, openDirs: Set<string>) {
  const out: TreeItem[] = [];
  const walk = (node: TreeNode, depth: number) => {
    const children = Array.from(node.children.values()).sort((a, b) => {
      if (a.isDir !== b.isDir) return a.isDir ? -1 : 1;
      return a.name.localeCompare(b.name);
    });
    children.forEach((child) => {
      out.push({
        name: child.name,
        path: child.path,
        isDir: child.isDir,
        depth,
        size: child.size,
      });
      if (child.isDir && openDirs.has(child.path)) {
        walk(child, depth + 1);
      }
    });
  };
  walk(root, 0);
  return out;
}

export function extensionForPath(path: string) {
  if (path.endsWith(".json")) return "json";
  if (
    path.endsWith(".yml") ||
    path.endsWith(".yaml") ||
    path.endsWith(".inventory")
  )
    return "yaml";
  if (path.endsWith(".py")) return "python";
  if (path.endsWith(".md")) return "markdown";
  if (path.endsWith(".kdbx")) return "kdbx";
  return "text";
}

export function encodePath(path: string) {
  return path
    .split("/")
    .map((segment) => encodeURIComponent(segment))
    .join("/");
}

export function hostVarsAliasesFromFiles(entries: FileEntry[]) {
  return entries
    .filter((entry) => {
      if (entry.is_dir) return false;
      return /^host_vars\/[^/]+\.ya?ml$/i.test(entry.path);
    })
    .map((entry) => entry.path.replace(/^host_vars\//, "").replace(/\.ya?ml$/i, ""))
    .filter(Boolean)
    .sort((a, b) => a.localeCompare(b));
}

export function normalizeRoles(roles: string[]) {
  return Array.from(new Set((roles || []).map((role) => role.trim()).filter(Boolean)));
}

export function rolesKey(roles: string[]) {
  return normalizeRoles(roles).sort().join("|");
}

export function rolesByAliasKey(map: Record<string, string[]>) {
  return Object.keys(map || {})
    .sort()
    .map((alias) => `${alias}:${rolesKey(map[alias] || [])}`)
    .join("||");
}

export function sanitizeAliasFilename(alias: string) {
  const cleaned = alias.trim().replace(/[^A-Za-z0-9._-]/g, "_");
  return cleaned || "host";
}

export function pickHostVarsPath(entries: FileEntry[], alias: string) {
  const trimmed = alias.trim();
  if (!trimmed) return null;
  const expected = `host_vars/${sanitizeAliasFilename(trimmed)}.yml`;
  if (entries.some((entry) => !entry.is_dir && entry.path === expected)) {
    return expected;
  }
  const fallback = entries.find(
    (entry) =>
      !entry.is_dir &&
      /^host_vars\/[^/]+\.ya?ml$/i.test(entry.path) &&
      entry.path.toLowerCase() === expected.toLowerCase()
  );
  return fallback?.path ?? null;
}

export function extractRolesByAlias(content: string): Record<string, string[]> {
  const out: Record<string, string[]> = {};
  try {
    const data = YAML.parse(content) ?? {};
    const children = data?.all?.children ?? {};
    Object.entries(children).forEach(([roleId, entry]: [string, any]) => {
      const hosts = entry?.hosts ?? {};
      Object.keys(hosts).forEach((alias) => {
        const key = alias.trim();
        if (!key) return;
        if (!out[key]) out[key] = [];
        out[key].push(roleId);
      });
    });
    Object.keys(out).forEach((alias) => {
      out[alias] = normalizeRoles(out[alias]);
    });
  } catch {
    // ignore parse errors
  }
  return out;
}

export function findVaultBlock(lines: string[], lineIndex: number): VaultBlock | null {
  if (lineIndex < 0 || lineIndex >= lines.length) return null;
  let keyLine = lineIndex;
  const keyRegex = /^(\s*)([A-Za-z0-9_]+)\s*:\s*!vault\s*(\|[-+]?)?\s*$/;
  while (keyLine >= 0) {
    if (keyRegex.test(lines[keyLine])) break;
    const trimmed = lines[keyLine].trim();
    if (trimmed && !trimmed.startsWith("$ANSIBLE_VAULT")) {
      keyLine -= 1;
      continue;
    }
    keyLine -= 1;
  }
  if (keyLine < 0) return null;
  const match = lines[keyLine].match(keyRegex);
  if (!match) return null;
  const key = match[2];
  const baseIndent = match[1] ?? "";
  const indent = `${baseIndent}  `;
  let start = keyLine;
  if (!lines[start + 1] || !lines[start + 1].trim().startsWith("$ANSIBLE_VAULT")) {
    return null;
  }
  let end = start + 1;
  while (end + 1 < lines.length) {
    const next = lines[end + 1];
    if (!next.trim()) {
      end += 1;
      break;
    }
    if (next.startsWith(indent) || next.trim().startsWith("$ANSIBLE_VAULT")) {
      end += 1;
      continue;
    }
    break;
  }
  return { key, start, end, indent };
}

export function extractVaultText(lines: string[], block: VaultBlock): string {
  const payload = lines.slice(block.start + 1, block.end + 1);
  const cleaned = payload.map((line) => {
    if (block.indent && line.startsWith(block.indent)) {
      return line.slice(block.indent.length);
    }
    return line.trimStart();
  });
  return cleaned.join("\n").trim();
}

export function replaceVaultBlock(
  lines: string[],
  block: VaultBlock,
  vaultText: string
): string {
  const payloadLines = (vaultText || "").split("\n");
  const indent = block.indent || "  ";
  const indentedPayload = payloadLines.map((line) => `${indent}${line}`);
  const nextLines = [
    ...lines.slice(0, block.start + 1),
    ...indentedPayload,
    ...lines.slice(block.end + 1),
  ];
  return nextLines.join("\n");
}
