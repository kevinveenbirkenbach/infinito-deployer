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
    if (typeof data?.detail === "string" && data.detail.trim()) {
      message = data.detail;
    }
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
