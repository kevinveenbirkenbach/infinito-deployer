import "bootstrap/dist/css/bootstrap.min.css";
import "@fortawesome/fontawesome-free/css/all.min.css";
import "@xterm/xterm/css/xterm.css";
import "react-quill/dist/quill.snow.css";
import "./globals.css";
import type { Metadata } from "next";
import type { ReactNode } from "react";

export const metadata: Metadata = {
  title: "Infinito.Nexus Store",
  description: "Software on your infrastructure. Data under your control.",
};

export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    <html lang="en">
      <body className="deployer-body">
        {children}
      </body>
    </html>
  );
}
