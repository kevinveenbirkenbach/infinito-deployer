const STATUS_LABELS = {
  queued: "Queued",
  running: "Running",
  succeeded: "Succeeded",
  failed: "Failed",
  canceled: "Canceled",
};

const STATUS_COLORS = {
  queued: { bg: "#e2e8f0", fg: "#1f2937", border: "#cbd5e1" },
  running: { bg: "#dbeafe", fg: "#1e3a8a", border: "#93c5fd" },
  succeeded: { bg: "#dcfce7", fg: "#166534", border: "#86efac" },
  failed: { bg: "#fee2e2", fg: "#991b1b", border: "#fecaca" },
  canceled: { bg: "#fef9c3", fg: "#92400e", border: "#fde68a" },
};

const TERMINAL_STATUSES = new Set(["succeeded", "failed", "canceled"]);

export function statusLabel(status) {
  const key = status ?? "unknown";
  return STATUS_LABELS[key] || "Unknown";
}

export function statusColors(status) {
  const key = status ?? "unknown";
  return (
    STATUS_COLORS[key] || {
      bg: "#e2e8f0",
      fg: "#1f2937",
      border: "#cbd5e1",
    }
  );
}

export function isTerminalStatus(status) {
  return TERMINAL_STATUSES.has(status);
}
