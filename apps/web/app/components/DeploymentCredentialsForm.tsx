"use client";

import { useEffect, useMemo, useState } from "react";
import {
  AUTH_METHODS,
  DEPLOY_TARGETS,
  createInitialState,
  validateForm,
} from "../lib/deploy_form";

type FormState = ReturnType<typeof createInitialState>;

const FIELD_LABELS: Record<string, string> = {
  deployTarget: "Deploy target",
  host: "Host",
  user: "User",
  authMethod: "Auth method",
  password: "Password",
  privateKey: "Private key",
};

export default function DeploymentCredentialsForm({
  baseUrl,
}: {
  baseUrl: string;
}) {
  const [state, setState] = useState<FormState>(createInitialState);

  useEffect(() => {
    setState(createInitialState());
  }, []);

  const errors = useMemo(() => validateForm(state), [state]);
  const isValid = Object.keys(errors).length === 0;

  const update = (patch: Partial<FormState>) => {
    setState((prev) => ({ ...prev, ...patch }));
  };

  const onAuthChange = (next: string) => {
    if (next === "password") {
      update({ authMethod: next, privateKey: "" });
    } else {
      update({ authMethod: next, password: "" });
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
            Deployment Target & Credentials
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
          gridTemplateColumns: "repeat(auto-fit, minmax(240px, 1fr))",
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
            Deploy target
          </label>
          <div style={{ display: "flex", gap: 8, marginTop: 8 }}>
            {DEPLOY_TARGETS.map((target) => (
              <button
                key={target}
                onClick={() => update({ deployTarget: target })}
                style={{
                  padding: "6px 10px",
                  borderRadius: 999,
                  border:
                    state.deployTarget === target
                      ? "1px solid #0f172a"
                      : "1px solid #cbd5e1",
                  background:
                    state.deployTarget === target ? "#0f172a" : "#fff",
                  color:
                    state.deployTarget === target ? "#fff" : "#334155",
                  fontSize: 12,
                  cursor: "pointer",
                }}
              >
                {target}
              </button>
            ))}
          </div>
          {errors.deployTarget ? (
            <p style={{ margin: "8px 0 0", color: "#b91c1c" }}>
              {errors.deployTarget}
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
            value={state.host}
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
            value={state.user}
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
        <label style={{ fontSize: 12, color: "#64748b" }}>
          Auth method
        </label>
        <div style={{ display: "flex", gap: 8, marginTop: 8 }}>
          {AUTH_METHODS.map((method) => (
            <button
              key={method}
              onClick={() => onAuthChange(method)}
              style={{
                padding: "6px 10px",
                borderRadius: 999,
                border:
                  state.authMethod === method
                    ? "1px solid #0f172a"
                    : "1px solid #cbd5e1",
                background:
                  state.authMethod === method ? "#0f172a" : "#fff",
                color:
                  state.authMethod === method ? "#fff" : "#334155",
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
            <label style={{ fontSize: 12, color: "#64748b" }}>
              Password
            </label>
            <input
              type="password"
              value={state.password}
              onChange={(e) => update({ password: e.target.value })}
              disabled={state.authMethod !== "password"}
              placeholder={
                state.authMethod === "password"
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
                  state.authMethod === "password" ? "#fff" : "#f8fafc",
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
              value={state.privateKey}
              onChange={(e) => update({ privateKey: e.target.value })}
              disabled={state.authMethod !== "private_key"}
              placeholder={
                state.authMethod === "private_key"
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
                  state.authMethod === "private_key" ? "#fff" : "#f8fafc",
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
