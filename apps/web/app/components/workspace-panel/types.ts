export type FileEntry = {
  path: string;
  is_dir: boolean;
  size?: number | null;
  modified_at?: string | null;
};

export type CredentialsState = {
  alias: string;
  description: string;
  host: string;
  port: string;
  user: string;
  color: string;
  logoEmoji: string;
  authMethod: string;
};

export type WorkspacePanelProps = {
  baseUrl: string;
  selectedRolesByAlias: Record<string, string[]>;
  credentials: CredentialsState;
  onCredentialsPatch?: (patch: Partial<CredentialsState>) => void;
  onInventoryReadyChange?: (ready: boolean) => void;
  onSelectedRolesByAliasChange?: (rolesByAlias: Record<string, string[]>) => void;
  onWorkspaceIdChange?: (id: string | null) => void;
  aliasRenames?: { from: string; to: string }[];
  onAliasRenamesHandled?: (count: number) => void;
  aliasDeletes?: string[];
  onAliasDeletesHandled?: (count: number) => void;
  aliasCleanups?: string[];
  onAliasCleanupsHandled?: (count: number) => void;
  selectionTouched?: boolean;
  compact?: boolean;
};

export type TreeNode = {
  name: string;
  path: string;
  isDir: boolean;
  size?: number | null;
  children: Map<string, TreeNode>;
};

export type TreeItem = {
  name: string;
  path: string;
  isDir: boolean;
  depth: number;
  size?: number | null;
};

export type KdbxEntryView = {
  id: string;
  group: string;
  title: string;
  username: string;
  password: string;
  url: string;
  notes: string;
};

export type VaultBlock = {
  key: string;
  start: number;
  end: number;
  indent: string;
};

export type WorkspaceListEntry = {
  id: string;
  created_at?: string | null;
  last_used?: string | null;
};
