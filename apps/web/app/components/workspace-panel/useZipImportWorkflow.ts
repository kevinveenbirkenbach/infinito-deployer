import { useCallback, useEffect, useState } from "react";
import type { ChangeEvent } from "react";
import type { ZipImportMode, ZipImportPreviewFile } from "./types";

type PreviewZipFn = (file: File) => Promise<ZipImportPreviewFile[]>;

type UploadZipFn = (
  file: File,
  options?: {
    defaultMode?: ZipImportMode;
    perFileMode?: Record<string, ZipImportMode>;
  }
) => Promise<{ ok: boolean; error?: string }>;

type UseZipImportWorkflowParams = {
  workspaceId: string | null;
  uploadBusy: boolean;
  previewZip: PreviewZipFn;
  uploadZip: UploadZipFn;
  setUploadError: (value: string | null) => void;
  setUploadStatus: (value: string | null) => void;
};

const DEFAULT_ZIP_IMPORT_MODE: ZipImportMode = "override";

export function useZipImportWorkflow({
  workspaceId,
  uploadBusy,
  previewZip,
  uploadZip,
  setUploadError,
  setUploadStatus,
}: UseZipImportWorkflowParams) {
  const [zipImportModalOpen, setZipImportModalOpen] = useState(false);
  const [zipImportPreviewBusy, setZipImportPreviewBusy] = useState(false);
  const [zipImportFile, setZipImportFile] = useState<File | null>(null);
  const [zipImportItems, setZipImportItems] = useState<ZipImportPreviewFile[]>([]);
  const [zipImportModeByPath, setZipImportModeByPath] = useState<
    Record<string, ZipImportMode>
  >({});
  const [zipImportApplyAll, setZipImportApplyAll] = useState(false);
  const [zipImportAllMode, setZipImportAllMode] =
    useState<ZipImportMode>(DEFAULT_ZIP_IMPORT_MODE);
  const [zipImportError, setZipImportError] = useState<string | null>(null);

  const resetZipImportState = useCallback(() => {
    setZipImportModalOpen(false);
    setZipImportPreviewBusy(false);
    setZipImportFile(null);
    setZipImportItems([]);
    setZipImportModeByPath({});
    setZipImportApplyAll(false);
    setZipImportAllMode(DEFAULT_ZIP_IMPORT_MODE);
    setZipImportError(null);
  }, []);

  useEffect(() => {
    resetZipImportState();
  }, [workspaceId, resetZipImportState]);

  const applyZipImportModeToAll = useCallback(
    (mode: ZipImportMode) => {
      setZipImportModeByPath(() => {
        const next: Record<string, ZipImportMode> = {};
        zipImportItems.forEach((item) => {
          next[item.path] = mode;
        });
        return next;
      });
    },
    [zipImportItems]
  );

  const closeZipImportModal = useCallback(() => {
    if (uploadBusy || zipImportPreviewBusy) return;
    resetZipImportState();
  }, [uploadBusy, zipImportPreviewBusy, resetZipImportState]);

  const setZipImportApplyToAll = useCallback(
    (checked: boolean) => {
      setZipImportApplyAll(checked);
      if (checked) {
        applyZipImportModeToAll(zipImportAllMode);
      }
    },
    [applyZipImportModeToAll, zipImportAllMode]
  );

  const setZipImportAllModeWithApply = useCallback(
    (mode: ZipImportMode) => {
      setZipImportAllMode(mode);
      if (zipImportApplyAll) {
        applyZipImportModeToAll(mode);
      }
    },
    [applyZipImportModeToAll, zipImportApplyAll]
  );

  const setZipImportModeForPath = useCallback(
    (path: string, mode: ZipImportMode) => {
      if (zipImportApplyAll) {
        setZipImportAllMode(mode);
        applyZipImportModeToAll(mode);
        return;
      }
      setZipImportModeByPath((prev) => ({
        ...prev,
        [path]: mode,
      }));
    },
    [applyZipImportModeToAll, zipImportApplyAll]
  );

  const confirmZipImport = useCallback(async () => {
    if (!zipImportFile || !workspaceId || uploadBusy) return;
    setZipImportError(null);

    const perFileMode: Record<string, ZipImportMode> = {};
    zipImportItems.forEach((item) => {
      perFileMode[item.path] =
        zipImportModeByPath[item.path] ||
        (item.exists ? "merge" : DEFAULT_ZIP_IMPORT_MODE);
    });

    const result = await uploadZip(zipImportFile, {
      defaultMode: zipImportApplyAll ? zipImportAllMode : DEFAULT_ZIP_IMPORT_MODE,
      perFileMode: zipImportApplyAll ? {} : perFileMode,
    });

    if (!result.ok) {
      const hint = "For non-YAML/JSON files, choose Override instead of Merge.";
      const message = String(result.error || "").trim();
      setZipImportError(
        message ? `Import failed: ${message}` : `Import failed. ${hint}`
      );
      return;
    }

    resetZipImportState();
  }, [
    workspaceId,
    uploadBusy,
    uploadZip,
    zipImportAllMode,
    zipImportApplyAll,
    zipImportFile,
    zipImportItems,
    zipImportModeByPath,
    resetZipImportState,
  ]);

  const onUploadSelect = useCallback(
    (event: ChangeEvent<HTMLInputElement>) => {
      const file = event.target.files?.[0];
      if (file) {
        void (async () => {
          if (!workspaceId || uploadBusy) return;
          setZipImportPreviewBusy(true);
          setZipImportError(null);
          setUploadError(null);
          setUploadStatus(null);
          try {
            const items = await previewZip(file);
            if (items.length === 0) {
              throw new Error("ZIP contains no importable files.");
            }
            const nextModeByPath: Record<string, ZipImportMode> = {};
            items.forEach((item) => {
              nextModeByPath[item.path] = item.exists ? "merge" : DEFAULT_ZIP_IMPORT_MODE;
            });
            setZipImportFile(file);
            setZipImportItems(items);
            setZipImportModeByPath(nextModeByPath);
            setZipImportApplyAll(false);
            setZipImportAllMode(DEFAULT_ZIP_IMPORT_MODE);
            setZipImportModalOpen(true);
          } catch (err: any) {
            setUploadError(err?.message ?? "failed to inspect zip");
          } finally {
            setZipImportPreviewBusy(false);
          }
        })();
      }
      event.target.value = "";
    },
    [
      previewZip,
      workspaceId,
      uploadBusy,
      setUploadError,
      setUploadStatus,
    ]
  );

  return {
    zipImportModalOpen,
    zipImportPreviewBusy,
    zipImportFile,
    zipImportItems,
    zipImportModeByPath,
    zipImportApplyAll,
    zipImportAllMode,
    zipImportError,
    importActionBusy: uploadBusy || zipImportPreviewBusy,
    onUploadSelect,
    closeZipImportModal,
    setZipImportApplyToAll,
    setZipImportAllModeWithApply,
    setZipImportModeForPath,
    confirmZipImport,
  };
}
