import {
  SIMPLEICON_STOP_WORDS,
  STATUS_COLORS,
  STATUS_COLOR_FALLBACK,
  STATUS_ORDER,
} from "./constants";
import type { QuickLink, Role, StatusColor } from "./types";

export function simpleIconCandidates(displayName: string, roleId: string) {
  const nameBase = String(displayName || "").trim().toLowerCase();
  const idBase = String(roleId || "").trim().toLowerCase();
  const normalize = (value: string) =>
    value
      .replace(/&/g, "and")
      .replace(/[^a-z0-9]+/g, " ")
      .trim();
  const fromName = normalize(nameBase);
  const fromId = normalize(idBase);
  const base = fromName || fromId;
  if (!base) return [];
  const parts = base.split(/\s+/).filter(Boolean);
  if (parts.length === 0) return [];
  const joined = parts.join("");
  const dashed = parts.join("-");
  const filtered = parts.filter((part) => !SIMPLEICON_STOP_WORDS.has(part));
  const candidates = [
    joined,
    dashed,
    parts[parts.length - 1],
    filtered.join(""),
    filtered[filtered.length - 1],
  ].filter(Boolean);
  return Array.from(new Set(candidates));
}

export function sortStatuses(statuses: string[]): string[] {
  const order = new Map(STATUS_ORDER.map((s, idx) => [s, idx]));
  return [...statuses].sort((a, b) => {
    const aIdx = order.get(a) ?? 999;
    const bIdx = order.get(b) ?? 999;
    if (aIdx === bIdx) {
      return a.localeCompare(b);
    }
    return aIdx - bIdx;
  });
}

export function initials(name: string) {
  const parts = name.split(/\s+/).filter(Boolean);
  if (parts.length === 0) return "?";
  if (parts.length === 1) return parts[0].slice(0, 2).toUpperCase();
  return (parts[0][0] + parts[1][0]).toUpperCase();
}

export function displayTargets(targets: string[]) {
  const out = new Set<string>();
  targets.forEach((target) => {
    const trimmed = (target || "").trim();
    if (!trimmed) return;
    if (trimmed === "universal") {
      out.add("server");
      out.add("workstation");
      return;
    }
    out.add(trimmed);
  });
  return Array.from(out);
}

export function displayCategories(categories: string[] | null | undefined) {
  const out = new Set<string>();
  (categories || []).forEach((category) => {
    const trimmed = String(category || "").trim();
    if (!trimmed) return;
    out.add(trimmed);
  });
  return Array.from(out);
}

export function toEmbedUrl(url: string) {
  try {
    const parsed = new URL(url);
    const host = parsed.hostname.replace("www.", "");
    if (host === "youtu.be") {
      const id = parsed.pathname.replace("/", "").trim();
      return id ? `https://www.youtube.com/embed/${id}` : url;
    }
    if (host.includes("youtube.com")) {
      if (parsed.pathname.startsWith("/embed/")) {
        return url;
      }
      const id = parsed.searchParams.get("v");
      return id ? `https://www.youtube.com/embed/${id}` : url;
    }
    if (host.includes("vimeo.com")) {
      const parts = parsed.pathname.split("/").filter(Boolean);
      const id = parts[0];
      return id ? `https://player.vimeo.com/video/${id}` : url;
    }
    return url;
  } catch {
    return url;
  }
}

export function quickLinksForRole(role: Role): QuickLink[] {
  const links: QuickLink[] = [
    {
      key: "documentation",
      label: "Documentation",
      url: role.documentation,
      type: "link",
      iconClass: "fa-solid fa-book",
    },
    {
      key: "video",
      label: "Video",
      url: role.video,
      type: "video",
      iconClass: "fa-solid fa-circle-play",
    },
    {
      key: "forum",
      label: "Forum",
      url: role.forum,
      type: "link",
      iconClass: "fa-solid fa-comments",
    },
    {
      key: "homepage",
      label: "Homepage",
      url: role.homepage,
      type: "link",
      iconClass: "fa-solid fa-house",
    },
    {
      key: "issues",
      label: "Issues",
      url: role.issue_tracker_url,
      type: "link",
      iconClass: "fa-solid fa-bug",
    },
    {
      key: "license",
      label: "License",
      url: role.license_url,
      type: "link",
      iconClass: "fa-solid fa-scale-balanced",
    },
  ];
  return links.filter((item) => !!item.url);
}

export function colorForStatus(status: string): StatusColor {
  return STATUS_COLORS[status] ?? STATUS_COLOR_FALLBACK;
}
