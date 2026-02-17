"use client";

import type { ReactNode } from "react";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import styles from "./styles.module.css";

type PlanOption = { id: string; label: string };
type PricingModel = "app" | "bundle";
type EnableDropdownVariant = "default" | "tile";
type EnableStateButtonSize = "compact" | "default" | "tile";

type RoleStateAction = "enable" | "enabled" | "disable";

type RoleStateConfig = {
  label: string;
  iconClass: string;
  toneClass: string;
};

type EnableDropdownProps = {
  enabled: boolean;
  disabled?: boolean;
  compact?: boolean;
  variant?: EnableDropdownVariant;
  showPlanField?: boolean;
  tileMeta?: ReactNode;
  pricingModel?: PricingModel;
  contextLabel?: string;
  plans?: PlanOption[];
  selectedPlanId?: string | null;
  serverCount?: number;
  appCount?: number;
  defaultUserCount?: number;
  roleId?: string;
  pricing?: Record<string, unknown> | null;
  pricingSummary?: Record<string, unknown> | null;
  baseUrl?: string;
  onOpenDetails?: () => void;
  onSelectPlan?: (planId: string | null) => void;
  onEnable: () => void;
  onDisable: () => void;
};

type PricingUser = {
  firstname: string;
  lastname: string;
  email?: string;
  username: string;
};

type PricingQuote = {
  model: PricingModel;
  users: number;
  servers: number;
  apps: number;
  total: number;
};

const PRICING_USERS_STORAGE_KEY = "infinito.pricing.users.v1";
const PRICING_USERS_UPDATED_EVENT = "infinito:pricing-users-updated";
const DEACTIVATION_FADE_DURATION_MS = 3000;
const DEACTIVATION_FADE_START_DELAY_MS = 30;

const ROLE_STATE_CONFIG: Record<RoleStateAction, RoleStateConfig> = {
  enable: {
    label: "Enable",
    iconClass: "fa-solid fa-power-off",
    toneClass: styles.enableStateDropdownButtonEnable,
  },
  enabled: {
    label: "Enabled",
    iconClass: "fa-solid fa-toggle-on",
    toneClass: styles.enableStateDropdownButtonEnabled,
  },
  disable: {
    label: "Disable",
    iconClass: "fa-solid fa-toggle-off",
    toneClass: styles.enableStateDropdownButtonDisable,
  },
};

const STATE_BUTTON_SIZE_CLASS: Record<EnableStateButtonSize, string> = {
  compact: styles.enableStateDropdownButtonSizeCompact,
  default: styles.enableStateDropdownButtonSizeDefault,
  tile: styles.enableStateDropdownButtonSizeTile,
};

function asTrimmedString(value: unknown): string {
  return String(value || "").trim();
}

function formatAmount(value: number, currency: string): string {
  try {
    return new Intl.NumberFormat(undefined, {
      style: "currency",
      currency: currency || "EUR",
      maximumFractionDigits: 2,
    }).format(value);
  } catch {
    return `${value.toFixed(2)} ${currency || "EUR"}`;
  }
}

function normalizePositiveInt(value: unknown, fallback: number): number {
  const num = Number(value);
  if (!Number.isFinite(num)) return fallback;
  return Math.max(1, Math.floor(num));
}

