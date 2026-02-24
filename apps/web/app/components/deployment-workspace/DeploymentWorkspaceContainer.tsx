"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import type { CSSProperties } from "react";
import YAML from "yaml";
import RoleDashboard from "../RoleDashboard";
import DeploymentCredentialsForm from "../DeploymentCredentialsForm";
import WorkspacePanel from "../WorkspacePanel";
import LiveDeploymentView from "../LiveDeploymentView";
import DeploymentWorkspaceServerSwitcher from "../DeploymentWorkspaceServerSwitcher";
import styles from "../DeploymentWorkspace.module.css";
import { sanitizeAliasFilename } from "../workspace-panel/utils";
import { createInitialState } from "../../lib/deploy_form";
import {
  createServerPlaceholder,
  normalizePersistedDeviceMeta,
  parseHostVarsServerPatchData,
} from "../../lib/device_meta";
import { buildDeploymentPayload } from "../../lib/deployment_payload";
import {
  normalizeDeviceColor,
  normalizeDeviceEmoji,
  pickUniqueDeviceColor,
  pickUniqueDeviceEmoji,
} from "../deployment-credentials/device-visuals";
import type {
  ConnectionResult,
  ServerState,
} from "../deployment-credentials/types";
import DeploymentWorkspaceTemplate from "./DeploymentWorkspaceTemplate";
import {
  PANEL_KEY_TO_QUERY,
  PANEL_QUERY_TO_KEY,
  type AliasRename,
  type DeploymentWorkspaceProps,
  type DomainFilterKind,
  type DomainKind,
  type DomainEntry,
  type PrimaryDomainAddRequest,
  type OrderedProviderServer,
  type PanelKey,
  type Role,
  type RoleAppConfigResponse,
  type WorkspaceTabPanel,
} from "./types";
import {
  DEFAULT_PRIMARY_DOMAIN,
  GROUP_VARS_ALL_PATH,
  GROUP_VARS_DOMAIN_CATALOG_KEY,
  buildDomainCatalogPayload,
  createDefaultDomainEntries,
  inferDomainKind,
  isLikelyFqdn,
  isValidDomainToken,
  normalizeDomainLabel,
  normalizeDomainName,
  normalizePrimaryDomainSelection,
  parseDomainCatalogFromGroupVars,
  readPrimaryDomainFromGroupVars,
} from "./domain-utils";
import {
  createDeviceStyle,
  encodeWorkspacePath,
  isPortInvalid,
  normalizePortValue,
  parseApiError,
  parseYamlMapping,
} from "./helpers";

