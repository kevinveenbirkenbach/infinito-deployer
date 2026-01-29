import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "Infinito Deployer",
  description: "Deployment dashboard for Infinito.Nexus (WIP)",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body style={{ fontFamily: "system-ui, sans-serif", margin: 0 }}>
        {children}
      </body>
    </html>
  );
}
