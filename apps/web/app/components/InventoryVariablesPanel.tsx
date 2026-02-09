"use client";

import { useEffect, useMemo, useState } from "react";
import { buildInventoryVars } from "../lib/inventory_vars";

type KeyValue = { key: string; value: string; id: string };

type CredentialsState = {
  deployTarget: string;
  host: string;
  user: string;
  authMethod: string;
  password: string;
  privateKey: string;
};

type InventoryPanelProps = {
  baseUrl: string;
  selectedRoles: string[];
  credentials: CredentialsState;
  inventoryReady?: boolean;
  onVarsChange?: (
    vars: Record<string, any> | null,
    error: string | null
  ) => void;
};

function newRow() {
  return {
    key: "",
    value: "",
    id: `${Date.now()}-${Math.random().toString(16).slice(2)}`,
  };
}

export default function InventoryVariablesPanel({
  baseUrl,
  selectedRoles,
  credentials,
  inventoryReady = true,
  onVarsChange,
}: InventoryPanelProps) {
  const [jsonText, setJsonText] = useState("{\n  \n}");
  const [pairs, setPairs] = useState<KeyValue[]>([]);
  const [previewYaml, setPreviewYaml] = useState<string | null>(null);
  const [previewWarnings, setPreviewWarnings] = useState<string[]>([]);
  const [previewError, setPreviewError] = useState<string | null>(null);
  const [previewLoading, setPreviewLoading] = useState(false);

  const parsed = useMemo(
    () => buildInventoryVars(jsonText, pairs),
    [jsonText, pairs]
  );

  const jsonError = parsed.error;

  useEffect(() => {
    onVarsChange?.(parsed.value, parsed.error);
  }, [parsed.value, parsed.error, onVarsChange]);

  const canPreview =
    inventoryReady &&
    !jsonError &&
    selectedRoles.length > 0 &&
    credentials.host &&
    credentials.user &&
    credentials.deployTarget &&
    credentials.authMethod &&
    ((credentials.authMethod === "password" && credentials.password) ||
      (credentials.authMethod === "private_key" &&
        credentials.privateKey));

  const updatePair = (id: string, patch: Partial<KeyValue>) => {
    setPairs((prev) =>
      prev.map((row) => (row.id === id ? { ...row, ...patch } : row))
    );
  };

  const removePair = (id: string) => {
    setPairs((prev) => prev.filter((row) => row.id !== id));
  };

  const addPair = () => {
    setPairs((prev) => [...prev, newRow()]);
  };

  const previewInventory = async () => {
    if (!canPreview || parsed.error) return;
    setPreviewLoading(true);
    setPreviewError(null);
    setPreviewYaml(null);
    setPreviewWarnings([]);

    const payload = {
      deploy_target: credentials.deployTarget,
      host: credentials.host,
      user: credentials.user,
      auth: {
        method: credentials.authMethod,
        password:
          credentials.authMethod === "password"
            ? credentials.password
            : undefined,
        private_key:
          credentials.authMethod === "private_key"
            ? credentials.privateKey
            : undefined,
      },
      selected_roles: selectedRoles,
      inventory_vars: parsed.value ?? {},
    };

    try {
      const res = await fetch(`${baseUrl}/api/inventories/preview`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });
      if (!res.ok) {
        let message = `HTTP ${res.status}`;
        try {
          const data = await res.json();
          if (data?.detail) {
            message = data.detail;
          }
        } catch {
          // ignore
        }
        throw new Error(message);
      }
      const data = await res.json();
      setPreviewYaml(data.inventory_yaml || "");
      setPreviewWarnings(data.warnings || []);
    } catch (err: any) {
      setPreviewError(err?.message ?? "Preview failed");
    } finally {
      setPreviewLoading(false);
    }
  };

  return (
    <section
      style={{
        marginTop: 28,
        padding: 24,
        borderRadius: 24,
        background:
          "linear-gradient(120deg, rgba(255, 251, 235, 0.92), rgba(239, 246, 255, 0.92))",
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
            Inventory Variables
          </h2>
          <p style={{ margin: "8px 0 0", color: "#475569" }}>
            Provide JSON vars or add key/value pairs. Preview uses the same
            schema as deployment to ensure parity.
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
          Selected roles:{" "}
          <strong>
            {selectedRoles.length === 0 ? "none" : selectedRoles.length}
          </strong>
        </div>
      </div>

      <div
        style={{
          marginTop: 20,
          display: "grid",
          gridTemplateColumns: "repeat(auto-fit, minmax(260px, 1fr))",
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
            JSON editor
          </label>
          <textarea
            value={jsonText}
            onChange={(e) => setJsonText(e.target.value)}
            rows={10}
            spellCheck={false}
            style={{
              width: "100%",
              marginTop: 8,
              padding: "12px",
              borderRadius: 12,
              border: "1px solid #cbd5e1",
              fontFamily:
                "ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, 'Liberation Mono', 'Courier New', monospace",
              fontSize: 12,
              background: "#0f172a",
              color: "#e2e8f0",
            }}
          />
          {jsonError ? (
            <p style={{ margin: "8px 0 0", color: "#b91c1c" }}>
              {jsonError}
            </p>
          ) : (
            <p style={{ margin: "8px 0 0", color: "#64748b" }}>
              Provide a JSON object. Empty JSON is treated as an empty map.
            </p>
          )}
        </div>

        <div
          style={{
            padding: 16,
            borderRadius: 18,
            background: "#fff",
            border: "1px solid rgba(15, 23, 42, 0.1)",
          }}
        >
          <div style={{ display: "flex", justifyContent: "space-between" }}>
            <label style={{ fontSize: 12, color: "#64748b" }}>
              Optional key/value overrides
            </label>
            <button
              onClick={addPair}
              style={{
                padding: "4px 10px",
                borderRadius: 999,
                border: "1px solid #0f172a",
                background: "#0f172a",
                color: "#fff",
                fontSize: 12,
                cursor: "pointer",
              }}
            >
              Add row
            </button>
          </div>
          {pairs.length === 0 ? (
            <p style={{ marginTop: 12, color: "#64748b", fontSize: 13 }}>
              No overrides yet. Add a key/value pair to inject extra vars.
            </p>
          ) : (
            <div style={{ display: "grid", gap: 10, marginTop: 12 }}>
              {pairs.map((pair) => (
                <div
                  key={pair.id}
                  style={{
                    display: "grid",
                    gridTemplateColumns: "1fr 1fr auto",
                    gap: 8,
                    alignItems: "center",
                  }}
                >
                  <input
                    value={pair.key}
                    onChange={(e) =>
                      updatePair(pair.id, { key: e.target.value })
                    }
                    placeholder="key"
                    style={{
                      padding: "8px 10px",
                      borderRadius: 10,
                      border: "1px solid #cbd5e1",
                    }}
                  />
                  <input
                    value={pair.value}
                    onChange={(e) =>
                      updatePair(pair.id, { value: e.target.value })
                    }
                    placeholder="value"
                    style={{
                      padding: "8px 10px",
                      borderRadius: 10,
                      border: "1px solid #cbd5e1",
                    }}
                  />
                  <button
                    onClick={() => removePair(pair.id)}
                    style={{
                      border: "1px solid #cbd5e1",
                      background: "#fff",
                      borderRadius: 10,
                      padding: "6px 10px",
                      cursor: "pointer",
                    }}
                  >
                    Remove
                  </button>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>

      <div style={{ marginTop: 16 }}>
        <button
          onClick={previewInventory}
          disabled={!canPreview || previewLoading}
          style={{
            padding: "10px 16px",
            borderRadius: 999,
            border: "1px solid #0f172a",
            background: canPreview ? "#0f172a" : "#e2e8f0",
            color: canPreview ? "#fff" : "#64748b",
            cursor: canPreview ? "pointer" : "not-allowed",
          }}
        >
          {previewLoading ? "Previewing..." : "Preview Inventory"}
        </button>
        {!inventoryReady ? (
          <span style={{ marginLeft: 12, color: "#b91c1c", fontSize: 12 }}>
            Generate inventory first to enable preview.
          </span>
        ) : !canPreview ? (
          <span style={{ marginLeft: 12, color: "#b91c1c", fontSize: 12 }}>
            Fill credentials, select roles, and fix JSON before previewing.
          </span>
        ) : null}
      </div>

      {previewError ? (
        <div
          style={{
            marginTop: 12,
            padding: 12,
            borderRadius: 12,
            background: "#fee2e2",
            color: "#991b1b",
            fontSize: 12,
          }}
        >
          {previewError}
        </div>
      ) : null}

      {previewYaml ? (
        <div
          style={{
            marginTop: 16,
            padding: 16,
            borderRadius: 18,
            background: "#0b0f19",
            color: "#e2e8f0",
            border: "1px solid #1f2937",
            fontFamily:
              "ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, 'Liberation Mono', 'Courier New', monospace",
            fontSize: 12,
            whiteSpace: "pre-wrap",
          }}
        >
          {previewYaml}
        </div>
      ) : null}

      {previewWarnings.length > 0 ? (
        <div style={{ marginTop: 12, color: "#b45309", fontSize: 12 }}>
          {previewWarnings.map((warning) => (
            <div key={warning}>{`WARN ${warning}`}</div>
          ))}
        </div>
      ) : null}
    </section>
  );
}
