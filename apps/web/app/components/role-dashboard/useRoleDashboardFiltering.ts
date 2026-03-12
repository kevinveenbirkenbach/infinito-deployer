import { useEffect, useMemo } from "react";
import type { Dispatch, SetStateAction } from "react";
import { filterRoles } from "../../lib/role_filter";
import { VIEW_CONFIG } from "./constants";
import {
  LIFECYCLE_PREVIEW_EXPERT_ALLOWED,
  LIFECYCLE_STABLE_ALLOWED,
  ROW_FILTER_OPTIONS,
  collectFacetValues,
  normalizeDeployTarget,
  normalizeFacet,
  type DeployTargetFilter,
  type ReleaseTrack,
  type SoftwareScope,
} from "./dashboard-filters";
import { sortStatuses } from "./helpers";
import type { Bundle, Role, ViewMode } from "./types";

type UseRoleDashboardFilteringParams = {
  roles: Role[];
  bundles: Bundle[];
  loading: boolean;
  error: string | null;
  selected: Set<string>;
  statusFilter: Set<string>;
  setStatusFilter: Dispatch<SetStateAction<Set<string>>>;
  targetFilter: DeployTargetFilter;
  categoryFilter: Set<string>;
  tagFilter: Set<string>;
  query: string;
  showSelectedOnly: boolean;
  viewMode: ViewMode;
  softwareScope: SoftwareScope;
  isExpertMode: boolean;
  releaseTrack: ReleaseTrack;
  matrixAliases: string[];
  selectedLookup: Record<string, Set<string>>;
  gridSize: { width: number; height: number };
  rowsOverride: number | null;
  page: number;
  setPage: Dispatch<SetStateAction<number>>;
  animatedRoleOffset: number;
  setAnimatedRoleOffset: Dispatch<SetStateAction<number>>;
  animatedBundleOffset: number;
  setAnimatedBundleOffset: Dispatch<SetStateAction<number>>;
  bundlesLoading: boolean;
  bundlesError: string | null;
  activeMode: "customer" | "expert";
};

