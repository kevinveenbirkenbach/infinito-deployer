import { useCallback, useEffect, useRef, useState } from "react";

type UseUnsavedChangesGuardParams = {
  workspaceId: string | null;
  activePath: string | null;
  isKdbx: boolean;
  editorDirty: boolean;
  editorValue: string;
  saveFile: (editorValue: string, editorDirty: boolean) => Promise<boolean>;
};

export function useUnsavedChangesGuard({
  workspaceId,
  activePath,
  isKdbx,
  editorDirty,
  editorValue,
  saveFile,
}: UseUnsavedChangesGuardParams) {
  const [saveInProgress, setSaveInProgress] = useState(false);
  const [lastSaveAckAt, setLastSaveAckAt] = useState<string | null>(null);
  const [leaveGuardOpen, setLeaveGuardOpen] = useState(false);
  const [leaveGuardMessage, setLeaveGuardMessage] = useState<string | null>(null);

  const autosaveTimerRef = useRef<number | null>(null);
  const pendingLeaveActionRef = useRef<(() => void) | null>(null);
  const bypassLeaveGuardRef = useRef(false);

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

  const hasUnsavedChanges = editorDirty || saveInProgress;

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
      setLeaveGuardMessage("Saving failed. Fix validation or API errors and try again.");
      return;
    }
    executePendingLeaveAction();
  }, [executePendingLeaveAction, flushPendingEditorSave]);

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

  return {
    saveInProgress,
    lastSaveAckAt,
    leaveGuardOpen,
    leaveGuardMessage,
    queueLeaveAction,
    cancelPendingLeaveAction,
    saveAndExecutePendingLeaveAction,
    flushPendingEditorSave,
  };
}
