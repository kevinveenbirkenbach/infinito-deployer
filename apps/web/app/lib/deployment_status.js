const STATUS_LABELS = {
  queued: "Queued",
  running: "Running",
  succeeded: "Succeeded",
  failed: "Failed",
  canceled: "Canceled",
};

const STATUS_COLORS = {
  queued: {
    bg: "var(--bs-secondary-bg-subtle)",
    fg: "var(--bs-secondary-text-emphasis)",
    border: "var(--bs-secondary-border-subtle)",
  },
  running: {
    bg: "var(--bs-info-bg-subtle)",
    fg: "var(--bs-info-text-emphasis)",
    border: "var(--bs-info-border-subtle)",
  },
  succeeded: {
    bg: "var(--bs-success-bg-subtle)",
    fg: "var(--bs-success-text-emphasis)",
    border: "var(--bs-success-border-subtle)",
  },
  failed: {
    bg: "var(--bs-danger-bg-subtle)",
    fg: "var(--bs-danger-text-emphasis)",
    border: "var(--bs-danger-border-subtle)",
  },
  canceled: {
    bg: "var(--bs-warning-bg-subtle)",
    fg: "var(--bs-warning-text-emphasis)",
    border: "var(--bs-warning-border-subtle)",
  },
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
      bg: "var(--bs-secondary-bg-subtle)",
      fg: "var(--bs-secondary-text-emphasis)",
      border: "var(--bs-secondary-border-subtle)",
    }
  );
}

export function isTerminalStatus(status) {
  return TERMINAL_STATUSES.has(status);
}
