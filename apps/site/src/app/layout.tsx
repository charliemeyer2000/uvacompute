import { Metadata } from "next";
import Script from "next/script";
import "./globals.css";
import { ConvexClientProvider } from "../providers/convexClientProvider";
import { Analytics } from "@vercel/analytics/next";
import { SpeedInsights } from "@vercel/speed-insights/next";
import { VercelToolbar } from "@vercel/toolbar/next";
import { IBM_Plex_Mono } from "next/font/google";
import { Toaster } from "@/components/ui/sonner";

const ibmPlexMono = IBM_Plex_Mono({
  subsets: ["latin"],
  weight: ["100", "200", "300", "400", "500", "600", "700"],
  variable: "--font-ibm-plex-mono",
});

export const metadata: Metadata = {
  title: "uvacompute",
  description: "your friendly local supercomputing company (at uva)",
  icons: {
    icon: "/favicon.svg",
  },
  openGraph: {
    title: "uvacompute",
    description: "your friendly local supercomputing company (at uva)",
    images: ["/api/og"],
  },
  twitter: {
    card: "summary_large_image",
    title: "uvacompute",
    description: "your friendly local supercomputing company (at uva)",
    images: ["/api/og"],
  },
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  const shouldInjectToolbar = !process.env.VERCEL;
  return (
    <html lang="en" className="overflow-y-scroll">
      <head>
        {process.env.NODE_ENV === "development" && (
          <Script
            src="//unpkg.com/react-grab/dist/index.global.js"
            crossOrigin="anonymous"
            strategy="beforeInteractive"
          />
        )}
        {process.env.NODE_ENV === "development" && (
          <Script
            src="//unpkg.com/@react-grab/claude-code/dist/client.global.js"
            strategy="lazyOnload"
          />
        )}
      </head>
      <body className={`${ibmPlexMono.variable} font-mono`}>
        <ConvexClientProvider>{children}</ConvexClientProvider>
        <Analytics />
        <SpeedInsights />
        {shouldInjectToolbar && <VercelToolbar />}
        <Toaster />
      </body>
    </html>
  );
}
