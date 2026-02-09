import "@xterm/xterm/css/xterm.css";
import "react-quill/dist/quill.snow.css";
import type { Metadata } from "next";
import { Space_Grotesk, Work_Sans } from "next/font/google";
import type { ReactNode } from "react";

const displayFont = Space_Grotesk({
  subsets: ["latin"],
  weight: ["400", "500", "600", "700"],
  variable: "--font-display",
});

const bodyFont = Work_Sans({
  subsets: ["latin"],
  weight: ["400", "500", "600"],
  variable: "--font-body",
});

export const metadata: Metadata = {
  title: "Infinito Deployer",
  description: "Deployment dashboard for Infinito.Nexus (WIP)",
};

export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    <html lang="en">
      <body
        className={`${displayFont.variable} ${bodyFont.variable}`}
        style={{
          fontFamily: "var(--font-body)",
          margin: 0,
          background:
            "linear-gradient(140deg, rgba(248, 250, 252, 1), rgba(240, 253, 250, 0.7))",
          color: "#0f172a",
        }}
      >
        {children}
      </body>
    </html>
  );
}
