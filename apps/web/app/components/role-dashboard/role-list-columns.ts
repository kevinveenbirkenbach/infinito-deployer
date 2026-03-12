import type { Role } from "./types";

export const LIST_COLUMN_GAP_PX = 12;

export type OptionalListColumnKey =
  | "version"
  | "status"
  | "targets"
  | "description"
  | "links"
  | "price";

export type ListColumnKey = "software" | OptionalListColumnKey | "enabled";

export const LIST_COLUMN_ORDER: ListColumnKey[] = [
  "software",
  "version",
  "status",
  "targets",
  "description",
  "links",
  "price",
  "enabled",
];

export const OPTIONAL_LIST_COLUMNS: OptionalListColumnKey[] = [
  "version",
  "price",
  "status",
  "targets",
  "description",
  "links",
];

export const LIST_COLUMN_LABEL: Record<ListColumnKey, string> = {
  software: "Software",
  version: "Version",
  status: "Status",
  targets: "Targets",
  description: "Description",
  links: "Links",
  price: "Price",
  enabled: "Enabled",
};

export const LIST_COLUMN_TEMPLATE: Record<ListColumnKey, string> = {
  software: "minmax(188px, 2.1fr)",
  version: "minmax(92px, 0.75fr)",
  status: "minmax(94px, 0.8fr)",
  targets: "minmax(116px, 0.95fr)",
  description: "minmax(186px, 1.8fr)",
  links: "minmax(102px, 0.8fr)",
  price: "minmax(96px, 0.8fr)",
  enabled: "minmax(132px, 0.95fr)",
};

export const LIST_COLUMN_MIN_WIDTH: Record<ListColumnKey, number> = {
  software: 188,
  version: 92,
  status: 94,
  targets: 116,
  description: 186,
  links: 102,
  price: 96,
  enabled: 132,
};

export function collapseEmojiForRole(role: Role): string {
  const targets = (role.deployment_targets || []).map((entry) =>
    String(entry || "").trim().toLowerCase()
  );
  const hasUniversal = targets.includes("universal");
  const hasServer = targets.includes("server");
  const hasWorkstation = targets.includes("workstation");
  if (hasUniversal || (hasServer && hasWorkstation)) return "🧩";
  if (hasServer) return "🖥️";
  if (hasWorkstation) return "💻";
  return "📦";
}
