import { betterAuth as ba } from "better-auth";
import { drizzleAdapter } from "better-auth/adapters/drizzle";
import { bearer } from "better-auth/plugins";
import { db } from "@/lib/db";
import { createAuthClient } from "better-auth/react";

export const betterAuth = ba({
  database: drizzleAdapter(db, {
    provider: "pg",
  }),
  plugins: [bearer()],
  secret: process.env.BETTER_AUTH_SECRET!,
  baseURL: process.env.BETTER_AUTH_URL!,
  emailAndPassword: {
    enabled: true,
  },
  socialProviders: {
    github: {
      clientId: process.env.GITHUB_CLIENT_ID!,
      clientSecret: process.env.GITHUB_CLIENT_SECRET!,
    },
    google: {
      prompt: "select_account+consent",
      accessType: "offline",
      clientId: process.env.GOOGLE_CLIENT_ID!,
      clientSecret: process.env.GOOGLE_CLIENT_SECRET!,
    },
  },
  trustedOrigins: [
    "uvacompute.com",
    "www.uvacompute.com",
    "preview.uvacompute.com",
    "www.preview.uvacompute.com",
    "https://uvacompute.com",
    "https://www.uvacompute.com",
    "https://preview.uvacompute.com",
    "https://www.preview.uvacompute.com",
    "https://www.preview.uvacompute.com",
    "http://localhost:3000",
  ],
});

export const authClient = createAuthClient({
  baseURL: process.env.BETTER_AUTH_URL!,
});
