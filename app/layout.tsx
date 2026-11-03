import type { Metadata, Viewport } from "next";
import { Geist, Geist_Mono } from "next/font/google";
import "./globals.css";
import { ServiceWorkerRegistrar } from "@/components/ServiceWorkerRegistrar";

const geistSans = Geist({
  variable: "--font-geist-sans",
  subsets: ["latin"],
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

export const metadata: Metadata = {
  title: "CRM Chatting",
  description: "Shift tracking, planning and payroll for the agency.",
  applicationName: "CRM Chatting",
  // iOS ignore le manifeste pour ces trois points et n'obéit qu'à ses propres
  // balises : sans elles, l'app installée garderait la barre d'adresse et une
  // icône générée à partir d'une capture de la page.
  appleWebApp: {
    capable: true,
    title: "CRM Chatting",
    // Le contenu passe sous la barre d'état, qui devient claire sur notre
    // fond sombre — cohérent avec les zones sûres gérées dans globals.css.
    statusBarStyle: "black-translucent",
  },
  icons: {
    icon: [
      { url: "/icon-192.png", sizes: "192x192", type: "image/png" },
      { url: "/icon-512.png", sizes: "512x512", type: "image/png" },
    ],
    apple: [{ url: "/apple-icon-180.png", sizes: "180x180", type: "image/png" }],
  },
  // Un CRM interne n'a rien à faire dans un moteur de recherche.
  robots: { index: false, follow: false },
  other: {
    // Next n'émet que `mobile-web-app-capable`, la balise standard récente.
    // Les iOS antérieurs à 15.4 n'ouvrent en plein écran que sur la balise
    // Apple d'origine : sans elle, l'app installée garde la barre d'adresse.
    "apple-mobile-web-app-capable": "yes",
  },
};

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  // Empêche le zoom au double-tap une fois installée : le comportement
  // attendu d'une app, pas d'une page web.
  maximumScale: 1,
  // "cover" lets the fixed bottom nav extend under the iPhone home bar,
  // padded back via env(safe-area-inset-bottom).
  viewportFit: "cover",
  themeColor: "#0a0e16",
};

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    <html
      lang="fr"
      className={`${geistSans.variable} ${geistMono.variable} h-full antialiased`}
    >
      <body className="min-h-full flex flex-col">
        <ServiceWorkerRegistrar />
        {children}
      </body>
    </html>
  );
}
