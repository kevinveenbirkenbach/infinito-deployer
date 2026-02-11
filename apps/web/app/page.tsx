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
  const statusLabel =
    "status" in health ? String(health.status || "OK") : "ERROR";
  const logoUrl =
    process.env.NEXT_PUBLIC_BRAND_LOGO_URL || "/brand-logo.png";

  return (
    <main
      style={{
        padding: "24px",
        height: "100vh",
        maxWidth: 1180,
        margin: "0 auto",
        display: "flex",
        flexDirection: "column",
        gap: 16,
        overflow: "hidden",
      }}
    >
      <header
        style={{
          display: "flex",
          alignItems: "center",
          justifyContent: "space-between",
          gap: 24,
        }}
      >
        <div style={{ flex: "1 1 420px" }}>
          <h1
            className="text-body"
            style={{
              margin: 0,
              fontFamily: "var(--font-display)",
              fontSize: 34,
              letterSpacing: "-0.03em",
            }}
          >
            Infinito.Nexus Software Center
          </h1>
          <p
            className="text-body-secondary"
            style={{
              marginTop: 8,
              fontSize: 15,
            }}
          >
            Software on your infrastructure. Data under your control.
          </p>
        </div>
        <div
          style={{
            width: 64,
            height: 64,
            borderRadius: "50%",
            background: "var(--bs-body-bg)",
            border: "1px solid var(--bs-border-color-translucent)",
            display: "grid",
            placeItems: "center",
            overflow: "hidden",
            boxShadow: "var(--deployer-shadow)",
          }}
          aria-label="Infinito.Nexus logo"
        >
          {logoUrl ? (
            <img
              src={logoUrl}
              alt="Infinito.Nexus logo"
              style={{ width: "100%", height: "100%", objectFit: "contain" }}
            />
          ) : (
            <i className="fa-solid fa-circle-nodes" aria-hidden="true" />
          )}
        </div>
      </header>

      <div
        style={{
          display: "flex",
          flexWrap: "wrap",
          gap: 8,
          alignItems: "center",
          justifyContent: "space-between",
        }}
      >
        <div style={{ display: "flex", flexWrap: "wrap", gap: 8 }}>
          {["Apps", "Toggle", "Tab", "Reload"].map((label) => (
            <button
              key={label}
              style={{
                padding: "6px 10px",
                borderRadius: 999,
                border: "1px solid var(--bs-border-color)",
                background: "var(--bs-body-bg)",
                color: "var(--bs-body-color)",
                fontSize: 12,
                cursor: "pointer",
              }}
            >
              {label}
            </button>
          ))}
        </div>
        <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
          <span className="text-body-secondary" style={{ fontSize: 12 }}>
            API: <code>{baseUrl}</code>
          </span>
          <span
            style={{
              padding: "4px 10px",
              borderRadius: 999,
              border: "1px solid var(--bs-border-color)",
              background: "var(--bs-body-bg)",
              fontSize: 12,
            }}
          >
            Status: {statusLabel}
          </span>
        </div>
      </div>

      <section
        style={{
          flex: 1,
          minHeight: 0,
          padding: 0,
          borderRadius: 0,
          background: "transparent",
          border: "none",
          overflow: "hidden",
        }}
      >
        <div style={{ height: "100%", overflow: "hidden" }}>
          <DeploymentConsole baseUrl={baseUrl} />
        </div>
      </section>

      <div
        style={{
          display: "flex",
          flexWrap: "wrap",
          gap: 8,
          alignItems: "center",
          justifyContent: "space-between",
        }}
      >
        <div style={{ display: "flex", flexWrap: "wrap", gap: 8 }}>
          {[
            "Documentation",
            "Solutions",
            "Source Code",
            "Follow Us",
            "Contact",
            "Imprint",
          ].map((label) => (
            <button
              key={label}
              style={{
                padding: "6px 10px",
                borderRadius: 999,
                border: "1px solid var(--bs-border-color)",
                background: "var(--bs-body-bg)",
                color: "var(--bs-body-color)",
                fontSize: 12,
                cursor: "pointer",
              }}
            >
              {label}
            </button>
          ))}
        </div>
        <span className="text-body-secondary" style={{ fontSize: 12 }}>
          Infinito.Nexus by Kevin Veen-Birkenbach
        </span>
      </div>
    </main>
  );
}
