import type { DomainEntry, DomainKind } from "./types";

export const DEFAULT_PRIMARY_DOMAIN = "localhost";
export const GROUP_VARS_DOMAIN_CATALOG_KEY = "INFINITO_DOMAINS";
export const GROUP_VARS_ALL_PATH = "group_vars/all.yml";

export function normalizeDomainName(value: unknown): string {
  return String(value || "").trim().toLowerCase();
}

export function normalizeDomainLabel(value: unknown): string {
  return String(value || "")
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9-]/g, "")
    .replace(/^-+|-+$/g, "");
}

export function isValidDomainToken(value: string): boolean {
  return Boolean(value) && /^[a-z0-9][a-z0-9._-]*$/.test(value);
}

export function isLikelyFqdn(value: string): boolean {
  const normalized = normalizeDomainName(value);
  if (!normalized || normalized.includes(" ") || !normalized.includes(".")) {
    return false;
  }
  const labels = normalized.split(".").filter(Boolean);
  if (labels.length < 2) return false;
  return labels.every(
    (label) =>
      /^[a-z0-9-]+$/.test(label) && !label.startsWith("-") && !label.endsWith("-")
  );
}

export function inferDomainKind(value: string): DomainKind {
  const normalized = normalizeDomainName(value);
  if (!normalized || normalized === DEFAULT_PRIMARY_DOMAIN || !normalized.includes(".")) {
    return "local";
  }
  const labels = normalized.split(".").filter(Boolean);
  if (labels.length <= 2) return "fqdn";
  return "subdomain";
}

export function buildDomainEntryId(
  kind: DomainKind,
  domain: string,
  parentFqdn: string | null
): string {
  const parentPart = parentFqdn ? `:${parentFqdn}` : "";
  return `${kind}:${domain}${parentPart}`;
}

export function createDefaultDomainEntries(): DomainEntry[] {
  return [
    {
      id: buildDomainEntryId("local", DEFAULT_PRIMARY_DOMAIN, null),
      kind: "local",
      domain: DEFAULT_PRIMARY_DOMAIN,
      parentFqdn: null,
    },
  ];
}

export function buildDomainCatalogPayload(
  entries: DomainEntry[]
): Array<Record<string, string>> {
  return (Array.isArray(entries) ? entries : []).map((entry) => {
    const row: Record<string, string> = {
      type: entry.kind,
      domain: entry.domain,
    };
    if (entry.kind === "subdomain" && entry.parentFqdn) {
      row.parent_fqdn = entry.parentFqdn;
    }
    return row;
  });
}

export function readPrimaryDomainFromGroupVars(data: Record<string, unknown>): string {
  const value = data.DOMAIN_PRIMARY;
  if (typeof value === "string") return value.trim();
  if (value === null || value === undefined) return "";
  return String(value).trim();
}

