"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import type { CSSProperties, ReactNode } from "react";
import { createPortal } from "react-dom";
import CodeMirror from "@uiw/react-codemirror";
import { yaml as yamlLang } from "@codemirror/lang-yaml";
import { filterRoles } from "../lib/role_filter";
import { VIEW_CONFIG, VIEW_MODE_ICONS } from "./role-dashboard/constants";
import { sortStatuses } from "./role-dashboard/helpers";
import { hexToRgba } from "./deployment-credentials/device-visuals";
import BundleGridView from "./role-dashboard/BundleGridView";
import EnableDropdown from "./role-dashboard/EnableDropdown";
import RoleDetailsModal from "./role-dashboard/RoleDetailsModal";
import RoleGridView from "./role-dashboard/RoleGridView";
import RoleListView from "./role-dashboard/RoleListView";
import RoleLogoView from "./role-dashboard/RoleLogoView";
import RoleVideoModal from "./role-dashboard/RoleVideoModal";
import { VIEW_MODES } from "./role-dashboard/types";
import ModeToggle from "./ModeToggle";
import styles from "./RoleDashboard.module.css";
import type { Bundle, Role, ViewMode } from "./role-dashboard/types";

type RoleAppConfigPayload = {
  role_id: string;
  alias: string;
  host_vars_path: string;
  content: string;
  imported_paths?: number;
};

const ROW_FILTER_OPTIONS: number[] = [1, 2, 3, 5, 10, 20, 100, 500, 1000];

function formatViewLabel(mode: ViewMode): string {
  return mode.charAt(0).toUpperCase() + mode.slice(1);
}

type SoftwareScope = "apps" | "bundles";
const SOFTWARE_SCOPE_OPTIONS: { id: SoftwareScope; label: string }[] = [
  { id: "bundles", label: "Bundles" },
  { id: "apps", label: "Apps" },
];

function normalizeFacet(value: string): string {
  return String(value || "").trim().toLowerCase();
}

