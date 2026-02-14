"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import styles from "./styles.module.css";

type PlanOption = { id: string; label: string };
type PricingModel = "app" | "bundle";

type RoleStateAction = "enable" | "enabled" | "disable";

const ROLE_STATE_OPTIONS: { id: RoleStateAction; label: string }[] = [
  { id: "enable", label: "Enable" },
  { id: "enabled", label: "Enabled" },
  { id: "disable", label: "Disable" },
];

type EnableDropdownProps = {
  enabled: boolean;
  disabled?: boolean;
  compact?: boolean;
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

function persistPricingUsers(nextUsers: PricingUser[]) {
  if (typeof window === "undefined") return;
  window.localStorage.setItem(PRICING_USERS_STORAGE_KEY, JSON.stringify(nextUsers));
  window.dispatchEvent(new Event(PRICING_USERS_UPDATED_EVENT));
}

export default function EnableDropdown({
  enabled,
  disabled = false,
  compact = false,
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
  onSelectPlan,
  onEnable,
  onDisable,
}: EnableDropdownProps) {
  const [inactiveState, setInactiveState] = useState<"enable" | "disable">("enable");
  const [confirmOpen, setConfirmOpen] = useState(false);
  const [stateMenuOpen, setStateMenuOpen] = useState(false);
  const [calculatorOpen, setCalculatorOpen] = useState(false);
  const [pricingUsers, setPricingUsers] = useState<PricingUser[]>([]);
  const [calcError, setCalcError] = useState<string | null>(null);
  const [quote, setQuote] = useState<PricingQuote | null>(null);
  const stateButtonRef = useRef<HTMLButtonElement | null>(null);
  const stateMenuRef = useRef<HTMLDivElement | null>(null);
  const prevEnabledRef = useRef<boolean>(enabled);

  // Keep legacy pricing props for backward compatibility with existing callers.
  void roleId;
  void pricing;
  void pricingSummary;
  void baseUrl;
  void defaultUserCount;

  useEffect(() => {
    if (!enabled && prevEnabledRef.current && inactiveState !== "disable") {
      setInactiveState("enable");
    }
    prevEnabledRef.current = enabled;
  }, [enabled, inactiveState]);

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

  useEffect(() => {
    if (!stateMenuOpen) return;
    const handleClickOutside = (event: MouseEvent) => {
      const target = event.target as Node | null;
      if (!target) return;
      if (stateMenuRef.current?.contains(target)) return;
      if (stateButtonRef.current?.contains(target)) return;
      setStateMenuOpen(false);
    };
    const handleEscape = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        setStateMenuOpen(false);
      }
    };
    document.addEventListener("mousedown", handleClickOutside);
    document.addEventListener("keydown", handleEscape);
    return () => {
      document.removeEventListener("mousedown", handleClickOutside);
      document.removeEventListener("keydown", handleEscape);
    };
  }, [stateMenuOpen]);

  const normalizedServerCount = Math.max(0, Math.floor(Number(serverCount) || 0));
  const normalizedBundleRoleCount = Math.max(0, Math.floor(Number(appCount) || 0));
  const usersCount = pricingUsers.length;
  const calculatedServers = pricingModel === "app" ? normalizedServerCount : 1;
  const calculatedApps = pricingModel === "app" ? 1 : normalizedBundleRoleCount;

  const calculatorModelLabel =
    pricingModel === "bundle" ? "users × roles" : "users × servers × app";

  const canCalculate =
    usersCount > 0 &&
    (pricingModel === "bundle" ? calculatedApps > 0 : calculatedServers > 0);

  useEffect(() => {
    setQuote(null);
  }, [pricingModel, usersCount, calculatedServers, calculatedApps]);

  const openCalculator = () => {
    setCalcError(null);
    setCalculatorOpen(true);
  };

  const applyCalculation = () => {
    if (!canCalculate) {
      if (usersCount <= 0) {
        setCalcError("Add at least one user.");
        return;
      }
      if (pricingModel === "bundle") {
        setCalcError("Bundle has no roles to calculate.");
      } else {
        setCalcError("No enabled servers for this app.");
      }
      return;
    }
    const users = normalizePositiveInt(usersCount, 1);
    const servers = normalizePositiveInt(calculatedServers, 1);
    const apps = normalizePositiveInt(calculatedApps, 1);
    const total = pricingModel === "bundle" ? users * apps : users * servers * apps;
    setQuote({ model: pricingModel, users, servers, apps, total });
    setCalcError(null);
    setCalculatorOpen(false);
  };

  const quoteLabel = useMemo(() => {
    if (!quote) return "Not calculated";
    if (quote.total <= 0) return "Free";
    return formatAmount(quote.total, "EUR");
  }, [quote]);

  const requestDisable = () => {
    if (disabled) return;
    if (enabled || inactiveState !== "disable") {
      setConfirmOpen(true);
    }
  };

  const triggerEnable = (action: RoleStateAction) => {
    if (disabled) return;
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
    setStateMenuOpen(false);
    if (disabled) return;
    if (action === "disable") {
      requestDisable();
      return;
    }
    triggerEnable(action);
  };

  const activeState: RoleStateAction = enabled ? "enabled" : inactiveState;

  const activeStateLabel = useMemo(() => {
    const found = ROLE_STATE_OPTIONS.find((entry) => entry.id === activeState);
    return found?.label || "Enable";
  }, [activeState]);

  const stateButtonClass = useMemo(() => {
    if (activeState === "enabled") return styles.enableStateDropdownButtonEnabled;
    if (activeState === "disable") return styles.enableStateDropdownButtonDisable;
    return styles.enableStateDropdownButtonEnable;
  }, [activeState]);

  const stateMenuOptions = useMemo(
    () => ROLE_STATE_OPTIONS.filter((option) => option.id !== activeState),
    [activeState]
  );

  const calculateButtonLabel = quote ? "Recalculate" : "Calculate";

  return (
    <>
      <div className={`${styles.enableControl} ${compact ? styles.enableControlCompact : ""}`}>
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

        {!compact ? (
          <div className={styles.enableField}>
            <div className={styles.enablePriceRow}>
              <span className={styles.enablePriceValue}>{quoteLabel}</span>
              <button
                type="button"
                onClick={openCalculator}
                disabled={disabled}
                className={styles.enableCalculateButton}
              >
                {calculateButtonLabel}
              </button>
            </div>
          </div>
        ) : null}

        <div className={`${styles.enableField} ${styles.enableFieldState}`}>
          <div className={styles.enableStateControl}>
            <button
              ref={stateButtonRef}
              type="button"
              disabled={disabled}
              onClick={() => setStateMenuOpen((prev) => !prev)}
              className={`${styles.enableStateDropdownButton} ${stateButtonClass} ${
                disabled ? styles.enableSwitchButtonLocked : ""
              }`}
            >
              <span>{activeStateLabel}</span>
              <i className="fa-solid fa-chevron-down" aria-hidden="true" />
            </button>
            {stateMenuOpen ? (
              <div ref={stateMenuRef} className={styles.enableStateMenu} role="menu">
                {stateMenuOptions.map((option) => (
                  <button
                    key={option.id}
                    type="button"
                    onClick={() => applyStateAction(option.id)}
                    className={`${styles.enableStateMenuItem} ${
                      option.id === "enable"
                        ? styles.enableStateMenuItemEnable
                        : option.id === "enabled"
                          ? styles.enableStateMenuItemEnabled
                          : styles.enableStateMenuItemDisable
                    }`}
                  >
                    {option.label}
                  </button>
                ))}
              </div>
            ) : null}
          </div>
        </div>
      </div>

      {calculatorOpen ? (
        <div className={styles.enableConfirmOverlay} onClick={() => setCalculatorOpen(false)}>
          <div
            className={styles.enableConfirmCard}
            onClick={(event) => event.stopPropagation()}
          >
            <h4 className={styles.enableConfirmTitle}>Calculate estimate</h4>
            <p className={styles.enableConfirmText}>
              Model: {calculatorModelLabel}
            </p>
            <div className={styles.enableCalcReadonlyGrid}>
              <label className={styles.enableCalcReadonlyField}>
                <span>Users</span>
                <input
                  type="number"
                  value={String(usersCount)}
                  className={styles.enableCalcInput}
                  readOnly
                />
              </label>
              <label className={styles.enableCalcReadonlyField}>
                <span>{pricingModel === "bundle" ? "Roles" : "Servers"}</span>
                <input
                  type="number"
                  value={String(pricingModel === "bundle" ? calculatedApps : calculatedServers)}
                  className={styles.enableCalcInput}
                  readOnly
                />
              </label>
              <label className={styles.enableCalcReadonlyField}>
                <span>Apps</span>
                <input
                  type="number"
                  value={String(calculatedApps)}
                  className={styles.enableCalcInput}
                  readOnly
                />
              </label>
            </div>
            <p className={styles.enableCalcHint}>
              Manage users in Inventory via the new Users button.
            </p>
            {calcError ? (
              <p className={styles.enableCalcError}>{calcError}</p>
            ) : null}
            <div className={styles.enableConfirmActions}>
              <button
                type="button"
                onClick={() => setCalculatorOpen(false)}
                className={styles.enableCancelButton}
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={applyCalculation}
                disabled={!canCalculate}
                className={styles.enableDisableButton}
              >
                Calculate
              </button>
            </div>
          </div>
        </div>
      ) : null}

      {confirmOpen ? (
        <div
          className={styles.enableConfirmOverlay}
          onClick={() => setConfirmOpen(false)}
        >
          <div
            className={styles.enableConfirmCard}
            onClick={(event) => event.stopPropagation()}
          >
            <h4 className={styles.enableConfirmTitle}>Disable app selection?</h4>
            <p className={styles.enableConfirmText}>
              {contextLabel
                ? `Disabling will remove this app from ${contextLabel}.`
                : "Disabling will remove this app from the current deployment selection."}
            </p>
            <p className={styles.enableConfirmText}>
              It will no longer be written to inventory for that scope and will not run
              in deployments until you enable it again.
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
                onClick={() => {
                  setConfirmOpen(false);
                  setInactiveState("disable");
                  if (hasPlanOptions) {
                    onSelectPlan?.(null);
                    return;
                  }
                  onDisable();
                }}
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
