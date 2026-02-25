import { useCallback, useEffect, useMemo, useState } from "react";
import type {
  HistoryOpenIntent,
  WorkspaceHistoryCommit,
  WorkspaceHistoryFileChange,
} from "./types";

type Args = {
  baseUrl: string;
  workspaceId: string | null;
  readApiDetail: (res: Response) => Promise<string>;
  refreshFiles: (workspaceId: string) => Promise<void>;
  activePath: string | null;
  loadFile: (path: string) => Promise<void>;
  setEditorDirty: (dirty: boolean) => void;
};

export function useWorkspaceHistory({
  baseUrl,
  workspaceId,
  readApiDetail,
  refreshFiles,
  activePath,
  loadFile,
  setEditorDirty,
}: Args) {
  const [historyOpen, setHistoryOpen] = useState(false);
  const [historyLoading, setHistoryLoading] = useState(false);
  const [historyDiffLoading, setHistoryDiffLoading] = useState(false);
  const [historyRestoreBusy, setHistoryRestoreBusy] = useState(false);
  const [historyError, setHistoryError] = useState<string | null>(null);
  const [historyStatus, setHistoryStatus] = useState<string | null>(null);
  const [historyScopePath, setHistoryScopePath] = useState<string | null>(null);
  const [historyScopeIsDir, setHistoryScopeIsDir] = useState(false);
  const [historyOpenIntent, setHistoryOpenIntent] =
    useState<HistoryOpenIntent>("history");
  const [historyAgainstCurrent, setHistoryAgainstCurrent] = useState(false);
  const [historyCommits, setHistoryCommits] = useState<WorkspaceHistoryCommit[]>([]);
  const [historySelectedSha, setHistorySelectedSha] = useState<string | null>(null);
  const [historyDiff, setHistoryDiff] = useState("");
  const [historyDiffFiles, setHistoryDiffFiles] = useState<
    WorkspaceHistoryFileChange[]
  >([]);

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
    (
      path: string | null = null,
      isDir = false,
      intent: HistoryOpenIntent = "history"
    ) => {
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
    setEditorDirty,
    workspaceId,
  ]);

  const restoreHistoryPath = useCallback(async () => {
    if (!workspaceId || !historySelectedSha || !historyScopePath || historyRestoreBusy) {
      return;
    }
    const label = historyScopeIsDir ? "folder" : "file";
    const confirmed = window.confirm(
      `Restore ${label} '${historyScopePath}' from commit ${historySelectedSha.slice(
        0,
        12
      )}?`
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
    setEditorDirty,
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

  return {
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
  };
}