function readPricingUsers(): PricingUser[] {
  if (typeof window === "undefined") return [];
  try {
    const raw = window.localStorage.getItem(PRICING_USERS_STORAGE_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    if (!Array.isArray(parsed)) return [];
    return parsed
      .map((entry) => ({
        firstname: asTrimmedString((entry as any)?.firstname),
        lastname: asTrimmedString((entry as any)?.lastname),
        email: asTrimmedString((entry as any)?.email) || undefined,
        username: asTrimmedString((entry as any)?.username).toLowerCase(),
      }))
      .filter(
        (entry) =>
          entry.firstname &&
          entry.lastname &&
          /^[a-z0-9]+$/.test(entry.username)
      );
  } catch {
    return [];
  }
}

function stateButtonSizeClass(
  variant: EnableDropdownVariant,
  compact: boolean
): EnableStateButtonSize {
  if (variant === "tile") return "tile";
  if (compact) return "compact";
  return "default";
}

export default function EnableDropdown({
  enabled,
  disabled = false,
  compact = false,
  variant = "default",
  showPlanField = true,
  tileMeta,
  pricingModel = "app",
  contextLabel,
  plans,
  selectedPlanId = null,
  serverCount = 1,
  appCount = 1,
  defaultUserCount = 1,
  roleId,
  pricing,
  pricingSummary,
  baseUrl,
  onOpenDetails,
  onSelectPlan,
  onEnable,
  onDisable,
}: EnableDropdownProps) {
  const [inactiveState, setInactiveState] = useState<"enable" | "disable">("enable");
  const [slowStateFadeActive, setSlowStateFadeActive] = useState(false);
  const [confirmOpen, setConfirmOpen] = useState(false);
  const [pricingUsers, setPricingUsers] = useState<PricingUser[]>([]);
  const prevEnabledRef = useRef<boolean>(enabled);
  const fadeStartTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const fadeResetTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Keep legacy pricing props for backward compatibility with existing callers.
  void roleId;
  void pricing;
  void pricingSummary;
  void baseUrl;
  void defaultUserCount;

  const clearStateFadeTimers = useCallback(() => {
    if (fadeStartTimerRef.current) {
      clearTimeout(fadeStartTimerRef.current);
      fadeStartTimerRef.current = null;
    }
    if (fadeResetTimerRef.current) {
      clearTimeout(fadeResetTimerRef.current);
      fadeResetTimerRef.current = null;
    }
  }, []);

  useEffect(() => {
    const wasEnabled = prevEnabledRef.current;
    if (!enabled && wasEnabled) {
      clearStateFadeTimers();
      setSlowStateFadeActive(false);
      setInactiveState("disable");
      fadeStartTimerRef.current = setTimeout(() => {
        setSlowStateFadeActive(true);
        setInactiveState("enable");
        fadeResetTimerRef.current = setTimeout(() => {
          setSlowStateFadeActive(false);
          fadeResetTimerRef.current = null;
        }, DEACTIVATION_FADE_DURATION_MS);
        fadeStartTimerRef.current = null;
      }, DEACTIVATION_FADE_START_DELAY_MS);
    } else if (enabled && !wasEnabled) {
      clearStateFadeTimers();
      setSlowStateFadeActive(false);
      setInactiveState("enable");
    }
    prevEnabledRef.current = enabled;
  }, [enabled, clearStateFadeTimers]);

  useEffect(
    () => () => {
      clearStateFadeTimers();
    },
    [clearStateFadeTimers]
  );

  useEffect(() => {
    if (typeof window === "undefined") return;
    const syncUsers = () => {
      setPricingUsers(readPricingUsers());
    };
    syncUsers();
    const onStorage = (event: StorageEvent) => {
      if (event.key && event.key !== PRICING_USERS_STORAGE_KEY) return;
      syncUsers();
    };
    const onCustomUpdate = () => syncUsers();
    window.addEventListener("storage", onStorage);
    window.addEventListener(PRICING_USERS_UPDATED_EVENT, onCustomUpdate);
    return () => {
      window.removeEventListener("storage", onStorage);
      window.removeEventListener(PRICING_USERS_UPDATED_EVENT, onCustomUpdate);
    };
  }, []);

  const planOptions = Array.isArray(plans)
    ? plans
        .map((plan) => ({
          id: String(plan?.id || "").trim(),
          label: String(plan?.label || plan?.id || "").trim(),
        }))
        .filter((plan) => plan.id && plan.label)
    : [];
  const hasPlanOptions = planOptions.length > 0 && typeof onSelectPlan === "function";
  const fallbackPlanId = planOptions.find((plan) => plan.id === "community")?.id || planOptions[0]?.id || null;
  const selectedPlanValue =
    hasPlanOptions && planOptions.some((plan) => plan.id === selectedPlanId)
      ? String(selectedPlanId)
      : fallbackPlanId;
  const selectedPlanLabel = hasPlanOptions
    ? planOptions.find((plan) => plan.id === selectedPlanValue)?.label || "Community"
    : "Community";

  const normalizedServerCount = Math.max(0, Math.floor(Number(serverCount) || 0));
  const normalizedBundleRoleCount = Math.max(1, Math.floor(Number(appCount) || 0));
  const usersCount = pricingUsers.length;
  const effectiveUsersCount = Math.max(1, usersCount);
  const calculatedServers = pricingModel === "app" ? Math.max(1, normalizedServerCount) : 1;
  const calculatedApps = pricingModel === "app" ? 1 : normalizedBundleRoleCount;

  const quote = useMemo<PricingQuote>(() => {
    const users = normalizePositiveInt(effectiveUsersCount, 1);
    const servers = normalizePositiveInt(calculatedServers, 1);
    const apps = normalizePositiveInt(calculatedApps, 1);
    const total = pricingModel === "bundle" ? users * apps : users * servers * apps;
    return { model: pricingModel, users, servers, apps, total };
  }, [effectiveUsersCount, calculatedServers, calculatedApps, pricingModel]);

  const quoteLabel = useMemo(() => {
    if (quote.total <= 0) return formatAmount(0, "EUR");
    return formatAmount(quote.total, "EUR");
  }, [quote]);

  const requestDisable = () => {
    if (disabled) return;
    setConfirmOpen(true);
  };

  const confirmDisable = () => {
    if (disabled) return;
    setConfirmOpen(false);
    setInactiveState("disable");
    if (hasPlanOptions) {
      onSelectPlan?.(null);
      return;
    }
    onDisable();
  };

  const triggerEnable = (action: RoleStateAction) => {
    if (disabled) return;
    clearStateFadeTimers();
    setSlowStateFadeActive(false);
    setInactiveState("enable");
    if (action === "enabled") {
      if (!enabled) {
        if (hasPlanOptions) {
          onSelectPlan?.(selectedPlanValue || fallbackPlanId || "community");
          return;
        }
        onEnable();
      }
      return;
    }
    if (hasPlanOptions) {
      onSelectPlan?.(selectedPlanValue || fallbackPlanId || "community");
      return;
    }
    if (!enabled) onEnable();
  };

  const applyStateAction = (action: RoleStateAction) => {
    if (disabled) return;
    if (action === "disable") {
      requestDisable();
      return;
    }
    triggerEnable(action);
  };

  const activeState: RoleStateAction = enabled ? "enabled" : inactiveState;
  const stateConfig = ROLE_STATE_CONFIG[activeState];
  const sizeClass = STATE_BUTTON_SIZE_CLASS[stateButtonSizeClass(variant, compact)];

  const tilePriceLabel = quoteLabel;

  const handleStateToggle = () => {
    if (disabled) return;
    if (enabled) {
      applyStateAction("disable");
      return;
    }
    applyStateAction("enabled");
  };

  const renderStateControl = () => (
    <button
      type="button"
      disabled={disabled}
      onClick={handleStateToggle}
      className={`${styles.enableStateDropdownButton} ${stateConfig.toneClass} ${sizeClass} ${
        slowStateFadeActive ? styles.enableStateDropdownButtonSlowFade : ""
      } ${
        disabled ? styles.enableSwitchButtonLocked : ""
      }`}
    >
      <span className={styles.enableStateDropdownButtonLabel}>
        <i className={stateConfig.iconClass} aria-hidden="true" />
        <span>{stateConfig.label}</span>
      </span>
    </button>
  );

  return (
    <>
      {variant === "tile" ? (
        <div className={styles.enableTileRoot}>
          <div className={styles.enableTilePriceBlock}>
            <span className={styles.enableTilePriceValue}>{tilePriceLabel}</span>
            <span className={styles.enableTilePriceCaption}>per month</span>
          </div>
          <div className={styles.enableTileActionColumn}>
            {renderStateControl()}
            {onOpenDetails ? (
              <button
                type="button"
                onClick={onOpenDetails}
                disabled={disabled}
                className={`${styles.enableTileActionButton} ${styles.enableTileActionButtonDetails}`}
              >
                <i className="fa-solid fa-circle-info" aria-hidden="true" />
                <span>Details</span>
              </button>
            ) : null}
          </div>
          <div className={styles.enableTileMetaRow}>{tileMeta || null}</div>
        </div>
      ) : (
        <div
          className={`${styles.enableControl} ${compact ? styles.enableControlCompact : ""} ${
            compact && onOpenDetails ? styles.enableControlCompactWithDetails : ""
          } ${compact && !showPlanField ? styles.enableControlCompactNoPlan : ""} ${
            compact && !showPlanField && onOpenDetails
              ? styles.enableControlCompactNoPlanWithDetails
              : ""
          }`}
        >
          {showPlanField ? (
            <div className={styles.enableField}>
              {hasPlanOptions && planOptions.length > 1 ? (
                <select
                  value={selectedPlanValue || ""}
                  disabled={disabled}
                  onChange={(event) => onSelectPlan?.(asTrimmedString(event.target.value) || null)}
                  className={styles.enablePlanSelect}
                >
                  {planOptions.map((plan) => (
                    <option key={plan.id} value={plan.id}>
                      {plan.label}
                    </option>
                  ))}
                </select>
              ) : (
                <span className={styles.enablePlanStatic}>{selectedPlanLabel}</span>
              )}
            </div>
          ) : null}

          {!compact ? (
            <div className={styles.enableField}>
              <div className={styles.enablePriceRow}>
                <span className={styles.enablePriceValue}>{quoteLabel}</span>
              </div>
            </div>
          ) : null}

          <div className={`${styles.enableField} ${styles.enableFieldState}`}>
            {renderStateControl()}
          </div>

          {compact && onOpenDetails ? (
            <button
              type="button"
              onClick={onOpenDetails}
              disabled={disabled}
              className={styles.enableCompactDetailsButton}
              aria-label="Open details"
              title="Details"
            >
              <i className="fa-solid fa-circle-info" aria-hidden="true" />
              <span>Details</span>
            </button>
          ) : null}
        </div>
      )}

      {confirmOpen ? (
        <div className={styles.enableConfirmOverlay} onClick={() => setConfirmOpen(false)}>
          <div
            className={styles.enableConfirmCard}
            onClick={(event) => event.stopPropagation()}
          >
            <h4 className={styles.enableConfirmTitle}>Disable selection?</h4>
            <p className={styles.enableConfirmText}>
              {contextLabel
                ? `Warning: Disabling will remove this app from ${contextLabel}.`
                : "Warning: Disabling will remove this app from the current deployment selection."}
            </p>
            <p className={styles.enableConfirmText}>
              It will no longer be deployed until you enable it again.
            </p>
            <div className={styles.enableConfirmActions}>
              <button
                type="button"
                onClick={() => setConfirmOpen(false)}
                className={styles.enableCancelButton}
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={confirmDisable}
                className={styles.enableDisableButton}
              >
                Disable
              </button>
            </div>
          </div>
        </div>
      ) : null}
    </>
  );
}
