import type { Metadata } from "next";
import "./globals.css";

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
      <body>{children}</body>
    </html>
  );
}
