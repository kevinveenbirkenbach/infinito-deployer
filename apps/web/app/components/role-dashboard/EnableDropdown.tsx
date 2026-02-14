"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import styles from "./styles.module.css";

type PlanOption = { id: string; label: string };

type PricingInputSpec = {
  id: string;
  type: "number" | "enum" | "boolean";
  label?: string;
  default?: unknown;
  min?: number;
  max?: number;
  options?: string[];
  applies_to?: string[];
};

type PricingPlan = {
  id: string;
  inputs?: PricingInputSpec[];
};

type PricingOffering = {
  id: string;
  label?: string;
  plans?: PricingPlan[];
  inputs?: PricingInputSpec[];
};

type PricingQuote = {
  total: number | null;
  currency: string;
  region: string;
  interval: string;
  contact_sales: boolean;
};

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

function asSpecList(value: unknown): PricingInputSpec[] {
  return Array.isArray(value) ? (value as PricingInputSpec[]) : [];
}

function asOfferingList(value: unknown): PricingOffering[] {
  return Array.isArray(value) ? (value as PricingOffering[]) : [];
}

function asPlanList(value: unknown): PricingPlan[] {
  return Array.isArray(value) ? (value as PricingPlan[]) : [];
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

function normalizeNumber(value: unknown): number | null {
  const n = typeof value === "number" ? value : Number(value);
  return Number.isFinite(n) ? n : null;
}

export default function EnableDropdown({
  enabled,
  disabled = false,
  compact = false,
  contextLabel,
  plans,
  selectedPlanId = null,
  roleId,
  pricing,
  pricingSummary,
  baseUrl,
  onSelectPlan,
  onEnable,
  onDisable,
}: EnableDropdownProps) {
  const [confirmOpen, setConfirmOpen] = useState(false);
  const [stateMenuOpen, setStateMenuOpen] = useState(false);
  const [selectedOfferingId, setSelectedOfferingId] = useState<string>("");
  const [selectedCurrency, setSelectedCurrency] = useState<string>("");
  const [selectedRegion, setSelectedRegion] = useState<string>("global");
  const [inputValues, setInputValues] = useState<Record<string, unknown>>({});
  const [quoteBusy, setQuoteBusy] = useState(false);
  const [quoteError, setQuoteError] = useState<string | null>(null);
  const [quote, setQuote] = useState<PricingQuote | null>(null);
  const stateButtonRef = useRef<HTMLButtonElement | null>(null);
  const stateMenuRef = useRef<HTMLDivElement | null>(null);

  const apiBaseUrl = typeof baseUrl === "string" ? baseUrl : "";

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
    : enabled
      ? "Enabled"
      : "Disabled";

  const pricingDoc =
    pricing && typeof pricing === "object" && !Array.isArray(pricing)
      ? (pricing as Record<string, unknown>)
      : null;

  const offerings = useMemo(
    () => asOfferingList(pricingDoc?.offerings).filter((entry) => asTrimmedString(entry?.id)),
    [pricingDoc]
  );

  const offeringsForPlan = useMemo(() => {
    if (!selectedPlanValue) return offerings;
    const filtered = offerings.filter((offering) =>
      asPlanList(offering?.plans).some((plan) => asTrimmedString(plan?.id) === selectedPlanValue)
    );
    return filtered.length > 0 ? filtered : offerings;
  }, [offerings, selectedPlanValue]);

  const selectedOffering = useMemo(() => {
    const current = offeringsForPlan.find(
      (offering) => asTrimmedString(offering?.id) === selectedOfferingId
    );
    if (current) return current;
    const preferred = asTrimmedString(pricingDoc?.default_offering_id);
    return (
      offeringsForPlan.find((offering) => asTrimmedString(offering?.id) === preferred) ||
      offeringsForPlan[0] ||
      null
    );
  }, [offeringsForPlan, pricingDoc, selectedOfferingId]);

  const selectedPricingPlan = useMemo(() => {
    if (!selectedOffering || !selectedPlanValue) return null;
    const plansForOffering = asPlanList(selectedOffering.plans);
    return (
      plansForOffering.find((plan) => asTrimmedString(plan?.id) === selectedPlanValue) ||
      plansForOffering[0] ||
      null
    );
  }, [selectedOffering, selectedPlanValue]);

  const summaryCurrencies = useMemo(() => {
    const raw = Array.isArray(pricingSummary?.currencies)
      ? (pricingSummary?.currencies as unknown[])
      : [];
    const normalized = raw
      .map((value) => asTrimmedString(value).toUpperCase())
      .filter(Boolean);
    return normalized.length > 0 ? Array.from(new Set(normalized)) : ["EUR"];
  }, [pricingSummary]);

  const summaryRegions = useMemo(() => {
    const raw = Array.isArray(pricingSummary?.regions)
      ? (pricingSummary?.regions as unknown[])
      : [];
    const normalized = raw
      .map((value) => asTrimmedString(value).toLowerCase())
      .filter(Boolean);
    return normalized.length > 0 ? Array.from(new Set(normalized)) : ["global"];
  }, [pricingSummary]);

  const pricingInputSpecs = useMemo(() => {
    const specsById = new Map<string, PricingInputSpec>();
    const activePlan = asTrimmedString(selectedPricingPlan?.id || selectedPlanValue || "");
    const appendSpecs = (items: unknown) => {
      asSpecList(items).forEach((entry) => {
        const key = asTrimmedString(entry?.id);
        if (!key) return;
        const appliesTo = Array.isArray(entry?.applies_to)
          ? entry.applies_to.map((value) => asTrimmedString(value)).filter(Boolean)
          : [];
        if (appliesTo.length > 0 && activePlan && !appliesTo.includes(activePlan)) {
          return;
        }
        specsById.set(key, { ...entry, id: key });
      });
    };
    appendSpecs(pricingDoc?.inputs);
    appendSpecs(selectedOffering?.inputs);
    appendSpecs(selectedPricingPlan?.inputs);
    return Array.from(specsById.values());
  }, [pricingDoc, selectedOffering, selectedPricingPlan, selectedPlanValue]);

  useEffect(() => {
    const preferred = asTrimmedString(pricingDoc?.default_offering_id);
    const nextOffering =
      offeringsForPlan.find((offering) => asTrimmedString(offering?.id) === preferred)?.id ||
      offeringsForPlan[0]?.id ||
      "";
    setSelectedOfferingId((prev) => (prev ? prev : asTrimmedString(nextOffering)));
  }, [pricingDoc, offeringsForPlan]);

  useEffect(() => {
    const defaultCurrency = summaryCurrencies.includes("EUR")
      ? "EUR"
      : summaryCurrencies[0] || "EUR";
    if (!selectedCurrency || !summaryCurrencies.includes(selectedCurrency)) {
      setSelectedCurrency(defaultCurrency);
    }
  }, [selectedCurrency, summaryCurrencies]);

  useEffect(() => {
    const defaultRegion = summaryRegions.includes("global")
      ? "global"
      : summaryRegions[0] || "global";
    if (!selectedRegion || !summaryRegions.includes(selectedRegion)) {
      setSelectedRegion(defaultRegion);
    }
  }, [selectedRegion, summaryRegions]);

  useEffect(() => {
    setInputValues((prev) => {
      const next: Record<string, unknown> = {};
      pricingInputSpecs.forEach((spec) => {
        const key = asTrimmedString(spec.id);
        if (!key) return;
        if (Object.prototype.hasOwnProperty.call(prev, key)) {
          next[key] = prev[key];
          return;
        }
        next[key] = spec.default ?? (spec.type === "boolean" ? false : "");
      });
      return next;
    });
  }, [pricingInputSpecs]);

  const normalizedInputs = useMemo(() => {
    const resolved: Record<string, unknown> = {};
    let error: string | null = null;
    pricingInputSpecs.forEach((spec) => {
      const key = asTrimmedString(spec.id);
      if (!key) return;
      const raw = inputValues[key];
      if (spec.type === "boolean") {
        resolved[key] = Boolean(raw);
        return;
      }
      if (spec.type === "enum") {
        const options = Array.isArray(spec.options)
          ? spec.options.map((item) => asTrimmedString(item)).filter(Boolean)
          : [];
        const value = asTrimmedString(raw || spec.default);
        if (!options.includes(value)) {
          error = `Invalid value for ${spec.label || key}.`;
          return;
        }
        resolved[key] = value;
        return;
      }
      const value = normalizeNumber(raw ?? spec.default);
      if (value === null) {
        error = `Invalid number for ${spec.label || key}.`;
        return;
      }
      const min = normalizeNumber(spec.min);
      const max = normalizeNumber(spec.max);
      if (min !== null && value < min) {
        error = `${spec.label || key} must be >= ${min}.`;
        return;
      }
      if (max !== null && value > max) {
        error = `${spec.label || key} must be <= ${max}.`;
        return;
      }
      resolved[key] = value;
    });
    return { values: resolved, error };
  }, [inputValues, pricingInputSpecs]);

  const quoteKey = useMemo(
    () =>
      JSON.stringify({
        plan: selectedPlanValue || "",
        offering: selectedOffering?.id || "",
        currency: selectedCurrency || "",
        region: selectedRegion || "global",
        inputs: normalizedInputs.values,
      }),
    [selectedPlanValue, selectedOffering, selectedCurrency, selectedRegion, normalizedInputs.values]
  );

  useEffect(() => {
    setQuote(null);
    setQuoteError(null);
  }, [quoteKey]);

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

  const canCalculate =
    Boolean(roleId) &&
    Boolean(pricingDoc) &&
    Boolean(selectedPlanValue) &&
    Boolean(selectedOffering) &&
    !quoteBusy &&
    !normalizedInputs.error;

  const calculateQuote = async () => {
    if (!canCalculate) {
      if (normalizedInputs.error) {
        setQuoteError(normalizedInputs.error);
      }
      return;
    }
    const payload = {
      role_id: roleId,
      offering_id: asTrimmedString(selectedOffering?.id),
      plan_id: selectedPlanValue,
      inputs: normalizedInputs.values,
      currency: selectedCurrency,
      region: selectedRegion || "global",
      include_setup_fee: false,
    };
    setQuoteBusy(true);
    setQuoteError(null);
    try {
      const res = await fetch(`${apiBaseUrl}/api/pricing/quote`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });
      if (!res.ok) {
        let message = `HTTP ${res.status}`;
        try {
          const data = await res.json();
          if (data?.detail) {
            message = String(data.detail);
          }
        } catch {
          // ignore parse errors
        }
        throw new Error(message);
      }
      const data = (await res.json()) as PricingQuote;
      setQuote(data);
    } catch (err: any) {
      setQuote(null);
      setQuoteError(err?.message ?? "failed to calculate quote");
    } finally {
      setQuoteBusy(false);
    }
  };

  const quoteLabel = useMemo(() => {
    if (quoteBusy) return "Calculating...";
    if (quoteError) return quoteError;
    if (!quote) return "Not calculated";
    if (quote.contact_sales) return "Contact sales";
    if (quote.total === null || quote.total === undefined) return "No estimate";
    if (quote.total <= 0) return "Free";
    const amount = formatAmount(quote.total, quote.currency || selectedCurrency || "EUR");
    return quote.interval ? `${amount}/${quote.interval}` : amount;
  }, [quoteBusy, quoteError, quote, selectedCurrency]);

  const requestDisable = () => {
    if (disabled || !enabled) return;
    setConfirmOpen(true);
  };

  const triggerEnable = () => {
    if (disabled) return;
    if (hasPlanOptions) {
      onSelectPlan?.(selectedPlanValue || fallbackPlanId || "community");
      return;
    }
    if (enabled) return;
    onEnable();
  };

  const applyStateAction = (action: RoleStateAction) => {
    setStateMenuOpen(false);
    if (disabled) return;
    if (action === "disable") {
      requestDisable();
      return;
    }
    triggerEnable();
  };

  const activeStateLabel = enabled ? "Enabled" : "Disable";

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
              <span className={quoteError ? styles.pricingError : styles.enablePriceValue}>
                {quoteLabel}
              </span>
              <button
                type="button"
                onClick={() => void calculateQuote()}
                disabled={!canCalculate}
                className={styles.enableCalculateButton}
              >
                Calculate
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
              className={`${styles.enableStateDropdownButton} ${
                enabled ? styles.enableStateDropdownButtonEnabled : styles.enableStateDropdownButtonDisabled
              } ${disabled ? styles.enableSwitchButtonLocked : ""}`}
            >
              <span>{activeStateLabel}</span>
              <i className="fa-solid fa-chevron-down" aria-hidden="true" />
            </button>
            {stateMenuOpen ? (
              <div ref={stateMenuRef} className={styles.enableStateMenu} role="menu">
                {ROLE_STATE_OPTIONS.map((option) => {
                  const active =
                    (enabled && option.id === "enabled") ||
                    (!enabled && option.id === "disable");
                  return (
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
                      } ${active ? styles.enableStateMenuItemActive : ""}`}
                    >
                      {option.label}
                    </button>
                  );
                })}
              </div>
            ) : null}
          </div>
          {!enabled ? (
            <span className={styles.enableWarningText}>
              Disabled: role will not be deployed.
            </span>
          ) : null}
        </div>
      </div>

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
