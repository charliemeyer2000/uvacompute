import { Metadata } from "next";
import "./globals.css";
import { ConvexClientProvider } from "./providers/convexClientProvider";

export const metadata: Metadata = {
  title: "uvacompute",
  description: "your friendly local compute cluster",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en">
      <body>
        <ConvexClientProvider>{children}</ConvexClientProvider>
      </body>
    </html>
  );
}
