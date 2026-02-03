import DeploymentLogs from "./components/DeploymentLogs";
import RoleDashboard from "./components/RoleDashboard";
import DeploymentCredentialsForm from "./components/DeploymentCredentialsForm";

async function getHealth(
  baseUrl: string
): Promise<{ status: string } | { error: string }> {
  try {
    const res = await fetch(`${baseUrl}/health`, { cache: "no-store" });
    if (!res.ok) return { error: `HTTP ${res.status}` };
    return await res.json();
  } catch (e: any) {
    return { error: e?.message ?? "unknown error" };
  }
}

export default async function Page() {
  const baseUrl = process.env.NEXT_PUBLIC_API_BASE_URL || "http://localhost:8000";
  const health = await getHealth(baseUrl);

  return (
    <main
      style={{
        padding: "32px 24px 48px",
        maxWidth: 1100,
        margin: "0 auto",
      }}
    >
      <section
        style={{
          padding: 28,
          borderRadius: 28,
          background:
            "radial-gradient(circle at top, rgba(255, 255, 255, 0.9), rgba(226, 232, 240, 0.9))",
          border: "1px solid rgba(15, 23, 42, 0.08)",
        }}
      >
        <div style={{ display: "flex", flexWrap: "wrap", gap: 24 }}>
          <div style={{ flex: "1 1 320px" }}>
            <h1
              style={{
                margin: 0,
                fontFamily: "var(--font-display)",
                fontSize: 38,
                letterSpacing: "-0.03em",
                color: "#0f172a",
              }}
            >
              Infinito Deployer
            </h1>
            <p
              style={{
                marginTop: 12,
                color: "#475569",
                fontSize: 15,
              }}
            >
              Curate, filter, and stage deployment roles with fast client-side
              filtering and persistent selection.
            </p>
          </div>
          <div
            style={{
              flex: "1 1 260px",
              alignSelf: "center",
              background: "#fff",
              borderRadius: 18,
              padding: 16,
              border: "1px solid rgba(15, 23, 42, 0.08)",
            }}
          >
            <h2 style={{ marginTop: 0, fontSize: 16 }}>API Health</h2>
            <p style={{ margin: "8px 0 0" }}>
              API Base URL: <code>{baseUrl}</code>
            </p>
            {"status" in health ? (
              <p>
                Status: <strong>{health.status}</strong>
              </p>
            ) : (
              <p>
                Status: <strong>ERROR</strong> — <code>{health.error}</code>
              </p>
            )}
          </div>
        </div>
      </section>

      <RoleDashboard baseUrl={baseUrl} />

      <DeploymentCredentialsForm baseUrl={baseUrl} />

      <DeploymentLogs baseUrl={baseUrl} />
    </main>
  );
}
