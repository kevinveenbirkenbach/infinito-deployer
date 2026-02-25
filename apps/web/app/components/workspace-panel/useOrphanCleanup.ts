import { useState } from "react";
import type { FileEntry, OrphanCleanupItem } from "./types";
import { encodePath, extractRolesByAlias } from "./utils";

type Args = {
  baseUrl: string;
  workspaceId: string | null;
  files: FileEntry[];
  activePath: string | null;
  setActivePath: (path: string | null) => void;
  setEditorValue: (value: string) => void;
  setEditorDirty: (dirty: boolean) => void;
  refreshFiles: (workspaceId: string) => Promise<void>;
};

export function useOrphanCleanup({
  baseUrl,
  workspaceId,
  files,
  activePath,
  setActivePath,
  setEditorValue,
  setEditorDirty,
  refreshFiles,
}: Args) {
  const [orphanCleanupOpen, setOrphanCleanupOpen] = useState(false);
  const [orphanCleanupLoading, setOrphanCleanupLoading] = useState(false);
  const [orphanCleanupBusy, setOrphanCleanupBusy] = useState(false);
  const [orphanCleanupItems, setOrphanCleanupItems] = useState<OrphanCleanupItem[]>(
    []
  );
  const [orphanCleanupSelected, setOrphanCleanupSelected] = useState<
    Record<string, boolean>
  >({});
  const [orphanCleanupError, setOrphanCleanupError] = useState<string | null>(null);
  const [orphanCleanupStatus, setOrphanCleanupStatus] = useState<string | null>(null);

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

    const items: OrphanCleanupItem[] = [];

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

  return {
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
  };
}
