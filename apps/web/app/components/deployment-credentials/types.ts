export type ServerState = {
  alias: string;
  description: string;
  primaryDomain: string;
  requirementServerType: string;
  requirementStorageGb: string;
  requirementLocation: string;
  host: string;
  port: string;
  user: string;
  color: string;
  logoEmoji: string;
  authMethod: string;
  password: string;
  privateKey: string;
  publicKey: string;
  keyAlgorithm: string;
  keyPassphrase: string;
};

export type FormState = {
  alias: string;
  host: string;
  port: string;
  user: string;
  authMethod: string;
  password: string;
  privateKey: string;
};

export type FormErrors = Partial<Record<keyof FormState, string>>;

export type ConnectionResult = {
  ping_ok: boolean;
  ping_error?: string | null;
  ssh_ok: boolean;
  ssh_error?: string | null;
};

export const SERVER_VIEW_MODES = [
  "detail",
  "list",
  "mini",
  "matrix",
  "row",
  "column",
] as const;
export type ServerViewMode = (typeof SERVER_VIEW_MODES)[number];

export const SERVER_VIEW_CONFIG: Record<
  ServerViewMode,
  { minWidth: number; minHeight: number; dense: boolean }
> = {
  detail: { minWidth: 320, minHeight: 240, dense: false },
  list: { minWidth: 600, minHeight: 84, dense: true },
  mini: { minWidth: 220, minHeight: 160, dense: true },
  matrix: { minWidth: 960, minHeight: 84, dense: true },
  row: { minWidth: 700, minHeight: 188, dense: false },
  column: { minWidth: 620, minHeight: 220, dense: false },
};

export const FIELD_LABELS: Record<string, string> = {
  alias: "Alias",
  host: "Host",
  port: "Port",
  user: "User",
  authMethod: "Credential type",
  password: "Password",
  privateKey: "Private key",
};
