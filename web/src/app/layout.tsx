import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "Homeward — Family AI Safety",
  description: "Local-first AI safety gateway for families. Keep kids safe with age-appropriate AI chat.",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body className="min-h-screen antialiased">{children}</body>
    </html>
  );
}
