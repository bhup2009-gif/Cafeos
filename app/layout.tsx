import type { Metadata, Viewport } from "next";
import "./globals.css";
export const metadata: Metadata = {
  title: "CaféOS — A little less busywork.",
  description:
    "A thoughtful workspace for your café. Orders, kitchen, billing and stock, together.",
  manifest: "/manifest.webmanifest",
  appleWebApp: { capable: true, title: "CaféOS", statusBarStyle: "default" },
};
export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  themeColor: "#faf9f6",
};
export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}
