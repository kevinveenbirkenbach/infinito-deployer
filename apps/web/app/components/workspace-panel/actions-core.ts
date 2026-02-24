import YAML from "yaml";
import {
  collectKdbxEntries,
  encodePath,
  extensionForPath,
  extractRolesByAlias,
  normalizeRoles,
  rolesByAliasKey,
  sanitizeAliasFilename,
} from "./utils";
import {
  normalizeDeviceColor,
  normalizeDeviceEmoji,
} from "../deployment-credentials/device-visuals";
import { buildCredentialsPatchFromHostVarsData } from "../../lib/device_meta";

export function createWorkspacePanelCoreActions(ctx: any) {
  const {
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
  } = ctx;

  const syncInventoryReady = (nextFiles: any[]) => {
    const ready = nextFiles.some((f) => f.path === "inventory.yml");
    setInventoryReady(ready);
    onInventoryReadyChange?.(ready);
  };

  const mergeRolesByAlias = (
    incoming: Record<string, string[]>
  ): Record<string, string[]> => {
    const merged: Record<string, string[]> = {};
    Object.entries(incoming || {}).forEach(([alias, roles]) => {
      const key = (alias || "").trim();
      if (!key) return;
      merged[key] = normalizeRoles(roles || []);
    });
    hostVarsAliases.forEach((alias: string) => {
      if (!merged[alias]) {
        merged[alias] = [];
      }
    });
    return merged;
  };

  const updateWorkspaceUrl = (id: string | null) => {
    if (typeof window === "undefined") return;
    const url = new URL(window.location.href);
    if (id) {
      url.searchParams.set("workspace", id);
    } else {
      url.searchParams.delete("workspace");
    }
    window.history.replaceState({}, "", url.toString());
  };

  const resetWorkspaceState = () => {
    setFiles([]);
    setOpenDirs(new Set());
    setActivePath(null);
    setEditorValue("");
    setEditorDirty(false);
    setEditorLoading(false);
    setEditorError(null);
    setEditorStatus(null);
    setMarkdownHtml("");
    setKdbxEntries([]);
    setKdbxError(null);
    setKdbxLoading(false);
    setKdbxPromptOpen(false);
    setKdbxRevealed({});
    setInventoryReady(false);
    onInventoryReadyChange?.(false);
  };

  const rememberWorkspace = (id: string, createdAt?: string | null) => {
    if (!userId) return;
    const now = new Date().toISOString();
    setWorkspaceList((prev: any[]) => {
      const next = prev.some((entry) => entry.id === id)
        ? prev.map((entry) =>
            entry.id === id
              ? {
                  ...entry,
                  last_used: now,
                  created_at: entry.created_at ?? createdAt ?? now,
                }
              : entry
          )
        : [...prev, { id, created_at: createdAt ?? now, last_used: now }];
      saveWorkspaceList(userId, next);
      return next;
    });
    if (typeof window !== "undefined") {
      window.localStorage.setItem(`${USER_WORKSPACE_CURRENT_PREFIX}${userId}`, id);
    }
  };

  const normalizeWorkspaceList = (items: any[]): any[] =>
    (Array.isArray(items) ? items : [])
      .map((entry) => {
        const workspaceId = String(entry?.workspace_id || entry?.id || "").trim();
        if (!workspaceId) return null;
        return {
          id: workspaceId,
          name: String(entry?.name || workspaceId),
          state: String(entry?.state || "draft").toLowerCase(),
          created_at: entry?.created_at ?? null,
          last_modified_at: entry?.last_modified_at ?? null,
          last_used: entry?.last_used ?? null,
        };
      })
      .filter(Boolean);

  const fetchWorkspaceListFromApi = async (): Promise<{
    supported: boolean;
    authenticated: boolean;
    userId: string | null;
    workspaces: any[];
    unauthorized: boolean;
  }> => {
    try {
      const res = await fetch(`${baseUrl}/api/workspaces`, { cache: "no-store" });
      if (res.status === 404) {
        return {
          supported: false,
          authenticated: false,
          userId: null,
          workspaces: [],
          unauthorized: false,
        };
      }
      if (res.status === 401) {
        return {
          supported: true,
          authenticated: false,
          userId: null,
          workspaces: [],
          unauthorized: true,
        };
      }
      if (!res.ok) {
        throw new Error(`HTTP ${res.status}`);
      }
      const data = await res.json();
      const authenticated = Boolean(data?.authenticated);
      const resolvedUserId = String(data?.user_id || "").trim() || null;
      const workspaces = normalizeWorkspaceList(data?.workspaces);
      if (authenticated && resolvedUserId && setUserId) {
        setUserId(resolvedUserId);
      }
      return {
        supported: true,
        authenticated,
        userId: resolvedUserId,
        workspaces,
        unauthorized: false,
      };
    } catch {
      return {
        supported: false,
        authenticated: false,
        userId: null,
        workspaces: [],
        unauthorized: false,
      };
    }
  };

  const refreshWorkspaceListFromApi = async (): Promise<any[] | null> => {
    const data = await fetchWorkspaceListFromApi();
    if (!data.supported) return null;
    if (!data.authenticated) {
      setWorkspaceList([]);
      return [];
    }
    setWorkspaceList(data.workspaces);
    if (data.userId) {
      saveWorkspaceList(data.userId, data.workspaces);
    }
    return data.workspaces;
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
        nextFiles.filter((f: any) => f.is_dir).map((f: any) => f.path)
      );
      setOpenDirs(dirs);
    }
  };

  const selectWorkspace = async (id: string): Promise<boolean> => {
    if (!id) return false;
    setWorkspaceLoading(true);
    setWorkspaceError(null);
    resetWorkspaceState();
    try {
      await refreshFiles(id);
      setWorkspaceId(id);
      onWorkspaceIdChange?.(id);
      if (typeof window !== "undefined") {
        window.localStorage.setItem(WORKSPACE_STORAGE_KEY, id);
        if (userId) {
          window.localStorage.setItem(`${USER_WORKSPACE_CURRENT_PREFIX}${userId}`, id);
        }
      }
      updateWorkspaceUrl(id);
      return true;
    } catch (err: any) {
      setWorkspaceError(err?.message ?? "workspace not found");
      return false;
    } finally {
      setWorkspaceLoading(false);
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
      resetWorkspaceState();
      setWorkspaceId(id);
      onWorkspaceIdChange?.(id);
      await refreshFiles(id);
      const apiContext = await fetchWorkspaceListFromApi();
      if (apiContext.supported) {
        if (apiContext.authenticated) {
          setWorkspaceList(apiContext.workspaces);
          if (apiContext.userId) {
            saveWorkspaceList(apiContext.userId, apiContext.workspaces);
            if (typeof window !== "undefined") {
              window.localStorage.setItem(
                `${USER_WORKSPACE_CURRENT_PREFIX}${apiContext.userId}`,
                id
              );
            }
          }
        } else {
          setWorkspaceList([]);
        }
      }
      if (userId && !apiContext.supported) {
        rememberWorkspace(id, data?.created_at ?? null);
      } else if (typeof window !== "undefined") {
        window.localStorage.setItem(WORKSPACE_STORAGE_KEY, id);
      }
      updateWorkspaceUrl(id);
    } catch (err: any) {
      setWorkspaceError(err?.message ?? "failed to create workspace");
    } finally {
      setWorkspaceLoading(false);
    }
  };

  const initWorkspace = async () => {
    setWorkspaceLoading(true);
    setWorkspaceError(null);
    try {
      const requested = readQueryParam("workspace");
      const apiListData = await fetchWorkspaceListFromApi();
      const apiAuthenticated = apiListData.supported && apiListData.authenticated;
      const apiUserId = apiListData.userId || userId || null;

      if (apiAuthenticated) {
        const list = apiListData.workspaces;
        setWorkspaceList(list);
        if (apiUserId) {
          saveWorkspaceList(apiUserId, list);
        }
        const storedCurrent =
          typeof window !== "undefined" && apiUserId
            ? window.localStorage.getItem(`${USER_WORKSPACE_CURRENT_PREFIX}${apiUserId}`)
            : null;
        const candidates = [requested, storedCurrent, list[0]?.id].filter(Boolean) as string[];
        for (const candidate of candidates) {
          const ok = await selectWorkspace(candidate);
          if (ok) return;
          if (requested && candidate === requested) {
            setWorkspaceError(`Workspace '${requested}' not found.`);
          }
        }
        await createWorkspace();
        return;
      }

      if (apiListData.supported) {
        if (userId && setUserId) {
          setUserId(null);
          setWorkspaceList([]);
          return;
        }
        setWorkspaceList([]);
      }

      if (userId && !apiListData.supported) {
        const list = loadWorkspaceList(userId);
        setWorkspaceList(list);
        const storedCurrent =
          typeof window !== "undefined"
            ? window.localStorage.getItem(`${USER_WORKSPACE_CURRENT_PREFIX}${userId}`)
            : null;
        const candidates = [requested, storedCurrent, list[0]?.id].filter(Boolean) as string[];
        for (const candidate of candidates) {
          const ok = await selectWorkspace(candidate);
          if (ok) return;
          if (requested && candidate === requested) {
            setWorkspaceError(`Workspace '${requested}' not found.`);
          }
        }
        await createWorkspace();
        return;
      }

      if (requested) {
        const ok = await selectWorkspace(requested);
        if (ok) return;
        setWorkspaceError(`Workspace '${requested}' not found.`);
      }
      let id: string | null = null;
      if (typeof window !== "undefined") {
        id = window.localStorage.getItem(WORKSPACE_STORAGE_KEY);
      }
      if (id) {
        const ok = await selectWorkspace(id);
        if (ok) return;
        if (typeof window !== "undefined") {
          window.localStorage.removeItem(WORKSPACE_STORAGE_KEY);
        }
      }
      await createWorkspace();
    } catch (err: any) {
      setWorkspaceError(err?.message ?? "workspace init failed");
    } finally {
      setWorkspaceLoading(false);
    }
  };

  const deleteWorkspace = async (id: string): Promise<void> => {
    const targetId = String(id || "").trim();
    if (!targetId) {
      throw new Error("workspace id is required");
    }
    const res = await fetch(
      `${baseUrl}/api/workspaces/${encodeURIComponent(targetId)}`,
      { method: "DELETE" }
    );
    if (!res.ok) {
      let message = `HTTP ${res.status}`;
      try {
        const data = await res.json();
        if (data?.detail) {
          message = String(data.detail);
        }
      } catch {
        // ignore parse errors
      }
      throw new Error(message);
    }

    const apiList = await refreshWorkspaceListFromApi();
    if (!apiList) {
      if (userId) {
        setWorkspaceList((prev: any[]) => {
          const next = prev.filter((entry) => entry.id !== targetId);
          saveWorkspaceList(userId, next);
          return next;
        });
      }
    }

    if (workspaceId === targetId) {
      resetWorkspaceState();
      setWorkspaceId(null);
      onWorkspaceIdChange?.(null);
      updateWorkspaceUrl(null);

      const nextCandidate =
        (Array.isArray(apiList) ? apiList : []).find((entry) => entry.id !== targetId)?.id ||
        null;
      if (nextCandidate) {
        await selectWorkspace(nextCandidate);
        return;
      }
      await createWorkspace();
      return;
    }

    if (userId && typeof window !== "undefined") {
      const currentKey = `${USER_WORKSPACE_CURRENT_PREFIX}${userId}`;
      const currentValue = window.localStorage.getItem(currentKey);
      if (currentValue === targetId) {
        window.localStorage.removeItem(currentKey);
      }
    }
  };

  const toggleDir = (path: string) => {
    setOpenDirs((prev: Set<string>) => {
      const next = new Set(prev);
      if (next.has(path)) {
        next.delete(path);
      } else {
        next.add(path);
      }
      return next;
    });
  };

  const lockKdbx = () => {
    kdbxPasswordRef.current = "";
    setKdbxEntries([]);
    setKdbxError(null);
    setKdbxRevealed({});
  };

  const loadKdbx = async (path: string, masterPassword: string) => {
    if (!workspaceId) return;
    setKdbxLoading(true);
    setKdbxError(null);
    try {
      const res = await fetch(
        `${baseUrl}/api/workspaces/${workspaceId}/download/${encodePath(path)}`,
        { cache: "no-store" }
      );
      if (!res.ok) {
        throw new Error(`HTTP ${res.status}`);
      }
      const buffer = await res.arrayBuffer();
      const kdbxMod = await import("kdbxweb");
      const kdbx = (kdbxMod as any).default ?? kdbxMod;
      if (!kdbxArgonReadyRef.current) {
        const argonMod = await import("argon2-browser/dist/argon2-bundled.min.js");
        let argon2Impl =
          (argonMod as any).argon2 || (argonMod as any).default || (argonMod as any);
        if (typeof argon2Impl === "function" && !argon2Impl?.hash) {
          try {
            const resolved = await (argon2Impl as any)();
            if (resolved?.hash) {
              argon2Impl = resolved;
            }
          } catch {
            // ignore and fall back to global argon2 if available
          }
        }
        if (!argon2Impl?.hash && (globalThis as any).argon2?.hash) {
          argon2Impl = (globalThis as any).argon2;
        }
        if (!argon2Impl?.hash) {
          throw new Error("Argon2 implementation missing");
        }
        const engine =
          kdbx?.CryptoEngine ||
          kdbx?.crypto ||
          (kdbxMod as any).CryptoEngine ||
          (kdbxMod as any).crypto;
        if (engine?.setArgon2Impl) {
          const argon2Wrapper = async (
            password: ArrayBuffer,
            salt: ArrayBuffer,
            memory: number,
            iterations: number,
            length: number,
            parallelism: number,
            type: number,
            version: number
          ) => {
            const result = await argon2Impl.hash({
              pass: new Uint8Array(password),
              salt: new Uint8Array(salt),
              time: iterations,
              mem: memory,
              hashLen: length,
              parallelism,
              type,
              version,
              raw: true,
            });
            return result?.hash;
          };
          engine.setArgon2Impl(argon2Wrapper);
          kdbxArgonReadyRef.current = true;
        } else {
          throw new Error("Argon2 engine not available");
        }
      }
      const creds = new kdbx.Credentials(kdbx.ProtectedValue.fromString(masterPassword));
      const db = await kdbx.Kdbx.load(buffer, creds);
      const entries: any[] = [];
      const rootGroup =
        typeof db.getDefaultGroup === "function"
          ? db.getDefaultGroup()
          : Array.isArray(db.groups)
            ? db.groups[0]
            : null;
      if (rootGroup) {
        collectKdbxEntries(rootGroup, [], entries);
      } else if (Array.isArray(db.groups)) {
        db.groups.forEach((group: any) => collectKdbxEntries(group, [], entries));
      }
      setKdbxEntries(entries);
    } catch (err: any) {
      setKdbxError(err?.message ?? "failed to open kdbx");
    } finally {
      setKdbxLoading(false);
      setEditorLoading(false);
    }
  };

  const handleKdbxSubmit = (masterPassword: string) => {
    setKdbxPromptOpen(false);
    kdbxPasswordRef.current = masterPassword;
    if (activePath) {
      void loadKdbx(activePath, masterPassword);
    }
  };

  const loadFile = async (path: string) => {
    if (!workspaceId) return;
    setEditorLoading(true);
    setEditorError(null);
    setEditorStatus(null);
    try {
      const kind = extensionForPath(path);
      if (kind === "kdbx") {
        setActivePath(path);
        setEditorValue("");
        setEditorDirty(false);
        setKdbxError(null);
        setKdbxEntries([]);
        if (kdbxPasswordRef.current) {
          await loadKdbx(path, kdbxPasswordRef.current);
        } else {
          setEditorLoading(false);
          setKdbxPromptOpen(true);
        }
        return;
      }
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

  const validateEditor = (editorValue: string, activePath: string | null) => {
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

  const saveFile = async (editorValue: string, editorDirty: boolean) => {
    if (!workspaceId || !activePath) return false;
    const validationError = validateEditor(editorValue, activePath);
    if (validationError) {
      setEditorError(validationError);
      return false;
    }
    setEditorLoading(true);
    setEditorError(null);
    setEditorStatus(null);
    try {
      const res = await fetch(
        `${baseUrl}/api/workspaces/${workspaceId}/files/${encodePath(activePath)}`,
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
      return true;
    } catch (err: any) {
      setEditorError(err?.message ?? "failed to save");
      return false;
    } finally {
      setEditorLoading(false);
    }
  };

  const generateInventory = async () => {
    if (!workspaceId || !canGenerate) return;
    setGenerateBusy(true);
    setInventorySyncError(null);
    try {
      const portRaw = credentials.port?.trim() || "";
      const portNum = portRaw ? Number(portRaw) : null;
      const payload = {
        alias: activeAlias,
        host: credentials.host,
        port: Number.isInteger(portNum) ? portNum : undefined,
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

  const resolveTargetRoles = (credentialsScope: "all" | "single", credentialsRole: string) => {
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
      allNode.children && typeof allNode.children === "object" ? allNode.children : {};

    let changed = false;
    const nextChildren: Record<string, any> = { ...childrenNode };

    Object.entries(childrenNode).forEach(([roleId, entryValue]) => {
      if (!entryValue || typeof entryValue !== "object") return;
      const entry = { ...(entryValue as Record<string, any>) };
      const hosts =
        entry.hosts && typeof entry.hosts === "object" ? { ...entry.hosts } : null;
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

  const removeAliasFromInventory = async (alias: string) => {
    if (!workspaceId || !inventoryReady) return;
    const content = await readWorkspaceFile("inventory.yml");
    const data = (YAML.parse(content) ?? {}) as Record<string, any>;
    const allNode = data.all && typeof data.all === "object" ? data.all : {};
    const childrenNode =
      allNode.children && typeof allNode.children === "object" ? allNode.children : {};

    let changed = false;
    const nextChildren: Record<string, any> = { ...childrenNode };

    Object.entries(childrenNode).forEach(([roleId, entryValue]) => {
      if (!entryValue || typeof entryValue !== "object") return;
      const entry = { ...(entryValue as Record<string, any>) };
      const hosts =
        entry.hosts && typeof entry.hosts === "object" ? { ...entry.hosts } : null;
      if (!hosts) return;
      if (Object.prototype.hasOwnProperty.call(hosts, alias)) {
        delete hosts[alias];
        changed = true;
      }
      if (Object.keys(hosts).length === 0) {
        delete nextChildren[roleId];
        changed = true;
      } else {
        entry.hosts = hosts;
        nextChildren[roleId] = entry;
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
  };

  const syncInventoryWithSelection = async (editorDirty: boolean) => {
    if (!workspaceId || !inventoryReady) return;
    if (activePath === "inventory.yml" && editorDirty) return;

    try {
      if (ctx.inventorySyncError) {
        setInventorySyncError(null);
      }
      const content = await readWorkspaceFile("inventory.yml");
      const data = (YAML.parse(content) ?? {}) as Record<string, any>;
      const allNode = data.all && typeof data.all === "object" ? data.all : {};
      const childrenNode =
        allNode.children && typeof allNode.children === "object" ? allNode.children : {};

      const mergedSelection = mergeRolesByAlias(selectedRolesByAlias);
      const managedAliases = new Set(
        Object.keys(mergedSelection)
          .map((alias) => String(alias || "").trim())
          .filter(Boolean)
      );
      const desiredHostsByRole: Record<string, Set<string>> = {};
      managedAliases.forEach((alias) => {
        const roles = normalizeRoles(mergedSelection[alias] || []);
        roles.forEach((roleId) => {
          if (!desiredHostsByRole[roleId]) {
            desiredHostsByRole[roleId] = new Set<string>();
          }
          desiredHostsByRole[roleId].add(alias);
        });
      });
      let changed = false;
      const nextChildren: Record<string, any> = { ...childrenNode };
      const roleIdsToProcess = new Set<string>([
        ...Object.keys(childrenNode),
        ...Object.keys(desiredHostsByRole),
      ]);

      roleIdsToProcess.forEach((roleId) => {
        const existing = nextChildren[roleId];
        const entry = existing && typeof existing === "object" ? { ...existing } : {};
        const hosts =
          entry.hosts && typeof entry.hosts === "object"
            ? { ...entry.hosts }
            : {};
        const desiredAliasesForRole = desiredHostsByRole[roleId] || new Set<string>();

        desiredAliasesForRole.forEach((alias) => {
          if (!Object.prototype.hasOwnProperty.call(hosts, alias)) {
            hosts[alias] = {};
            changed = true;
          }
        });

        Object.keys(hosts).forEach((alias) => {
          if (managedAliases.has(alias) && !desiredAliasesForRole.has(alias)) {
            delete hosts[alias];
            changed = true;
          }
        });

        if (Object.keys(hosts).length === 0) {
          if (Object.prototype.hasOwnProperty.call(nextChildren, roleId)) {
            delete nextChildren[roleId];
            changed = true;
          }
          return;
        }

        nextChildren[roleId] = { ...entry, hosts };
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
        err?.message ? `Inventory sync failed: ${err.message}` : "Inventory sync failed."
      );
    }
  };

  const syncSelectionFromInventory = async (editorDirty: boolean) => {
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

  const syncHostVarsFromCredentials = async (editorDirty: boolean) => {
    if (!workspaceId) return;
    if (hostVarsSyncRef.current) return;
    if (!activeAlias) return;
    const host = credentials.host?.trim() || "";
    const portRaw = credentials.port?.trim() || "";
    const user = credentials.user?.trim() || "";
    const description = credentials.description?.trim() || "";
    const primaryDomain = credentials.primaryDomain?.trim() || "";
    const requirementServerType = String(
      credentials.requirementServerType || ""
    )
      .trim()
      .toLowerCase();
    const requirementStorageGbRaw = String(
      credentials.requirementStorageGb || ""
    ).trim();
    const requirementStorageGbParsed = Number(requirementStorageGbRaw);
    const requirementStorageGb =
      requirementStorageGbRaw &&
      Number.isFinite(requirementStorageGbParsed) &&
      requirementStorageGbParsed >= 0
        ? String(Math.floor(requirementStorageGbParsed))
        : "";
    const requirementLocation = String(
      credentials.requirementLocation || ""
    ).trim();
    const color = normalizeDeviceColor(credentials.color) || "";
    const logoEmoji = normalizeDeviceEmoji(credentials.logoEmoji) || "";
    const targetPath =
      hostVarsPath ||
      (activeAlias ? `host_vars/${sanitizeAliasFilename(activeAlias)}.yml` : null);
    if (!targetPath) return;
    if (activePath === targetPath && editorDirty) return;
    if (
      !host &&
      !user &&
      !description &&
      !primaryDomain &&
      !requirementServerType &&
      !requirementStorageGb &&
      !requirementLocation &&
      !color &&
      !logoEmoji
    ) {
      return;
    }

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
      if (description) {
        if (data.description !== description) {
          data.description = description;
          changed = true;
        }
      } else if (Object.prototype.hasOwnProperty.call(data, "description")) {
        delete data.description;
        changed = true;
      }
      if (primaryDomain) {
        if (data.DOMAIN_PRIMARY !== primaryDomain) {
          data.DOMAIN_PRIMARY = primaryDomain;
          changed = true;
        }
      } else if (Object.prototype.hasOwnProperty.call(data, "DOMAIN_PRIMARY")) {
        delete data.DOMAIN_PRIMARY;
        changed = true;
      }
      const requirementsNode =
        data.server_requirements &&
        typeof data.server_requirements === "object" &&
        !Array.isArray(data.server_requirements)
          ? { ...data.server_requirements }
          : {};
      let requirementsChanged = false;
      if (requirementServerType) {
        if (requirementsNode.server_type !== requirementServerType) {
          requirementsNode.server_type = requirementServerType;
          requirementsChanged = true;
        }
      } else if (
        Object.prototype.hasOwnProperty.call(requirementsNode, "server_type")
      ) {
        delete requirementsNode.server_type;
        requirementsChanged = true;
      }
      if (requirementStorageGb) {
        const storageValue = Number(requirementStorageGb);
        if (requirementsNode.storage_gb !== storageValue) {
          requirementsNode.storage_gb = storageValue;
          requirementsChanged = true;
        }
      } else if (
        Object.prototype.hasOwnProperty.call(requirementsNode, "storage_gb")
      ) {
        delete requirementsNode.storage_gb;
        requirementsChanged = true;
      }
      if (requirementLocation) {
        if (requirementsNode.location !== requirementLocation) {
          requirementsNode.location = requirementLocation;
          requirementsChanged = true;
        }
      } else if (
        Object.prototype.hasOwnProperty.call(requirementsNode, "location")
      ) {
        delete requirementsNode.location;
        requirementsChanged = true;
      }
      if (requirementsChanged) {
        if (Object.keys(requirementsNode).length > 0) {
          data.server_requirements = requirementsNode;
        } else if (
          Object.prototype.hasOwnProperty.call(data, "server_requirements")
        ) {
          delete data.server_requirements;
        }
        changed = true;
      }
      if (color && data.color !== color) {
        data.color = color;
        changed = true;
      }
      if (logoEmoji) {
        const currentLogo: Record<string, any> =
          data.logo && typeof data.logo === "object" ? { ...data.logo } : {};
        if (currentLogo.emoji !== logoEmoji) {
          currentLogo.emoji = logoEmoji;
          changed = true;
        }
        data.logo = currentLogo;
      } else if (
        data.logo &&
        typeof data.logo === "object" &&
        Object.prototype.hasOwnProperty.call(data.logo, "emoji")
      ) {
        const nextLogo: Record<string, any> = { ...data.logo };
        delete nextLogo.emoji;
        if (Object.keys(nextLogo).length === 0) {
          delete data.logo;
        } else {
          data.logo = nextLogo;
        }
        changed = true;
      }
      const prevPort = lastPortRef.current;
      lastPortRef.current = portRaw;
      if (portRaw) {
        const portNum = Number(portRaw);
        if (Number.isInteger(portNum) && portNum >= 1 && portNum <= 65535) {
          const existing =
            typeof data.ansible_port === "number"
              ? data.ansible_port
              : Number.isInteger(Number(data.ansible_port))
              ? Number(data.ansible_port)
              : null;
          if (existing !== portNum) {
            data.ansible_port = portNum;
            changed = true;
          }
        }
      } else if (prevPort && Object.prototype.hasOwnProperty.call(data, "ansible_port")) {
        delete data.ansible_port;
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

  const syncCredentialsFromHostVars = async (editorDirty: boolean) => {
    if (!workspaceId || !hostVarsPath) return;
    if (!onCredentialsPatch) return;
    if (hostVarsSyncRef.current) return;
    if (activePath === hostVarsPath && editorDirty) return;
    try {
      const content = await readWorkspaceFile(hostVarsPath);
      const data = (YAML.parse(content) ?? {}) as Record<string, any>;
      const patch = buildCredentialsPatchFromHostVarsData(data, credentials);
      if (Object.keys(patch).length > 0) {
        onCredentialsPatch(patch);
      }
    } catch {
      // ignore
    }
  };

  return {
    syncInventoryReady,
    mergeRolesByAlias,
    updateWorkspaceUrl,
    resetWorkspaceState,
    rememberWorkspace,
    refreshFiles,
    selectWorkspace,
    readWorkspaceFile,
    writeWorkspaceFile,
    renameWorkspaceFile,
    createWorkspace,
    initWorkspace,
    deleteWorkspace,
    toggleDir,
    lockKdbx,
    loadKdbx,
    handleKdbxSubmit,
    loadFile,
    validateEditor,
    saveFile,
    generateInventory,
    resolveTargetRoles,
    renameAliasInInventory,
    removeAliasFromInventory,
    syncInventoryWithSelection,
    syncSelectionFromInventory,
    syncHostVarsFromCredentials,
    syncCredentialsFromHostVars,
  };
}
