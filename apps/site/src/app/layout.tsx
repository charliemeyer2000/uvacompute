import { Metadata } from "next";
import "./globals.css";
import { ConvexClientProvider } from "./providers/convexClientProvider";
import { Analytics } from "@vercel/analytics/next";
import { VercelToolbar } from "@vercel/toolbar/next";

export const metadata: Metadata = {
  title: "uvacompute",
  description: "your friendly local compute cluster",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  const shouldInjectToolbar = !process.env.VERCEL;
  return (
    <html lang="en">
      <body>
        <ConvexClientProvider>{children}</ConvexClientProvider>
        <Analytics />
        {shouldInjectToolbar && <VercelToolbar />}
      </body>
    </html>
  );
}
