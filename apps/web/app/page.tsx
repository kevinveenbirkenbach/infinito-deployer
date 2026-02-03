import DeploymentLogs from "./components/DeploymentLogs";

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
    <main style={{ padding: 24, maxWidth: 960, margin: "0 auto" }}>
      <h1 style={{ marginTop: 0 }}>Infinito Deployer (Bootstrap)</h1>
      <p>
        This is a minimal bootstrap UI. Next steps: role catalog tiles, filtering, inventory preview, deployment jobs.
      </p>

      <section style={{ padding: 16, border: "1px solid #ddd", borderRadius: 12 }}>
        <h2 style={{ marginTop: 0 }}>API Health</h2>
        <p>
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
      </section>

      <DeploymentLogs baseUrl={baseUrl} />
    </main>
  );
}
