import type { Metadata, Viewport } from "next";
import "./globals.css";
export const metadata: Metadata = {
  title: "AMOR WORKFORCE | Gemeinsam. Gut geplant.",
  description: "Dienstplanung und Personalmanagement für starke Teams.",
  manifest: "/manifest.webmanifest",
  appleWebApp: {
    capable: true,
    title: "AMOR",
    statusBarStyle: "black-translucent",
  },
  icons: { icon: "/icon.svg", apple: "/icon-192.png" },
};
export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  themeColor: "#101010",
};
export default function Layout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="de" suppressHydrationWarning>
      <body>{children}</body>
    </html>
  );
}
