import type { NextConfig } from "next";
import createWithVercelToolbar from "@vercel/toolbar/plugins/next";
const nextConfig: NextConfig = {
  /* config options here */
  images: {
    domains: ["lh3.googleusercontent.com"],
  },
};

const withVercelToolbar = createWithVercelToolbar();

export default withVercelToolbar(nextConfig);
