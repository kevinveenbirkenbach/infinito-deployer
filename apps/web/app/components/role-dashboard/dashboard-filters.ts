import type { ViewMode } from "./types";

export const ROW_FILTER_OPTIONS: number[] = [1, 2, 3, 5, 10, 20, 100, 500, 1000];
export const DEFAULT_VIEW_MODES: ViewMode[] = ["detail", "list", "mini", "matrix"];
export const ANIMATED_VIEW_MODES: ViewMode[] = ["row", "column"];

export function formatViewLabel(mode: ViewMode): string {
  return mode.charAt(0).toUpperCase() + mode.slice(1);
}

export type SoftwareScope = "apps" | "bundles";

export const TARGET_FILTER_OPTIONS = [
  "all",
  "universal",
  "server",
  "workstation",
] as const;

export type DeployTargetFilter = (typeof TARGET_FILTER_OPTIONS)[number];

const TARGET_FILTER_SET = new Set<string>(TARGET_FILTER_OPTIONS);

export type ReleaseTrack = "stable" | "preview";

const RELEASE_TRACK_OPTIONS = ["stable", "preview"] as const;
const RELEASE_TRACK_SET = new Set<string>(RELEASE_TRACK_OPTIONS);

export const TARGET_FILTER_META: Record<
  DeployTargetFilter,
  { iconClass: string; tooltip: string }
> = {
  all: {
    iconClass: "fa-solid fa-globe",
    tooltip: "Show software for all deploy targets.",
  },
  universal: {
    iconClass: "fa-solid fa-infinity",
    tooltip: "Show only software that is deployable on universal targets.",
  },
  server: {
    iconClass: "fa-solid fa-server",
    tooltip: "Show only software for server deployments.",
  },
  workstation: {
    iconClass: "fa-solid fa-laptop-code",
    tooltip: "Show only software for workstation deployments.",
  },
};

export const STATUS_FILTER_META: Record<string, { iconClass: string; tooltip: string }> = {
  stable: {
    iconClass: "fa-solid fa-circle-check",
    tooltip: "Stable lifecycle stage.",
  },
  maintenance: {
    iconClass: "fa-solid fa-screwdriver-wrench",
    tooltip: "Maintenance lifecycle stage.",
  },
  beta: {
    iconClass: "fa-solid fa-flask",
    tooltip: "Beta lifecycle stage.",
  },
  alpha: {
    iconClass: "fa-solid fa-vial",
    tooltip: "Alpha lifecycle stage.",
  },
  "pre-alpha": {
    iconClass: "fa-solid fa-seedling",
    tooltip: "Pre-alpha lifecycle stage.",
  },
  deprecated: {
    iconClass: "fa-solid fa-box-archive",
    tooltip: "Deprecated lifecycle stage.",
  },
};

export const LIFECYCLE_STABLE_ALLOWED = new Set<string>([
  "beta",
  "stable",
  "maintenance",
]);

export const LIFECYCLE_PREVIEW_EXPERT_ALLOWED = new Set<string>([
  "alpha",
  "beta",
  "stable",
  "maintenance",
]);

export const FILTER_TOOLTIPS = {
  rows: "Choose how many rows are rendered in row/column views.",
  deployTarget: "Filter software by deploy target.",
  lifecycle: "Filter apps and bundles by lifecycle status.",
  selection: "Filter apps by enabled/disabled selection state.",
  categories: "Filter software by metadata categories.",
  tags: "Filter software by galaxy tags.",
} as const;

export const SW_QUERY_KEYS = {
  scope: "sw_scope",
  track: "sw_track",
  search: "sw_search",
  target: "sw_target",
  status: "sw_status",
  categories: "sw_categories",
  tags: "sw_tags",
  selected: "sw_selected",
  view: "sw_view",
  rows: "sw_rows",
  listOpen: "sw_list_open",
  listClosed: "sw_list_closed",
  bundleListOpen: "sw_bundle_list_open",
  bundleListClosed: "sw_bundle_list_closed",
} as const;

export function normalizeFacet(value: string): string {
  return String(value || "").trim().toLowerCase();
}

export function isReleaseTrack(value: string): value is ReleaseTrack {
  return RELEASE_TRACK_SET.has(value);
}

export function normalizeDeployTarget(value: string): string {
  const normalized = normalizeFacet(value);
  if (normalized === "servers") return "server";
  if (normalized === "workstations") return "workstation";
  return normalized;
}

export function isDeployTargetFilter(value: string): value is DeployTargetFilter {
  return TARGET_FILTER_SET.has(value);
}

export function parseCsvParam(value: string | null): string[] {
  return String(value || "")
    .split(",")
    .map((entry) => String(entry || "").trim())
    .filter(Boolean);
}

export function parseFacetCsvParam(value: string | null): string[] {
  return String(value || "")
    .split(",")
    .map((entry) => normalizeFacet(entry))
    .filter(Boolean);
}

export function parseListColumnCsvParam<T extends string>(
  value: string | null,
  allowedColumns: readonly T[]
): T[] {
  const allowedSet = new Set<string>(allowedColumns);
  const seen = new Set<T>();
  String(value || "")
    .split(",")
    .map((entry) => String(entry || "").trim().toLowerCase())
    .forEach((entry) => {
      if (!allowedSet.has(entry)) return;
      seen.add(entry as T);
    });
  return allowedColumns.filter((entry) => seen.has(entry));
}

export function normalizeListColumnState<T extends string>(
  openColumns: T[],
  closedColumns: T[],
  allColumns: readonly T[]
): {
  open: T[];
  closed: T[];
} {
  const openSet = new Set<T>(openColumns);
  const closedSet = new Set<T>(closedColumns);
  allColumns.forEach((column) => {
    if (openSet.has(column) && closedSet.has(column)) {
      openSet.delete(column);
    }
  });
  return {
    open: allColumns.filter((column) => openSet.has(column)),
    closed: allColumns.filter((column) => closedSet.has(column)),
  };
}

export function collectFacetValues<T>(
  entries: T[],
  getter: (entry: T) => string[] | null | undefined
): string[] {
  const seen = new Map<string, string>();
  entries.forEach((item) => {
    (getter(item) || []).forEach((entry) => {
      const label = String(entry || "").trim();
      const key = normalizeFacet(label);
      if (!label || !key || seen.has(key)) return;
      seen.set(key, label);
    });
  });
  return Array.from(seen.values()).sort((a, b) => a.localeCompare(b));
}
