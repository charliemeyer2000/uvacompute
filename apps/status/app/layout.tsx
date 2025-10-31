import type { Metadata } from "next";
import { IBM_Plex_Mono } from "next/font/google";
import "./globals.css";

const ibmPlexMono = IBM_Plex_Mono({
  subsets: ["latin"],
  weight: ["100", "200", "300", "400", "500", "600", "700"],
  variable: "--font-ibm-plex-mono",
});

export const metadata: Metadata = {
  title: "uvacompute status",
  description: "Status page for uvacompute services",
  icons: {
    icon: "/favicon.svg",
  },
  openGraph: {
    title: "uvacompute status",
    description: "Status page for uvacompute services",
    images: ["/api/og"],
  },
  twitter: {
    card: "summary_large_image",
    title: "uvacompute status",
    description: "Status page for uvacompute services",
    images: ["/api/og"],
  },
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en" className="overflow-y-scroll">
      <body className={`${ibmPlexMono.variable} font-mono`}>{children}</body>
    </html>
  );
}