export function parseDomainCatalogFromGroupVars(
  data: Record<string, unknown>
): DomainEntry[] {
  const rawCatalog = data[GROUP_VARS_DOMAIN_CATALOG_KEY];
  const rawItems = Array.isArray(rawCatalog) ? rawCatalog : [];
  const staged: Array<{ kind: DomainKind; domain: string; parentFqdn: string | null }> = [];

  rawItems.forEach((item) => {
    if (typeof item === "string") {
      const domain = normalizeDomainName(item);
      if (!domain) return;
      staged.push({
        kind: inferDomainKind(domain),
        domain,
        parentFqdn: null,
      });
      return;
    }
    if (!item || typeof item !== "object" || Array.isArray(item)) return;
    const node = item as Record<string, unknown>;
    const domain = normalizeDomainName(node.domain ?? node.value ?? node.name);
    if (!domain) return;
    const rawKind = normalizeDomainName(node.type ?? node.kind);
    const kind: DomainKind =
      rawKind === "local" || rawKind === "fqdn" || rawKind === "subdomain"
        ? (rawKind as DomainKind)
        : inferDomainKind(domain);
    const parentFqdn = normalizeDomainName(
      node.parent_fqdn ?? node.parentFqdn ?? node.parent
    );
    staged.push({
      kind,
      domain,
      parentFqdn: parentFqdn || null,
    });
  });

  const fallbackPrimary = normalizeDomainName(readPrimaryDomainFromGroupVars(data));
  if (fallbackPrimary) {
    staged.push({
      kind: inferDomainKind(fallbackPrimary),
      domain: fallbackPrimary,
      parentFqdn: null,
    });
  }

  const entries: DomainEntry[] = [];
  const seenDomains = new Set<string>();
  const fqdnDomains = new Set<string>();

  const pushEntry = (
    kind: DomainKind,
    domain: string,
    parentFqdn: string | null = null
  ) => {
    const normalizedDomain = normalizeDomainName(domain);
    if (!normalizedDomain || seenDomains.has(normalizedDomain)) return;
    if (kind === "local" && !isValidDomainToken(normalizedDomain)) return;
    if (kind === "fqdn" && !isLikelyFqdn(normalizedDomain)) return;
    if (kind === "subdomain") {
      if (!normalizedDomain.includes(".")) return;
      const normalizedParent = normalizeDomainName(
        parentFqdn || normalizedDomain.split(".").slice(1).join(".")
      );
      if (!normalizedParent || !isLikelyFqdn(normalizedParent)) return;
      if (!seenDomains.has(normalizedParent)) {
        pushEntry("fqdn", normalizedParent, null);
      }
      entries.push({
        id: buildDomainEntryId("subdomain", normalizedDomain, normalizedParent),
        kind: "subdomain",
        domain: normalizedDomain,
        parentFqdn: normalizedParent,
      });
      seenDomains.add(normalizedDomain);
      return;
    }
    entries.push({
      id: buildDomainEntryId(kind, normalizedDomain, null),
      kind,
      domain: normalizedDomain,
      parentFqdn: null,
    });
    seenDomains.add(normalizedDomain);
    if (kind === "fqdn") {
      fqdnDomains.add(normalizedDomain);
    }
  };

  staged.forEach((entry) => {
    if (entry.kind === "subdomain") {
      const parentFqdn =
        normalizeDomainName(entry.parentFqdn || "") ||
        normalizeDomainName(entry.domain.split(".").slice(1).join("."));
      if (parentFqdn && !fqdnDomains.has(parentFqdn)) {
        pushEntry("fqdn", parentFqdn, null);
      }
      pushEntry("subdomain", entry.domain, parentFqdn || null);
      return;
    }
    pushEntry(entry.kind, entry.domain, null);
  });

  if (!seenDomains.has(DEFAULT_PRIMARY_DOMAIN)) {
    entries.unshift({
      id: buildDomainEntryId("local", DEFAULT_PRIMARY_DOMAIN, null),
      kind: "local",
      domain: DEFAULT_PRIMARY_DOMAIN,
      parentFqdn: null,
    });
    seenDomains.add(DEFAULT_PRIMARY_DOMAIN);
  }

  const typeOrder: Record<DomainKind, number> = { local: 0, fqdn: 1, subdomain: 2 };
  return entries
    .slice()
    .sort(
      (a, b) =>
        typeOrder[a.kind] - typeOrder[b.kind] ||
        a.domain.localeCompare(b.domain, undefined, { sensitivity: "base" })
    );
}

export function normalizePrimaryDomainSelection(
  value: unknown,
  entries: DomainEntry[]
): string {
  const desired = normalizeDomainName(value);
  if (!desired) return DEFAULT_PRIMARY_DOMAIN;
  const lookup = new Map<string, string>();
  (Array.isArray(entries) ? entries : []).forEach((entry) => {
    const domain = normalizeDomainName(entry.domain);
    if (!domain) return;
    if (!lookup.has(domain)) {
      lookup.set(domain, entry.domain);
    }
  });
  return lookup.get(desired) || DEFAULT_PRIMARY_DOMAIN;
}
