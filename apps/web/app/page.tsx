import DeploymentConsole from "./components/DeploymentConsole";

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
          background: "var(--deployer-hero-bg)",
          border: "1px solid var(--bs-border-color-translucent)",
        }}
      >
        <div style={{ display: "flex", flexWrap: "wrap", gap: 24 }}>
          <div style={{ flex: "1 1 320px" }}>
            <h1
              className="text-body"
              style={{
                margin: 0,
                fontFamily: "var(--font-display)",
                fontSize: 38,
                letterSpacing: "-0.03em",
              }}
            >
              Infinito Deployer
            </h1>
            <p
              className="text-body-secondary"
              style={{
                marginTop: 12,
                fontSize: 15,
              }}
            >
              Curate, filter, and stage deployment roles with fast client-side
              filtering and persistent selection.
            </p>
          </div>
          <div
            className="bg-body border"
            style={{
              flex: "1 1 260px",
              alignSelf: "center",
              borderRadius: 18,
              padding: 16,
            }}
          >
            <h2 className="text-body" style={{ marginTop: 0, fontSize: 16 }}>
              API Health
            </h2>
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

      <DeploymentConsole baseUrl={baseUrl} />
    </main>
  );
}
