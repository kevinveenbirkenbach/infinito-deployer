import type { CSSProperties } from "react";
import YAML from "yaml";
import { hexToRgba } from "../deployment-credentials/device-visuals";

export function createDeviceStyle(
  color: string,
  {
    backgroundAlpha,
    borderAlpha,
    outlineAlpha,
  }: { backgroundAlpha: number; borderAlpha: number; outlineAlpha?: number }
): CSSProperties {
  const background = hexToRgba(color, backgroundAlpha);
  const border = hexToRgba(color, borderAlpha);
  const outline = hexToRgba(color, outlineAlpha ?? borderAlpha);
  return {
    ...(background ? { "--device-row-bg": background } : {}),
    ...(border ? { "--device-row-border": border } : {}),
    ...(outline ? { "--device-row-outline": outline } : {}),
  } as CSSProperties;
}

export function encodeWorkspacePath(path: string): string {
  return String(path || "")
    .split("/")
    .map((segment) => encodeURIComponent(segment))
    .join("/");
}

function stringifyApiDetail(detail: unknown): string | null {
  if (typeof detail === "string") {
    const trimmed = detail.trim();
    return trimmed || null;
  }
  if (Array.isArray(detail)) {
    const parts = detail
      .map((item) => stringifyApiDetail(item))
      .filter((item): item is string => Boolean(item));
    return parts.length > 0 ? parts.join(" | ") : null;
  }
  if (detail && typeof detail === "object") {
    const record = detail as Record<string, unknown>;
    const nested = stringifyApiDetail(record.detail);
    if (nested) {
      return nested;
    }
    const msg =
      typeof record.msg === "string" ? record.msg.trim() : "";
    if (msg) {
      const loc = Array.isArray(record.loc)
        ? record.loc
            .map((part) => String(part ?? "").trim())
            .filter(Boolean)
            .join(".")
        : "";
      return loc ? `${loc}: ${msg}` : msg;
    }
    try {
      const serialized = JSON.stringify(detail);
      return serialized && serialized !== "{}" ? serialized : null;
    } catch {
      return null;
    }
  }
  if (detail == null) return null;
  const fallback = String(detail).trim();
  return fallback || null;
}

export function parseYamlMapping(content: string): Record<string, unknown> {
  const trimmed = String(content || "").trim();
  if (!trimmed) return {};
  const parsed = YAML.parse(trimmed);
  if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) {
    return {};
  }
  return { ...(parsed as Record<string, unknown>) };
}

export async function parseApiError(res: Response): Promise<string> {
  let message = `HTTP ${res.status}`;
  try {
    const data = await res.json();
    const detailMessage = stringifyApiDetail(data?.detail);
    if (detailMessage) return detailMessage;
    const directMessage = stringifyApiDetail(data?.message);
    if (directMessage) return directMessage;
    const payloadMessage = stringifyApiDetail(data);
    if (payloadMessage) return payloadMessage;
  } catch {
    const text = await res.text();
    if (text?.trim()) {
      message = text.trim();
    }
  }
  return message;
}

export function normalizePortValue(value: string | number | null | undefined): string {
  const digits = String(value ?? "").replace(/[^\d]/g, "");
  if (!digits) return "";
  const parsed = Number.parseInt(digits, 10);
  if (!Number.isInteger(parsed)) return "";
  return String(Math.min(65535, Math.max(1, parsed)));
}

export function isPortInvalid(port: string): boolean {
  const raw = String(port || "").trim();
  if (!raw) return false;
  const num = Number(raw);
  return !Number.isInteger(num) || num < 1 || num > 65535;
}