function collectFacetValues<T>(
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

type RoleDashboardProps = {
  baseUrl?: string;
  roles: Role[];
  loading: boolean;
  error: string | null;
  selected: Set<string>;
  onToggleSelected: (id: string) => void;
  onLoadRoleAppConfig?: (
    roleId: string,
    alias?: string
  ) => Promise<RoleAppConfigPayload>;
  onSaveRoleAppConfig?: (
    roleId: string,
    content: string,
    alias?: string
  ) => Promise<RoleAppConfigPayload>;
  onImportRoleAppDefaults?: (
    roleId: string,
    alias?: string
  ) => Promise<RoleAppConfigPayload>;
  activeAlias?: string;
  serverAliases?: string[];
  serverMetaByAlias?: Record<string, { logoEmoji?: string | null; color?: string | null }>;
  selectedByAlias?: Record<string, string[]>;
  onToggleSelectedForAlias?: (alias: string, roleId: string) => void;
  selectedPlanByAlias?: Record<string, Record<string, string | null>>;
  onSelectPlanForAlias?: (
    alias: string,
    roleId: string,
    planId: string | null
  ) => void;
  serverSwitcher?: ReactNode;
  onCreateServerForTarget?: (target: string) => string | null;
  mode?: "customer" | "expert";
  onModeChange?: (mode: "customer" | "expert") => void;
  compact?: boolean;
};

export default function RoleDashboard({
  baseUrl,
  roles,
  loading,
  error,
  selected,
  onToggleSelected,
  onLoadRoleAppConfig,
  onSaveRoleAppConfig,
  onImportRoleAppDefaults,
  activeAlias,
  serverAliases,
  serverMetaByAlias,
  selectedByAlias,
  onToggleSelectedForAlias,
  selectedPlanByAlias,
  onSelectPlanForAlias,
  serverSwitcher,
  onCreateServerForTarget,
  mode: controlledMode,
  onModeChange,
  compact = false,
}: RoleDashboardProps) {
  const Wrapper = compact ? "div" : "section";
  const wrapperClassName = compact ? styles.root : `${styles.root} ${styles.wrapper}`;

  const [query, setQuery] = useState("");
  const [queryDraft, setQueryDraft] = useState("");
  const [statusFilter, setStatusFilter] = useState<Set<string>>(new Set());
  const [targetFilter, setTargetFilter] = useState("all");
  const [categoryFilter, setCategoryFilter] = useState<Set<string>>(new Set());
  const [tagFilter, setTagFilter] = useState<Set<string>>(new Set());
  const [categoryDraft, setCategoryDraft] = useState("");
  const [tagDraft, setTagDraft] = useState("");
  const [softwareScope, setSoftwareScope] = useState<SoftwareScope>("bundles");
  const [showSelectedOnly, setShowSelectedOnly] = useState(false);
  const [page, setPage] = useState(1);
  const [viewMode, setViewMode] = useState<ViewMode>("detail");
  const [rowsOverride, setRowsOverride] = useState<number | null>(null);
  const scrollRef = useRef<HTMLDivElement | null>(null);
  const controlsRef = useRef<HTMLDivElement | null>(null);
  const filtersButtonRef = useRef<HTMLButtonElement | null>(null);
  const filtersPopoverRef = useRef<HTMLDivElement | null>(null);
  const scopeButtonRef = useRef<HTMLButtonElement | null>(null);
  const scopePopoverRef = useRef<HTMLDivElement | null>(null);
  const viewButtonRef = useRef<HTMLButtonElement | null>(null);
  const viewPopoverRef = useRef<HTMLDivElement | null>(null);
  const [gridSize, setGridSize] = useState({ width: 0, height: 0 });
  const [filtersOpen, setFiltersOpen] = useState(false);
  const [filtersPos, setFiltersPos] = useState({ top: 0, left: 0 });
  const [viewMenuOpen, setViewMenuOpen] = useState(false);
  const [scopeMenuOpen, setScopeMenuOpen] = useState(false);
  const [localMode, setLocalMode] = useState<"customer" | "expert">("customer");
  const [editingRole, setEditingRole] = useState<Role | null>(null);
  const [editorContent, setEditorContent] = useState("");
  const [editorPath, setEditorPath] = useState("");
  const [editorAlias, setEditorAlias] = useState("");
  const [editorBusy, setEditorBusy] = useState(false);
  const [editorError, setEditorError] = useState<string | null>(null);
  const [editorStatus, setEditorStatus] = useState<string | null>(null);
  const editorExtensions = useMemo(() => [yamlLang()], []);
  const [activeVideo, setActiveVideo] = useState<{
    url: string;
    title: string;
  } | null>(null);
  const [activeDetails, setActiveDetails] = useState<{
    role: Role;
    alias: string;
  } | null>(null);
  const [bundles, setBundles] = useState<Bundle[]>([]);
  const [bundlesLoading, setBundlesLoading] = useState(false);
  const [bundlesError, setBundlesError] = useState<string | null>(null);
  const [bundleMergePrompt, setBundleMergePrompt] = useState<{
    bundle: Bundle;
    alias: string;
  } | null>(null);

  useEffect(() => {
    if (!activeVideo) return;
    const handle = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        setActiveVideo(null);
      }
    };
    window.addEventListener("keydown", handle);
    return () => window.removeEventListener("keydown", handle);
  }, [activeVideo]);

  useEffect(() => {
    if (!activeDetails) return;
    const handle = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        setActiveDetails(null);
      }
    };
    window.addEventListener("keydown", handle);
    return () => window.removeEventListener("keydown", handle);
  }, [activeDetails]);

  useEffect(() => {
    const apiBase = String(baseUrl || "").trim();
    const endpoint = `${apiBase}/api/bundles`;
    let alive = true;
    const loadBundles = async () => {
      setBundlesLoading(true);
      setBundlesError(null);
      try {
        const res = await fetch(endpoint, { cache: "no-store" });
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        const data = await res.json();
        if (!alive) return;
        setBundles(Array.isArray(data) ? data : []);
      } catch (err: any) {
        if (!alive) return;
        setBundles([]);
        setBundlesError(err?.message ?? "failed to load bundles");
      } finally {
        if (alive) setBundlesLoading(false);
      }
    };
    void loadBundles();
    return () => {
      alive = false;
    };
  }, [baseUrl]);

  useEffect(() => {
    const node = scrollRef.current;
    if (!node) return;
    const update = () => {
      const controlsHeight = controlsRef.current?.clientHeight ?? 0;
      setGridSize({
        width: node.clientWidth || 0,
        height: Math.max(0, (node.clientHeight || 0) - controlsHeight),
      });
    };
    update();
    if (typeof ResizeObserver === "undefined") {
      window.addEventListener("resize", update);
      return () => window.removeEventListener("resize", update);
    }
    const observer = new ResizeObserver(() => update());
    observer.observe(node);
    if (controlsRef.current) observer.observe(controlsRef.current);
    return () => observer.disconnect();
  }, []);

  const statusOptions = useMemo(() => {
    const set = new Set<string>();
    roles.forEach((role) => {
      if (role.status) set.add(role.status);
    });
    return sortStatuses(Array.from(set));
  }, [roles]);

  const appCategoryOptions = useMemo(
    () => collectFacetValues(roles, (role) => role.categories),
    [roles]
  );

  const appTagOptions = useMemo(
    () => collectFacetValues(roles, (role) => role.galaxy_tags),
    [roles]
  );

  const bundleCategoryOptions = useMemo(
    () => collectFacetValues(bundles, (bundle) => bundle.categories),
    [bundles]
  );

  const bundleTagOptions = useMemo(
    () => collectFacetValues(bundles, (bundle) => bundle.tags),
    [bundles]
  );

  const appCategoryLabelByToken = useMemo(() => {
    const map = new Map<string, string>();
    appCategoryOptions.forEach((entry) => {
      map.set(normalizeFacet(entry), entry);
    });
    return map;
  }, [appCategoryOptions]);

  const appTagLabelByToken = useMemo(() => {
    const map = new Map<string, string>();
    appTagOptions.forEach((entry) => {
      map.set(normalizeFacet(entry), entry);
    });
    return map;
  }, [appTagOptions]);

  const bundleCategoryLabelByToken = useMemo(() => {
    const map = new Map<string, string>();
    bundleCategoryOptions.forEach((entry) => {
      map.set(normalizeFacet(entry), entry);
    });
    return map;
  }, [bundleCategoryOptions]);

  const bundleTagLabelByToken = useMemo(() => {
    const map = new Map<string, string>();
    bundleTagOptions.forEach((entry) => {
      map.set(normalizeFacet(entry), entry);
    });
    return map;
  }, [bundleTagOptions]);

  const activeCategoryOptions =
    softwareScope === "bundles" ? bundleCategoryOptions : appCategoryOptions;
  const activeTagOptions =
    softwareScope === "bundles" ? bundleTagOptions : appTagOptions;
  const activeCategoryLabelByToken =
    softwareScope === "bundles"
      ? bundleCategoryLabelByToken
      : appCategoryLabelByToken;
  const activeTagLabelByToken =
    softwareScope === "bundles" ? bundleTagLabelByToken : appTagLabelByToken;

  const matrixAliases = useMemo(() => {
    const raw = Array.isArray(serverAliases) ? serverAliases : [];
    const deduped = Array.from(
      new Set(
        raw
          .map((alias) => String(alias || "").trim())
          .filter(Boolean)
      )
    );
    if (deduped.length > 0) return deduped;
    const fallback = String(activeAlias || "").trim();
    return fallback ? [fallback] : [];
  }, [serverAliases, activeAlias]);

  const matrixColumnStyleByAlias = useMemo(() => {
    const out: Record<string, CSSProperties> = {};
    matrixAliases.forEach((alias) => {
      const color = String(serverMetaByAlias?.[alias]?.color || "").trim();
      const cellBg = hexToRgba(color, 0.14);
      const headBg = hexToRgba(color, 0.24);
      const border = hexToRgba(color, 0.58);
      if (!cellBg && !headBg && !border) return;
      out[alias] = {
        ...(cellBg ? { "--matrix-device-col-bg": cellBg } : {}),
        ...(headBg ? { "--matrix-device-col-head-bg": headBg } : {}),
        ...(border ? { "--matrix-device-col-border": border } : {}),
      } as CSSProperties;
    });
    return out;
  }, [matrixAliases, serverMetaByAlias]);

  const selectedLookup = useMemo(() => {
    const out: Record<string, Set<string>> = {};
    if (selectedByAlias) {
      Object.entries(selectedByAlias).forEach(([alias, roleIds]) => {
        const key = String(alias || "").trim();
        if (!key) return;
        out[key] = new Set(
          (Array.isArray(roleIds) ? roleIds : [])
            .map((roleId) => String(roleId || "").trim())
            .filter(Boolean)
        );
      });
    }
    const active = String(activeAlias || "").trim();
    if (active && !out[active]) {
      out[active] = new Set(selected);
    }
    return out;
  }, [selectedByAlias, activeAlias, selected]);

  const roleServerCountByRole = useMemo(() => {
    const counts: Record<string, number> = {};
    roles.forEach((role) => {
      const roleId = String(role.id || "").trim();
      if (!roleId) return;
      counts[roleId] = matrixAliases.reduce((sum, alias) => {
        return sum + (selectedLookup[alias]?.has(roleId) ? 1 : 0);
      }, 0);
    });
    return counts;
  }, [roles, matrixAliases, selectedLookup]);

  const rolePlanOptions = useMemo(() => {
    const out: Record<string, { id: string; label: string }[]> = {};
    roles.forEach((role) => {
      const pricing = role?.pricing;
      const offerings = Array.isArray(pricing?.offerings) ? pricing.offerings : [];
      const defaultOfferingId = String(
        pricing?.default_offering_id || pricing?.default_offering || ""
      ).trim();
      const orderedOfferings = offerings
        .slice()
        .sort((a: any, b: any) => {
          const aId = String(a?.id || "").trim();
          const bId = String(b?.id || "").trim();
          if (aId === defaultOfferingId && bId !== defaultOfferingId) return -1;
          if (bId === defaultOfferingId && aId !== defaultOfferingId) return 1;
          return aId.localeCompare(bId);
        });
      const plans = orderedOfferings.flatMap((offering: any) =>
        Array.isArray(offering?.plans) ? offering.plans : []
      );
      const normalized = plans
        .map((plan: any) => ({
          id: String(plan?.id || "").trim(),
          label: String(plan?.label || plan?.id || "").trim(),
        }))
        .filter((plan: { id: string; label: string }) => plan.id && plan.label);
      const deduped = Array.from(
        new Map(normalized.map((plan: { id: string; label: string }) => [plan.id, plan])).values()
      );
      if (!deduped.some((plan) => plan.id === "community")) {
        deduped.unshift({ id: "community", label: "Community" });
      }
      out[role.id] = deduped.length > 0 ? deduped : [{ id: "community", label: "Community" }];
    });
    return out;
  }, [roles]);

  const defaultPlanByRole = useMemo(() => {
    const out: Record<string, string> = {};
    Object.entries(rolePlanOptions).forEach(([roleId, plans]) => {
      out[roleId] =
        plans.find((plan) => plan.id === "community")?.id ||
        plans[0]?.id ||
        "community";
    });
    return out;
  }, [rolePlanOptions]);

  const selectedPlanLookup = useMemo(() => {
    const out: Record<string, Record<string, string | null>> = {};
    matrixAliases.forEach((alias) => {
      const next: Record<string, string | null> = {};
      const selectedRoles = selectedLookup[alias] || new Set<string>();
      const rolePlans = selectedPlanByAlias?.[alias] || {};
      roles.forEach((role) => {
        const roleId = role.id;
        const selectedPlan = rolePlans?.[roleId];
        if (selectedRoles.has(roleId)) {
          next[roleId] = selectedPlan || defaultPlanByRole[roleId] || "community";
        } else {
          next[roleId] = null;
        }
      });
      out[alias] = next;
    });
    return out;
  }, [matrixAliases, selectedLookup, selectedPlanByAlias, roles, defaultPlanByRole]);

  const activeSelectedPlanByRole = useMemo(() => {
    const alias = String(activeAlias || "").trim();
    if (!alias) return {};
    return selectedPlanLookup[alias] || {};
  }, [activeAlias, selectedPlanLookup]);

  const appFilteredRoles = useMemo(
    () =>
      filterRoles(roles, {
        statuses: statusFilter,
        target: targetFilter,
        query,
        categories: categoryFilter,
        tags: tagFilter,
      }),
    [roles, statusFilter, targetFilter, query, categoryFilter, tagFilter]
  );

  const filteredBundles = useMemo(() => {
    const queryToken = normalizeFacet(query);
    const categoryTokens = new Set(Array.from(categoryFilter));
    const tagTokens = new Set(Array.from(tagFilter));
    return bundles.filter((bundle) => {
      if (targetFilter !== "all") {
        const target = normalizeFacet(bundle.deploy_target);
        if (target !== targetFilter) return false;
      }

      if (categoryTokens.size > 0) {
        const categories = (bundle.categories || []).map(normalizeFacet);
        if (!categories.some((entry) => categoryTokens.has(entry))) return false;
      }

      if (tagTokens.size > 0) {
        const tags = (bundle.tags || []).map(normalizeFacet);
        if (!tags.some((entry) => tagTokens.has(entry))) return false;
      }

      if (queryToken) {
        const haystack = [bundle.id, bundle.title, bundle.description]
          .map(normalizeFacet)
          .join(" ");
        if (!haystack.includes(queryToken)) return false;
      }

      return true;
    });
  }, [bundles, targetFilter, categoryFilter, tagFilter, query]);

  const filteredRoles = useMemo(() => {
    if (!showSelectedOnly) return appFilteredRoles;
    if (viewMode === "matrix") {
      return appFilteredRoles.filter((role) =>
        matrixAliases.some((alias) => selectedLookup[alias]?.has(role.id))
      );
    }
    return appFilteredRoles.filter((role) => selected.has(role.id));
  }, [appFilteredRoles, selected, showSelectedOnly, viewMode, matrixAliases, selectedLookup]);

  const viewConfig = VIEW_CONFIG[viewMode];
  const gridGap = 16;
  const widthBuffer = viewMode === "mini" ? 80 : viewConfig.horizontal ? 360 : 140;
  const minCardWidth = Math.max(viewConfig.minWidth, viewConfig.iconSize + widthBuffer);
  const computedColumns =
    viewMode === "list" || viewMode === "matrix"
      ? 1
      : Math.max(
          1,
          Math.floor((gridSize.width + gridGap) / (minCardWidth + gridGap))
        );
  const contentHeightBuffer =
    viewMode === "mini" ? 24 : viewMode === "matrix" ? 12 : 8;
  const computedRows = Math.max(
    1,
    Math.floor(
      (Math.max(0, gridSize.height - contentHeightBuffer) + gridGap) /
        (viewConfig.minHeight + gridGap)
    )
  );
  const rows = Math.max(1, rowsOverride ?? computedRows);
  const pageSize = Math.max(1, rows * computedColumns);
  const activeItemCount =
    softwareScope === "bundles" ? filteredBundles.length : filteredRoles.length;
  const rowOptions = useMemo(() => {
    const maxRows = Math.max(
      1,
      Math.ceil(activeItemCount / Math.max(1, computedColumns))
    );
    const next = ROW_FILTER_OPTIONS.filter((value) => value <= maxRows);
    if (rowsOverride && !next.includes(rowsOverride)) {
      next.push(rowsOverride);
    }
    return next.sort((a, b) => a - b);
  }, [activeItemCount, computedColumns, rowsOverride]);

  const pageCount = Math.max(1, Math.ceil(activeItemCount / pageSize));
  const currentPage = Math.min(page, pageCount);
  const paginatedRoles = useMemo(() => {
    const start = (currentPage - 1) * pageSize;
    return filteredRoles.slice(start, start + pageSize);
  }, [filteredRoles, currentPage, pageSize]);
  const paginatedBundles = useMemo(() => {
    const start = (currentPage - 1) * pageSize;
    return filteredBundles.slice(start, start + pageSize);
  }, [filteredBundles, currentPage, pageSize]);

  const selectedCount = useMemo(() => {
    if (viewMode !== "matrix") return selected.size;
    return matrixAliases.reduce(
      (sum, alias) => sum + (selectedLookup[alias]?.size ?? 0),
      0
    );
  }, [viewMode, selected, matrixAliases, selectedLookup]);

  const filteredSelectedCount = useMemo(() => {
    if (viewMode !== "matrix") {
      return filteredRoles.filter((role) => selected.has(role.id)).length;
    }
    const allowedRoleIds = new Set(filteredRoles.map((role) => role.id));
    let count = 0;
    matrixAliases.forEach((alias) => {
      selectedLookup[alias]?.forEach((roleId) => {
        if (allowedRoleIds.has(roleId)) count += 1;
      });
    });
    return count;
  }, [viewMode, filteredRoles, selected, matrixAliases, selectedLookup]);

  const hiddenSelected = Math.max(0, selectedCount - filteredSelectedCount);
  const isBundleScope = softwareScope === "bundles";
  const headerLoading = isBundleScope ? bundlesLoading : loading;
  const headerError = isBundleScope ? bundlesError : error;
  const headerFilteredCount = isBundleScope ? filteredBundles.length : filteredRoles.length;
  const headerTotalCount = isBundleScope ? bundles.length : roles.length;

  const toggleStatus = (status: string) => {
    setStatusFilter((prev) => {
      const next = new Set(prev);
      if (next.has(status)) {
        next.delete(status);
      } else {
        next.add(status);
      }
      return next;
    });
  };

  const addCategoryFilter = () => {
    const token = normalizeFacet(categoryDraft);
    if (!token) return;
    setCategoryFilter((prev) => {
      const next = new Set(prev);
      next.add(token);
      return next;
    });
    setCategoryDraft("");
  };

  const addTagFilter = () => {
    const token = normalizeFacet(tagDraft);
    if (!token) return;
    setTagFilter((prev) => {
      const next = new Set(prev);
      next.add(token);
      return next;
    });
    setTagDraft("");
  };

  const canToggleAliasRole = (alias: string) =>
    Boolean(onSelectPlanForAlias || onToggleSelectedForAlias) ||
    String(activeAlias || "").trim() === alias;

  const toggleSelectedByAlias = (alias: string, roleId: string) => {
    if (!alias || !roleId) return;
    if (onToggleSelectedForAlias) {
      onToggleSelectedForAlias(alias, roleId);
      return;
    }
    if (String(activeAlias || "").trim() === alias) {
      onToggleSelected(roleId);
    }
  };

  const selectPlanByAlias = (alias: string, roleId: string, planId: string | null) => {
    if (!alias || !roleId) return;
    if (onSelectPlanForAlias) {
      onSelectPlanForAlias(alias, roleId, planId);
      return;
    }
    const selectedState = Boolean(selectedLookup[alias]?.has(roleId));
    if (planId && !selectedState) {
      toggleSelectedByAlias(alias, roleId);
    } else if (!planId && selectedState) {
      toggleSelectedByAlias(alias, roleId);
    }
  };

  const knownRoleIds = useMemo(
    () => new Set(roles.map((role) => String(role.id || "").trim()).filter(Boolean)),
    [roles]
  );

  const resolveBundleAlias = (bundle: Bundle): string => {
    const currentAlias = String(activeAlias || "").trim();
    if (currentAlias) return currentAlias;

    const existingAliases = matrixAliases
      .map((alias) => String(alias || "").trim())
      .filter(Boolean);
    if (existingAliases.length > 0) {
      const deployTarget = String(bundle.deploy_target || "").trim().toLowerCase();
      const targetMatch =
        existingAliases.find((alias) => alias.toLowerCase() === deployTarget) ||
        existingAliases.find((alias) =>
          alias.toLowerCase().includes(deployTarget === "workstation" ? "workstation" : "server")
        );
      return targetMatch || existingAliases[0];
    }

    const createdAlias = onCreateServerForTarget?.(bundle.deploy_target);
    return String(createdAlias || bundle.deploy_target || "server").trim() || "server";
  };

  const applyBundleToAlias = (
    bundle: Bundle,
    alias: string,
    strategy: "merge" | "overwrite"
  ) => {
    const targetAlias = String(alias || "").trim();
    if (!targetAlias) return;
    const bundleRoleIds = (Array.isArray(bundle.role_ids) ? bundle.role_ids : [])
      .map((roleId) => String(roleId || "").trim())
      .filter((roleId) => roleId && knownRoleIds.has(roleId));
    if (bundleRoleIds.length === 0) return;

    const existing = selectedLookup[targetAlias] || new Set<string>();
    const desired =
      strategy === "merge"
        ? new Set<string>([...Array.from(existing), ...bundleRoleIds])
        : new Set<string>(bundleRoleIds);

    const roleIdsToCheck = new Set<string>([
      ...Array.from(existing),
      ...Array.from(desired),
    ]);
    roleIdsToCheck.forEach((roleId) => {
      const hasNow = existing.has(roleId);
      const shouldHave = desired.has(roleId);
      if (hasNow === shouldHave) return;
      if (shouldHave) {
        const defaultPlan = defaultPlanByRole[roleId] || "community";
        selectPlanByAlias(targetAlias, roleId, defaultPlan);
      } else {
        selectPlanByAlias(targetAlias, roleId, null);
      }
    });
  };

  const requestEnableBundle = (bundle: Bundle) => {
    const alias = resolveBundleAlias(bundle);
    const existing = selectedLookup[alias] || new Set<string>();
    if (existing.size === 0) {
      applyBundleToAlias(bundle, alias, "overwrite");
      return;
    }
    setBundleMergePrompt({ bundle, alias });
  };

  const disableBundle = (bundle: Bundle) => {
    const alias = resolveBundleAlias(bundle);
    const existing = selectedLookup[alias] || new Set<string>();
    const bundleRoleIds = (Array.isArray(bundle.role_ids) ? bundle.role_ids : [])
      .map((roleId) => String(roleId || "").trim())
      .filter((roleId) => roleId && knownRoleIds.has(roleId));
    bundleRoleIds.forEach((roleId) => {
      if (existing.has(roleId)) {
        selectPlanByAlias(alias, roleId, null);
      }
    });
  };

  const bundleStateById = useMemo(() => {
    const alias = String(activeAlias || "").trim() || matrixAliases[0] || "";
    const selectedForAlias = selectedLookup[alias] || new Set<string>();
    const stateMap: Record<
      string,
      { enabled: boolean; selectedCount: number; totalCount: number }
    > = {};
    bundles.forEach((bundle) => {
      const bundleRoleIds = (Array.isArray(bundle.role_ids) ? bundle.role_ids : [])
        .map((roleId) => String(roleId || "").trim())
        .filter((roleId) => roleId && knownRoleIds.has(roleId));
      const totalCount = bundleRoleIds.length;
      const selectedCount = bundleRoleIds.reduce(
        (sum, roleId) => sum + (selectedForAlias.has(roleId) ? 1 : 0),
        0
      );
      stateMap[bundle.id] = {
        enabled: totalCount > 0 && selectedCount === totalCount,
        selectedCount,
        totalCount,
      };
    });
    return stateMap;
  }, [activeAlias, matrixAliases, selectedLookup, bundles, knownRoleIds]);

  const detailAliases = useMemo(() => {
    const fallback = String(activeAlias || "").trim();
    const aliases = matrixAliases.map((alias) => String(alias || "").trim()).filter(Boolean);
    if (aliases.length > 0) return aliases;
    return fallback ? [fallback] : ["server"];
  }, [matrixAliases, activeAlias]);

  const activeDetailsAlias = useMemo(() => {
    if (!activeDetails) return detailAliases[0] || "server";
    if (detailAliases.includes(activeDetails.alias)) return activeDetails.alias;
    return detailAliases[0] || "server";
  }, [activeDetails, detailAliases]);

  const activeDetailsRoleId = String(activeDetails?.role?.id || "").trim();
  const activeDetailsSelected = Boolean(
    activeDetailsRoleId && selectedLookup[activeDetailsAlias]?.has(activeDetailsRoleId)
  );
  const activeDetailsPlans = activeDetailsRoleId
    ? rolePlanOptions[activeDetailsRoleId] || [{ id: "community", label: "Community" }]
    : [{ id: "community", label: "Community" }];
  const activeDetailsPlanId = activeDetailsRoleId
    ? selectedPlanLookup[activeDetailsAlias]?.[activeDetailsRoleId] ?? null
    : null;

  useEffect(() => {
    setPage(1);
  }, [
    query,
    statusFilter,
    targetFilter,
    categoryFilter,
    tagFilter,
    softwareScope,
    showSelectedOnly,
    viewMode,
    rowsOverride,
  ]);

  useEffect(() => {
    if (page > pageCount) setPage(pageCount);
  }, [page, pageCount]);

  const applySearch = () => {
    setQuery(queryDraft.trim());
  };

  const openFilters = () => {
    const button = filtersButtonRef.current;
    if (!button) return;
    const rect = button.getBoundingClientRect();
    const width = 360;
    setFiltersPos({
      top: rect.bottom + 8,
      left: Math.max(12, rect.right - width),
    });
    setFiltersOpen(true);
  };

  useEffect(() => {
    if (!filtersOpen) return;
    const handleClickOutside = (event: MouseEvent) => {
      const target = event.target as Node | null;
      if (!target) return;
      if (filtersPopoverRef.current?.contains(target)) return;
      if (filtersButtonRef.current?.contains(target)) return;
      setFiltersOpen(false);
    };
    const handleEscape = (event: KeyboardEvent) => {
      if (event.key === "Escape") setFiltersOpen(false);
    };
    const closeOnViewportChange = () => setFiltersOpen(false);

    document.addEventListener("mousedown", handleClickOutside);
    document.addEventListener("keydown", handleEscape);
    window.addEventListener("resize", closeOnViewportChange);
    window.addEventListener("scroll", closeOnViewportChange, true);
    return () => {
      document.removeEventListener("mousedown", handleClickOutside);
      document.removeEventListener("keydown", handleEscape);
      window.removeEventListener("resize", closeOnViewportChange);
      window.removeEventListener("scroll", closeOnViewportChange, true);
    };
  }, [filtersOpen]);

  useEffect(() => {
    if (!viewMenuOpen) return;
    const handleClickOutside = (event: MouseEvent) => {
      const target = event.target as Node | null;
      if (!target) return;
      if (viewPopoverRef.current?.contains(target)) return;
      if (viewButtonRef.current?.contains(target)) return;
      setViewMenuOpen(false);
    };
    const handleEscape = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        setViewMenuOpen(false);
      }
    };
    document.addEventListener("mousedown", handleClickOutside);
    document.addEventListener("keydown", handleEscape);
    return () => {
      document.removeEventListener("mousedown", handleClickOutside);
      document.removeEventListener("keydown", handleEscape);
    };
  }, [viewMenuOpen]);

  useEffect(() => {
    if (!scopeMenuOpen) return;
    const handleClickOutside = (event: MouseEvent) => {
      const target = event.target as Node | null;
      if (!target) return;
      if (scopePopoverRef.current?.contains(target)) return;
      if (scopeButtonRef.current?.contains(target)) return;
      setScopeMenuOpen(false);
    };
    const handleEscape = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        setScopeMenuOpen(false);
      }
    };
    document.addEventListener("mousedown", handleClickOutside);
    document.addEventListener("keydown", handleEscape);
    return () => {
      document.removeEventListener("mousedown", handleClickOutside);
      document.removeEventListener("keydown", handleEscape);
    };
  }, [scopeMenuOpen]);

  useEffect(() => {
    if (softwareScope !== "bundles") return;
    setViewMenuOpen(false);
    setShowSelectedOnly(false);
    setStatusFilter(new Set());
    setTargetFilter("all");
    setCategoryFilter(new Set());
    setTagFilter(new Set());
    if (viewMode === "matrix") {
      setViewMode("detail");
    }
  }, [softwareScope, viewMode]);

  useEffect(() => {
    const onEscape = (event: KeyboardEvent) => {
      if (event.key !== "Escape") return;
      if (editingRole) {
        setEditingRole(null);
      }
    };
    window.addEventListener("keydown", onEscape);
    return () => window.removeEventListener("keydown", onEscape);
  }, [editingRole]);

  const activeMode = controlledMode ?? localMode;
  const applyMode = (mode: "customer" | "expert") => {
    if (onModeChange) {
      onModeChange(mode);
      return;
    }
    setLocalMode(mode);
  };

  const handleModeChange = (mode: "customer" | "expert") => {
    applyMode(mode);
    if (mode === "customer") {
      setEditingRole(null);
    }
  };

  const startEditRoleConfig = async (role: Role, aliasOverride?: string) => {
    if (!onLoadRoleAppConfig) return;
    const requestedAlias = String(aliasOverride || "").trim();
    setEditingRole(role);
    setEditorBusy(true);
    setEditorError(null);
    setEditorStatus(null);
    setEditorAlias(requestedAlias);
    try {
      const data = await onLoadRoleAppConfig(role.id, requestedAlias || undefined);
      setEditorContent(String(data?.content ?? ""));
      setEditorPath(String(data?.host_vars_path ?? ""));
      setEditorAlias(String(data?.alias ?? requestedAlias));
    } catch (err: any) {
      setEditorError(err?.message ?? "failed to load app config");
      setEditorContent("");
      setEditorPath("");
      setEditorAlias(requestedAlias);
    } finally {
      setEditorBusy(false);
    }
  };

  const saveRoleConfig = async () => {
    if (!editingRole || !onSaveRoleAppConfig) return;
    setEditorBusy(true);
    setEditorError(null);
    setEditorStatus(null);
    try {
      const data = await onSaveRoleAppConfig(
        editingRole.id,
        editorContent,
        editorAlias || undefined
      );
      setEditorContent(String(data?.content ?? editorContent));
      setEditorPath(String(data?.host_vars_path ?? editorPath));
      setEditorAlias(String(data?.alias ?? editorAlias));
      setEditorStatus("Saved.");
    } catch (err: any) {
      setEditorError(err?.message ?? "failed to save app config");
    } finally {
      setEditorBusy(false);
    }
  };

  const importRoleDefaults = async () => {
    if (!editingRole || !onImportRoleAppDefaults) return;
    setEditorBusy(true);
    setEditorError(null);
    setEditorStatus(null);
    try {
      const data = await onImportRoleAppDefaults(
        editingRole.id,
        editorAlias || undefined
      );
      setEditorContent(String(data?.content ?? editorContent));
      setEditorPath(String(data?.host_vars_path ?? editorPath));
      setEditorAlias(String(data?.alias ?? editorAlias));
      const imported = Number(data?.imported_paths ?? 0);
      setEditorStatus(
        imported > 0
          ? `Imported ${imported} missing paths from config/main.yml.`
          : "No missing defaults to import."
      );
    } catch (err: any) {
      setEditorError(err?.message ?? "failed to import defaults");
    } finally {
      setEditorBusy(false);
    }
  };

  const filtersOverlay =
    filtersOpen && typeof document !== "undefined"
      ? createPortal(
          <div
            ref={filtersPopoverRef}
            className={styles.dropdownCardOverlay}
            style={{ top: filtersPos.top, left: filtersPos.left }}
          >
            <div className={styles.group}>
              <span className={`text-body-tertiary ${styles.groupTitle}`}>Rows</span>
              <select
                value={rowsOverride ? String(rowsOverride) : "auto"}
                onChange={(event) => {
                  const value = event.target.value;
                  if (value === "auto") {
                    setRowsOverride(null);
                  } else {
                    const parsed = Number(value);
                    setRowsOverride(Number.isFinite(parsed) ? parsed : null);
                  }
                }}
                className={`form-select ${styles.rowSelect}`}
              >
                <option value="auto">Auto ({computedRows})</option>
                {rowOptions.map((value) => (
                  <option key={value} value={String(value)}>
                    {value} rows
                  </option>
                ))}
              </select>
            </div>

            <div className={styles.group}>
              <span className={`text-body-tertiary ${styles.groupTitle}`}>
                Deploy target
              </span>
              <div className={styles.groupButtons}>
                {["all", "server", "workstation"].map((target) => (
                  <button
                    key={target}
                    onClick={() => setTargetFilter(target)}
                    className={`${styles.pillButton} ${
                      targetFilter === target ? styles.pillButtonActive : ""
                    }`}
                  >
                    {target === "server" ? "device" : target}
                  </button>
                ))}
              </div>
            </div>

            {softwareScope === "apps" ? (
              <div className={styles.group}>
                <span className={`text-body-tertiary ${styles.groupTitle}`}>Status</span>
                <div className={styles.groupButtons}>
                  {statusOptions.map((status) => {
                    const active = statusFilter.has(status);
                    return (
                      <button
                        key={status}
                        onClick={() => toggleStatus(status)}
                        className={`${styles.pillButton} ${
                          active ? styles.pillButtonActive : ""
                        }`}
                      >
                        {status}
                      </button>
                    );
                  })}
                </div>
              </div>
            ) : null}

            {softwareScope === "apps" ? (
              <div className={styles.group}>
                <span className={`text-body-tertiary ${styles.groupTitle}`}>
                  Selection
                </span>
                <div className={styles.groupButtons}>
                  {[
                    { key: "all", label: "all", active: !showSelectedOnly },
                    { key: "selected", label: "enabled", active: showSelectedOnly },
                  ].map((item) => (
                    <button
                      key={item.key}
                      onClick={() => setShowSelectedOnly(item.key === "selected")}
                      className={`${styles.pillButton} ${
                        item.active ? styles.pillButtonActive : ""
                      }`}
                    >
                      {item.label}
                    </button>
                  ))}
                </div>
              </div>
            ) : null}

            <div className={styles.group}>
              <span className={`text-body-tertiary ${styles.groupTitle}`}>Categories</span>
              <div className={styles.filterInputRow}>
                <input
                  value={categoryDraft}
                  onChange={(event) => setCategoryDraft(event.target.value)}
                  onKeyDown={(event) => {
                    if (event.key === "Enter") {
                      event.preventDefault();
                      addCategoryFilter();
                    }
                  }}
                  list="role-category-options"
                  placeholder="Search/add category"
                  className={`form-control ${styles.filterInput}`}
                />
                <button
                  type="button"
                  onClick={addCategoryFilter}
                  className={styles.filterAddButton}
                >
                  Add
                </button>
              </div>
              <datalist id="role-category-options">
                {activeCategoryOptions.map((entry) => (
                  <option key={entry} value={entry} />
                ))}
              </datalist>
              {categoryFilter.size > 0 ? (
                <div className={styles.selectedTokenList}>
                  {Array.from(categoryFilter).map((token) => (
                    <button
                      key={token}
                      type="button"
                      onClick={() =>
                        setCategoryFilter((prev) => {
                          const next = new Set(prev);
                          next.delete(token);
                          return next;
                        })
                      }
                      className={styles.selectedToken}
                    >
                      <span>{activeCategoryLabelByToken.get(token) || token}</span>
                      <i className="fa-solid fa-xmark" aria-hidden="true" />
                    </button>
                  ))}
                </div>
              ) : (
                <span className={styles.groupHint}>No category filter</span>
              )}
            </div>

            <div className={styles.group}>
              <span className={`text-body-tertiary ${styles.groupTitle}`}>Tags</span>
              <div className={styles.filterInputRow}>
                <input
                  value={tagDraft}
                  onChange={(event) => setTagDraft(event.target.value)}
                  onKeyDown={(event) => {
                    if (event.key === "Enter") {
                      event.preventDefault();
                      addTagFilter();
                    }
                  }}
                  list="role-tag-options"
                  placeholder="Search/add tag"
                  className={`form-control ${styles.filterInput}`}
                />
                <button
                  type="button"
                  onClick={addTagFilter}
                  className={styles.filterAddButton}
                >
                  Add
                </button>
              </div>
              <datalist id="role-tag-options">
                {activeTagOptions.map((entry) => (
                  <option key={entry} value={entry} />
                ))}
              </datalist>
              {tagFilter.size > 0 ? (
                <div className={styles.selectedTokenList}>
                  {Array.from(tagFilter).map((token) => (
                    <button
                      key={token}
                      type="button"
                      onClick={() =>
                        setTagFilter((prev) => {
                          const next = new Set(prev);
                          next.delete(token);
                          return next;
                        })
                      }
                      className={styles.selectedToken}
                    >
                      <span>{activeTagLabelByToken.get(token) || token}</span>
                      <i className="fa-solid fa-xmark" aria-hidden="true" />
                    </button>
                  ))}
                </div>
              ) : (
                <span className={styles.groupHint}>No tag filter</span>
              )}
            </div>
          </div>,
          document.body
        )
      : null;

  return (
    <Wrapper className={wrapperClassName}>
      {!compact ? (
        <div className={styles.header}>
          <div className={styles.headerLeft}>
            <h2 className={`text-body ${styles.title}`}>Software</h2>
            <p className={`text-body-secondary ${styles.subtitle}`}>
              Browse roles, filter fast, and keep your selections locked in while you
              explore.
            </p>
          </div>
          <div className={`text-body-secondary ${styles.headerRight}`}>
            {headerLoading ? (
              <span>{isBundleScope ? "Loading bundles…" : "Loading roles…"}</span>
            ) : (
              <span>
                {headerFilteredCount} / {headerTotalCount}{" "}
                {isBundleScope ? "bundles" : "roles"}
                {!isBundleScope && selectedCount > 0 ? (
                  <span>
                    {" "}
                    · Enabled {selectedCount}
                    {hiddenSelected > 0 ? ` (${hiddenSelected} hidden)` : ""}
                  </span>
                ) : null}
                {!isBundleScope && viewMode === "matrix"
                  ? ` · Matrix: ${matrixAliases.length} devices`
                  : !isBundleScope && activeAlias
                    ? ` · Active: ${activeAlias}`
                    : ""}
              </span>
            )}
          </div>
        </div>
      ) : null}

      {headerError ? <div className={`text-danger ${styles.error}`}>{headerError}</div> : null}

      <div className={styles.layout}>
        <div ref={scrollRef} className={styles.scrollArea}>
          <div ref={controlsRef} className={styles.controls}>
            <div className={styles.controlsRow}>
              <input
                value={queryDraft}
                onChange={(e) => {
                  const value = e.target.value;
                  setQueryDraft(value);
                  setQuery(value);
                }}
                onKeyDown={(event) => {
                  if (event.key === "Enter") {
                    event.preventDefault();
                    applySearch();
                  }
                }}
                placeholder={softwareScope === "bundles" ? "Search bundles" : "Search roles"}
                aria-label={softwareScope === "bundles" ? "Search bundles" : "Search roles"}
                className={`form-control ${styles.search}`}
              />
              <button
                ref={filtersButtonRef}
                onClick={() => {
                  if (filtersOpen) {
                    setFiltersOpen(false);
                  } else {
                    openFilters();
                  }
                }}
                className={`${styles.toolbarButton} ${styles.filterButton}`}
                aria-expanded={filtersOpen}
              >
                <i className="fa-solid fa-filter" aria-hidden="true" />
                <span>Filters</span>
                <i className="fa-solid fa-chevron-down" aria-hidden="true" />
              </button>
              <div className={styles.scopeControl}>
                <button
                  ref={scopeButtonRef}
                  type="button"
                  onClick={() => setScopeMenuOpen((prev) => !prev)}
                  className={`${styles.toolbarButton} ${styles.scopeButton}`}
                  aria-haspopup="menu"
                  aria-expanded={scopeMenuOpen}
                >
                  <i className="fa-solid fa-layer-group" aria-hidden="true" />
                  <span>
                    {SOFTWARE_SCOPE_OPTIONS.find((option) => option.id === softwareScope)?.label ||
                      "Bundles"}
                  </span>
                  <i className="fa-solid fa-chevron-down" aria-hidden="true" />
                </button>
                {scopeMenuOpen ? (
                  <div
                    ref={scopePopoverRef}
                    className={styles.scopeMenu}
                    role="menu"
                  >
                    {SOFTWARE_SCOPE_OPTIONS.map((option) => (
                      <button
                        key={option.id}
                        type="button"
                        onClick={() => {
                          setSoftwareScope(option.id);
                          setScopeMenuOpen(false);
                        }}
                        className={`${styles.scopeMenuItem} ${
                          softwareScope === option.id ? styles.scopeMenuItemActive : ""
                        }`}
                      >
                        {option.label}
                      </button>
                    ))}
                  </div>
                ) : null}
              </div>
              {softwareScope === "apps" && serverSwitcher && viewMode !== "matrix" ? (
                <div className={styles.serverSwitcherSlot}>{serverSwitcher}</div>
              ) : null}
              {softwareScope === "apps" ? (
                <div className={styles.viewModeControl}>
                  <button
                    ref={viewButtonRef}
                    onClick={() => setViewMenuOpen((prev) => !prev)}
                    className={`${styles.viewModeButton} ${styles.viewModeButtonActive}`}
                    aria-haspopup="menu"
                    aria-expanded={viewMenuOpen}
                  >
                    <i className={VIEW_MODE_ICONS[viewMode]} aria-hidden="true" />
                    <span>{formatViewLabel(viewMode)}</span>
                    <i className="fa-solid fa-chevron-down" aria-hidden="true" />
                  </button>
                  {viewMenuOpen ? (
                    <div
                      ref={viewPopoverRef}
                      className={styles.viewModeMenu}
                      role="menu"
                    >
                      {VIEW_MODES.map((mode) => {
                        const active = viewMode === mode;
                        return (
                          <button
                            key={mode}
                            onClick={() => {
                              setViewMode(mode);
                              setViewMenuOpen(false);
                            }}
                            className={`${styles.viewModeMenuItem} ${
                              active ? styles.viewModeMenuItemActive : ""
                            }`}
                          >
                            <i className={VIEW_MODE_ICONS[mode]} aria-hidden="true" />
                            <span>{formatViewLabel(mode)}</span>
                          </button>
                        );
                      })}
                    </div>
                  ) : null}
                </div>
              ) : null}
              <div
                className={`${styles.modeControl} ${
                  softwareScope === "bundles" ? styles.modeControlRight : ""
                }`}
              >
                <ModeToggle mode={activeMode} onModeChange={handleModeChange} />
              </div>
            </div>
          </div>

          <div
            className={`${styles.content} ${
              softwareScope === "apps" && viewMode === "matrix" ? styles.contentMatrix : ""
            }`}
          >
            {softwareScope === "bundles" ? (
              <BundleGridView
                bundles={paginatedBundles}
                computedColumns={computedColumns}
                gridGap={gridGap}
                minHeight={viewConfig.minHeight}
                activeAlias={String(activeAlias || "").trim() || matrixAliases[0] || "server"}
                bundleStates={bundleStateById}
                onEnableBundle={requestEnableBundle}
                onDisableBundle={disableBundle}
              />
            ) : viewMode === "matrix" ? (
              matrixAliases.length === 0 ? (
                <div className={`text-body-secondary ${styles.matrixEmpty}`}>
                  Add at least one device to use matrix selection.
                </div>
              ) : (
                <div className={styles.matrixContainer}>
                  <table className={styles.matrixTable}>
                    <thead>
                      <tr>
                        <th>App</th>
                        {matrixAliases.map((alias) => (
                          <th
                            key={alias}
                            className={styles.matrixAliasColumnHead}
                            style={matrixColumnStyleByAlias[alias]}
                          >
                            <span className={styles.matrixAliasHead}>
                              <span aria-hidden="true">
                                {serverMetaByAlias?.[alias]?.logoEmoji || "💻"}
                              </span>
                              <span>{alias}</span>
                            </span>
                          </th>
                        ))}
                      </tr>
                    </thead>
                    <tbody>
                      {paginatedRoles.map((role) => (
                        <tr key={role.id}>
                          <th className={styles.matrixRoleCell}>
                            <div className={styles.matrixRoleInner}>
                              <RoleLogoView role={role} size={28} />
                              <div className={styles.matrixRoleText}>
                                <span className={styles.matrixRoleName}>
                                  {role.display_name}
                                </span>
                              </div>
                            </div>
                          </th>
                          {matrixAliases.map((alias) => {
                            const selectedState = Boolean(
                              selectedLookup[alias]?.has(role.id)
                            );
                            const selectable = canToggleAliasRole(alias);
                            return (
                              <td
                                key={`${alias}:${role.id}`}
                                className={styles.matrixAliasColumnCell}
                                style={matrixColumnStyleByAlias[alias]}
                              >
                                <div className={styles.matrixCellActions}>
                                  <EnableDropdown
                                    enabled={selectedState}
                                    disabled={!selectable}
                                    compact
                                    pricingModel="app"
                                    plans={rolePlanOptions[role.id]}
                                    selectedPlanId={
                                      selectedPlanLookup[alias]?.[role.id] ?? null
                                    }
                                    onSelectPlan={(planId) =>
                                      selectPlanByAlias(alias, role.id, planId)
                                    }
                                    roleId={role.id}
                                    pricing={role.pricing || null}
                                    pricingSummary={role.pricing_summary || null}
                                    baseUrl={baseUrl}
                                    serverCount={selectedState ? 1 : 0}
                                    appCount={1}
                                    contextLabel={`device "${alias}" for "${role.display_name}"`}
                                    onEnable={() => {
                                      if (!selectedState) {
                                        toggleSelectedByAlias(alias, role.id);
                                      }
                                    }}
                                    onDisable={() => {
                                      if (selectedState) {
                                        toggleSelectedByAlias(alias, role.id);
                                      }
                                    }}
                                  />
                                  {activeMode === "expert" && onLoadRoleAppConfig ? (
                                    <button
                                      type="button"
                                      onClick={() =>
                                        void startEditRoleConfig(role, alias)
                                      }
                                      className={styles.matrixEditButton}
                                    >
                                      <i
                                        className="fa-solid fa-pen-to-square"
                                        aria-hidden="true"
                                      />
                                      <span>Edit</span>
                                    </button>
                                  ) : null}
                                </div>
                              </td>
                            );
                          })}
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )
            ) : viewMode === "list" ? (
              <RoleListView
                roles={paginatedRoles}
                selected={selected}
                iconSize={viewConfig.iconSize}
                onToggleSelected={onToggleSelected}
                rolePlans={rolePlanOptions}
                selectedPlanByRole={activeSelectedPlanByRole}
                onSelectRolePlan={(roleId, planId) =>
                  selectPlanByAlias(String(activeAlias || "").trim(), roleId, planId)
                }
                roleServerCountByRole={roleServerCountByRole}
                baseUrl={baseUrl}
                developerMode={activeMode === "expert"}
                onEditRoleConfig={
                  onLoadRoleAppConfig ? (role) => void startEditRoleConfig(role) : undefined
                }
                onOpenVideo={(url, title) => setActiveVideo({ url, title })}
              />
            ) : (
              <RoleGridView
                roles={paginatedRoles}
                selected={selected}
                onToggleSelected={onToggleSelected}
                rolePlans={rolePlanOptions}
                selectedPlanByRole={activeSelectedPlanByRole}
                onSelectRolePlan={(roleId, planId) =>
                  selectPlanByAlias(String(activeAlias || "").trim(), roleId, planId)
                }
                roleServerCountByRole={roleServerCountByRole}
                baseUrl={baseUrl}
                developerMode={activeMode === "expert"}
                onEditRoleConfig={
                  onLoadRoleAppConfig ? (role) => void startEditRoleConfig(role) : undefined
                }
                viewMode={viewMode}
                viewConfig={viewConfig}
                computedColumns={computedColumns}
                gridGap={gridGap}
                onOpenVideo={(url, title) => setActiveVideo({ url, title })}
                onOpenDetails={(role) =>
                  setActiveDetails({
                    role,
                    alias: String(activeAlias || "").trim() || matrixAliases[0] || "server",
                  })
                }
              />
            )}
          </div>
        </div>

        <div className={`text-body-secondary ${styles.pagination}`}>
          <button
            onClick={() => setPage((prev) => Math.max(1, prev - 1))}
            disabled={currentPage <= 1}
            className={`${styles.pageButton} ${
              currentPage <= 1 ? styles.pageButtonDisabled : styles.pageButtonEnabled
            }`}
          >
            Prev
          </button>
          <span>
            Page {currentPage} / {pageCount}
          </span>
          <button
            onClick={() => setPage((prev) => Math.min(pageCount, prev + 1))}
            disabled={currentPage >= pageCount}
            className={`${styles.pageButton} ${
              currentPage >= pageCount ? styles.pageButtonDisabled : styles.pageButtonEnabled
            }`}
          >
            Next
          </button>
        </div>
      </div>

      <RoleVideoModal activeVideo={activeVideo} onClose={() => setActiveVideo(null)} />
      {activeDetails ? (
        <RoleDetailsModal
          role={activeDetails.role}
          aliases={detailAliases}
          selectedAlias={activeDetailsAlias}
          selected={activeDetailsSelected}
          plans={activeDetailsPlans}
          selectedPlanId={activeDetailsPlanId}
          serverCount={activeDetailsSelected ? 1 : 0}
          onAliasChange={(alias) =>
            setActiveDetails((prev) => (prev ? { ...prev, alias } : prev))
          }
          onSelectPlan={(planId) => {
            if (!activeDetailsRoleId) return;
            selectPlanByAlias(activeDetailsAlias, activeDetailsRoleId, planId);
          }}
          onEnable={() => {
            if (!activeDetailsRoleId || activeDetailsSelected) return;
            toggleSelectedByAlias(activeDetailsAlias, activeDetailsRoleId);
          }}
          onDisable={() => {
            if (!activeDetailsRoleId || !activeDetailsSelected) return;
            toggleSelectedByAlias(activeDetailsAlias, activeDetailsRoleId);
          }}
          onOpenVideo={(url, title) => setActiveVideo({ url, title })}
          onClose={() => setActiveDetails(null)}
        />
      ) : null}
      {bundleMergePrompt ? (
        <div
          onClick={() => setBundleMergePrompt(null)}
          className={styles.modeConfirmOverlay}
        >
          <div
            onClick={(event) => event.stopPropagation()}
            className={styles.modeConfirmCard}
          >
            <div className={styles.modeConfirmTitleRow}>
              <i
                className={`fa-solid fa-diagram-project ${styles.modeConfirmIcon}`}
                aria-hidden="true"
              />
              <h3 className={styles.modeConfirmTitle}>Bundle deployment strategy</h3>
            </div>
            <p className={styles.modeConfirmText}>
              Server "{bundleMergePrompt.alias}" already has app selections. Choose how
              to apply "{bundleMergePrompt.bundle.title}".
            </p>
            <div className={styles.modeConfirmActions}>
              <button
                onClick={() => setBundleMergePrompt(null)}
                className={styles.modeActionButton}
              >
                <span>Cancel</span>
              </button>
              <button
                onClick={() => {
                  applyBundleToAlias(
                    bundleMergePrompt.bundle,
                    bundleMergePrompt.alias,
                    "merge"
                  );
                  setBundleMergePrompt(null);
                }}
                className={`${styles.modeActionButton} ${styles.modeActionButtonSuccess}`}
              >
                <span>Merge</span>
              </button>
              <button
                onClick={() => {
                  applyBundleToAlias(
                    bundleMergePrompt.bundle,
                    bundleMergePrompt.alias,
                    "overwrite"
                  );
                  setBundleMergePrompt(null);
                }}
                className={`${styles.modeActionButton} ${styles.modeActionButtonDanger}`}
              >
                <span>Overwrite</span>
              </button>
            </div>
          </div>
        </div>
      ) : null}
      {editingRole ? (
        <div onClick={() => setEditingRole(null)} className={styles.configEditorOverlay}>
          <div
            onClick={(event) => event.stopPropagation()}
            className={styles.configEditorCard}
          >
            <div className={styles.configEditorHeader}>
              <div>
                <h3 className={styles.configEditorTitle}>
                  Edit app config: {editingRole.display_name}
                </h3>
                <p className={`text-body-secondary ${styles.configEditorMeta}`}>
                  {editorAlias ? `Alias: ${editorAlias} · ` : ""}
                  {editorPath || "host_vars file"}
                </p>
              </div>
            </div>
            <div className={styles.configEditorSurface}>
              <CodeMirror
                value={editorContent}
                height="100%"
                editable={!editorBusy}
                extensions={editorExtensions}
                onChange={(value) => {
                  setEditorContent(value);
                  setEditorStatus(null);
                  setEditorError(null);
                }}
                className={styles.configEditorCodeMirror}
              />
            </div>
            {editorError ? (
              <p className={`text-danger ${styles.configEditorMessage}`}>{editorError}</p>
            ) : null}
            {editorStatus ? (
              <p className={`text-success ${styles.configEditorMessage}`}>{editorStatus}</p>
            ) : null}
            <div className={styles.configEditorActions}>
              <button
                onClick={() => void importRoleDefaults()}
                disabled={editorBusy || !onImportRoleAppDefaults}
                className={styles.modeActionButton}
              >
                {editorBusy ? "Working..." : "Import defaults"}
              </button>
              <button
                onClick={() => setEditingRole(null)}
                className={styles.modeActionButton}
              >
                Close
              </button>
              <button
                onClick={() => void saveRoleConfig()}
                disabled={editorBusy || !onSaveRoleAppConfig}
                className={`${styles.modeActionButton} ${styles.modeActionButtonPrimary}`}
              >
                {editorBusy ? "Saving..." : "Save"}
              </button>
            </div>
          </div>
        </div>
      ) : null}
      {filtersOverlay}
    </Wrapper>
  );
}