export default function DeploymentWorkspace({
  baseUrl,
  onJobCreated,
}: DeploymentWorkspaceProps) {
  const initial = useMemo(() => createInitialState(), []);
  const [roles, setRoles] = useState<Role[]>([]);
  const [rolesLoading, setRolesLoading] = useState(true);
  const [rolesError, setRolesError] = useState<string | null>(null);
  const [servers, setServers] = useState<ServerState[]>([
    {
      alias: initial.alias,
      description: initial.description,
      primaryDomain: initial.primaryDomain || DEFAULT_PRIMARY_DOMAIN,
      requirementServerType: initial.requirementServerType || "vps",
      requirementStorageGb: initial.requirementStorageGb || "200",
      requirementLocation: initial.requirementLocation || "Germany",
      host: initial.host,
      port: initial.port,
      user: initial.user,
      color: pickUniqueDeviceColor(new Set<string>()),
      logoEmoji:
        normalizeDeviceEmoji(initial.logoEmoji) ||
        pickUniqueDeviceEmoji(new Set<string>()),
      authMethod: initial.authMethod,
      password: initial.password,
      privateKey: initial.privateKey,
      publicKey: initial.publicKey,
      keyAlgorithm: initial.keyAlgorithm,
      keyPassphrase: initial.keyPassphrase,
    },
  ]);
  const [activeAlias, setActiveAlias] = useState(initial.alias);
  const [selectedByAlias, setSelectedByAlias] = useState<
    Record<string, Set<string>>
  >(() => ({ [initial.alias]: new Set<string>() }));
  const [selectedPlansByAlias, setSelectedPlansByAlias] = useState<
    Record<string, Record<string, string | null>>
  >(() => ({ [initial.alias]: {} }));
  const [aliasRenames, setAliasRenames] = useState<AliasRename[]>([]);
  const [aliasDeletes, setAliasDeletes] = useState<string[]>([]);
  const [aliasCleanups, setAliasCleanups] = useState<string[]>([]);
  const [selectionTouched, setSelectionTouched] = useState(false);
  const [deploySelection, setDeploySelection] = useState<Set<string>>(
    new Set<string>()
  );
  const [deployRoleFilter, setDeployRoleFilter] = useState<Set<string>>(
    new Set<string>()
  );
  const [deployRolePickerOpen, setDeployRolePickerOpen] = useState(false);
  const [deployRoleQuery, setDeployRoleQuery] = useState("");
  const [deployedAliases, setDeployedAliases] = useState<Set<string>>(
    new Set<string>()
  );
  const [connectionResults, setConnectionResults] = useState<
    Record<string, ConnectionResult>
  >({});
  const [deployViewTab, setDeployViewTab] = useState<"live-log" | "terminal">(
    "live-log"
  );
  const lastDeploymentSelectionRef = useRef<string[] | null>(null);
  const uiQueryReadyRef = useRef(false);
  const pendingAliasFromQueryRef = useRef("");

  const [workspaceId, setWorkspaceId] = useState<string | null>(null);
  const [workspacePrimaryDomain, setWorkspacePrimaryDomain] = useState(
    DEFAULT_PRIMARY_DOMAIN
  );
  const [inventoryReady, setInventoryReady] = useState(false);
  const [deploying, setDeploying] = useState(false);
  const [deployError, setDeployError] = useState<string | null>(null);
  const [liveJobId, setLiveJobId] = useState("");
  const [connectRequestKey, setConnectRequestKey] = useState(0);
  const [cancelRequestKey, setCancelRequestKey] = useState(0);
  const [liveConnected, setLiveConnected] = useState(false);
  const [liveCanceling, setLiveCanceling] = useState(false);
  const [liveError, setLiveError] = useState<string | null>(null);
  const [openCredentialsAlias, setOpenCredentialsAlias] = useState<string | null>(
    null
  );
  const [deviceMode, setDeviceMode] = useState<"customer" | "expert">("customer");
  const [expertConfirmOpen, setExpertConfirmOpen] = useState(false);
  const [detailSearchOpen, setDetailSearchOpen] = useState(false);
  const [detailSearchTargetAlias, setDetailSearchTargetAlias] = useState<
    string | null
  >(null);
  const [primaryDomainDraft, setPrimaryDomainDraft] = useState(
    DEFAULT_PRIMARY_DOMAIN
  );
  const [primaryDomainModalError, setPrimaryDomainModalError] = useState<
    string | null
  >(null);
  const [primaryDomainModalSaving, setPrimaryDomainModalSaving] = useState(false);
  const [domainEntries, setDomainEntries] = useState<DomainEntry[]>(
    createDefaultDomainEntries
  );
  const [domainFilterQuery, setDomainFilterQuery] = useState("");
  const [domainFilterKind, setDomainFilterKind] = useState<DomainFilterKind>("all");
  const [domainPopupOpen, setDomainPopupOpen] = useState(false);
  const [domainPopupType, setDomainPopupType] = useState<DomainKind>("fqdn");
  const [domainPopupFqdnValue, setDomainPopupFqdnValue] = useState("");
  const [domainPopupFqdnCheckBusy, setDomainPopupFqdnCheckBusy] = useState(false);
  const [domainPopupFqdnCheckResult, setDomainPopupFqdnCheckResult] = useState<{
    available: boolean;
    note: string;
  } | null>(null);
  const [domainPopupLocalValue, setDomainPopupLocalValue] = useState(
    DEFAULT_PRIMARY_DOMAIN
  );
  const [domainPopupSubLabel, setDomainPopupSubLabel] = useState("");
  const [domainPopupParentFqdn, setDomainPopupParentFqdn] = useState("");
  const [domainPopupError, setDomainPopupError] = useState<string | null>(null);
  const [domainPopupPrompt, setDomainPopupPrompt] = useState<string | null>(null);
  const [domainPopupTargetAlias, setDomainPopupTargetAlias] = useState<
    string | null
  >(null);
  const [activePanel, setActivePanel] = useState<PanelKey>("intro");
  const handleModeChange = useCallback(
    (mode: "customer" | "expert") => {
      if (mode === deviceMode) return;
      if (mode === "expert") {
        setExpertConfirmOpen(true);
        return;
      }
      setExpertConfirmOpen(false);
      setDeviceMode("customer");
    },
    [deviceMode]
  );
  const cancelExpertMode = useCallback(() => {
    setExpertConfirmOpen(false);
  }, []);
  const confirmExpertMode = useCallback(() => {
    setExpertConfirmOpen(false);
    setDeviceMode("expert");
  }, []);

  useEffect(() => {
    if (typeof window === "undefined") return;
    const params = new URLSearchParams(window.location.search);
    const panelParam = String(params.get("ui_panel") || "").trim().toLowerCase();
    const modeParam = String(params.get("ui_mode") || "").trim().toLowerCase();
    const aliasParam = String(params.get("ui_device") || "").trim();
    if (panelParam && PANEL_QUERY_TO_KEY[panelParam]) {
      setActivePanel(PANEL_QUERY_TO_KEY[panelParam]);
    }
    if (modeParam === "customer" || modeParam === "expert") {
      setDeviceMode(modeParam);
    }
    if (aliasParam) {
      pendingAliasFromQueryRef.current = aliasParam;
    }
    uiQueryReadyRef.current = true;
  }, []);

  useEffect(() => {
    let alive = true;

    const load = async () => {
      setRolesLoading(true);
      setRolesError(null);
      try {
        const res = await fetch(`${baseUrl}/api/roles`, {
          cache: "no-store",
        });
        if (!res.ok) {
          throw new Error(`HTTP ${res.status}`);
        }
        const data = await res.json();
        if (alive) {
          setRoles(Array.isArray(data) ? data : []);
        }
      } catch (err: any) {
        if (alive) {
          setRolesError(err?.message ?? "failed to load roles");
        }
      } finally {
        if (alive) setRolesLoading(false);
      }
    };

    load();
    return () => {
      alive = false;
    };
  }, [baseUrl]);

  const readGroupVarsAll = useCallback(
    async (targetWorkspaceId: string): Promise<Record<string, unknown>> => {
      const path = encodeWorkspacePath(GROUP_VARS_ALL_PATH);
      const res = await fetch(
        `${baseUrl}/api/workspaces/${targetWorkspaceId}/files/${path}`,
        {
          cache: "no-store",
        }
      );
      if (res.status === 404) return {};
      if (!res.ok) {
        throw new Error(`Failed to read ${GROUP_VARS_ALL_PATH}: HTTP ${res.status}`);
      }
      const data = (await res.json()) as { content?: unknown };
      try {
        return parseYamlMapping(String(data?.content ?? ""));
      } catch {
        throw new Error(`${GROUP_VARS_ALL_PATH} is not valid YAML.`);
      }
    },
    [baseUrl]
  );

  const writeGroupVarsAll = useCallback(
    async (targetWorkspaceId: string, data: Record<string, unknown>) => {
      const path = encodeWorkspacePath(GROUP_VARS_ALL_PATH);
      const res = await fetch(
        `${baseUrl}/api/workspaces/${targetWorkspaceId}/files/${path}`,
        {
          method: "PUT",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ content: YAML.stringify(data) }),
        }
      );
      if (!res.ok) {
        throw new Error(`Failed to write ${GROUP_VARS_ALL_PATH}: HTTP ${res.status}`);
      }
    },
    [baseUrl]
  );

  const primaryDomainOptions = useMemo(() => {
    const out: string[] = [];
    const seen = new Set<string>();
    domainEntries.forEach((entry) => {
      const domain = normalizeDomainName(entry.domain);
      if (!domain || seen.has(domain)) return;
      seen.add(domain);
      out.push(entry.domain);
    });
    if (!seen.has(DEFAULT_PRIMARY_DOMAIN)) {
      out.unshift(DEFAULT_PRIMARY_DOMAIN);
    }
    return out;
  }, [domainEntries]);

  const fqdnDomainOptions = useMemo(
    () =>
      domainEntries
        .filter((entry) => entry.kind === "fqdn")
        .map((entry) => normalizeDomainName(entry.domain))
        .filter(Boolean),
    [domainEntries]
  );

  const domainUsageByName = useMemo(() => {
    const usage = new Map<string, number>();
    servers.forEach((server) => {
      const value = normalizeDomainName(server.primaryDomain);
      if (!value) return;
      usage.set(value, (usage.get(value) || 0) + 1);
    });
    return usage;
  }, [servers]);

  const filteredDomainEntries = useMemo(() => {
    const query = normalizeDomainName(domainFilterQuery);
    return domainEntries.filter((entry) => {
      if (domainFilterKind !== "all" && entry.kind !== domainFilterKind) {
        return false;
      }
      if (!query) return true;
      const parent = normalizeDomainName(entry.parentFqdn || "");
      return (
        entry.domain.includes(query) ||
        entry.kind.includes(query) ||
        parent.includes(query)
      );
    });
  }, [domainEntries, domainFilterKind, domainFilterQuery]);

  const persistWorkspaceDomainSettings = useCallback(
    async (options?: {
      entries?: DomainEntry[];
      primaryDomain?: string;
    }) => {
      const sourceEntries = Array.isArray(options?.entries)
        ? options.entries
        : domainEntries;
      const sourcePrimaryDomain =
        typeof options?.primaryDomain === "string"
          ? options.primaryDomain
          : primaryDomainDraft;
      const nextEntries = parseDomainCatalogFromGroupVars({
        [GROUP_VARS_DOMAIN_CATALOG_KEY]: buildDomainCatalogPayload(sourceEntries),
        DOMAIN_PRIMARY: sourcePrimaryDomain || DEFAULT_PRIMARY_DOMAIN,
      });
      const nextDomain = normalizePrimaryDomainSelection(
        sourcePrimaryDomain,
        nextEntries
      );
      setPrimaryDomainModalSaving(true);
      setPrimaryDomainModalError(null);
      try {
        if (workspaceId) {
          const data = await readGroupVarsAll(workspaceId);
          const nextData = {
            ...data,
            DOMAIN_PRIMARY: nextDomain,
            [GROUP_VARS_DOMAIN_CATALOG_KEY]: buildDomainCatalogPayload(nextEntries),
          };
          await writeGroupVarsAll(workspaceId, nextData);
        }
        setDomainEntries(nextEntries);
        setWorkspacePrimaryDomain(nextDomain);
        setPrimaryDomainDraft(nextDomain);
      } catch (err) {
        const message =
          err instanceof Error
            ? err.message
            : `Failed to write ${GROUP_VARS_ALL_PATH}.`;
        setPrimaryDomainModalError(message);
      } finally {
        setPrimaryDomainModalSaving(false);
      }
    },
    [
      workspaceId,
      domainEntries,
      primaryDomainDraft,
      readGroupVarsAll,
      writeGroupVarsAll,
    ]
  );

  const openDomainPopup = useCallback(
    (preferredType: DomainKind = "fqdn", request?: PrimaryDomainAddRequest) => {
      const alias = String(request?.alias || "").trim();
      const requestedDomain = normalizeDomainName(request?.value);
      const requestedParentFqdn = normalizeDomainName(request?.parentFqdn);
      const requestedSubLabel = normalizeDomainLabel(request?.subLabel);
      const reason = request?.reason;
      setDomainPopupOpen(true);
      setDomainPopupError(null);
      setDomainPopupFqdnCheckResult(null);
      setDomainPopupTargetAlias(alias || null);
      if (reason === "missing") {
        setDomainPopupPrompt(
          "Please select an existing domain or add a valid domain first."
        );
      } else if (reason === "unknown" && requestedDomain) {
        setDomainPopupPrompt(
          `"${requestedDomain}" is not in the list. Add it as a valid domain.`
        );
      } else {
        setDomainPopupPrompt(null);
      }
      if (request?.kind === "subdomain" || preferredType === "subdomain") {
        setDomainPopupType("subdomain");
        setDomainPopupFqdnValue("");
        setDomainPopupLocalValue(DEFAULT_PRIMARY_DOMAIN);
        setDomainPopupSubLabel(requestedSubLabel);
        if (requestedParentFqdn && fqdnDomainOptions.includes(requestedParentFqdn)) {
          setDomainPopupParentFqdn(requestedParentFqdn);
        } else if (fqdnDomainOptions.length > 0) {
          setDomainPopupParentFqdn(fqdnDomainOptions[0]);
        } else {
          setDomainPopupParentFqdn("");
        }
        return;
      }
      if (requestedDomain) {
        if (requestedDomain.includes(".")) {
          setDomainPopupType("fqdn");
          setDomainPopupFqdnValue(requestedDomain);
          setDomainPopupSubLabel("");
          setDomainPopupParentFqdn("");
          setDomainPopupLocalValue(DEFAULT_PRIMARY_DOMAIN);
        } else {
          setDomainPopupType("local");
          setDomainPopupLocalValue(requestedDomain);
          setDomainPopupFqdnValue("");
          setDomainPopupSubLabel("");
          setDomainPopupParentFqdn("");
        }
        return;
      }
      setDomainPopupType(preferredType);
      setDomainPopupFqdnValue("");
      if (preferredType === "local") {
        setDomainPopupLocalValue(DEFAULT_PRIMARY_DOMAIN);
      } else {
        setDomainPopupLocalValue(DEFAULT_PRIMARY_DOMAIN);
      }
      setDomainPopupParentFqdn("");
      setDomainPopupSubLabel("");
    },
    [fqdnDomainOptions]
  );

  const closeDomainPopup = useCallback(() => {
    setDomainPopupOpen(false);
    setDomainPopupError(null);
    setDomainPopupFqdnValue("");
    setDomainPopupFqdnCheckBusy(false);
    setDomainPopupFqdnCheckResult(null);
    setDomainPopupSubLabel("");
    setDomainPopupParentFqdn("");
    setDomainPopupLocalValue(DEFAULT_PRIMARY_DOMAIN);
    setDomainPopupType("fqdn");
    setDomainPopupPrompt(null);
    setDomainPopupTargetAlias(null);
  }, []);

  const checkDomainPopupFqdn = useCallback(async () => {
    const domain = normalizeDomainName(domainPopupFqdnValue);
    if (!isLikelyFqdn(domain)) {
      setDomainPopupError("Enter a valid FQDN (for example: shop.example.org).");
      setDomainPopupFqdnCheckResult(null);
      return;
    }
    setDomainPopupFqdnCheckBusy(true);
    setDomainPopupError(null);
    setDomainPopupFqdnCheckResult(null);
    try {
      const res = await fetch(
        `${baseUrl}/api/providers/domain-availability?domain=${encodeURIComponent(
          domain
        )}`,
        { cache: "no-store" }
      );
      if (!res.ok) {
        let message = `HTTP ${res.status}`;
        try {
          const data = await res.json();
          if (typeof data?.detail === "string" && data.detail.trim()) {
            message = data.detail.trim();
          }
        } catch {
          const text = await res.text();
          if (text.trim()) message = text.trim();
        }
        throw new Error(message);
      }
      const data = (await res.json()) as {
        available?: boolean;
        note?: string;
      };
      const available = Boolean(data?.available);
      const note = String(data?.note || "").trim();
      setDomainPopupFqdnCheckResult({
        available,
        note:
          note ||
          (available
            ? "Domain looks available."
            : "Domain is likely already registered."),
      });
    } catch (err: any) {
      setDomainPopupError(
        err?.message ?? "Domain availability check failed."
      );
      setDomainPopupFqdnCheckResult(null);
    } finally {
      setDomainPopupFqdnCheckBusy(false);
    }
  }, [baseUrl, domainPopupFqdnValue]);

  const addDomainFromPopup = useCallback(() => {
    let nextDomain = "";
    let nextParentFqdn: string | null = null;

    if (domainPopupType === "local") {
      const localValue = normalizeDomainName(domainPopupLocalValue);
      if (!localValue || !isValidDomainToken(localValue)) {
        setDomainPopupError(
          "Enter a valid local domain (letters, numbers, dot, underscore, hyphen)."
        );
        return;
      }
      nextDomain = localValue;
    } else if (domainPopupType === "fqdn") {
      nextDomain = normalizeDomainName(domainPopupFqdnValue);
      if (!isLikelyFqdn(nextDomain)) {
        setDomainPopupError("Enter a valid FQDN (for example: shop.example.org).");
        return;
      }
    } else {
      const subLabel = normalizeDomainLabel(domainPopupSubLabel);
      const parentFqdn = normalizeDomainName(domainPopupParentFqdn);
      if (!subLabel || !parentFqdn) {
        setDomainPopupError("Provide subdomain label and parent FQDN.");
        return;
      }
      if (!fqdnDomainOptions.includes(parentFqdn)) {
        setDomainPopupError("Subdomains must belong to an existing FQDN.");
        return;
      }
      nextDomain = `${subLabel}.${parentFqdn}`;
      nextParentFqdn = parentFqdn;
    }

    const applyDomainToTargetAlias = (domain: string) => {
      const targetAlias = String(domainPopupTargetAlias || "").trim();
      if (!targetAlias) return false;
      setServers((prev) =>
        normalizePersistedDeviceMeta(
          prev.map((server) =>
            server.alias === targetAlias
              ? { ...server, primaryDomain: domain }
              : server
          )
        )
      );
      if (workspaceId) {
        void fetch(`${baseUrl}/api/providers/primary-domain`, {
          method: "PUT",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            workspace_id: workspaceId,
            alias: targetAlias,
            primary_domain: domain,
          }),
        });
      }
      return true;
    };

    const duplicate = domainEntries.some(
      (entry) => normalizeDomainName(entry.domain) === nextDomain
    );
    if (duplicate) {
      if (applyDomainToTargetAlias(nextDomain)) {
        closeDomainPopup();
        return;
      }
      setDomainPopupError("Domain already exists.");
      return;
    }

    const nextEntries = parseDomainCatalogFromGroupVars({
      [GROUP_VARS_DOMAIN_CATALOG_KEY]: [
        ...buildDomainCatalogPayload(domainEntries),
        {
          type: domainPopupType,
          domain: nextDomain,
          ...(nextParentFqdn ? { parent_fqdn: nextParentFqdn } : {}),
        },
      ],
      DOMAIN_PRIMARY: primaryDomainDraft || workspacePrimaryDomain || DEFAULT_PRIMARY_DOMAIN,
    });
    setDomainPopupError(null);
    const nextPrimaryDomain = normalizeDomainName(primaryDomainDraft)
      ? primaryDomainDraft
      : nextDomain;
    void persistWorkspaceDomainSettings({
      entries: nextEntries,
      primaryDomain: nextPrimaryDomain,
    });

    applyDomainToTargetAlias(nextDomain);
    closeDomainPopup();
  }, [
    baseUrl,
    closeDomainPopup,
    domainEntries,
    domainPopupFqdnValue,
    domainPopupLocalValue,
    domainPopupParentFqdn,
    domainPopupSubLabel,
    domainPopupType,
    domainPopupTargetAlias,
    fqdnDomainOptions,
    primaryDomainDraft,
    persistWorkspaceDomainSettings,
    workspaceId,
    workspacePrimaryDomain,
  ]);

  const removeDomainEntry = useCallback(
    (domain: string) => {
      const targetDomain = normalizeDomainName(domain);
      if (!targetDomain || targetDomain === DEFAULT_PRIMARY_DOMAIN) {
        setPrimaryDomainModalError("localhost cannot be removed.");
        return;
      }
      const hasLinkedSubdomains = domainEntries.some(
        (entry) =>
          entry.kind === "subdomain" &&
          normalizeDomainName(entry.parentFqdn || "") === targetDomain
      );
      if (hasLinkedSubdomains) {
        setPrimaryDomainModalError(
          "Remove subdomains first. Each subdomain must belong to a FQDN."
        );
        return;
      }
      setPrimaryDomainModalError(null);
      const nextEntries = domainEntries.filter(
        (entry) => normalizeDomainName(entry.domain) !== targetDomain
      );
      const nextPrimaryDomain =
        normalizeDomainName(primaryDomainDraft) === targetDomain
          ? DEFAULT_PRIMARY_DOMAIN
          : primaryDomainDraft;
      void persistWorkspaceDomainSettings({
        entries: nextEntries,
        primaryDomain: nextPrimaryDomain,
      });
    },
    [domainEntries, primaryDomainDraft, persistWorkspaceDomainSettings]
  );

  useEffect(() => {
    if (!workspaceId) {
      setDomainEntries(createDefaultDomainEntries());
      setWorkspacePrimaryDomain(DEFAULT_PRIMARY_DOMAIN);
      return;
    }
    let cancelled = false;
    const loadDomainSettings = async () => {
      try {
        const data = await readGroupVarsAll(workspaceId);
        const entries = parseDomainCatalogFromGroupVars(data);
        const domain = normalizePrimaryDomainSelection(
          readPrimaryDomainFromGroupVars(data),
          entries
        );
        if (!cancelled) {
          setDomainEntries(entries);
          setWorkspacePrimaryDomain(domain);
        }
      } catch {
        if (!cancelled) {
          setDomainEntries(createDefaultDomainEntries());
          setWorkspacePrimaryDomain(DEFAULT_PRIMARY_DOMAIN);
        }
      }
    };
    void loadDomainSettings();
    return () => {
      cancelled = true;
    };
  }, [workspaceId, readGroupVarsAll]);

  useEffect(() => {
    setPrimaryDomainDraft(
      normalizePrimaryDomainSelection(workspacePrimaryDomain, domainEntries)
    );
    setPrimaryDomainModalError(null);
  }, [workspaceId, workspacePrimaryDomain, domainEntries]);

  useEffect(() => {
    if (!activeAlias && servers.length > 0) {
      setActiveAlias(servers[0].alias);
      return;
    }
    if (activeAlias && !servers.some((server) => server.alias === activeAlias)) {
      if (pendingAliasFromQueryRef.current) {
        return;
      }
      setActiveAlias(servers[0]?.alias ?? "");
    }
  }, [activeAlias, servers]);

  useEffect(() => {
    const wantedAlias = pendingAliasFromQueryRef.current.trim();
    if (!wantedAlias) return;
    if (!servers.some((server) => server.alias === wantedAlias)) return;
    pendingAliasFromQueryRef.current = "";
    if (activeAlias !== wantedAlias) {
      setActiveAlias(wantedAlias);
    }
  }, [servers, activeAlias]);

  useEffect(() => {
    if (!activeAlias) return;
    setSelectedByAlias((prev) => {
      if (prev[activeAlias]) return prev;
      return { ...prev, [activeAlias]: new Set<string>() };
    });
  }, [activeAlias]);

  const persistPrimaryDomainForAlias = useCallback(
    async (alias: string, primaryDomain: string) => {
      const targetAlias = String(alias || "").trim();
      if (!workspaceId || !targetAlias) return;
      try {
        await fetch(`${baseUrl}/api/providers/primary-domain`, {
          method: "PUT",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            workspace_id: workspaceId,
            alias: targetAlias,
            primary_domain: normalizePrimaryDomainSelection(primaryDomain, domainEntries),
          }),
        });
      } catch {
        // Keep UI responsive if background sync fails.
      }
    },
    [baseUrl, workspaceId, domainEntries]
  );

  useEffect(() => {
    const fallbackPrimary = normalizePrimaryDomainSelection(
      workspacePrimaryDomain,
      domainEntries
    );
    const corrections: Array<{ alias: string; primaryDomain: string }> = [];
    setServers((prev) => {
      let changed = false;
      const next = prev.map((server) => {
        const currentPrimary = normalizeDomainName(server.primaryDomain);
        if (currentPrimary) {
          return server;
        }
        const normalizedPrimary = fallbackPrimary;
        changed = true;
        corrections.push({ alias: server.alias, primaryDomain: normalizedPrimary });
        return { ...server, primaryDomain: normalizedPrimary };
      });
      return changed ? normalizePersistedDeviceMeta(next) : prev;
    });
    if (corrections.length > 0 && workspaceId) {
      corrections.forEach(({ alias, primaryDomain }) => {
        void persistPrimaryDomainForAlias(alias, primaryDomain);
      });
    }
  }, [
    domainEntries,
    workspaceId,
    workspacePrimaryDomain,
    persistPrimaryDomainForAlias,
  ]);

  const createServer = useCallback(
    (alias: string, existingServers: ServerState[] = []): ServerState => {
      const usedColors = new Set<string>();
      const usedLogos = new Set<string>();
      existingServers.forEach((server) => {
        const color = normalizeDeviceColor(server.color);
        if (color) usedColors.add(color);
        const logo = normalizeDeviceEmoji(server.logoEmoji);
        if (logo) usedLogos.add(logo);
      });
      return {
        alias,
        description: "",
        primaryDomain: DEFAULT_PRIMARY_DOMAIN,
        requirementServerType: "vps",
        requirementStorageGb: "200",
        requirementLocation: "Germany",
        host: "",
        port: "22",
        user: "root",
        color: pickUniqueDeviceColor(usedColors),
        logoEmoji: pickUniqueDeviceEmoji(usedLogos),
        authMethod: "password",
        password: "",
        privateKey: "",
        publicKey: "",
        keyAlgorithm: "ed25519",
        keyPassphrase: "",
      };
    },
    []
  );

  const persistDeviceVisualMetaForAlias = useCallback(
    async (
      alias: string,
      patch: { color?: string; logoEmoji?: string }
    ): Promise<void> => {
      if (!workspaceId) return;
      const targetAlias = String(alias || "").trim();
      if (!targetAlias) return;
      const hasColorPatch = Object.prototype.hasOwnProperty.call(patch, "color");
      const hasLogoPatch = Object.prototype.hasOwnProperty.call(patch, "logoEmoji");
      if (!hasColorPatch && !hasLogoPatch) return;

      const hostVarsPath = `host_vars/${sanitizeAliasFilename(targetAlias)}.yml`;
      const fileUrl = `${baseUrl}/api/workspaces/${workspaceId}/files/${encodeWorkspacePath(
        hostVarsPath
      )}`;

      let data: Record<string, any> = {};
      try {
        const readRes = await fetch(fileUrl, { cache: "no-store" });
        if (readRes.ok) {
          const payload = await readRes.json();
          const parsed = YAML.parse(String(payload?.content ?? ""));
          if (parsed && typeof parsed === "object" && !Array.isArray(parsed)) {
            data = parsed as Record<string, any>;
          }
        } else if (readRes.status !== 404) {
          return;
        }
      } catch {
        return;
      }

      let changed = false;

      if (hasColorPatch) {
        const nextColor = normalizeDeviceColor(patch.color) || "";
        if (nextColor) {
          if (data.color !== nextColor) {
            data.color = nextColor;
            changed = true;
          }
        } else if (Object.prototype.hasOwnProperty.call(data, "color")) {
          delete data.color;
          changed = true;
        }
      }

      if (hasLogoPatch) {
        const nextLogo = normalizeDeviceEmoji(patch.logoEmoji) || "";
        const logoNode: Record<string, any> =
          data.logo && typeof data.logo === "object" && !Array.isArray(data.logo)
            ? { ...data.logo }
            : {};
        const currentLogo =
          typeof logoNode.emoji === "string" ? String(logoNode.emoji || "") : "";
        if (nextLogo) {
          if (currentLogo !== nextLogo) {
            logoNode.emoji = nextLogo;
            data.logo = logoNode;
            changed = true;
          } else if (!data.logo || typeof data.logo !== "object" || Array.isArray(data.logo)) {
            data.logo = logoNode;
            changed = true;
          }
        } else if (Object.prototype.hasOwnProperty.call(logoNode, "emoji")) {
          delete logoNode.emoji;
          if (Object.keys(logoNode).length === 0) {
            delete data.logo;
          } else {
            data.logo = logoNode;
          }
          changed = true;
        }
      }

      if (!changed) return;
      try {
        await fetch(fileUrl, {
          method: "PUT",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ content: YAML.stringify(data) }),
        });
      } catch {
        // Ignore visual metadata sync errors to keep the UI responsive.
      }
    },
    [baseUrl, workspaceId]
  );

  const activeServer = useMemo(() => {
    if (activeAlias) {
      const found = servers.find((server) => server.alias === activeAlias);
      if (found) return found;
    }
    return servers[0] ?? null;
  }, [servers, activeAlias]);

  const serverAliasKey = useMemo(
    () =>
      Array.from(
        new Set(
          servers
            .map((server) => String(server.alias || "").trim())
            .filter(Boolean)
        )
      )
        .sort((a, b) => a.localeCompare(b))
        .join("|"),
    [servers]
  );

  useEffect(() => {
    if (!workspaceId) return;
    const aliases = serverAliasKey
      ? serverAliasKey.split("|").map((alias) => String(alias || "").trim()).filter(Boolean)
      : [];
    if (aliases.length === 0) return;

    let cancelled = false;
    const loadServerMetaFromHostVars = async () => {
      try {
        const listRes = await fetch(`${baseUrl}/api/workspaces/${workspaceId}/files`, {
          cache: "no-store",
        });
        if (!listRes.ok) return;
        const listData = await listRes.json();
        const files = Array.isArray(listData?.files) ? listData.files : [];
        const hostVarsPathByAlias = new Map<string, string>();

        files.forEach((entry: any) => {
          if (!entry || entry.is_dir) return;
          const path = String(entry.path || "");
          const match = path.match(/^host_vars\/([^/]+)\.ya?ml$/i);
          if (!match) return;
          const alias = String(match[1] || "").trim();
          if (!alias || hostVarsPathByAlias.has(alias)) return;
          hostVarsPathByAlias.set(alias, path);
        });

        const patchByAlias: Record<string, Partial<ServerState>> = {};
        await Promise.all(
          aliases.map(async (alias) => {
            const hostVarsPath = hostVarsPathByAlias.get(alias);
            if (!hostVarsPath) return;
            const fileRes = await fetch(
              `${baseUrl}/api/workspaces/${workspaceId}/files/${encodeWorkspacePath(
                hostVarsPath
              )}`,
              { cache: "no-store" }
            );
            if (!fileRes.ok) return;
            const fileData = await fileRes.json();
            const parsed = (YAML.parse(String(fileData?.content ?? "")) ?? {}) as Record<
              string,
              unknown
            >;
            const patch = parseHostVarsServerPatchData(parsed);
            if (Object.keys(patch).length > 0) {
              patchByAlias[alias] = patch;
            }
          })
        );

        if (cancelled || Object.keys(patchByAlias).length === 0) return;
        setServers((prev) => {
          let changed = false;
          const next = prev.map((server) => {
            const patch = patchByAlias[server.alias];
            if (!patch) return server;
            const merged: ServerState = { ...server, ...patch };
            const same =
              merged.host === server.host &&
              merged.port === server.port &&
              merged.user === server.user &&
              merged.description === server.description &&
              merged.primaryDomain === server.primaryDomain &&
              merged.requirementServerType === server.requirementServerType &&
              merged.requirementStorageGb === server.requirementStorageGb &&
              merged.requirementLocation === server.requirementLocation &&
              merged.color === server.color &&
              merged.logoEmoji === server.logoEmoji;
            if (same) return server;
            changed = true;
            return merged;
          });
          return changed ? normalizePersistedDeviceMeta(next) : prev;
        });
      } catch {
        // ignore hydration failures and keep current in-memory state
      }
    };

    void loadServerMetaFromHostVars();
    return () => {
      cancelled = true;
    };
  }, [baseUrl, workspaceId, serverAliasKey]);

  const selectedRolesByAlias = useMemo(() => {
    const out: Record<string, string[]> = {};
    Object.entries(selectedByAlias).forEach(([alias, set]) => {
      out[alias] = Array.from(set);
    });
    return out;
  }, [selectedByAlias]);

  const selectedRoles = useMemo(
    () => selectedRolesByAlias[activeAlias] ?? [],
    [selectedRolesByAlias, activeAlias]
  );

  const defaultPlanForRole = useCallback(
    (roleId: string) => {
      const role = roles.find((entry) => entry.id === roleId);
      if (!role) return "community";
      const pricing = role.pricing || null;
      const offerings = Array.isArray(pricing?.offerings) ? pricing.offerings : [];
      const defaultOfferingId = String(pricing?.default_offering_id || "").trim();
      const offering =
        offerings.find((item) => String(item?.id || "").trim() === defaultOfferingId) ||
        offerings[0] ||
        null;
      const plans = Array.isArray((offering as any)?.plans) ? (offering as any).plans : [];
      const defaultPlanId = String(pricing?.default_plan_id || "").trim();
      if (defaultPlanId && plans.some((plan: any) => String(plan?.id || "").trim() === defaultPlanId)) {
        return defaultPlanId;
      }
      const community = plans.find((plan: any) => String(plan?.id || "").trim() === "community");
      if (community) return "community";
      const first = plans[0];
      return String(first?.id || "").trim() || "community";
    },
    [roles]
  );

  useEffect(() => {
    setSelectedPlansByAlias((prev) => {
      const next: Record<string, Record<string, string | null>> = { ...prev };
      Object.entries(selectedByAlias).forEach(([alias, roleSet]) => {
        const current = { ...(next[alias] || {}) };
        roleSet.forEach((roleId) => {
          if (!current[roleId]) {
            current[roleId] = defaultPlanForRole(roleId);
          }
        });
        Object.keys(current).forEach((roleId) => {
          if (!roleSet.has(roleId)) {
            current[roleId] = null;
          }
        });
        next[alias] = current;
      });
      return next;
    });
  }, [selectedByAlias, defaultPlanForRole]);

  const selectableAliases = useMemo(() => {
    const out: string[] = [];
    servers.forEach((server) => {
      const alias = String(server.alias || "").trim();
      if (!alias) return;
      const roles = (selectedRolesByAlias?.[alias] ?? []).filter(
        (roleId) =>
          deployRoleFilter.size === 0 || deployRoleFilter.has(String(roleId || ""))
      );
      const hasRoles = Array.isArray(roles) && roles.length > 0;
      const host = String(server.host || "").trim();
      const user = String(server.user || "").trim();
      const authReady =
        server.authMethod === "private_key"
          ? Boolean(String(server.privateKey || "").trim())
          : Boolean(String(server.password || "").trim());
      const portRaw = String(server.port || "").trim();
      const portNum = Number(portRaw);
      const portValid =
        !portRaw || (Number.isInteger(portNum) && portNum >= 1 && portNum <= 65535);
      const isConfigured = Boolean(host && user && authReady && portValid);
      if (hasRoles && isConfigured && !deployedAliases.has(alias)) {
        out.push(alias);
      }
    });
    return out;
  }, [servers, selectedRolesByAlias, deployedAliases, deployRoleFilter]);

  const inventoryRoleIds = useMemo(() => {
    const seen = new Set<string>();
    Object.values(selectedRolesByAlias).forEach((list) => {
      (Array.isArray(list) ? list : []).forEach((role) => {
        const roleId = String(role || "").trim();
        if (roleId) seen.add(roleId);
      });
    });
    return Array.from(seen).sort((a, b) => a.localeCompare(b));
  }, [selectedRolesByAlias]);

  const deployRoleOptions = useMemo(() => {
    const query = deployRoleQuery.trim().toLowerCase();
    if (!query) return inventoryRoleIds;
    return inventoryRoleIds.filter((roleId) =>
      roleId.toLowerCase().includes(query)
    );
  }, [inventoryRoleIds, deployRoleQuery]);

  const deployRoleSummary = useMemo(() => {
    if (inventoryRoleIds.length === 0) return "No apps in inventory";
    if (deployRoleFilter.size === 0) return "No apps selected";
    if (deployRoleFilter.size === inventoryRoleIds.length) {
      return `All apps (${inventoryRoleIds.length})`;
    }
    return `${deployRoleFilter.size} apps selected`;
  }, [inventoryRoleIds, deployRoleFilter]);

  useEffect(() => {
    setDeploySelection((prev) => {
      const allowed = new Set(selectableAliases);
      const next = new Set(
        Array.from(prev).filter((alias) => allowed.has(alias))
      );
      if (next.size === 0 && selectableAliases.length > 0) {
        selectableAliases.forEach((alias) => next.add(alias));
      }
      return next;
    });
  }, [selectableAliases]);

  useEffect(() => {
    setDeployedAliases((prev) => {
      const existing = new Set(servers.map((server) => server.alias));
      return new Set(Array.from(prev).filter((alias) => existing.has(alias)));
    });
  }, [servers]);

  useEffect(() => {
    setConnectionResults((prev) => {
      const existing = new Set(servers.map((server) => server.alias));
      let changed = false;
      const next: Record<string, ConnectionResult> = {};
      Object.entries(prev).forEach(([alias, result]) => {
        if (existing.has(alias)) {
          next[alias] = result;
        } else {
          changed = true;
        }
      });
      return changed ? next : prev;
    });
  }, [servers]);

  useEffect(() => {
    setDeployRoleFilter((prev) => {
      const allowed = new Set(inventoryRoleIds);
      const next = new Set(Array.from(prev).filter((roleId) => allowed.has(roleId)));
      if (next.size === 0 && inventoryRoleIds.length > 0) {
        inventoryRoleIds.forEach((roleId) => next.add(roleId));
      }
      return next;
    });
  }, [inventoryRoleIds]);

  useEffect(() => {
    setDeployedAliases(new Set());
    setConnectionResults({});
    setDeploySelection(new Set());
    setDeployRoleFilter(new Set());
    setSelectedPlansByAlias({});
    setAliasRenames([]);
    setAliasDeletes([]);
    setAliasCleanups([]);
    setLiveJobId("");
    setLiveConnected(false);
    setLiveCanceling(false);
    setLiveError(null);
    setOpenCredentialsAlias(null);
    setExpertConfirmOpen(false);
    setDetailSearchOpen(false);
    setDetailSearchTargetAlias(null);
    setPrimaryDomainDraft(DEFAULT_PRIMARY_DOMAIN);
    setPrimaryDomainModalError(null);
    setPrimaryDomainModalSaving(false);
    setDomainFilterQuery("");
    setDomainFilterKind("all");
    setDomainPopupOpen(false);
    setDomainPopupError(null);
    setDomainPopupType("fqdn");
    setDomainPopupFqdnValue("");
    setDomainPopupFqdnCheckBusy(false);
    setDomainPopupFqdnCheckResult(null);
    setDomainPopupLocalValue(DEFAULT_PRIMARY_DOMAIN);
    setDomainPopupSubLabel("");
    setDomainPopupParentFqdn("");
    setDomainPopupPrompt(null);
    setDomainPopupTargetAlias(null);
    setConnectRequestKey(0);
    setCancelRequestKey(0);
  }, [workspaceId]);

  useEffect(() => {
    if (typeof window === "undefined") return;
    if (!workspaceId) return;
    const params = new URLSearchParams(window.location.search);
    const modeFromQuery = String(params.get("ui_mode") || "").trim().toLowerCase();
    if (modeFromQuery === "customer" || modeFromQuery === "expert") {
      setDeviceMode(modeFromQuery);
      return;
    }
    const stored = window.localStorage.getItem(`infinito.devices.mode.${workspaceId}`);
    if (stored === "customer" || stored === "expert") {
      setDeviceMode(stored);
      return;
    }
    setDeviceMode("customer");
  }, [workspaceId]);

  useEffect(() => {
    if (typeof window === "undefined") return;
    if (!workspaceId) return;
    window.localStorage.setItem(`infinito.devices.mode.${workspaceId}`, deviceMode);
  }, [workspaceId, deviceMode]);

  useEffect(() => {
    if (typeof window === "undefined") return;
    if (!uiQueryReadyRef.current) return;
    const url = new URL(window.location.href);
    url.searchParams.set("ui_panel", PANEL_KEY_TO_QUERY[activePanel]);
    url.searchParams.set("ui_mode", deviceMode);
    if (activeAlias) {
      url.searchParams.set("ui_device", activeAlias);
    } else {
      url.searchParams.delete("ui_device");
    }
    window.history.replaceState({}, "", url.toString());
  }, [activePanel, deviceMode, activeAlias]);

  useEffect(() => {
    if (!deployRolePickerOpen) return;
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") setDeployRolePickerOpen(false);
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [deployRolePickerOpen]);

  useEffect(() => {
    if (!detailSearchOpen) return;
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        setDetailSearchOpen(false);
        setDetailSearchTargetAlias(null);
      }
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [detailSearchOpen]);

  useEffect(() => {
    if (!expertConfirmOpen) return;
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") setExpertConfirmOpen(false);
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [expertConfirmOpen]);

  useEffect(() => {
    if (!domainPopupOpen) return;
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        closeDomainPopup();
      }
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [domainPopupOpen, closeDomainPopup]);

  const applySelectedRolesByAlias = useCallback(
    (rolesByAlias: Record<string, string[]>) => {
      const aliases = Object.keys(rolesByAlias || {})
        .map((alias) => alias.trim())
        .filter(Boolean);

      if (aliases.length === 0) {
        return;
      }

      setSelectedByAlias((prev) => {
        const next: Record<string, Set<string>> = {};
        Object.entries(prev).forEach(([alias, set]) => {
          next[alias] = new Set<string>(set);
        });
        aliases.forEach((alias) => {
          next[alias] = new Set<string>(rolesByAlias?.[alias] ?? []);
        });
        return next;
      });
      setSelectedPlansByAlias((prev) => {
        const next: Record<string, Record<string, string | null>> = { ...prev };
        aliases.forEach((alias) => {
          const current = { ...(next[alias] || {}) };
          const enabled = new Set((rolesByAlias?.[alias] ?? []).map((item) => String(item || "").trim()).filter(Boolean));
          enabled.forEach((roleId) => {
            if (!current[roleId]) {
              current[roleId] = defaultPlanForRole(roleId);
            }
          });
          Object.keys(current).forEach((roleId) => {
            if (!enabled.has(roleId)) current[roleId] = null;
          });
          next[alias] = current;
        });
        return next;
      });

      setServers((prev) => {
        const byAlias = new Map(prev.map((server) => [server.alias, server]));
        const ordered: string[] = [];
        const seen = new Set<string>();
        prev.forEach((server) => {
          if (!seen.has(server.alias)) {
            ordered.push(server.alias);
            seen.add(server.alias);
          }
        });
        aliases
          .filter((alias) => !seen.has(alias))
          .sort((a, b) => a.localeCompare(b))
          .forEach((alias) => ordered.push(alias));
        const nextServers: ServerState[] = [];
        ordered.forEach((alias) => {
          const existing = byAlias.get(alias);
          nextServers.push(existing ?? createServerPlaceholder(alias));
        });
        return normalizePersistedDeviceMeta(nextServers);
      });

      if (!activeAlias) {
        setActiveAlias(aliases[0] ?? "");
      }
    },
    [activeAlias, createServerPlaceholder, defaultPlanForRole]
  );

  const updateServer = useCallback(
    (alias: string, patch: Partial<ServerState>) => {
      if (!alias) return;
      const nextAliasRaw =
        typeof patch.alias === "string" ? patch.alias.trim() : "";
      const shouldRename = nextAliasRaw && nextAliasRaw !== alias;
      const hasColorPatch = Object.prototype.hasOwnProperty.call(patch, "color");
      const hasLogoPatch = Object.prototype.hasOwnProperty.call(patch, "logoEmoji");

      setServers((prev) => {
        const idx = prev.findIndex((server) => server.alias === alias);
        if (idx === -1) return prev;
        if (
          shouldRename &&
          prev.some((server, i) => server.alias === nextAliasRaw && i !== idx)
        ) {
          return prev;
        }
        const next = [...prev];
        next[idx] = {
          ...prev[idx],
          ...patch,
          alias: shouldRename ? nextAliasRaw : prev[idx].alias,
        };
        return normalizePersistedDeviceMeta(next);
      });

      if (hasColorPatch || hasLogoPatch) {
        const targetAlias = shouldRename ? nextAliasRaw : alias;
        void persistDeviceVisualMetaForAlias(targetAlias, {
          ...(hasColorPatch ? { color: String(patch.color || "") } : {}),
          ...(hasLogoPatch ? { logoEmoji: String(patch.logoEmoji || "") } : {}),
        });
      }

      if (shouldRename) {
        const nextAlias = nextAliasRaw;
        setSelectedByAlias((prev) => {
          const next: Record<string, Set<string>> = { ...prev };
          const roles = next[alias]
            ? new Set<string>(next[alias])
            : new Set<string>();
          delete next[alias];
          if (next[nextAlias]) {
            roles.forEach((role) => next[nextAlias].add(role));
          } else {
            next[nextAlias] = roles;
          }
          return next;
        });
        setSelectedPlansByAlias((prev) => {
          const next: Record<string, Record<string, string | null>> = { ...prev };
          const previous = { ...(next[alias] || {}) };
          delete next[alias];
          next[nextAlias] = { ...(next[nextAlias] || {}), ...previous };
          return next;
        });
        if (activeAlias === alias) {
          setActiveAlias(nextAlias);
        }
        setConnectionResults((prev) => {
          if (!prev[alias]) return prev;
          const next = { ...prev, [nextAlias]: prev[alias] };
          delete next[alias];
          return next;
        });
        setAliasRenames((prev) => [...prev, { from: alias, to: nextAlias }]);
      }
    },
    [activeAlias, persistDeviceVisualMetaForAlias]
  );

  const addServer = useCallback(
    (aliasHint?: string) => {
      const existing = new Set(servers.map((server) => server.alias));
      const normalizedHint = String(aliasHint || "")
        .trim()
        .toLowerCase()
        .replace(/[^a-z0-9-]/g, "-")
        .replace(/-+/g, "-")
        .replace(/^-|-$/g, "");
      const baseAlias = normalizedHint || "device";
      let alias = baseAlias;
      let idx = 2;
      while (existing.has(alias)) {
        alias = `${baseAlias}-${idx}`;
        idx += 1;
      }

      const newServer = createServer(alias, servers);

      setServers((prev) => normalizePersistedDeviceMeta([...prev, newServer]));
      setSelectedByAlias((prev) => ({ ...prev, [alias]: new Set<string>() }));
      setActiveAlias(alias);
      void persistDeviceVisualMetaForAlias(alias, {
        color: newServer.color,
        logoEmoji: newServer.logoEmoji,
      });
      return alias;
    },
    [servers, createServer, persistDeviceVisualMetaForAlias]
  );

  const removeServerFromClient = useCallback(
    (alias: string) => {
      if (!alias) return;
      setServers((prev) => {
        const next = prev.filter((server) => server.alias !== alias);
        if (activeAlias === alias) {
          setActiveAlias(next[0]?.alias ?? "");
        }
        return normalizePersistedDeviceMeta(next);
      });
      setSelectedByAlias((prev) => {
        const next: Record<string, Set<string>> = { ...prev };
        delete next[alias];
        return next;
      });
      setSelectedPlansByAlias((prev) => {
        const next: Record<string, Record<string, string | null>> = { ...prev };
        delete next[alias];
        return next;
      });
      setConnectionResults((prev) => {
        if (!prev[alias]) return prev;
        const next = { ...prev };
        delete next[alias];
        return next;
      });
      setOpenCredentialsAlias((prev) => (prev === alias ? null : prev));
      setDeploySelection((prev) => {
        if (!prev.has(alias)) return prev;
        const next = new Set(prev);
        next.delete(alias);
        return next;
      });
      setDeployedAliases((prev) => {
        if (!prev.has(alias)) return prev;
        const next = new Set(prev);
        next.delete(alias);
        return next;
      });
      setSelectionTouched(true);
    },
    [activeAlias]
  );

  const removeServer = useCallback(
    async (alias: string) => {
      if (!alias) return;
      if (!workspaceId || !inventoryReady) {
        throw new Error("Workspace inventory is not ready yet.");
      }
      setAliasDeletes((prev) => [...prev, alias]);
      removeServerFromClient(alias);
    },
    [inventoryReady, workspaceId, removeServerFromClient]
  );

  const cleanupServer = useCallback(
    async (alias: string) => {
      if (!alias) return;
      if (!workspaceId || !inventoryReady) {
        throw new Error("Workspace inventory is not ready yet.");
      }
      setAliasCleanups((prev) => [...prev, alias]);
      removeServerFromClient(alias);
    },
    [inventoryReady, workspaceId, removeServerFromClient]
  );

  const toggleSelectedForAlias = useCallback((alias: string, id: string) => {
    const targetAlias = String(alias || "").trim();
    const roleId = String(id || "").trim();
    if (!targetAlias || !roleId) return;
    const currentlySelected = Boolean(selectedByAlias[targetAlias]?.has(roleId));
    const nextEnabled = !currentlySelected;
    setSelectedByAlias((prev) => {
      const next: Record<string, Set<string>> = { ...prev };
      const set = next[targetAlias]
        ? new Set<string>(next[targetAlias])
        : new Set<string>();
      if (set.has(roleId)) {
        set.delete(roleId);
      } else {
        set.add(roleId);
      }
      next[targetAlias] = set;
      return next;
    });
    setSelectedPlansByAlias((prev) => {
      const next: Record<string, Record<string, string | null>> = { ...prev };
      const current = { ...(next[targetAlias] || {}) };
      current[roleId] = nextEnabled ? current[roleId] || defaultPlanForRole(roleId) : null;
      next[targetAlias] = current;
      return next;
    });
    setSelectionTouched(true);
  }, [defaultPlanForRole, selectedByAlias]);

  const toggleSelected = useCallback(
    (id: string) => {
      if (!activeAlias) return;
      toggleSelectedForAlias(activeAlias, id);
    },
    [activeAlias, toggleSelectedForAlias]
  );

  const toggleDeployAlias = (alias: string) => {
    if (!alias) return;
    setDeploySelection((prev) => {
      const next = new Set(prev);
      if (next.has(alias)) {
        next.delete(alias);
      } else {
        next.add(alias);
      }
      return next;
    });
  };

  const selectAllDeployAliases = () => {
    setDeploySelection(new Set(selectableAliases));
  };

  const deselectAllDeployAliases = () => {
    setDeploySelection(new Set());
  };

  const toggleDeployRole = (roleId: string) => {
    const key = String(roleId || "").trim();
    if (!key) return;
    setDeployRoleFilter((prev) => {
      const next = new Set(prev);
      if (next.has(key)) {
        next.delete(key);
      } else {
        next.add(key);
      }
      return next;
    });
  };

  const selectAllDeployRoles = () => {
    setDeployRoleFilter(new Set(inventoryRoleIds));
  };

  const deselectAllDeployRoles = () => {
    setDeployRoleFilter(new Set());
  };

  const handleConnectionResult = (alias: string, result: ConnectionResult) => {
    const key = String(alias || "").trim();
    if (!key) return;
    setConnectionResults((prev) => ({ ...prev, [key]: result }));
  };

  const deploymentPlan = useMemo(
    () =>
      buildDeploymentPayload({
        activeServer,
        selectedRolesByAlias,
        selectedAliases: Array.from(deploySelection),
        selectableAliases,
        roleFilter: Array.from(deployRoleFilter),
        workspaceId,
        inventoryReady,
      }),
    [
      activeServer,
      selectedRolesByAlias,
      deploySelection,
      selectableAliases,
      deployRoleFilter,
      workspaceId,
      inventoryReady,
    ]
  );

  const deploymentErrors = deploymentPlan.errors;
  const canDeploy = Object.keys(deploymentErrors).length === 0 && !deploying;

  const startDeployment = async () => {
    setDeployError(null);

    if (!deploymentPlan.payload) {
      setDeployError("Resolve the highlighted items before deploying.");
      return;
    }

    lastDeploymentSelectionRef.current = Array.from(deploySelection);
    setDeploying(true);
    try {
      const res = await fetch(`${baseUrl}/api/deployments`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(deploymentPlan.payload),
      });
      if (!res.ok) {
        throw new Error(await parseApiError(res));
      }
      const data = await res.json();
      const created = String(data?.job_id ?? "");
      if (created) {
        setLiveJobId(created);
        setLiveError(null);
        setDeployViewTab("terminal");
        setConnectRequestKey((prev) => prev + 1);
        onJobCreated?.(created);
      }
    } catch (err: any) {
      setDeployError(err?.message ?? "Deployment failed");
    } finally {
      setDeploying(false);
    }
  };

  const credentials = useMemo(() => {
    return {
      alias: activeServer?.alias ?? "",
      description: activeServer?.description ?? "",
      primaryDomain: activeServer?.primaryDomain ?? "",
      requirementServerType: activeServer?.requirementServerType ?? "vps",
      requirementStorageGb: activeServer?.requirementStorageGb ?? "200",
      requirementLocation: activeServer?.requirementLocation ?? "Germany",
      host: activeServer?.host ?? "",
      port: activeServer?.port ?? "",
      user: activeServer?.user ?? "",
      color: activeServer?.color ?? "",
      logoEmoji: activeServer?.logoEmoji ?? "",
      authMethod: activeServer?.authMethod ?? "password",
    };
  }, [activeServer]);

  const handleDeploymentStatus = useCallback(
    (status: { job_id?: string; status?: string } | null) => {
      if (!status?.status) return;
      if (status.job_id && liveJobId && status.job_id !== liveJobId) return;
      const terminal = ["succeeded", "failed", "canceled"].includes(status.status);
      if (status.status === "succeeded" && lastDeploymentSelectionRef.current) {
        setDeployedAliases((prev) => {
          const next = new Set(prev);
          lastDeploymentSelectionRef.current?.forEach((alias) => next.add(alias));
          return next;
        });
      }
      if (terminal) {
        lastDeploymentSelectionRef.current = null;
      }
    },
    [liveJobId]
  );

  const deployTableColumns =
    "minmax(0, 1.3fr) minmax(0, 0.7fr) minmax(0, 1.25fr) minmax(62px, 0.45fr) minmax(0, 0.85fr) minmax(66px, 0.55fr) minmax(94px, 0.85fr) 52px";
  const deployTableStyle = {
    "--deploy-table-columns": deployTableColumns,
  } as CSSProperties;

  const isAuthMissing = (server: ServerState) =>
    server.authMethod === "private_key"
      ? !String(server.privateKey || "").trim()
      : !String(server.password || "").trim();

  const hasCredentials = (server: ServerState) => {
    const host = String(server.host || "").trim();
    const user = String(server.user || "").trim();
    const authReady = !isAuthMissing(server);
    return Boolean(host && user && authReady);
  };

  const canTestConnection = (server: ServerState) => {
    const host = String(server.host || "").trim();
    const user = String(server.user || "").trim();
    const portRaw = String(server.port || "").trim();
    const portValue = Number(portRaw);
    const portValid =
      Number.isInteger(portValue) && portValue >= 1 && portValue <= 65535;
    return Boolean(host && user && portValid && !isAuthMissing(server));
  };

  const testConnectionForServer = useCallback(
    async (server: ServerState) => {
      if (!workspaceId || !canTestConnection(server)) return;
      try {
        const portRaw = String(server.port ?? "").trim();
        const portValue = portRaw ? Number(portRaw) : null;
        const res = await fetch(
          `${baseUrl}/api/workspaces/${workspaceId}/test-connection`,
          {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
              host: server.host,
              port: Number.isInteger(portValue) ? portValue : undefined,
              user: server.user,
              auth_method: server.authMethod,
              password: server.password || undefined,
              private_key: server.privateKey || undefined,
              key_passphrase: server.keyPassphrase || undefined,
            }),
          }
        );
        if (!res.ok) {
          let message = `HTTP ${res.status}`;
          try {
            const data = await res.json();
            if (typeof data?.detail === "string" && data.detail.trim()) {
              message = data.detail.trim();
            }
          } catch {
            const text = await res.text();
            if (text.trim()) message = text.trim();
          }
          throw new Error(message);
        }
        const data = (await res.json()) as ConnectionResult;
        handleConnectionResult(server.alias, data);
      } catch (err: any) {
        handleConnectionResult(server.alias, {
          ping_ok: false,
          ping_error: err?.message ?? "ping failed",
          ssh_ok: false,
          ssh_error: err?.message ?? "ssh failed",
        });
      }
    },
    [baseUrl, workspaceId, handleConnectionResult]
  );

  const getConnectionState = (server: ServerState) => {
    const credentialsReady = hasCredentials(server);
    const status = connectionResults[server.alias];
    const fullyConnected = status?.ping_ok === true && status?.ssh_ok === true;

    if (credentialsReady && fullyConnected) {
      return {
        rowClass: styles.serverRowHealthy,
        label: "Connected",
        toneClass: styles.statusDotGreen,
        tooltip: "Ping and SSH checks succeeded.",
      };
    }
    if (!credentialsReady) {
      return {
        rowClass: styles.serverRowMissingCredentials,
        label: "Missing credentials",
        toneClass: styles.statusDotOrange,
        tooltip: "No credentials configured. Set password or SSH key before testing.",
      };
    }
    if (!status) {
      return {
        rowClass: styles.serverRowWarning,
        label: "Not tested",
        toneClass: styles.statusDotYellow,
        tooltip: "No connection test result yet.",
      };
    }
    if (status.ping_ok && status.ssh_ok) {
      return {
        rowClass: styles.serverRowHealthy,
        label: "Connected",
        toneClass: styles.statusDotGreen,
        tooltip: "Ping and SSH checks succeeded.",
      };
    }
    const detail: string[] = [];
    if (!status.ping_ok) {
      detail.push(status.ping_error?.trim() || "Ping check failed.");
    }
    if (!status.ssh_ok) {
      detail.push(status.ssh_error?.trim() || "SSH check failed.");
    }
    return {
      rowClass: styles.serverRowWarning,
      label: !status.ping_ok ? "Ping failed" : "Connection failed",
      toneClass: styles.statusDotOrange,
      tooltip: detail.join(" ") || "Connection test failed.",
    };
  };

  const requestConnect = () => {
    if (!liveJobId.trim()) return;
    setLiveError(null);
    setConnectRequestKey((prev) => prev + 1);
    setDeployViewTab("terminal");
  };

  const requestCancel = () => {
    if (!liveJobId.trim()) return;
    setLiveError(null);
    setCancelRequestKey((prev) => prev + 1);
  };

  const openCredentialsFor = (alias: string) => {
    const target = String(alias || "").trim();
    if (!target) return;
    setActiveAlias(target);
    setOpenCredentialsAlias(target);
    setActivePanel("server");
  };

  const handleProviderOrderedServer = useCallback(
    (device: OrderedProviderServer) => {
      const alias = String(device.alias || "").trim();
      if (!alias) return;
      const existingAlias = servers.some((server) => server.alias === alias);
      const nextColor = pickUniqueDeviceColor(new Set(servers.map((server) => server.color)));
      const nextLogoEmoji = pickUniqueDeviceEmoji(
        new Set(servers.map((server) => server.logoEmoji))
      );
      const requirementServerType = String(
        device.requirementServerType || "vps"
      ).trim() || "vps";
      const requirementStorageGb = String(
        device.requirementStorageGb || "200"
      ).trim() || "200";
      const requirementLocation = String(
        device.requirementLocation || "Germany"
      ).trim() || "Germany";
      setServers((prev) => {
        const existingIndex = prev.findIndex((server) => server.alias === alias);
        const patch: ServerState = {
          alias,
          description: "",
          primaryDomain: DEFAULT_PRIMARY_DOMAIN,
          requirementServerType,
          requirementStorageGb,
          requirementLocation,
          host: String(device.ansible_host || ""),
          port: String(device.ansible_port || 22),
          user: String(device.ansible_user || "root"),
          color: nextColor,
          logoEmoji: nextLogoEmoji,
          authMethod: "password",
          password: "",
          privateKey: "",
          publicKey: "",
          keyAlgorithm: "ed25519",
          keyPassphrase: "",
        };
        if (existingIndex >= 0) {
          const next = [...prev];
          next[existingIndex] = {
            ...next[existingIndex],
            host: patch.host,
            user: patch.user,
            port: patch.port,
            requirementServerType: patch.requirementServerType,
            requirementStorageGb: patch.requirementStorageGb,
            requirementLocation: patch.requirementLocation,
          };
          return normalizePersistedDeviceMeta(next);
        }
        return normalizePersistedDeviceMeta([...prev, patch]);
      });
      if (!existingAlias) {
        void persistDeviceVisualMetaForAlias(alias, {
          color: nextColor,
          logoEmoji: nextLogoEmoji,
        });
      }
      setSelectedByAlias((prev) => {
        if (prev[alias]) return prev;
        return { ...prev, [alias]: new Set<string>() };
      });
      setSelectedPlansByAlias((prev) => {
        if (prev[alias]) return prev;
        return { ...prev, [alias]: {} };
      });
      setActiveAlias(alias);
    },
    [persistDeviceVisualMetaForAlias, servers]
  );

  const roleAppConfigUrl = useCallback(
    (roleId: string, suffix = "", aliasOverride?: string) => {
      if (!workspaceId) {
        throw new Error("Workspace is not ready yet.");
      }
      const rid = encodeURIComponent(String(roleId || "").trim());
      const alias = String(aliasOverride || activeAlias || "").trim();
      const query = alias ? `?alias=${encodeURIComponent(alias)}` : "";
      return `${baseUrl}/api/workspaces/${workspaceId}/roles/${rid}/app-config${suffix}${query}`;
    },
    [activeAlias, baseUrl, workspaceId]
  );

  const loadRoleAppConfig = useCallback(
    async (roleId: string, aliasOverride?: string): Promise<RoleAppConfigResponse> => {
      const url = roleAppConfigUrl(roleId, "", aliasOverride);
      const res = await fetch(url, { cache: "no-store" });
      if (!res.ok) {
        throw new Error(await parseApiError(res));
      }
      return (await res.json()) as RoleAppConfigResponse;
    },
    [roleAppConfigUrl]
  );

  const saveRoleAppConfig = useCallback(
    async (
      roleId: string,
      content: string,
      aliasOverride?: string
    ): Promise<RoleAppConfigResponse> => {
      const url = roleAppConfigUrl(roleId, "", aliasOverride);
      const res = await fetch(url, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ content }),
      });
      if (!res.ok) {
        throw new Error(await parseApiError(res));
      }
      return (await res.json()) as RoleAppConfigResponse;
    },
    [roleAppConfigUrl]
  );

  const selectRolePlanForAlias = useCallback(
    (alias: string, roleId: string, planId: string | null) => {
      const targetAlias = String(alias || "").trim();
      const targetRole = String(roleId || "").trim();
      if (!targetAlias || !targetRole) return;

      const normalizedPlan = planId ? String(planId || "").trim() : null;
      const resolvedPlan = normalizedPlan || defaultPlanForRole(targetRole);

      setSelectedByAlias((prev) => {
        const next: Record<string, Set<string>> = { ...prev };
        const set = next[targetAlias] ? new Set(next[targetAlias]) : new Set<string>();
        if (normalizedPlan) {
          set.add(targetRole);
        } else {
          set.delete(targetRole);
        }
        next[targetAlias] = set;
        return next;
      });

      setSelectedPlansByAlias((prev) => {
        const next: Record<string, Record<string, string | null>> = { ...prev };
        const current = { ...(next[targetAlias] || {}) };
        current[targetRole] = normalizedPlan ? resolvedPlan : null;
        next[targetAlias] = current;
        return next;
      });
      setSelectionTouched(true);

      if (!workspaceId) return;
      void (async () => {
        try {
          const loaded = await loadRoleAppConfig(targetRole, targetAlias);
          let parsed: Record<string, any> = {};
          try {
            const data = YAML.parse(String(loaded?.content ?? "")) ?? {};
            if (data && typeof data === "object" && !Array.isArray(data)) {
              parsed = data as Record<string, any>;
            }
          } catch {
            parsed = {};
          }
          parsed.plan_id = normalizedPlan ? resolvedPlan : null;
          await saveRoleAppConfig(
            targetRole,
            YAML.stringify(parsed),
            targetAlias
          );
        } catch {
          // keep UI responsive; inventory write errors are surfaced in the config editor flow
        }
      })();
    },
    [defaultPlanForRole, loadRoleAppConfig, saveRoleAppConfig, workspaceId]
  );

  const importRoleAppDefaults = useCallback(
    async (roleId: string, aliasOverride?: string): Promise<RoleAppConfigResponse> => {
      const url = roleAppConfigUrl(roleId, "/import-defaults", aliasOverride);
      const res = await fetch(url, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
      });
      if (!res.ok) {
        throw new Error(await parseApiError(res));
      }
      return (await res.json()) as RoleAppConfigResponse;
    },
    [roleAppConfigUrl]
  );

  const serverSwitcher = (
    <DeploymentWorkspaceServerSwitcher
      currentAlias={activeAlias}
      servers={servers}
      onSelect={setActiveAlias}
      onCreate={addServer}
      onOpenServerTab={() => setActivePanel("server")}
    />
  );

  const serverMetaByAlias = useMemo(
    () =>
      Object.fromEntries(
        servers.map((server) => [
          server.alias,
          { logoEmoji: server.logoEmoji || "💻", color: server.color || "" },
        ])
      ) as Record<string, { logoEmoji?: string | null; color?: string | null }>,
    [servers]
  );

  const billingMatrixRows = useMemo(() => {
    const hardwareCount = servers.length;
    const selectedAppsCount = Object.values(selectedRolesByAlias || {}).reduce(
      (sum, roles) => sum + (Array.isArray(roles) ? roles.length : 0),
      0
    );
    const supportSeats = hardwareCount > 0 ? 1 : 0;
    return [
      {
        item: "Hardware management",
        quantity: hardwareCount,
        unit: 9,
        recurring: hardwareCount * 9,
        setup: hardwareCount * 29,
      },
      {
        item: "Software workload",
        quantity: selectedAppsCount,
        unit: 3,
        recurring: selectedAppsCount * 3,
        setup: 0,
      },
      {
        item: "Support baseline",
        quantity: supportSeats,
        unit: 19,
        recurring: supportSeats * 19,
        setup: 0,
      },
    ];
  }, [servers, selectedRolesByAlias]);

  const billingRecurringTotal = billingMatrixRows.reduce(
    (sum, row) => sum + row.recurring,
    0
  );
  const billingSetupTotal = billingMatrixRows.reduce((sum, row) => sum + row.setup, 0);

  const panels: WorkspaceTabPanel[] = [
    {
      key: "intro",
      title: "Intro",
      content: (
        <div className={styles.introPanel}>
          <h3 className={styles.placeholderTitle}>Welcome to your deployment workspace</h3>
          <p className={styles.placeholderCopy}>
            Placeholder: Hier kommt eine kurze Einfuehrung zum Ablauf von
            Software-Auswahl, Hardware-Konfiguration, Inventory und Setup hinein.
          </p>
          <div className={styles.introVideoWrap}>
            <iframe
              title="2026-02-18 13-25-09"
              src="https://video.infinito.nexus/videos/embed/5YmUZYWUaaNcEy5vH5pHrQ"
              frameBorder="0"
              allowFullScreen
              sandbox="allow-same-origin allow-scripts allow-popups allow-forms"
              className={styles.introVideo}
            />
          </div>
          <p className={styles.placeholderCopy}>
            Placeholder: In einem naechsten Schritt koennen wir hier auch eine
            Checkliste mit den wichtigsten ersten Schritten ergaenzen.
          </p>
        </div>
      ),
    },
    {
      key: "store",
      title: "Software",
      content: (
        <RoleDashboard
          baseUrl={baseUrl}
          roles={roles}
          loading={rolesLoading}
          error={rolesError}
          selected={new Set<string>(selectedRoles)}
          onToggleSelected={toggleSelected}
          onLoadRoleAppConfig={loadRoleAppConfig}
          onSaveRoleAppConfig={saveRoleAppConfig}
          onImportRoleAppDefaults={importRoleAppDefaults}
          activeAlias={activeAlias}
          serverAliases={servers.map((server) => server.alias)}
          serverMetaByAlias={serverMetaByAlias}
          selectedByAlias={selectedRolesByAlias}
          onToggleSelectedForAlias={toggleSelectedForAlias}
          selectedPlanByAlias={selectedPlansByAlias}
          onSelectPlanForAlias={selectRolePlanForAlias}
          serverSwitcher={serverSwitcher}
          onCreateServerForTarget={(target) => addServer(target)}
          mode={deviceMode}
          onModeChange={handleModeChange}
          compact
        />
      ),
    },
    {
      key: "domain",
      title: "Domain",
      content: (
        <div className={styles.domainPanel}>
          <div className={styles.domainTableFilters}>
            <input
              value={domainFilterQuery}
              onChange={(event) => setDomainFilterQuery(event.target.value)}
              placeholder="Filter domains"
              className={`form-control ${styles.domainFilterInput}`}
            />
            <select
              value={domainFilterKind}
              onChange={(event) =>
                setDomainFilterKind(event.target.value as DomainFilterKind)
              }
              className={`form-select ${styles.domainFilterSelect}`}
            >
              <option value="all">All types</option>
              <option value="local">Local</option>
              <option value="fqdn">FQDN</option>
              <option value="subdomain">Subdomain</option>
            </select>
            <button
              type="button"
              onClick={() => openDomainPopup()}
              className={styles.modeActionButton}
            >
              <i className="fa-solid fa-plus" aria-hidden="true" />
              <span>Add new</span>
            </button>
          </div>

          {primaryDomainModalError ? (
            <p className={styles.primaryDomainError}>{primaryDomainModalError}</p>
          ) : null}

          <div className={styles.domainTableWrap}>
            <table className={styles.domainTable}>
              <thead>
                <tr>
                  <th>Default</th>
                  <th>Domain</th>
                  <th>Type</th>
                  <th>Parent FQDN</th>
                  <th>Devices</th>
                  <th>Action</th>
                </tr>
              </thead>
              <tbody>
                {filteredDomainEntries.length === 0 ? (
                  <tr>
                    <td colSpan={6} className={styles.domainTableEmpty}>
                      No domains match the current filter.
                    </td>
                  </tr>
                ) : (
                  filteredDomainEntries.map((entry) => {
                    const domainKey = normalizeDomainName(entry.domain);
                    const inUse = (domainUsageByName.get(domainKey) || 0) > 0;
                    const hasChildren = domainEntries.some(
                      (item) =>
                        item.kind === "subdomain" &&
                        normalizeDomainName(item.parentFqdn || "") === domainKey
                    );
                    const removeBlocked =
                      domainKey === DEFAULT_PRIMARY_DOMAIN || hasChildren || inUse;
                    const removeTitle =
                      domainKey === DEFAULT_PRIMARY_DOMAIN
                        ? "localhost is required."
                        : hasChildren
                        ? "Remove subdomains first."
                        : inUse
                        ? "Reassign devices before removing this domain."
                        : "Remove domain";
                    const addSubdomainParent =
                      entry.kind === "fqdn"
                        ? normalizeDomainName(entry.domain)
                        : entry.kind === "subdomain"
                        ? normalizeDomainName(entry.parentFqdn || "")
                        : "";
                    const addSubdomainBlocked = !addSubdomainParent;
                    const addSubdomainTitle = addSubdomainBlocked
                      ? "Subdomains require a FQDN parent."
                      : `Add subdomain under ${addSubdomainParent}`;
                    return (
                      <tr key={entry.id}>
                        <td>
                          <input
                            type="radio"
                            name="workspace-primary-domain-radio"
                            checked={
                              normalizeDomainName(primaryDomainDraft) === domainKey
                            }
                            onChange={() => {
                              setPrimaryDomainDraft(entry.domain);
                              setPrimaryDomainModalError(null);
                              void persistWorkspaceDomainSettings({
                                entries: domainEntries,
                                primaryDomain: entry.domain,
                              });
                            }}
                            aria-label={`Set ${entry.domain} as workspace primary domain`}
                          />
                        </td>
                        <td>
                          <code>{entry.domain}</code>
                        </td>
                        <td>{entry.kind}</td>
                        <td>
                          {entry.parentFqdn ? <code>{entry.parentFqdn}</code> : "—"}
                        </td>
                        <td>{domainUsageByName.get(domainKey) || 0}</td>
                        <td>
                          <div className={styles.domainActionRow}>
                            <button
                              type="button"
                              onClick={() =>
                                openDomainPopup("subdomain", {
                                  kind: "subdomain",
                                  parentFqdn: addSubdomainParent,
                                })
                              }
                              disabled={addSubdomainBlocked}
                              title={addSubdomainTitle}
                              className={styles.domainActionButton}
                            >
                              <i className="fa-solid fa-sitemap" aria-hidden="true" />
                              <span>Add subdomain</span>
                            </button>
                            <button
                              type="button"
                              onClick={() => removeDomainEntry(entry.domain)}
                              disabled={removeBlocked}
                              title={removeTitle}
                              className={styles.domainRemoveButton}
                            >
                              <i className="fa-solid fa-trash" aria-hidden="true" />
                              <span>Remove</span>
                            </button>
                          </div>
                        </td>
                      </tr>
                    );
                  })
                )}
              </tbody>
            </table>
          </div>
        </div>
      ),
    },
    {
      key: "server",
      title: "Hardware",
      content: (
        <div className={styles.serverPanelStack}>
          <DeploymentCredentialsForm
            baseUrl={baseUrl}
            workspaceId={workspaceId}
            servers={servers}
            connectionResults={connectionResults}
            activeAlias={activeAlias}
            onActiveAliasChange={setActiveAlias}
            onUpdateServer={updateServer}
            onConnectionResult={handleConnectionResult}
            onRemoveServer={removeServer}
            onCleanupServer={cleanupServer}
            onAddServer={addServer}
            openCredentialsAlias={openCredentialsAlias}
            onOpenCredentialsAliasHandled={() => setOpenCredentialsAlias(null)}
            deviceMode={deviceMode}
            onDeviceModeChange={handleModeChange}
            primaryDomainOptions={primaryDomainOptions}
            onRequestAddPrimaryDomain={(request) =>
              openDomainPopup("fqdn", request)
            }
            onOpenDetailSearch={(alias) => {
              const targetAlias = String(alias || "").trim();
              setDetailSearchTargetAlias(targetAlias || null);
              setDetailSearchOpen(true);
            }}
            compact
          />
        </div>
      ),
    },
    {
      key: "inventory",
      title: "Inventory",
      content: (
        <div className={styles.inventoryPanelContent}>
          <WorkspacePanel
            baseUrl={baseUrl}
            selectedRolesByAlias={selectedRolesByAlias}
            credentials={credentials}
            onCredentialsPatch={(patch) => {
              if (!activeServer) return;
              updateServer(activeServer.alias, patch);
            }}
            onInventoryReadyChange={setInventoryReady}
            onSelectedRolesByAliasChange={applySelectedRolesByAlias}
            onWorkspaceIdChange={setWorkspaceId}
            aliasRenames={aliasRenames}
            onAliasRenamesHandled={(count) =>
              setAliasRenames((prev) => prev.slice(count))
            }
            aliasDeletes={aliasDeletes}
            onAliasDeletesHandled={(count) =>
              setAliasDeletes((prev) => prev.slice(count))
            }
            aliasCleanups={aliasCleanups}
            onAliasCleanupsHandled={(count) =>
              setAliasCleanups((prev) => prev.slice(count))
            }
            selectionTouched={selectionTouched}
            compact
          />
        </div>
      ),
    },
    {
      key: "deploy",
      title: "Setup",
      content: (
        <div className={styles.deployLayout}>
          <div className={styles.deployTabs}>
            <button
              type="button"
              onClick={() => setDeployViewTab("live-log")}
              className={`${styles.deployTabButton} ${
                deployViewTab === "live-log" ? styles.deployTabButtonActive : ""
              }`}
            >
              Deploy devices
            </button>
            <button
              type="button"
              onClick={() => setDeployViewTab("terminal")}
              className={`${styles.deployTabButton} ${
                deployViewTab === "terminal" ? styles.deployTabButtonActive : ""
              }`}
            >
              Terminal
            </button>
          </div>

          {deployError ? <div className={styles.errorText}>{deployError}</div> : null}
          {liveError ? <div className={styles.errorText}>{liveError}</div> : null}

          <div className={styles.deployBody}>
            <div
              className={`${styles.deployTabPanel} ${
                deployViewTab === "live-log" ? styles.deployTabPanelActive : ""
              }`}
              aria-hidden={deployViewTab !== "live-log"}
            >
              <div className={styles.serverTableCard} style={deployTableStyle}>
                <div className={styles.serverTableTop}>
                  <span className={styles.serverTableTitle}>Deploy devices</span>
                  <span className={`text-body-secondary ${styles.serverTableMeta}`}>
                    {deploySelection.size} selected
                  </span>
                </div>
                <div className={styles.serverTableHeader}>
                  <span>Status</span>
                  <span>Device</span>
                  <span>Host</span>
                  <span>Port</span>
                  <span>User</span>
                  <span>Apps</span>
                  <span>Edit</span>
                  <span>Select</span>
                </div>
                <div className={styles.serverTableRows}>
                  {servers.map((server) => {
                    const alias = String(server.alias || "").trim();
                    if (!alias) return null;
                    const roles = selectedRolesByAlias?.[alias] ?? [];
                    const filteredRoles = (Array.isArray(roles) ? roles : []).filter(
                      (roleId) =>
                        deployRoleFilter.size === 0 || deployRoleFilter.has(roleId)
                    );
                    const hasRoles = filteredRoles.length > 0;
                    const isDeployed = deployedAliases.has(alias);
                    const isSelected = deploySelection.has(alias);
                    const hostMissing = !String(server.host || "").trim();
                    const userMissing = !String(server.user || "").trim();
                    const portInvalid = isPortInvalid(server.port);
                    const authMissing = isAuthMissing(server);
                    const appsMissing = !hasRoles;
                    const isConfigured =
                      !hostMissing && !userMissing && !portInvalid && !authMissing;
                    const isSelectable = hasRoles && isConfigured && !isDeployed;
                    const connectionState = getConnectionState(server);
                    const statusToneClass = isDeployed
                      ? styles.statusDotGreen
                      : connectionState.toneClass;
                    const statusTooltip = isDeployed
                      ? "Device was included in the last successful deployment."
                      : hasRoles
                      ? connectionState.tooltip
                      : "No apps selected for this device.";
                    const tintAllowed =
                      !isDeployed &&
                      isConfigured &&
                      connectionState.rowClass !== styles.serverRowMissingCredentials;
                    const rowStyle = tintAllowed
                      ? createDeviceStyle(server.color, {
                          backgroundAlpha: 0.16,
                          borderAlpha: 0.56,
                          outlineAlpha: 0.86,
                        })
                      : undefined;
                    const roleText = hasRoles ? `${filteredRoles.length} apps` : "—";
                    const roleTitle = hasRoles
                      ? filteredRoles.sort().join(", ")
                      : "No apps selected";
                    return (
                      <div
                        key={alias}
                        className={`${styles.serverRow} ${
                          connectionState.rowClass
                        } ${isSelected ? styles.serverRowSelected : ""} ${
                          tintAllowed ? styles.serverRowTinted : ""
                        }`}
                        style={rowStyle}
                      >
                        <div
                          className={`${styles.statusCell} ${
                            isDeployed ? styles.statusCellDeployed : ""
                          }`}
                        >
                          <button
                            type="button"
                            className={styles.statusDotButton}
                            title={statusTooltip}
                            aria-label={`Status: ${
                              isDeployed ? "Deployed" : connectionState.label
                            }`}
                          >
                            <span
                              className={`${styles.statusDot} ${statusToneClass}`}
                              aria-hidden="true"
                            />
                          </button>
                        </div>
                        <span className={styles.aliasCell}>
                          <span className={styles.aliasWithEmoji}>
                            <span aria-hidden="true">{server.logoEmoji || "💻"}</span>
                            <span>{alias}</span>
                          </span>
                        </span>
                        <div className={styles.tableInputWrap}>
                          <input
                            value={server.host}
                            onChange={(event) =>
                              updateServer(alias, { host: event.target.value })
                            }
                            onBlur={(event) =>
                              void testConnectionForServer({
                                ...server,
                                host: event.currentTarget.value,
                              })
                            }
                            placeholder="example.com"
                            className={`${styles.tableInput} ${
                              hostMissing ? styles.tableInputMissing : ""
                            }`}
                          />
                          {hostMissing ? (
                            <span className={styles.cellAlert} title="Host is required.">
                              !
                            </span>
                          ) : null}
                        </div>
                        <div className={styles.tableInputWrap}>
                          <input
                            type="number"
                            value={server.port}
                            onChange={(event) =>
                              updateServer(alias, {
                                port: normalizePortValue(event.target.value),
                              })
                            }
                            onBlur={() =>
                              {
                                const normalized = normalizePortValue(server.port) || "22";
                                updateServer(alias, {
                                  port: normalized,
                                });
                                void testConnectionForServer({
                                  ...server,
                                  port: normalized,
                                });
                              }
                            }
                            placeholder="22"
                            min={1}
                            max={65535}
                            step={1}
                            inputMode="numeric"
                            className={`${styles.tableInput} ${
                              portInvalid ? styles.tableInputMissing : ""
                            }`}
                          />
                          {portInvalid ? (
                            <span
                              className={styles.cellAlert}
                              title="Port must be between 1 and 65535."
                            >
                              !
                            </span>
                          ) : null}
                        </div>
                        <div className={styles.tableInputWrap}>
                          <input
                            value={server.user}
                            onChange={(event) =>
                              updateServer(alias, { user: event.target.value })
                            }
                            onBlur={(event) =>
                              void testConnectionForServer({
                                ...server,
                                user: event.currentTarget.value,
                              })
                            }
                            placeholder="root"
                            className={`${styles.tableInput} ${
                              userMissing ? styles.tableInputMissing : ""
                            }`}
                          />
                          {userMissing ? (
                            <span className={styles.cellAlert} title="User is required.">
                              !
                            </span>
                          ) : null}
                        </div>
                        <div className={styles.appsCell} title={roleTitle}>
                          <span className={styles.roleCell}>{roleText}</span>
                          {appsMissing ? (
                            <span
                              className={styles.cellAlert}
                              title="Select at least one app for this device."
                            >
                              !
                            </span>
                          ) : null}
                        </div>
                        <div className={styles.credentialsCell}>
                          <button
                            type="button"
                            onClick={() => openCredentialsFor(alias)}
                            className={`${styles.smallButton} ${styles.smallButtonEnabled}`}
                          >
                            <i className="fa-solid fa-pen-to-square" aria-hidden="true" />
                            <span>Edit</span>
                          </button>
                        </div>
                        <div>
                          <input
                            type="checkbox"
                            checked={isSelected}
                            disabled={!isSelectable}
                            onChange={() => toggleDeployAlias(alias)}
                          />
                        </div>
                      </div>
                    );
                  })}
                </div>
                <div className={styles.serverTableFooter}>
                  <button
                    type="button"
                    onClick={() => setDeployRolePickerOpen(true)}
                    className={`${styles.smallButton} ${styles.smallButtonEnabled}`}
                    disabled={inventoryRoleIds.length === 0}
                    title="Choose apps passed to infinito deploy --id"
                  >
                    <i className="fa-solid fa-list-check" aria-hidden="true" />
                    <span>Apps: {deployRoleSummary}</span>
                  </button>
                  <button
                    onClick={selectAllDeployAliases}
                    disabled={selectableAliases.length === 0}
                    className={`${styles.smallButton} ${
                      selectableAliases.length === 0
                        ? styles.smallButtonDisabled
                        : styles.smallButtonEnabled
                    }`}
                  >
                    Select all
                  </button>
                  <button
                    onClick={deselectAllDeployAliases}
                    disabled={selectableAliases.length === 0}
                    className={`${styles.smallButton} ${
                      selectableAliases.length === 0
                        ? styles.smallButtonDisabled
                        : styles.smallButtonEnabled
                    }`}
                  >
                    Deselect all
                  </button>
                </div>
              </div>
            </div>

            <div
              className={`${styles.deployTabPanel} ${
                deployViewTab === "terminal" ? styles.deployTabPanelActive : ""
              }`}
              aria-hidden={deployViewTab !== "terminal"}
            >
              <div className={styles.liveWrap}>
                <LiveDeploymentView
                  baseUrl={baseUrl}
                  jobId={liveJobId}
                  compact
                  fill
                  hideControls
                  connectRequestKey={connectRequestKey}
                  cancelRequestKey={cancelRequestKey}
                  onJobIdSync={setLiveJobId}
                  onConnectedChange={setLiveConnected}
                  onCancelingChange={setLiveCanceling}
                  onErrorChange={setLiveError}
                  onStatusChange={handleDeploymentStatus}
                />
              </div>
            </div>
          </div>

          <div className={styles.deployFooter}>
            <input
              value={liveJobId}
              onChange={(event) => {
                setLiveError(null);
                setLiveJobId(event.target.value);
              }}
              placeholder="Job ID"
              className={`form-control ${styles.jobInput}`}
            />
            <button
              type="button"
              onClick={requestConnect}
              disabled={!liveJobId.trim() || liveConnected}
              className={`btn btn-info ${styles.footerButton}`}
            >
              {liveConnected ? "Connected" : "Connect"}
            </button>
            <button
              type="button"
              onClick={startDeployment}
              disabled={!canDeploy}
              className={`btn btn-success ${styles.footerButton}`}
            >
              {deploying ? "Deploying..." : "Deploy"}
            </button>
            <button
              type="button"
              onClick={requestCancel}
              disabled={!liveJobId.trim() || liveCanceling || !liveConnected}
              className={`btn btn-danger ${styles.footerButton}`}
            >
              {liveCanceling ? "Canceling..." : "Cancel"}
            </button>
          </div>
        </div>
      ),
    },
    {
      key: "billing",
      title: "Billing",
      content: (
        <div className={styles.billingPanel}>
          <div className={styles.billingTableWrap}>
            <table className={styles.billingTable}>
              <thead>
                <tr>
                  <th>Position</th>
                  <th>Menge</th>
                  <th>Einzelpreis (EUR/Monat)</th>
                  <th>Laufend (EUR/Monat)</th>
                  <th>Einmalig (EUR)</th>
                </tr>
              </thead>
              <tbody>
                {billingMatrixRows.map((row) => (
                  <tr key={row.item}>
                    <td>{row.item}</td>
                    <td>{row.quantity}</td>
                    <td>{row.unit.toFixed(2)}</td>
                    <td>{row.recurring.toFixed(2)}</td>
                    <td>{row.setup.toFixed(2)}</td>
                  </tr>
                ))}
              </tbody>
              <tfoot>
                <tr>
                  <td>Summe</td>
                  <td />
                  <td />
                  <td>{billingRecurringTotal.toFixed(2)}</td>
                  <td>{billingSetupTotal.toFixed(2)}</td>
                </tr>
              </tfoot>
            </table>
          </div>
          <p className={styles.billingHint}>
            Placeholder-Matrix fuer den ersten Billing-Ueberblick.
          </p>
        </div>
      ),
    },
  ];

  const enabledPanels = useMemo(
    () => panels.filter((panel) => !panel.disabled),
    [panels]
  );

  useEffect(() => {
    if (enabledPanels.length === 0) return;
    if (!enabledPanels.some((panel) => panel.key === activePanel)) {
      setActivePanel(enabledPanels[0].key);
    }
  }, [activePanel, enabledPanels]);

  const closeDetailSearch = useCallback(() => {
    setDetailSearchOpen(false);
    setDetailSearchTargetAlias(null);
  }, []);

  const handleDomainPopupTypeSelect = useCallback((kind: DomainKind) => {
    setDomainPopupType(kind);
    setDomainPopupError(null);
    setDomainPopupFqdnCheckResult(null);
  }, []);

  const handleDomainPopupFqdnValueChange = useCallback(
    (value: string) => {
      setDomainPopupFqdnValue(value);
      if (domainPopupError) setDomainPopupError(null);
      if (domainPopupFqdnCheckResult) {
        setDomainPopupFqdnCheckResult(null);
      }
    },
    [domainPopupError, domainPopupFqdnCheckResult]
  );

  return (
    <DeploymentWorkspaceTemplate
      panels={panels}
      activePanel={activePanel}
      onSelectPanel={setActivePanel}
      deployRolePicker={{
        open: deployRolePickerOpen,
        query: deployRoleQuery,
        summary: deployRoleSummary,
        options: deployRoleOptions,
        selected: deployRoleFilter,
        inventoryRoleIds,
        onClose: () => setDeployRolePickerOpen(false),
        onQueryChange: setDeployRoleQuery,
        onSelectAll: selectAllDeployRoles,
        onClearAll: deselectAllDeployRoles,
        onToggleRole: toggleDeployRole,
      }}
      detailSearch={{
        open: detailSearchOpen,
        targetAlias: detailSearchTargetAlias,
        baseUrl,
        workspaceId,
        workspacePrimaryDomain,
        onClose: closeDetailSearch,
        onOrderedServer: handleProviderOrderedServer,
      }}
      expertModeConfirm={{
        open: expertConfirmOpen,
        onCancel: cancelExpertMode,
        onConfirm: confirmExpertMode,
      }}
      domainPopup={{
        open: domainPopupOpen,
        saving: primaryDomainModalSaving,
        prompt: domainPopupPrompt,
        type: domainPopupType,
        error: domainPopupError,
        fqdnValue: domainPopupFqdnValue,
        fqdnCheckBusy: domainPopupFqdnCheckBusy,
        fqdnCheckResult: domainPopupFqdnCheckResult,
        localValue: domainPopupLocalValue,
        subLabel: domainPopupSubLabel,
        parentFqdn: domainPopupParentFqdn,
        fqdnOptions: fqdnDomainOptions,
        onClose: closeDomainPopup,
        onSelectType: handleDomainPopupTypeSelect,
        onFqdnValueChange: handleDomainPopupFqdnValueChange,
        onCheckFqdn: () => {
          void checkDomainPopupFqdn();
        },
        onLocalValueChange: setDomainPopupLocalValue,
        onSubLabelChange: setDomainPopupSubLabel,
        onParentFqdnChange: setDomainPopupParentFqdn,
        onAddDomain: addDomainFromPopup,
      }}
    />
  );
}
