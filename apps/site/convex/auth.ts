import { components } from "./_generated/api";
import { query } from "./_generated/server";
import { v } from "convex/values";
import { createClient, GenericCtx } from "@convex-dev/better-auth";
import { convex } from "@convex-dev/better-auth/plugins";
import { betterAuth, BetterAuthOptions } from "better-auth";
import { deviceAuthorization } from "better-auth/plugins";
import { DataModel } from "./_generated/dataModel";
import authSchema from "./betterAuth/schema";

const siteUrl = process.env.SITE_URL || "http://localhost:3000";

export const authComponent = createClient<DataModel, typeof authSchema>(
  components.betterAuth,
  {
    local: {
      schema: authSchema,
    },
  },
);

export const createAuth = (
  ctx: GenericCtx<DataModel>,
  { optionsOnly } = { optionsOnly: false },
) =>
  betterAuth({
    baseURL: siteUrl,
    logger: {
      disabled: optionsOnly,
    },
    database: authComponent.adapter(ctx),
    user: {
      additionalFields: {
        hasEarlyAccess: {
          type: "boolean",
          defaultValue: false,
        },
      },
    },
    emailAndPassword: {
      enabled: true,
      requireEmailVerification: true,
      async sendResetPassword({ user, url }) {
        const { sendPasswordResetEmail } = await import("../src/lib/email");
        await sendPasswordResetEmail({
          email: user.email,
          url,
          name: user.name,
        });
      },
      resetPasswordTokenExpiresIn: 3600,
    },
    emailVerification: {
      async sendVerificationEmail({ user, url }) {
        const { sendVerificationEmail } = await import("../src/lib/email");
        await sendVerificationEmail({
          email: user.email,
          url,
          name: user.name,
        });
      },
      async afterEmailVerification(user, request) {
        console.log(`${user.email} has been successfully verified!`);
      },
      sendOnSignUp: true,
      autoSignInAfterVerification: true,
    },
    socialProviders: {
      google: {
        clientId: process.env.GOOGLE_CLIENT_ID!,
        clientSecret: process.env.GOOGLE_CLIENT_SECRET!,
      },
      github: {
        clientId: process.env.GITHUB_CLIENT_ID!,
        clientSecret: process.env.GITHUB_CLIENT_SECRET!,
      },
    },
    plugins: [
      deviceAuthorization({
        expiresIn: "30m",
        interval: "5s",
        validateClient: async (clientId: string) => {
          return clientId === "uvacompute-cli";
        },
      }),
      convex(),
    ],
  } satisfies BetterAuthOptions);

export const getCurrentUser = query({
  args: {},
  handler: async (ctx) => {
    return await authComponent.getAuthUser(ctx);
  },
});
