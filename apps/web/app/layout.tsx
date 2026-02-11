import "bootstrap/dist/css/bootstrap.min.css";
import "@xterm/xterm/css/xterm.css";
import "react-quill/dist/quill.snow.css";
import "./globals.css";
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
        className={`deployer-body ${displayFont.variable} ${bodyFont.variable}`}
      >
        {children}
      </body>
    </html>
  );
}
