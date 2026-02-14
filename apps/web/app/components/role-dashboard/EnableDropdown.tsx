"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import styles from "./styles.module.css";

type PlanOption = { id: string; label: string };

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

export default function EnableDropdown({
  enabled,
  disabled = false,
  compact = false,
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
  const [usersInput, setUsersInput] = useState(
    normalizePositiveInt(defaultUserCount, 1)
  );
  const [serversInput, setServersInput] = useState(
    normalizePositiveInt(serverCount, 1)
  );
  const [appsInput, setAppsInput] = useState(normalizePositiveInt(appCount, 1));
  const [quote, setQuote] = useState<{
    users: number;
    servers: number;
    apps: number;
    total: number;
  } | null>(null);
  const stateButtonRef = useRef<HTMLButtonElement | null>(null);
  const stateMenuRef = useRef<HTMLDivElement | null>(null);
  const prevEnabledRef = useRef<boolean>(enabled);

  // Keep legacy pricing props for backward compatibility with existing callers.
  void roleId;
  void pricing;
  void pricingSummary;
  void baseUrl;

  useEffect(() => {
    if (!enabled && prevEnabledRef.current && inactiveState !== "disable") {
      setInactiveState("enable");
    }
    prevEnabledRef.current = enabled;
  }, [enabled, inactiveState]);

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

  const openCalculator = () => {
    setUsersInput(normalizePositiveInt(defaultUserCount, 1));
    setServersInput(normalizePositiveInt(serverCount, 1));
    setAppsInput(normalizePositiveInt(appCount, 1));
    setCalculatorOpen(true);
  };

  const applyCalculation = () => {
    const users = normalizePositiveInt(usersInput, 1);
    const servers = normalizePositiveInt(serversInput, 1);
    const apps = normalizePositiveInt(appsInput, 1);
    const total = users * servers * apps;
    setQuote({ users, servers, apps, total });
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

  const stateHint =
    activeState === "disable"
      ? "Disabled: role will not be deployed."
      : activeState === "enable"
        ? "Enable: role will be deployed on next setup."
        : null;

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
          {stateHint ? <span className={styles.enableWarningText}>{stateHint}</span> : null}
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
              Model: users × servers × apps
            </p>
            <div className={styles.enableCalcGrid}>
              <label className={styles.enableCalcField}>
                <span>Users</span>
                <input
                  type="number"
                  min={1}
                  value={usersInput}
                  onChange={(event) => setUsersInput(Number(event.target.value))}
                  className={styles.enableCalcInput}
                />
              </label>
              <label className={styles.enableCalcField}>
                <span>Servers</span>
                <input
                  type="number"
                  min={1}
                  value={serversInput}
                  onChange={(event) => setServersInput(Number(event.target.value))}
                  className={styles.enableCalcInput}
                />
              </label>
              <label className={styles.enableCalcField}>
                <span>Apps</span>
                <input
                  type="number"
                  min={1}
                  value={appsInput}
                  onChange={(event) => setAppsInput(Number(event.target.value))}
                  className={styles.enableCalcInput}
                />
              </label>
            </div>
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
