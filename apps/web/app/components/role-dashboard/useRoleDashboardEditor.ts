import { useState } from "react";
import type { Dispatch, SetStateAction } from "react";
import type { Role } from "./types";

type RoleAppConfigPayload = {
  role_id: string;
  alias: string;
  host_vars_path: string;
  content: string;
  imported_paths?: number;
};

type UseRoleDashboardEditorParams = {
  onLoadRoleAppConfig?: (roleId: string, alias?: string) => Promise<RoleAppConfigPayload>;
  onSaveRoleAppConfig?: (
    roleId: string,
    content: string,
    alias?: string
  ) => Promise<RoleAppConfigPayload>;
  onImportRoleAppDefaults?: (
    roleId: string,
    alias?: string
  ) => Promise<RoleAppConfigPayload>;
};

type UseRoleDashboardEditorResult = {
  editingRole: Role | null;
  setEditingRole: Dispatch<SetStateAction<Role | null>>;
  editorContent: string;
  editorPath: string;
  editorAlias: string;
  editorBusy: boolean;
  editorError: string | null;
  editorStatus: string | null;
  setEditorContent: Dispatch<SetStateAction<string>>;
  setEditorError: Dispatch<SetStateAction<string | null>>;
  setEditorStatus: Dispatch<SetStateAction<string | null>>;
  startEditRoleConfig: (role: Role, aliasOverride?: string) => Promise<void>;
  saveRoleConfig: () => Promise<void>;
  importRoleDefaults: () => Promise<void>;
};

export function useRoleDashboardEditor({
  onLoadRoleAppConfig,
  onSaveRoleAppConfig,
  onImportRoleAppDefaults,
}: UseRoleDashboardEditorParams): UseRoleDashboardEditorResult {
  const [editingRole, setEditingRole] = useState<Role | null>(null);
  const [editorContent, setEditorContent] = useState("");
  const [editorPath, setEditorPath] = useState("");
  const [editorAlias, setEditorAlias] = useState("");
  const [editorBusy, setEditorBusy] = useState(false);
  const [editorError, setEditorError] = useState<string | null>(null);
  const [editorStatus, setEditorStatus] = useState<string | null>(null);

  const startEditRoleConfig = async (role: Role, aliasOverride?: string) => {
    if (!onLoadRoleAppConfig) return;
    const requestedAlias = String(aliasOverride || "").trim();
    setEditingRole(role);
    setEditorBusy(true);
    setEditorError(null);
    setEditorStatus(null);
    setEditorAlias(requestedAlias);
    try {
      const data = await onLoadRoleAppConfig(role.id, requestedAlias || undefined);
      setEditorContent(String(data?.content ?? ""));
      setEditorPath(String(data?.host_vars_path ?? ""));
      setEditorAlias(String(data?.alias ?? requestedAlias));
    } catch (err: any) {
      setEditorError(err?.message ?? "failed to load app config");
      setEditorContent("");
      setEditorPath("");
      setEditorAlias(requestedAlias);
    } finally {
      setEditorBusy(false);
    }
  };

  const saveRoleConfig = async () => {
    if (!editingRole || !onSaveRoleAppConfig) return;
    setEditorBusy(true);
    setEditorError(null);
    setEditorStatus(null);
    try {
      const data = await onSaveRoleAppConfig(
        editingRole.id,
        editorContent,
        editorAlias || undefined
      );
      setEditorContent(String(data?.content ?? editorContent));
      setEditorPath(String(data?.host_vars_path ?? editorPath));
      setEditorAlias(String(data?.alias ?? editorAlias));
      setEditorStatus("Saved.");
    } catch (err: any) {
      setEditorError(err?.message ?? "failed to save app config");
    } finally {
      setEditorBusy(false);
    }
  };

  const importRoleDefaults = async () => {
    if (!editingRole || !onImportRoleAppDefaults) return;
    setEditorBusy(true);
    setEditorError(null);
    setEditorStatus(null);
    try {
      const data = await onImportRoleAppDefaults(
        editingRole.id,
        editorAlias || undefined
      );
      setEditorContent(String(data?.content ?? editorContent));
      setEditorPath(String(data?.host_vars_path ?? editorPath));
      setEditorAlias(String(data?.alias ?? editorAlias));
      const imported = Number(data?.imported_paths ?? 0);
      setEditorStatus(
        imported > 0
          ? `Imported ${imported} missing paths from config/main.yml.`
          : "No missing defaults to import."
      );
    } catch (err: any) {
      setEditorError(err?.message ?? "failed to import defaults");
    } finally {
      setEditorBusy(false);
    }
  };

  return {
    editingRole,
    setEditingRole,
    editorContent,
    editorPath,
    editorAlias,
    editorBusy,
    editorError,
    editorStatus,
    setEditorContent,
    setEditorError,
    setEditorStatus,
    startEditRoleConfig,
    saveRoleConfig,
    importRoleDefaults,
  };
}
