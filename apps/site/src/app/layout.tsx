import { Metadata } from "next";
import "./globals.css";
import { ConvexClientProvider } from "../providers/convexClientProvider";
import { Analytics } from "@vercel/analytics/next";
import { SpeedInsights } from "@vercel/speed-insights/next";
import { VercelToolbar } from "@vercel/toolbar/next";
import { IBM_Plex_Mono } from "next/font/google";

const ibmPlexMono = IBM_Plex_Mono({
  subsets: ["latin"],
  weight: ["100", "200", "300", "400", "500", "600", "700"],
  variable: "--font-ibm-plex-mono",
});

export const metadata: Metadata = {
  title: "uvacompute",
  description:
    "High-performance cloud compute with NVIDIA RTX 5090 GPUs, flexible VMs, and serverless containers",
  icons: {
    icon: "/favicon.svg",
  },
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  const shouldInjectToolbar = !process.env.VERCEL;
  return (
    <html lang="en">
      <body className={`${ibmPlexMono.variable} font-mono`}>
        <ConvexClientProvider>{children}</ConvexClientProvider>
        <Analytics />
        <SpeedInsights />
        {shouldInjectToolbar && <VercelToolbar />}
      </body>
    </html>
  );
}
