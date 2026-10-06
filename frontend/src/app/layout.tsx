import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "Electrical Load Optimizer",
  description: "AI-powered electrical load analysis and energy optimization",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}
