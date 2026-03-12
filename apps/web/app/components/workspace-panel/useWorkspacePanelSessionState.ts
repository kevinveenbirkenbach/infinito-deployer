import { useEffect, useState } from "react";
import type { WorkspaceListEntry } from "./types";

type UseWorkspacePanelSessionStateParams = {
  readQueryParam: (name: string) => string | null;
  userStorageKey: string;
};

export function useWorkspacePanelSessionState({
  readQueryParam,
  userStorageKey,
}: UseWorkspacePanelSessionStateParams) {
  const [userId, setUserId] = useState<string | null>(null);
  const [workspaceList, setWorkspaceList] = useState<WorkspaceListEntry[]>([]);
  const [workspaceSwitcherTarget, setWorkspaceSwitcherTarget] =
    useState<HTMLElement | null>(null);

  useEffect(() => {
    if (typeof document === "undefined") return;
    setWorkspaceSwitcherTarget(document.getElementById("workspace-switcher-slot"));
  }, []);

  useEffect(() => {
    if (typeof window === "undefined") return;
    const sync = () => {
      const fromQuery = readQueryParam("user") || readQueryParam("workspace_user");
      const stored = window.localStorage.getItem(userStorageKey);
      const resolved = fromQuery || stored;
      if (resolved) {
        if (fromQuery && fromQuery !== stored) {
          window.localStorage.setItem(userStorageKey, resolved);
        }
        setUserId(resolved);
      } else {
        setUserId(null);
      }
    };
    sync();

    const onStorage = (event: StorageEvent) => {
      if (event.key && event.key !== userStorageKey) return;
      sync();
    };
    const onSessionUpdate = () => sync();

    window.addEventListener("storage", onStorage);
    window.addEventListener("infinito:account-session-updated", onSessionUpdate);
    return () => {
      window.removeEventListener("storage", onStorage);
      window.removeEventListener("infinito:account-session-updated", onSessionUpdate);
    };
  }, [readQueryParam, userStorageKey]);

  useEffect(() => {
    if (!userId) {
      setWorkspaceList([]);
    }
  }, [userId]);

  return {
    userId,
    setUserId,
    workspaceList,
    setWorkspaceList,
    workspaceSwitcherTarget,
  };
}
