import DeploymentConsole from "./components/DeploymentConsole";

export default function Page() {
  const configuredBaseUrl = (process.env.NEXT_PUBLIC_API_BASE_URL || "").trim();
  const baseUrl =
    !configuredBaseUrl || configuredBaseUrl === "http://localhost:8000"
      ? ""
      : configuredBaseUrl;
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
            Infinito.Nexus Store
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
            display: "flex",
            flexDirection: "column",
            alignItems: "center",
            gap: 8,
            minWidth: 160,
          }}
        >
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
          <div
            id="workspace-switcher-slot"
            style={{ width: "100%", display: "grid", placeItems: "center" }}
          />
        </div>
      </header>

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
            "Support",
            "Source Code",
            "Follow Us",
            "Contact",
            "Imprint",
          ].map((label) => (
            <span
              key={label}
              style={{
                color: "var(--bs-secondary-color)",
                fontSize: 12,
                textDecoration: "underline",
                textUnderlineOffset: "2px",
                cursor: "pointer",
              }}
            >
              {label}
            </span>
          ))}
        </div>
        <span className="text-body-secondary" style={{ fontSize: 12 }}>
          Infinito.Nexus by Kevin Veen-Birkenbach
        </span>
      </div>
    </main>
  );
}
