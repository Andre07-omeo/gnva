import type { Metadata, Viewport } from "next";
import { IBM_Plex_Sans, IBM_Plex_Mono } from "next/font/google";
import "./globals.css";
import { Providers } from "./providers";
import { InstallationPWA } from "@/components/pwa";
export const dynamic = "force-dynamic";

const sans = IBM_Plex_Sans({ subsets: ["latin"], weight: ["400", "500", "600", "700"], variable: "--f-sans" });
const mono = IBM_Plex_Mono({ subsets: ["latin"], weight: ["400", "500", "600"], variable: "--f-mono" });

export const metadata: Metadata = {
  title: "GNVA - Gestion Numérique de Validation des Autocollants",
  description: "Traçabilité territoriale des autocollants QR, assujettis et recouvrements en RDC.",
  manifest: "/manifest.webmanifest",
  icons: { icon: "/icons/icon-32.png", apple: "/icons/icon-180.png" },
  appleWebApp: { capable: true, title: "GNVA", statusBarStyle: "default" },
};
export const viewport: Viewport = { width: "device-width", initialScale: 1, themeColor: "#1757aa" };

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="fr" className={`${sans.variable} ${mono.variable}`}>
      <body>
        <Providers>{children}<InstallationPWA /></Providers>
      </body>
    </html>
  );
}
