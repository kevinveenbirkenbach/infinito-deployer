export type RoleLogo = {
  source: string;
  css_class?: string | null;
  url?: string | null;
};

export type Role = {
  id: string;
  display_name: string;
  status: string;
  description: string;
  deployment_targets: string[];
  logo?: RoleLogo | null;
  documentation?: string | null;
  video?: string | null;
  forum?: string | null;
  homepage?: string | null;
  repository?: string | null;
  issue_tracker_url?: string | null;
  license_url?: string | null;
};

export const VIEW_MODES = ["detail", "list", "mini"] as const;
export type ViewMode = (typeof VIEW_MODES)[number];

export type ViewConfig = {
  minWidth: number;
  minHeight: number;
  iconSize: number;
  showDescription: boolean;
  showTargets: boolean;
  showLinks: boolean;
  horizontal: boolean;
};

export type QuickLink = {
  key: string;
  label: string;
  url?: string | null;
  type: "link" | "video";
  iconClass: string;
};

export type StatusColor = {
  bg: string;
  fg: string;
  border: string;
};
