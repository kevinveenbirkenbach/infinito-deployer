"use client";

import { useMemo } from "react";
import emojiData from "@emoji-mart/data";

type CountryFlagSelectPluginProps = {
  value: string;
  onChange: (nextValue: string) => void;
  className?: string;
  id?: string;
  disabled?: boolean;
  "aria-label"?: string;
};

type CountryOption = {
  code: string;
  name: string;
  flag: string;
};

function buildCountryOptions(): CountryOption[] {
  const emojiMap =
    emojiData &&
    typeof emojiData === "object" &&
    (emojiData as any).emojis &&
    typeof (emojiData as any).emojis === "object"
      ? ((emojiData as any).emojis as Record<
          string,
          { name?: unknown; skins?: Array<{ native?: unknown }> }
        >)
      : null;

  if (!emojiMap) {
    return [{ code: "DE", name: "Germany", flag: "🇩🇪" }];
  }

  const seen = new Set<string>();
  const countries: CountryOption[] = [];
  Object.entries(emojiMap).forEach(([id, entry]) => {
    if (!id.startsWith("flag-")) return;
    const code = id.slice(5).toUpperCase();
    if (!/^[A-Z]{2}$/.test(code) || seen.has(code)) return;
    const rawFlag = String(entry?.skins?.[0]?.native ?? "").trim();
    if (!rawFlag) return;
    const rawName = String(entry?.name ?? "").trim();
    const name = rawName.replace(/\s+flag$/i, "").trim() || code;
    seen.add(code);
    countries.push({ code, name, flag: rawFlag });
  });

  countries.sort((a, b) => a.name.localeCompare(b.name, "en"));
  return countries.length > 0
    ? countries
    : [{ code: "DE", name: "Germany", flag: "🇩🇪" }];
}

const COUNTRIES: CountryOption[] = buildCountryOptions();

function stripLeadingSymbols(value: string): string {
  return String(value || "")
    .replace(/^[^\p{L}\p{N}]+/gu, "")
    .trim();
}

export default function CountryFlagSelectPlugin({
  value,
  onChange,
  className,
  id,
  disabled,
  "aria-label": ariaLabel,
}: CountryFlagSelectPluginProps) {
  const normalizedValue = String(value || "").trim();
  const normalizedNeedle = stripLeadingSymbols(normalizedValue).toLowerCase();

  const matchedCountry = useMemo(
    () =>
      COUNTRIES.find(
        (country) =>
          country.name.toLowerCase() === normalizedNeedle ||
          country.code.toLowerCase() === normalizedNeedle
      ) || null,
    [normalizedNeedle]
  );

  const selectedValue = matchedCountry ? matchedCountry.code : "__custom__";
  const countryByCode = useMemo(() => {
    const map = new Map<string, CountryOption>();
    COUNTRIES.forEach((country) => {
      map.set(country.code, country);
    });
    return map;
  }, []);

  const options = useMemo(() => {
    const items = COUNTRIES.map((country) => ({
      key: country.code,
      value: country.code,
      label: `${country.flag} ${country.name}`,
    }));

    if (matchedCountry || !normalizedValue) {
      return items;
    }
    return [
      {
        key: "__custom__",
        value: "__custom__",
        label: `🌍 ${normalizedValue}`,
      },
      ...items,
    ];
  }, [normalizedValue, matchedCountry]);

  return (
    <select
      id={id}
      value={selectedValue}
      onChange={(event) => {
        const code = String(event.target.value || "").trim().toUpperCase();
        if (code === "__CUSTOM__") {
          onChange(normalizedValue || "");
          return;
        }
        const country = countryByCode.get(code);
        if (country) {
          onChange(country.name);
          return;
        }
        onChange(normalizedValue || "");
      }}
      className={className}
      disabled={disabled}
      aria-label={ariaLabel}
    >
      {options.map((option) => (
        <option key={option.key} value={option.value}>
          {option.label}
        </option>
      ))}
    </select>
  );
}
