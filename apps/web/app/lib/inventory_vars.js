/**
 * @param {string} text
 */
export function parseJsonObject(text) {
  const trimmed = String(text ?? "").trim();
  if (!trimmed) {
    return { value: {}, error: null };
  }
  try {
    const parsed = JSON.parse(trimmed);
    if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) {
      return { value: null, error: "JSON must be an object." };
    }
    return { value: parsed, error: null };
  } catch (err) {
    return { value: null, error: "Invalid JSON." };
  }
}

/**
 * @param {{ key: string; value: string }[]} pairs
 */
export function kvToObject(pairs) {
  const out = {};
  (pairs ?? []).forEach((pair) => {
    const key = String(pair?.key ?? "").trim();
    if (!key) return;
    out[key] = String(pair?.value ?? "");
  });
  return out;
}

/**
 * @param {string} jsonText
 * @param {{ key: string; value: string }[]} pairs
 */
export function buildInventoryVars(jsonText, pairs) {
  const parsed = parseJsonObject(jsonText);
  if (parsed.error) {
    return { value: null, error: parsed.error };
  }
  const kvObject = kvToObject(pairs);
  return { value: { ...parsed.value, ...kvObject }, error: null };
}
