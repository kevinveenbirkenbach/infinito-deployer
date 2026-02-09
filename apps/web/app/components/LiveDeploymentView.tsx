"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import type { Terminal as XTermTerminal } from "@xterm/xterm";
import type { FitAddon as XTermFitAddon } from "@xterm/addon-fit";
import {
  isTerminalStatus,
  statusColors,
  statusLabel,
} from "../lib/deployment_status";

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
}: {
  baseUrl: string;
  jobId?: string;
  autoConnect?: boolean;
}) {
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
        theme: {
          background: "#0b0f19",
          foreground: "#e2e8f0",
          cursor: "#38bdf8",
        },
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
    };

    setupTerminal().catch((err) => {
      console.error("Failed to initialize xterm", err);
    });

    return () => {
      disposed = true;
      if (onResize) window.removeEventListener("resize", onResize);
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
      } catch {
        setStatus(null);
      }
    });

    es.addEventListener("done", (evt) => {
      try {
        const payload = JSON.parse((evt as MessageEvent).data);
        setStatus(payload);
      } catch {
        setStatus(null);
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
    <section
      style={{
        marginTop: 28,
        padding: 24,
        borderRadius: 24,
        background:
          "linear-gradient(120deg, rgba(226, 232, 240, 0.9), rgba(240, 253, 250, 0.9))",
        border: "1px solid rgba(15, 23, 42, 0.08)",
        boxShadow: "0 18px 40px rgba(15, 23, 42, 0.08)",
      }}
    >
      <div style={{ display: "flex", flexWrap: "wrap", gap: 16 }}>
        <div style={{ flex: "1 1 320px" }}>
          <h2
            style={{
              margin: 0,
              fontFamily: "var(--font-display)",
              fontSize: 26,
              letterSpacing: "-0.02em",
              color: "#0f172a",
            }}
          >
            Live Deployment View
          </h2>
          <p style={{ margin: "8px 0 0", color: "#475569" }}>
            Docker-like terminal output via SSE, with real-time status updates.
          </p>
        </div>
        <div
          style={{
            flex: "1 1 240px",
            alignSelf: "center",
            textAlign: "right",
            color: "#475569",
            fontSize: 13,
          }}
        >
          Status:{" "}
          <span
            style={{
              padding: "4px 8px",
              borderRadius: 999,
              background: statusStyles.bg,
              color: statusStyles.fg,
              border: `1px solid ${statusStyles.border}`,
              fontSize: 12,
            }}
          >
            {statusLabel(status?.status)}
          </span>
        </div>
      </div>

      <div
        style={{
          marginTop: 16,
          display: "flex",
          flexWrap: "wrap",
          gap: 12,
        }}
      >
        <input
          value={jobId}
          onChange={(e) => setJobId(e.target.value)}
          placeholder="Job ID"
          style={{
            flex: "1 1 240px",
            padding: "10px 12px",
            borderRadius: 12,
            border: "1px solid #cbd5e1",
          }}
        />
        <button
          onClick={connect}
          disabled={!jobId.trim() || connected}
          style={{
            padding: "10px 16px",
            borderRadius: 999,
            border: "1px solid #0f172a",
            background: connected ? "#e2e8f0" : "#0f172a",
            color: connected ? "#64748b" : "#fff",
            cursor: connected ? "not-allowed" : "pointer",
          }}
        >
          {connected ? "Connected" : "Connect"}
        </button>
        <button
          onClick={cancel}
          disabled={!jobId.trim() || canceling || isTerminalStatus(status?.status)}
          style={{
            padding: "10px 16px",
            borderRadius: 999,
            border: "1px solid #cbd5e1",
            background: "#fff",
            color: "#0f172a",
            cursor:
              !jobId.trim() || canceling || isTerminalStatus(status?.status)
                ? "not-allowed"
                : "pointer",
          }}
        >
          {canceling ? "Canceling..." : "Cancel"}
        </button>
      </div>

      {error ? (
        <div style={{ marginTop: 8, color: "#b91c1c" }}>{error}</div>
      ) : null}

      <div
        style={{
          marginTop: 16,
          borderRadius: 18,
          border: "1px solid #111827",
          background: "#0b0f19",
          height: 320,
          overflow: "hidden",
        }}
      >
        <div style={{ width: "100%", height: "100%" }} ref={containerRef} />
      </div>

      {status?.status && isTerminalStatus(status.status) ? (
        <div
          style={{
            marginTop: 12,
            padding: 12,
            borderRadius: 12,
            background: statusStyles.bg,
            color: statusStyles.fg,
            border: `1px solid ${statusStyles.border}`,
            fontSize: 12,
          }}
        >
          Final status: {statusLabel(status.status)}
          {status.exit_code !== null && status.exit_code !== undefined
            ? ` (exit ${status.exit_code})`
            : ""}
        </div>
      ) : null}
    </section>
  );
}
