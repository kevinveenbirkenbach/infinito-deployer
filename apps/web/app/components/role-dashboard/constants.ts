import type { StatusColor, ViewConfig, ViewMode } from "./types";

export const STATUS_ORDER = [
  "stable",
  "beta",
  "alpha",
  "pre-alpha",
  "deprecated",
];

export const STATUS_COLORS: Record<string, StatusColor> = {
  stable: {
    bg: "var(--bs-success-bg-subtle)",
    fg: "var(--bs-success-text-emphasis)",
    border: "var(--bs-success-border-subtle)",
  },
  beta: {
    bg: "var(--bs-info-bg-subtle)",
    fg: "var(--bs-info-text-emphasis)",
    border: "var(--bs-info-border-subtle)",
  },
  alpha: {
    bg: "var(--bs-warning-bg-subtle)",
    fg: "var(--bs-warning-text-emphasis)",
    border: "var(--bs-warning-border-subtle)",
  },
  "pre-alpha": {
    bg: "var(--bs-danger-bg-subtle)",
    fg: "var(--bs-danger-text-emphasis)",
    border: "var(--bs-danger-border-subtle)",
  },
  deprecated: {
    bg: "var(--bs-secondary-bg-subtle)",
    fg: "var(--bs-secondary-text-emphasis)",
    border: "var(--bs-secondary-border-subtle)",
  },
};

export const STATUS_COLOR_FALLBACK: StatusColor = {
  bg: "var(--bs-secondary-bg-subtle)",
  fg: "var(--bs-secondary-text-emphasis)",
  border: "var(--bs-secondary-border-subtle)",
};

export const SIMPLEICON_CDN = "https://cdn.simpleicons.org";

export const SIMPLEICON_STOP_WORDS = new Set([
  "the",
  "and",
  "for",
  "server",
  "service",
  "app",
  "apps",
  "web",
  "desktop",
  "platform",
  "proxy",
  "node",
]);

export const VIEW_MODE_ICONS: Record<ViewMode, string> = {
  detail: "fa-solid fa-table-cells-large",
  list: "fa-solid fa-list",
  mini: "fa-solid fa-border-all",
  matrix: "fa-solid fa-table",
};

export const VIEW_CONFIG: Record<ViewMode, ViewConfig> = {
  detail: {
    minWidth: 260,
    minHeight: 240,
    iconSize: 46,
    showDescription: true,
    showTargets: true,
    showLinks: true,
    horizontal: false,
  },
  list: {
    minWidth: 520,
    minHeight: 84,
    iconSize: 40,
    showDescription: true,
    showTargets: true,
    showLinks: true,
    horizontal: true,
  },
  mini: {
    minWidth: 140,
    minHeight: 120,
    iconSize: 56,
    showDescription: false,
    showTargets: false,
    showLinks: false,
    horizontal: false,
  },
  matrix: {
    minWidth: 960,
    minHeight: 48,
    iconSize: 32,
    showDescription: false,
    showTargets: false,
    showLinks: false,
    horizontal: true,
  },
};