export function useRoleDashboardFiltering({
  roles,
  bundles,
  loading,
  error,
  selected,
  statusFilter,
  setStatusFilter,
  targetFilter,
  categoryFilter,
  tagFilter,
  query,
  showSelectedOnly,
  viewMode,
  softwareScope,
  isExpertMode,
  releaseTrack,
  matrixAliases,
  selectedLookup,
  gridSize,
  rowsOverride,
  page,
  setPage,
  animatedRoleOffset,
  setAnimatedRoleOffset,
  animatedBundleOffset,
  setAnimatedBundleOffset,
  activeMode,
  bundlesLoading,
  bundlesError,
}: UseRoleDashboardFilteringParams) {
  const roleStatusById = useMemo(() => {
    const out: Record<string, string> = {};
    roles.forEach((role) => {
      const roleId = String(role.id || "").trim();
      const status = normalizeFacet(role.status);
      if (!roleId || !status) return;
      out[roleId] = status;
    });
    return out;
  }, [roles]);

  const appLifecycleOptionsAll = useMemo(() => {
    const set = new Set<string>();
    roles.forEach((role) => {
      const status = normalizeFacet(role.status);
      if (status) set.add(status);
    });
    return sortStatuses(Array.from(set));
  }, [roles]);

  const bundleLifecycleByBundleId = useMemo(() => {
    const out: Record<string, Set<string>> = {};
    bundles.forEach((bundle) => {
      const statuses = new Set<string>();
      (Array.isArray(bundle.role_ids) ? bundle.role_ids : [])
        .map((roleId) => String(roleId || "").trim())
        .filter(Boolean)
        .forEach((roleId) => {
          const status = roleStatusById[roleId];
          if (status) statuses.add(status);
        });
      out[bundle.id] = statuses;
    });
    return out;
  }, [bundles, roleStatusById]);

  const bundleLifecycleOptionsAll = useMemo(() => {
    const set = new Set<string>();
    Object.values(bundleLifecycleByBundleId).forEach((statuses) => {
      statuses.forEach((status) => set.add(status));
    });
    return sortStatuses(Array.from(set));
  }, [bundleLifecycleByBundleId]);

  const lifecycleAllowedStatuses = useMemo(
    () =>
      new Set<string>(
        Array.from(
          isExpertMode && releaseTrack === "preview"
            ? LIFECYCLE_PREVIEW_EXPERT_ALLOWED
            : LIFECYCLE_STABLE_ALLOWED
        )
      ),
    [isExpertMode, releaseTrack]
  );

  const lifecycleBaseOptions =
    softwareScope === "bundles" ? bundleLifecycleOptionsAll : appLifecycleOptionsAll;

  const lifecycleStatusOptions = useMemo(
    () =>
      sortStatuses(
        lifecycleBaseOptions.filter((status) => lifecycleAllowedStatuses.has(status))
      ),
    [lifecycleBaseOptions, lifecycleAllowedStatuses]
  );

  const lifecycleStatusOptionSet = useMemo(
    () => new Set<string>(lifecycleStatusOptions),
    [lifecycleStatusOptions]
  );

  useEffect(() => {
    setStatusFilter((prev) => {
      const next = new Set(
        Array.from(prev).filter((status) => lifecycleStatusOptionSet.has(status))
      );
      const unchanged =
        next.size === prev.size && Array.from(next).every((status) => prev.has(status));
      return unchanged ? prev : next;
    });
  }, [lifecycleStatusOptionSet, setStatusFilter]);

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
  const activeTagOptions = softwareScope === "bundles" ? bundleTagOptions : appTagOptions;
  const activeCategoryLabelByToken =
    softwareScope === "bundles" ? bundleCategoryLabelByToken : appCategoryLabelByToken;
  const activeTagLabelByToken =
    softwareScope === "bundles" ? bundleTagLabelByToken : appTagLabelByToken;

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
        const target = normalizeDeployTarget(bundle.deploy_target);
        if (target !== targetFilter) return false;
      }

      if (statusFilter.size > 0) {
        const bundleStatuses = bundleLifecycleByBundleId[bundle.id] || new Set<string>();
        const hasLifecycleMatch = Array.from(statusFilter).some((status) =>
          bundleStatuses.has(status)
        );
        if (!hasLifecycleMatch) return false;
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
  }, [
    bundles,
    targetFilter,
    statusFilter,
    bundleLifecycleByBundleId,
    categoryFilter,
    tagFilter,
    query,
  ]);

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
  const isLaneView = viewMode === "row" || viewMode === "column";
  const isLaneAnimatedView = isLaneView;
  const isAppLaneAnimatedView = softwareScope === "apps" && isLaneView;
  const isBundleLaneAnimatedView = softwareScope === "bundles" && isLaneView;
  const gridGap = 16;
  const widthBuffer = viewMode === "mini" ? 80 : viewConfig.horizontal ? 360 : 140;
  const minCardWidth = Math.max(viewConfig.minWidth, viewConfig.iconSize + widthBuffer);
  const computedColumns =
    viewMode === "list" ||
    viewMode === "matrix" ||
    viewMode === "row" ||
    viewMode === "column"
      ? 1
      : Math.max(1, Math.floor((gridSize.width + gridGap) / (minCardWidth + gridGap)));
  const contentHeightBuffer = viewMode === "mini" ? 24 : viewMode === "matrix" ? 12 : 8;
  const laneMinSize = viewMode === "row" ? 188 : viewMode === "column" ? 220 : viewConfig.minHeight;
  const rowAxisSize = viewMode === "column" ? gridSize.width : gridSize.height;
  const computedRows = Math.max(
    1,
    Math.floor((Math.max(0, rowAxisSize - contentHeightBuffer) + gridGap) / (laneMinSize + gridGap))
  );
  const rows = Math.max(1, rowsOverride ?? computedRows);
  const laneGap = 14;
  const laneCount = Math.max(1, rows);
  const laneGapTotal = Math.max(0, laneGap * (laneCount - 1));
  const rowLaneSize = Math.max(188, Math.floor(Math.max(0, gridSize.height - laneGapTotal) / laneCount));
  const columnLaneSize = Math.max(
    220,
    Math.floor(Math.max(0, gridSize.width - laneGapTotal) / laneCount)
  );
  const pageSize = Math.max(1, rows * computedColumns);
  const activeItemCount = softwareScope === "bundles" ? filteredBundles.length : filteredRoles.length;

  const rowOptions = useMemo(() => {
    const maxRows = Math.max(1, Math.ceil(activeItemCount / Math.max(1, computedColumns)));
    const next = ROW_FILTER_OPTIONS.filter((value) => value <= maxRows);
    if (rowsOverride && !next.includes(rowsOverride)) {
      next.push(rowsOverride);
    }
    return next.sort((a, b) => a - b);
  }, [activeItemCount, computedColumns, rowsOverride]);

  const pageCount = isLaneAnimatedView ? 1 : Math.max(1, Math.ceil(activeItemCount / pageSize));
  const currentPage = isLaneAnimatedView ? 1 : Math.min(page, pageCount);

  const animatedRoles = useMemo(() => {
    if (!isAppLaneAnimatedView || filteredRoles.length === 0) return filteredRoles;
    const total = filteredRoles.length;
    const normalizedOffset = ((animatedRoleOffset % total) + total) % total;
    if (normalizedOffset === 0) return filteredRoles;
    return [
      ...filteredRoles.slice(normalizedOffset),
      ...filteredRoles.slice(0, normalizedOffset),
    ];
  }, [filteredRoles, animatedRoleOffset, isAppLaneAnimatedView]);

  const animatedBundles = useMemo(() => {
    if (!isBundleLaneAnimatedView || filteredBundles.length === 0) return filteredBundles;
    const total = filteredBundles.length;
    const normalizedOffset = ((animatedBundleOffset % total) + total) % total;
    if (normalizedOffset === 0) return filteredBundles;
    return [
      ...filteredBundles.slice(normalizedOffset),
      ...filteredBundles.slice(0, normalizedOffset),
    ];
  }, [filteredBundles, animatedBundleOffset, isBundleLaneAnimatedView]);

  const paginatedRoles = useMemo(() => {
    if (isAppLaneAnimatedView) return animatedRoles;
    const start = (currentPage - 1) * pageSize;
    return filteredRoles.slice(start, start + pageSize);
  }, [filteredRoles, currentPage, pageSize, isAppLaneAnimatedView, animatedRoles]);

  const paginatedBundles = useMemo(() => {
    if (isBundleLaneAnimatedView) return animatedBundles;
    const start = (currentPage - 1) * pageSize;
    return filteredBundles.slice(start, start + pageSize);
  }, [filteredBundles, currentPage, pageSize, isBundleLaneAnimatedView, animatedBundles]);

  const laneAnimatedItemCount =
    softwareScope === "bundles" ? filteredBundles.length : filteredRoles.length;

  const selectedCount = useMemo(() => {
    if (viewMode !== "matrix") return selected.size;
    return matrixAliases.reduce((sum, alias) => sum + (selectedLookup[alias]?.size ?? 0), 0);
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

  useEffect(() => {
    setPage(1);
    setAnimatedRoleOffset(0);
    setAnimatedBundleOffset(0);
  }, [
    query,
    statusFilter,
    targetFilter,
    categoryFilter,
    tagFilter,
    softwareScope,
    releaseTrack,
    activeMode,
    showSelectedOnly,
    viewMode,
    rowsOverride,
    setPage,
    setAnimatedRoleOffset,
    setAnimatedBundleOffset,
  ]);

  useEffect(() => {
    if (page > pageCount) setPage(pageCount);
  }, [page, pageCount, setPage]);

  return {
    lifecycleStatusOptions,
    activeCategoryOptions,
    activeTagOptions,
    activeCategoryLabelByToken,
    activeTagLabelByToken,
    filteredBundles,
    filteredRoles,
    viewConfig,
    computedColumns,
    gridGap,
    computedRows,
    rows,
    rowLaneSize,
    columnLaneSize,
    rowOptions,
    pageCount,
    currentPage,
    paginatedRoles,
    paginatedBundles,
    isLaneAnimatedView,
    laneAnimatedItemCount,
    laneCount,
    selectedCount,
    hiddenSelected,
    isBundleScope,
    headerLoading,
    headerError,
    headerFilteredCount,
    headerTotalCount,
  };
}
