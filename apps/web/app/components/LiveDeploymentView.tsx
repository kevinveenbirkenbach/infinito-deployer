"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import type { CSSProperties } from "react";
import type { Terminal as XTermTerminal } from "@xterm/xterm";
import type { FitAddon as XTermFitAddon } from "@xterm/addon-fit";
import {
  isTerminalStatus,
  statusColors,
  statusLabel,
} from "../lib/deployment_status";
import styles from "./LiveDeploymentView.module.css";

type StatusPayload = {
  job_id: string;
  status: string;
  started_at?: string | null;
  finished_at?: string | null;
  exit_code?: number | null;
  timestamp?: string | null;
};

export default function LiveDeploymentView({
  baseUrl,
  jobId: externalJobId,
  autoConnect = false,
  compact = false,
  fill = false,
  onStatusChange,
}: {
  baseUrl: string;
  jobId?: string;
  autoConnect?: boolean;
  compact?: boolean;
  fill?: boolean;
  onStatusChange?: (status: StatusPayload | null) => void;
}) {
  const Wrapper = compact ? "div" : "section";
  const wrapperClassName = [
    compact ? "" : styles.wrapperPanel,
    fill ? styles.wrapperFill : "",
  ]
    .filter(Boolean)
    .join(" ");
  const [jobId, setJobId] = useState(externalJobId ?? "");
  const [status, setStatus] = useState<StatusPayload | null>(null);
  const [connected, setConnected] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [canceling, setCanceling] = useState(false);
  const lastAutoJobRef = useRef<string | null>(null);

  const termRef = useRef<XTermTerminal | null>(null);
  const fitRef = useRef<XTermFitAddon | null>(null);
  const containerRef = useRef<HTMLDivElement | null>(null);
  const esRef = useRef<EventSource | null>(null);

  useEffect(() => {
    let disposed = false;
    let onResize: (() => void) | null = null;
    let onSchemeChange: (() => void) | null = null;
    let mediaQuery: MediaQueryList | null = null;

    const readCssVar = (name: string, fallback: string) => {
      if (typeof window === "undefined") return fallback;
      const value = getComputedStyle(document.documentElement)
        .getPropertyValue(name)
        .trim();
      return value || fallback;
    };

    const buildTheme = () => ({
      background: readCssVar("--deployer-terminal-bg", "#0b0f19"),
      foreground: readCssVar("--deployer-terminal-text", "#e2e8f0"),
      cursor: readCssVar("--deployer-accent", "#38bdf8"),
    });

    const setupTerminal = async () => {
      if (!containerRef.current) return;
      const [{ Terminal }, { FitAddon }] = await Promise.all([
        import("@xterm/xterm"),
        import("@xterm/addon-fit"),
      ]);
      if (disposed || !containerRef.current) return;

      const term = new Terminal({
        fontFamily:
          "ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, 'Liberation Mono', 'Courier New', monospace",
        fontSize: 12,
        theme: buildTheme(),
        convertEol: true,
        cursorBlink: true,
        scrollback: 2000,
      });
      const fit = new FitAddon();
      term.loadAddon(fit);
      term.open(containerRef.current);
      fit.fit();
      term.writeln("\u001b[1mLive deployment logs\u001b[0m");
      term.writeln("Attach to a job ID to stream output.");

      termRef.current = term;
      fitRef.current = fit;

      onResize = () => fit.fit();
      window.addEventListener("resize", onResize);

      if (typeof window !== "undefined") {
        mediaQuery = window.matchMedia("(prefers-color-scheme: dark)");
        onSchemeChange = () => {
          const nextTheme = buildTheme();
          term.options.theme = nextTheme;
          term.refresh(0, Math.max(0, term.rows - 1));
        };
        const legacyMediaQuery = mediaQuery as MediaQueryList & {
          addListener?: (listener: () => void) => void;
          removeListener?: (listener: () => void) => void;
        };
        if (legacyMediaQuery.addEventListener) {
          legacyMediaQuery.addEventListener("change", onSchemeChange);
        } else if (legacyMediaQuery.addListener) {
          legacyMediaQuery.addListener(onSchemeChange);
        }
      }
    };

    setupTerminal().catch((err) => {
      console.error("Failed to initialize xterm", err);
    });

    return () => {
      disposed = true;
      if (onResize) window.removeEventListener("resize", onResize);
      if (mediaQuery && onSchemeChange) {
        const legacyMediaQuery = mediaQuery as MediaQueryList & {
          addListener?: (listener: () => void) => void;
          removeListener?: (listener: () => void) => void;
        };
        if (legacyMediaQuery.removeEventListener) {
          legacyMediaQuery.removeEventListener("change", onSchemeChange);
        } else if (legacyMediaQuery.removeListener) {
          legacyMediaQuery.removeListener(onSchemeChange);
        }
      }
      termRef.current?.dispose();
      termRef.current = null;
      fitRef.current = null;
    };
  }, []);

  useEffect(() => {
    return () => {
      if (esRef.current) esRef.current.close();
    };
  }, []);

  const statusStyles = useMemo(() => statusColors(status?.status), [status]);
  const statusStyle = {
    "--live-status-bg": statusStyles.bg,
    "--live-status-fg": statusStyles.fg,
    "--live-status-border": statusStyles.border,
  } as CSSProperties;
  const terminalStyle = {
    "--terminal-top": `${compact ? 12 : 16}px`,
    "--terminal-radius": compact ? "0px" : "18px",
    "--terminal-height": fill ? "100%" : "320px",
    "--terminal-flex": fill ? "1" : "initial",
    "--terminal-min-height": fill ? "220px" : "initial",
  } as CSSProperties;

  const writeLines = (text: string) => {
    const term = termRef.current;
    if (!term) return;
    const lines = String(text ?? "").split("\n");
    lines.forEach((line) => {
      const sanitized = line.replace(/\r/g, "");
      term.writeln(sanitized);
    });
  };

  useEffect(() => {
    if (typeof externalJobId !== "string") return;
    setJobId((prev) => (prev === externalJobId ? prev : externalJobId));
  }, [externalJobId]);

  const connectTo = (rawId: string) => {
    const trimmed = rawId.trim();
    if (!trimmed) return;
    setError(null);
    setStatus(null);
    setConnected(true);
    setJobId(trimmed);

    if (esRef.current) {
      esRef.current.close();
    }

    const term = termRef.current;
    if (term) {
      term.reset();
      term.writeln("\u001b[1mAttaching to job\u001b[0m " + trimmed);
    }

    const es = new EventSource(`${baseUrl}/api/deployments/${trimmed}/logs`);
    esRef.current = es;

    es.addEventListener("log", (evt) => {
      writeLines((evt as MessageEvent).data ?? "");
    });

    es.addEventListener("status", (evt) => {
      try {
        const payload = JSON.parse((evt as MessageEvent).data);
        setStatus(payload);
        onStatusChange?.(payload);
      } catch {
        setStatus(null);
        onStatusChange?.(null);
      }
    });

    es.addEventListener("done", (evt) => {
      try {
        const payload = JSON.parse((evt as MessageEvent).data);
        setStatus(payload);
        onStatusChange?.(payload);
      } catch {
        setStatus(null);
        onStatusChange?.(null);
      }
      setConnected(false);
      es.close();
      writeLines("\u001b[1mDeployment finished\u001b[0m");
    });

    es.onerror = () => {
      setError("Connection lost");
      setConnected(false);
    };
  };

  const connect = () => {
    connectTo(jobId);
  };

  useEffect(() => {
    if (!autoConnect) return;
    const trimmed = String(externalJobId ?? "").trim();
    if (!trimmed) return;
    if (lastAutoJobRef.current === trimmed) return;
    lastAutoJobRef.current = trimmed;
    connectTo(trimmed);
  }, [autoConnect, externalJobId]);

  const cancel = async () => {
    if (!jobId.trim()) return;
    setCanceling(true);
    setError(null);
    try {
      const res = await fetch(
        `${baseUrl}/api/deployments/${jobId.trim()}/cancel`,
        { method: "POST" }
      );
      if (!res.ok) {
        const text = await res.text();
        throw new Error(text || `HTTP ${res.status}`);
      }
    } catch (err: any) {
      setError(err?.message ?? "Cancel failed");
    } finally {
      setCanceling(false);
    }
  };

  return (
    <Wrapper className={wrapperClassName}>
      {!compact ? (
        <div className={styles.header}>
          <div className={styles.headerLeft}>
            <h2 className={`text-body ${styles.title}`}>Live Deployment View</h2>
            <p className={`text-body-secondary ${styles.subtitle}`}>
              Docker-like terminal output via SSE, with real-time status updates.
            </p>
          </div>
          <div className={`text-body-secondary ${styles.headerRight}`}>
            Status:{" "}
            <span className={styles.statusBadge} style={statusStyle}>
              {statusLabel(status?.status)}
            </span>
          </div>
        </div>
      ) : null}

      <div className={styles.controls}>
        <input
          value={jobId}
          onChange={(e) => setJobId(e.target.value)}
          placeholder="Job ID"
          className={styles.jobInput}
        />
        <button
          onClick={connect}
          disabled={!jobId.trim() || connected}
          className={`${styles.connectButton} ${
            connected ? styles.connectDisabled : styles.connectEnabled
          }`}
        >
          {connected ? "Connected" : "Connect"}
        </button>
        <button
          onClick={cancel}
          disabled={!jobId.trim() || canceling || isTerminalStatus(status?.status)}
          className={`${styles.cancelButton} ${
            !jobId.trim() || canceling || isTerminalStatus(status?.status)
              ? styles.cancelDisabled
              : styles.cancelEnabled
          }`}
        >
          {canceling ? "Canceling..." : "Cancel"}
        </button>
      </div>

      {error ? <div className={`text-danger ${styles.error}`}>{error}</div> : null}

      <div className={styles.terminalWrap} style={terminalStyle}>
        <div className={styles.terminalContainer} ref={containerRef} />
      </div>

      {status?.status && isTerminalStatus(status.status) ? (
        <div className={styles.finalStatus} style={statusStyle}>
          Final status: {statusLabel(status.status)}
          {status.exit_code !== null && status.exit_code !== undefined
            ? ` (exit ${status.exit_code})`
            : ""}
        </div>
      ) : null}
    </Wrapper>
  );
}
