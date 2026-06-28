import type { NextConfig } from "next";
import createWithVercelToolbar from "@vercel/toolbar/plugins/next";
const nextConfig: NextConfig = {
  experimental: {
    optimizePackageImports: ["lucide-react"],
    viewTransition: true,
  },
  images: {
    remotePatterns: [{ hostname: "lh3.googleusercontent.com" }],
  },
};

const withVercelToolbar = createWithVercelToolbar();

export default withVercelToolbar(nextConfig);
