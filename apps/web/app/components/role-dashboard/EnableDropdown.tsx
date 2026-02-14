"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import styles from "./styles.module.css";

type PlanOption = { id: string; label: string };

type PricingInputSpec = {
  id: string;
  type: "number" | "enum" | "boolean";
  label?: string;
  description?: string;
  default?: unknown;
  min?: number;
  max?: number;
  options?: string[];
  applies_to?: string[];
};

type PricingPlan = {
  id: string;
  pricing?: Record<string, unknown> | null;
  setup_fee?: Record<string, unknown> | null;
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
  breakdown?: {
    setup_fee?: number;
    minimum_commit_applied?: { applied?: boolean; delta?: number };
  };
  notes?: string[];
};

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
  const rootRef = useRef<HTMLDivElement | null>(null);
  const [menuOpen, setMenuOpen] = useState(false);
  const [confirmOpen, setConfirmOpen] = useState(false);

  const [selectedOfferingId, setSelectedOfferingId] = useState<string>("");
  const [selectedCurrency, setSelectedCurrency] = useState<string>("");
  const [selectedRegion, setSelectedRegion] = useState<string>("global");
  const [includeSetupFee, setIncludeSetupFee] = useState(false);
  const [inputValues, setInputValues] = useState<Record<string, unknown>>({});
  const [quoteBusy, setQuoteBusy] = useState(false);
  const [quoteError, setQuoteError] = useState<string | null>(null);
  const [quote, setQuote] = useState<PricingQuote | null>(null);

  const planOptions = Array.isArray(plans)
    ? plans
        .map((plan) => ({
          id: String(plan?.id || "").trim(),
          label: String(plan?.label || plan?.id || "").trim(),
        }))
        .filter((plan) => plan.id && plan.label)
    : [];

  const hasPlanOptions = planOptions.length > 0 && typeof onSelectPlan === "function";

  const activePlanId = hasPlanOptions
    ? planOptions.some((plan) => plan.id === selectedPlanId)
      ? String(selectedPlanId)
      : null
    : enabled
      ? "enabled"
      : null;
  const activePlanLabel = hasPlanOptions
    ? planOptions.find((plan) => plan.id === activePlanId)?.label || null
    : null;

  const pricingDoc =
    pricing && typeof pricing === "object" && !Array.isArray(pricing)
      ? (pricing as Record<string, unknown>)
      : null;

  const offerings = useMemo(
    () => asOfferingList(pricingDoc?.offerings).filter((entry) => asTrimmedString(entry?.id)),
    [pricingDoc]
  );

  const offeringsForPlan = useMemo(() => {
    if (!activePlanId) return offerings;
    const filtered = offerings.filter((offering) =>
      asPlanList(offering?.plans).some((plan) => asTrimmedString(plan?.id) === activePlanId)
    );
    return filtered.length > 0 ? filtered : offerings;
  }, [offerings, activePlanId]);

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
    if (!selectedOffering) return null;
    const plansForOffering = asPlanList(selectedOffering.plans);
    if (activePlanId) {
      const found = plansForOffering.find(
        (plan) => asTrimmedString(plan?.id) === activePlanId
      );
      if (found) return found;
    }
    return plansForOffering[0] || null;
  }, [selectedOffering, activePlanId]);

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
    const activePlan = asTrimmedString(selectedPricingPlan?.id || activePlanId || "");
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
  }, [pricingDoc, selectedOffering, selectedPricingPlan, activePlanId]);

  useEffect(() => {
    if (!menuOpen) return;
    const preferred = asTrimmedString(pricingDoc?.default_offering_id);
    const nextOffering =
      offeringsForPlan.find((offering) => asTrimmedString(offering?.id) === preferred)?.id ||
      offeringsForPlan[0]?.id ||
      "";
    setSelectedOfferingId((prev) => (prev ? prev : asTrimmedString(nextOffering)));
  }, [menuOpen, pricingDoc, offeringsForPlan]);

  useEffect(() => {
    if (!menuOpen) return;
    const defaultCurrency = summaryCurrencies.includes("EUR")
      ? "EUR"
      : summaryCurrencies[0] || "EUR";
    if (!selectedCurrency || !summaryCurrencies.includes(selectedCurrency)) {
      setSelectedCurrency(defaultCurrency);
    }
  }, [menuOpen, selectedCurrency, summaryCurrencies]);

  useEffect(() => {
    if (!menuOpen) return;
    const defaultRegion = summaryRegions.includes("global")
      ? "global"
      : summaryRegions[0] || "global";
    if (!selectedRegion || !summaryRegions.includes(selectedRegion)) {
      setSelectedRegion(defaultRegion);
    }
  }, [menuOpen, selectedRegion, summaryRegions]);

  useEffect(() => {
    if (!menuOpen) return;
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
  }, [menuOpen, pricingInputSpecs]);

  useEffect(() => {
    if (!menuOpen) return;
    const handleClickOutside = (event: MouseEvent) => {
      const target = event.target as Node | null;
      if (!target) return;
      if (rootRef.current?.contains(target)) return;
      setMenuOpen(false);
    };
    const handleEscape = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        setMenuOpen(false);
      }
    };
    document.addEventListener("mousedown", handleClickOutside);
    document.addEventListener("keydown", handleEscape);
    return () => {
      document.removeEventListener("mousedown", handleClickOutside);
      document.removeEventListener("keydown", handleEscape);
    };
  }, [menuOpen]);

  const requestDisable = () => {
    if (disabled) return;
    if (hasPlanOptions) {
      if (!activePlanId) return;
    } else if (!enabled) {
      return;
    }
    setMenuOpen(false);
    setConfirmOpen(true);
  };

  const hasPricingQuoteSupport =
    Boolean(baseUrl) &&
    Boolean(roleId) &&
    Boolean(pricingDoc) &&
    Boolean(activePlanId) &&
    Boolean(selectedOffering) &&
    hasPlanOptions &&
    enabled;

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
        offering: selectedOffering?.id || "",
        plan: activePlanId || "",
        currency: selectedCurrency || "",
        region: selectedRegion || "global",
        setup: includeSetupFee,
        inputs: normalizedInputs.values,
      }),
    [
      selectedOffering,
      activePlanId,
      selectedCurrency,
      selectedRegion,
      includeSetupFee,
      normalizedInputs.values,
    ]
  );

  useEffect(() => {
    if (!menuOpen) return;
    if (!hasPricingQuoteSupport) return;
    if (!selectedCurrency) return;
    if (normalizedInputs.error) {
      setQuote(null);
      setQuoteError(normalizedInputs.error);
      setQuoteBusy(false);
      return;
    }
    let alive = true;
    const controller = new AbortController();
    const run = async () => {
      setQuoteBusy(true);
      setQuoteError(null);
      try {
        const res = await fetch(`${baseUrl}/api/pricing/quote`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          signal: controller.signal,
          body: JSON.stringify({
            role_id: roleId,
            offering_id: asTrimmedString(selectedOffering?.id),
            plan_id: activePlanId,
            inputs: normalizedInputs.values,
            currency: selectedCurrency,
            region: selectedRegion || "global",
            include_setup_fee: includeSetupFee,
          }),
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
        if (!alive) return;
        setQuote(data);
        setQuoteError(null);
      } catch (err: any) {
        if (!alive || controller.signal.aborted) return;
        setQuote(null);
        setQuoteError(err?.message ?? "failed to calculate quote");
      } finally {
        if (alive) setQuoteBusy(false);
      }
    };
    void run();
    return () => {
      alive = false;
      controller.abort();
    };
  }, [
    menuOpen,
    hasPricingQuoteSupport,
    baseUrl,
    roleId,
    selectedOffering,
    activePlanId,
    selectedCurrency,
    selectedRegion,
    includeSetupFee,
    normalizedInputs,
    quoteKey,
  ]);

  const label = hasPlanOptions
    ? activePlanId && activePlanLabel
      ? `${activePlanLabel} · Enabled`
      : "Disabled"
    : enabled
      ? "Enabled"
      : "Enable";

  return (
    <>
      <div ref={rootRef} className={styles.enableControl}>
        <button
          type="button"
          disabled={disabled}
          onClick={() => {
            if (disabled) return;
            setMenuOpen((prev) => !prev);
          }}
          className={`${styles.enableTrigger} ${
            enabled ? styles.enableTriggerEnabled : styles.enableTriggerIdle
          } ${compact ? styles.enableTriggerCompact : ""} ${
            disabled ? styles.enableTriggerDisabled : ""
          }`}
          aria-haspopup="menu"
          aria-expanded={menuOpen}
        >
          <span>{label}</span>
          <i className="fa-solid fa-chevron-down" aria-hidden="true" />
        </button>
        {menuOpen ? (
          <div className={styles.enableMenu} role="menu">
            {hasPlanOptions ? (
              <>
                <button
                  type="button"
                  onClick={requestDisable}
                  className={`${styles.enableMenuItem} ${
                    !activePlanId ? styles.enableMenuItemActive : ""
                  } ${styles.enableMenuItemDanger}`}
                >
                  Disabled
                </button>
                {planOptions.map((plan) => (
                  <button
                    key={plan.id}
                    type="button"
                    onClick={() => {
                      setMenuOpen(false);
                      if (!enabled) onEnable();
                      onSelectPlan?.(plan.id);
                    }}
                    className={`${styles.enableMenuItem} ${
                      activePlanId === plan.id ? styles.enableMenuItemActive : ""
                    }`}
                  >
                    Enabled - {plan.label}
                  </button>
                ))}
              </>
            ) : (
              <>
                <button
                  type="button"
                  onClick={() => {
                    setMenuOpen(false);
                    if (!enabled) onEnable();
                  }}
                  className={`${styles.enableMenuItem} ${
                    enabled ? styles.enableMenuItemActive : ""
                  }`}
                >
                  Enable
                </button>
                <button
                  type="button"
                  disabled={!enabled}
                  onClick={requestDisable}
                  className={`${styles.enableMenuItem} ${styles.enableMenuItemDanger}`}
                >
                  Disable
                </button>
              </>
            )}

            {hasPricingQuoteSupport ? (
              <div className={styles.pricingPanel}>
                <div className={styles.pricingPanelTitle}>Estimate</div>
                <div className={styles.pricingControlsGrid}>
                  {offeringsForPlan.length > 1 ? (
                    <label className={styles.pricingControlField}>
                      <span>Offering</span>
                      <select
                        value={asTrimmedString(selectedOffering?.id)}
                        onChange={(event) => setSelectedOfferingId(event.target.value)}
                      >
                        {offeringsForPlan.map((offering) => {
                          const oid = asTrimmedString(offering.id);
                          return (
                            <option key={oid} value={oid}>
                              {asTrimmedString(offering.label) || oid}
                            </option>
                          );
                        })}
                      </select>
                    </label>
                  ) : null}
                  <label className={styles.pricingControlField}>
                    <span>Currency</span>
                    <select
                      value={selectedCurrency}
                      onChange={(event) => setSelectedCurrency(event.target.value)}
                    >
                      {summaryCurrencies.map((currency) => (
                        <option key={currency} value={currency}>
                          {currency}
                        </option>
                      ))}
                    </select>
                  </label>
                  {summaryRegions.length > 1 ? (
                    <label className={styles.pricingControlField}>
                      <span>Region</span>
                      <select
                        value={selectedRegion}
                        onChange={(event) => setSelectedRegion(event.target.value)}
                      >
                        {summaryRegions.map((region) => (
                          <option key={region} value={region}>
                            {region.toUpperCase()}
                          </option>
                        ))}
                      </select>
                    </label>
                  ) : null}
                </div>

                {pricingInputSpecs.length > 0 ? (
                  <div className={styles.pricingInputs}>
                    {pricingInputSpecs.map((spec) => {
                      const key = asTrimmedString(spec.id);
                      if (!key) return null;
                      if (spec.type === "boolean") {
                        return (
                          <label key={key} className={styles.pricingCheckboxField}>
                            <input
                              type="checkbox"
                              checked={Boolean(inputValues[key])}
                              onChange={(event) =>
                                setInputValues((prev) => ({
                                  ...prev,
                                  [key]: event.target.checked,
                                }))
                              }
                            />
                            <span>{spec.label || key}</span>
                          </label>
                        );
                      }
                      if (spec.type === "enum") {
                        const options = Array.isArray(spec.options)
                          ? spec.options.map((item) => asTrimmedString(item)).filter(Boolean)
                          : [];
                        return (
                          <label key={key} className={styles.pricingControlField}>
                            <span>{spec.label || key}</span>
                            <select
                              value={asTrimmedString(inputValues[key] ?? spec.default)}
                              onChange={(event) =>
                                setInputValues((prev) => ({
                                  ...prev,
                                  [key]: event.target.value,
                                }))
                              }
                            >
                              {options.map((option) => (
                                <option key={option} value={option}>
                                  {option}
                                </option>
                              ))}
                            </select>
                          </label>
                        );
                      }
                      const min = normalizeNumber(spec.min);
                      const max = normalizeNumber(spec.max);
                      return (
                        <label key={key} className={styles.pricingControlField}>
                          <span>{spec.label || key}</span>
                          <input
                            type="number"
                            value={String(inputValues[key] ?? spec.default ?? "")}
                            min={min !== null ? min : undefined}
                            max={max !== null ? max : undefined}
                            step="1"
                            onChange={(event) =>
                              setInputValues((prev) => ({
                                ...prev,
                                [key]: event.target.value,
                              }))
                            }
                          />
                        </label>
                      );
                    })}
                  </div>
                ) : null}

                {Boolean(pricingSummary?.has_setup_fee) ? (
                  <label className={styles.pricingCheckboxField}>
                    <input
                      type="checkbox"
                      checked={includeSetupFee}
                      onChange={(event) => setIncludeSetupFee(event.target.checked)}
                    />
                    <span>Include one-time setup fee</span>
                  </label>
                ) : null}

                <div className={styles.pricingResult}>
                  {quoteBusy ? (
                    <span className={styles.pricingMuted}>Calculating estimate...</span>
                  ) : quoteError ? (
                    <span className={styles.pricingError}>{quoteError}</span>
                  ) : quote?.contact_sales ? (
                    <span className={styles.pricingMuted}>Contact sales for pricing.</span>
                  ) : quote?.total !== null && quote?.total !== undefined ? (
                    <>
                      <strong>
                        {quote.total <= 0
                          ? "Free"
                          : formatAmount(quote.total, quote.currency || selectedCurrency)}
                      </strong>
                      <span className={styles.pricingMuted}>
                        {quote.interval ? ` / ${quote.interval}` : ""}
                      </span>
                      {Boolean(quote.breakdown?.setup_fee) ? (
                        <span className={styles.pricingMuted}>
                          includes one-time setup fee
                        </span>
                      ) : null}
                      {quote.breakdown?.minimum_commit_applied?.applied ? (
                        <span className={styles.pricingMuted}>
                          minimum spend applied
                        </span>
                      ) : null}
                    </>
                  ) : (
                    <span className={styles.pricingMuted}>No estimate available.</span>
                  )}
                </div>
              </div>
            ) : null}
          </div>
        ) : null}
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
                    onDisable();
                    onSelectPlan?.(null);
                  } else {
                    onDisable();
                  }
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
