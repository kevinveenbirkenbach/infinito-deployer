export type ServerState = {
  alias: string;
  description: string;
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

export const SERVER_VIEW_MODES = ["selection", "list"] as const;
export type ServerViewMode = (typeof SERVER_VIEW_MODES)[number];

export const SERVER_VIEW_CONFIG: Record<
  ServerViewMode,
  { minWidth: number; minHeight: number; dense: boolean }
> = {
  selection: { minWidth: 260, minHeight: 190, dense: true },
  list: { minWidth: 600, minHeight: 72, dense: true },
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
