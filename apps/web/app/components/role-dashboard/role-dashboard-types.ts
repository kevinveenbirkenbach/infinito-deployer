import type { ReactNode } from "react";
import type { Role } from "./types";

export type RoleAppConfigPayload = {
  role_id: string;
  alias: string;
  host_vars_path: string;
  content: string;
  imported_paths?: number;
};

export type RoleDashboardProps = {
  baseUrl?: string;
  roles: Role[];
  loading: boolean;
  error: string | null;
  selected: Set<string>;
  onToggleSelected: (id: string) => void;
  onLoadRoleAppConfig?: (
    roleId: string,
    alias?: string
  ) => Promise<RoleAppConfigPayload>;
  onSaveRoleAppConfig?: (
    roleId: string,
    content: string,
    alias?: string
  ) => Promise<RoleAppConfigPayload>;
  onImportRoleAppDefaults?: (
    roleId: string,
    alias?: string
  ) => Promise<RoleAppConfigPayload>;
  activeAlias?: string;
  serverAliases?: string[];
  serverMetaByAlias?: Record<string, { logoEmoji?: string | null; color?: string | null }>;
  selectedByAlias?: Record<string, string[]>;
  onToggleSelectedForAlias?: (alias: string, roleId: string) => void;
  selectedPlanByAlias?: Record<string, Record<string, string | null>>;
  onSelectPlanForAlias?: (
    alias: string,
    roleId: string,
    planId: string | null
  ) => void;
  serverSwitcher?: ReactNode;
  onCreateServerForTarget?: (target: string) => string | null;
  mode?: "customer" | "expert";
  onModeChange?: (mode: "customer" | "expert") => void;
  compact?: boolean;
};
