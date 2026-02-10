"use client";

import { useEffect, useMemo, useState } from "react";
import { AUTH_METHODS, validateForm } from "../lib/deploy_form";

type ServerState = {
  alias: string;
  host: string;
  user: string;
  authMethod: string;
  password: string;
  privateKey: string;
};

type FormState = {
  alias: string;
  host: string;
  user: string;
  authMethod: string;
  password: string;
  privateKey: string;
};

const FIELD_LABELS: Record<string, string> = {
  alias: "Alias",
  host: "Host",
  user: "User",
  authMethod: "Auth method",
  password: "Password",
  privateKey: "Private key",
};

export default function DeploymentCredentialsForm({
  baseUrl,
  servers,
  activeAlias,
  onActiveAliasChange,
  onUpdateServer,
  onAddServer,
}: {
  baseUrl: string;
  servers: ServerState[];
  activeAlias: string;
  onActiveAliasChange: (alias: string) => void;
  onUpdateServer: (alias: string, patch: Partial<ServerState>) => void;
  onAddServer: () => void;
}) {
  const activeServer = useMemo(() => {
    if (activeAlias) {
      const found = servers.find((server) => server.alias === activeAlias);
      if (found) return found;
    }
    return servers[0] ?? null;
  }, [servers, activeAlias]);

  const [aliasDraft, setAliasDraft] = useState(activeServer?.alias ?? "");
  const [aliasError, setAliasError] = useState<string | null>(null);

  useEffect(() => {
    setAliasDraft(activeServer?.alias ?? "");
    setAliasError(null);
  }, [activeServer?.alias]);

  const validationTarget: FormState = {
    alias: activeServer?.alias ?? "",
    host: activeServer?.host ?? "",
    user: activeServer?.user ?? "",
    authMethod: activeServer?.authMethod ?? "password",
    password: activeServer?.password ?? "",
    privateKey: activeServer?.privateKey ?? "",
  };

  const errors = useMemo(() => validateForm(validationTarget), [validationTarget]);
  const isValid = Object.keys(errors).length === 0 && !aliasError;

  const update = (patch: Partial<ServerState>) => {
    if (!activeServer) return;
    onUpdateServer(activeServer.alias, patch);
  };

  const onAuthChange = (next: string) => {
    if (next === "password") {
      update({ authMethod: next, privateKey: "" });
    } else {
      update({ authMethod: next, password: "" });
    }
  };

  const commitAlias = () => {
    if (!activeServer) return;
    const nextAlias = aliasDraft.trim();
    if (!nextAlias) {
      setAliasError("Alias is required.");
      setAliasDraft(activeServer.alias);
      return;
    }
    const duplicate = servers.some(
      (server) => server.alias === nextAlias && server.alias !== activeServer.alias
    );
    if (duplicate) {
      setAliasError("Alias already exists.");
      return;
    }
    setAliasError(null);
    if (nextAlias !== activeServer.alias) {
      onUpdateServer(activeServer.alias, { alias: nextAlias });
    }
  };

  return (
    <section
      style={{
        marginTop: 28,
        padding: 24,
        borderRadius: 24,
        background:
          "linear-gradient(120deg, rgba(236, 253, 245, 0.9), rgba(255, 251, 235, 0.9))",
        border: "1px solid rgba(15, 23, 42, 0.08)",
        boxShadow: "0 18px 40px rgba(15, 23, 42, 0.08)",
      }}
    >
      <div style={{ display: "flex", flexWrap: "wrap", gap: 16 }}>
        <div style={{ flex: "1 1 300px" }}>
          <h2
            style={{
              margin: 0,
              fontFamily: "var(--font-display)",
              fontSize: 26,
              letterSpacing: "-0.02em",
              color: "#0f172a",
            }}
          >
            Deployment Credentials
          </h2>
          <p style={{ margin: "8px 0 0", color: "#475569" }}>
            Credentials are only used to establish the SSH session during
            deployment. They are never stored in the browser and are not written
            to disk.
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
          API Base: <code>{baseUrl}</code>
        </div>
      </div>

      <div
        style={{
          marginTop: 20,
          display: "grid",
          gridTemplateColumns: "repeat(auto-fit, minmax(220px, 1fr))",
          gap: 16,
        }}
      >
        <div
          style={{
            padding: 16,
            borderRadius: 18,
            background: "#fff",
            border: "1px solid rgba(15, 23, 42, 0.1)",
          }}
        >
          <label style={{ fontSize: 12, color: "#64748b" }}>
            Active server
          </label>
          <div style={{ marginTop: 8, display: "grid", gap: 8 }}>
            <select
              value={activeAlias || activeServer?.alias || ""}
              onChange={(e) => onActiveAliasChange(e.target.value)}
              style={{
                padding: "8px 10px",
                borderRadius: 10,
                border: "1px solid #cbd5e1",
                fontSize: 12,
              }}
            >
              {servers.length === 0 ? (
                <option value="">No servers yet</option>
              ) : null}
              {servers.map((server) => (
                <option key={server.alias} value={server.alias}>
                  {server.alias || "(unnamed)"}
                </option>
              ))}
            </select>
            <button
              onClick={onAddServer}
              style={{
                padding: "6px 10px",
                borderRadius: 999,
                border: "1px solid #0f172a",
                background: "#0f172a",
                color: "#fff",
                fontSize: 12,
                cursor: "pointer",
              }}
            >
              Add server
            </button>
          </div>
        </div>

        <div
          style={{
            padding: 16,
            borderRadius: 18,
            background: "#fff",
            border: "1px solid rgba(15, 23, 42, 0.1)",
          }}
        >
          <label style={{ fontSize: 12, color: "#64748b" }}>Alias</label>
          <input
            value={aliasDraft}
            onChange={(e) => setAliasDraft(e.target.value)}
            onBlur={commitAlias}
            onKeyDown={(e) => {
              if (e.key === "Enter") {
                e.preventDefault();
                commitAlias();
              }
            }}
            placeholder="main"
            style={{
              width: "100%",
              marginTop: 8,
              padding: "10px 12px",
              borderRadius: 12,
              border: "1px solid #cbd5e1",
            }}
          />
          {aliasError ? (
            <p style={{ margin: "8px 0 0", color: "#b91c1c" }}>
              {aliasError}
            </p>
          ) : null}
          {!aliasError && errors.alias ? (
            <p style={{ margin: "8px 0 0", color: "#b91c1c" }}>
              {errors.alias}
            </p>
          ) : null}
        </div>

        <div
          style={{
            padding: 16,
            borderRadius: 18,
            background: "#fff",
            border: "1px solid rgba(15, 23, 42, 0.1)",
          }}
        >
          <label style={{ fontSize: 12, color: "#64748b" }}>Host</label>
          <input
            value={activeServer?.host ?? ""}
            onChange={(e) => update({ host: e.target.value })}
            placeholder="example.com or 192.168.0.2"
            style={{
              width: "100%",
              marginTop: 8,
              padding: "10px 12px",
              borderRadius: 12,
              border: "1px solid #cbd5e1",
            }}
          />
          {errors.host ? (
            <p style={{ margin: "8px 0 0", color: "#b91c1c" }}>
              {errors.host}
            </p>
          ) : null}
        </div>

        <div
          style={{
            padding: 16,
            borderRadius: 18,
            background: "#fff",
            border: "1px solid rgba(15, 23, 42, 0.1)",
          }}
        >
          <label style={{ fontSize: 12, color: "#64748b" }}>User</label>
          <input
            value={activeServer?.user ?? ""}
            onChange={(e) => update({ user: e.target.value })}
            placeholder="root"
            style={{
              width: "100%",
              marginTop: 8,
              padding: "10px 12px",
              borderRadius: 12,
              border: "1px solid #cbd5e1",
            }}
          />
          {errors.user ? (
            <p style={{ margin: "8px 0 0", color: "#b91c1c" }}>
              {errors.user}
            </p>
          ) : null}
        </div>
      </div>

      <div
        style={{
          marginTop: 16,
          padding: 16,
          borderRadius: 18,
          background: "#fff",
          border: "1px solid rgba(15, 23, 42, 0.1)",
        }}
      >
        <label style={{ fontSize: 12, color: "#64748b" }}>Auth method</label>
        <div style={{ display: "flex", gap: 8, marginTop: 8 }}>
          {AUTH_METHODS.map((method) => (
            <button
              key={method}
              onClick={() => onAuthChange(method)}
              style={{
                padding: "6px 10px",
                borderRadius: 999,
                border:
                  activeServer?.authMethod === method
                    ? "1px solid #0f172a"
                    : "1px solid #cbd5e1",
                background:
                  activeServer?.authMethod === method ? "#0f172a" : "#fff",
                color:
                  activeServer?.authMethod === method ? "#fff" : "#334155",
                fontSize: 12,
                cursor: "pointer",
              }}
            >
              {method.replace("_", " ")}
            </button>
          ))}
        </div>
        {errors.authMethod ? (
          <p style={{ margin: "8px 0 0", color: "#b91c1c" }}>
            {errors.authMethod}
          </p>
        ) : null}

        <div
          style={{
            marginTop: 16,
            display: "grid",
            gridTemplateColumns: "repeat(auto-fit, minmax(220px, 1fr))",
            gap: 16,
          }}
        >
          <div>
            <label style={{ fontSize: 12, color: "#64748b" }}>Password</label>
            <input
              type="password"
              value={activeServer?.password ?? ""}
              onChange={(e) => update({ password: e.target.value })}
              disabled={activeServer?.authMethod !== "password"}
              placeholder={
                activeServer?.authMethod === "password"
                  ? "Enter password"
                  : "Disabled for key auth"
              }
              autoComplete="off"
              style={{
                width: "100%",
                marginTop: 8,
                padding: "10px 12px",
                borderRadius: 12,
                border: "1px solid #cbd5e1",
                background:
                  activeServer?.authMethod === "password" ? "#fff" : "#f8fafc",
              }}
            />
            {errors.password ? (
              <p style={{ margin: "8px 0 0", color: "#b91c1c" }}>
                {errors.password}
              </p>
            ) : null}
          </div>

          <div>
            <label style={{ fontSize: 12, color: "#64748b" }}>
              Private key
            </label>
            <textarea
              value={activeServer?.privateKey ?? ""}
              onChange={(e) => update({ privateKey: e.target.value })}
              disabled={activeServer?.authMethod !== "private_key"}
              placeholder={
                activeServer?.authMethod === "private_key"
                  ? "Paste SSH private key"
                  : "Disabled for password auth"
              }
              rows={5}
              autoComplete="off"
              spellCheck={false}
              style={{
                width: "100%",
                marginTop: 8,
                padding: "10px 12px",
                borderRadius: 12,
                border: "1px solid #cbd5e1",
                background:
                  activeServer?.authMethod === "private_key"
                    ? "#fff"
                    : "#f8fafc",
                resize: "vertical",
                fontFamily:
                  "ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, 'Liberation Mono', 'Courier New', monospace",
                fontSize: 12,
              }}
            />
            {errors.privateKey ? (
              <p style={{ margin: "8px 0 0", color: "#b91c1c" }}>
                {errors.privateKey}
              </p>
            ) : null}
          </div>
        </div>
      </div>

      <div style={{ marginTop: 16, display: "flex", gap: 12 }}>
        <button
          disabled={!isValid}
          style={{
            padding: "10px 16px",
            borderRadius: 999,
            border: "1px solid #0f172a",
            background: isValid ? "#0f172a" : "#e2e8f0",
            color: isValid ? "#fff" : "#64748b",
            cursor: isValid ? "pointer" : "not-allowed",
          }}
        >
          Save credentials
        </button>
        {!isValid ? (
          <span style={{ alignSelf: "center", color: "#b91c1c" }}>
            Fix the fields highlighted below.
          </span>
        ) : null}
      </div>

      {Object.keys(errors).length > 0 ? (
        <div
          style={{
            marginTop: 12,
            padding: 12,
            borderRadius: 12,
            background: "#fef2f2",
            color: "#991b1b",
            fontSize: 12,
          }}
        >
          {Object.entries(errors).map(([key, message]) => (
            <div key={key}>
              <strong>{FIELD_LABELS[key] ?? key}:</strong> {message}
            </div>
          ))}
        </div>
      ) : null}
    </section>
  );
}
