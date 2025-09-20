import { components } from "./_generated/api";
import { query, QueryCtx } from "./_generated/server";
import authSchema from "./betterAuth/schema.js";
import { createClient, GenericCtx } from "@convex-dev/better-auth";
import { convex } from "@convex-dev/better-auth/plugins";
import { betterAuth, BetterAuthOptions } from "better-auth";
import { deviceAuthorization } from "better-auth/plugins";
import { DataModel } from "./_generated/dataModel";

const siteUrl = process.env.SITE_URL || "http://localhost:3000";

export const betterAuthComponent = createClient<DataModel, typeof authSchema>(
  components.betterAuth,
  {
    local: {
      schema: authSchema,
    },
    verbose: false,
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
    database: betterAuthComponent.adapter(ctx),
    emailAndPassword: {
      enabled: true,
      requireEmailVerification: false, // Simplified for now
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

export const safeGetUser = async (ctx: QueryCtx) => {
  return betterAuthComponent.safeGetAuthUser(ctx);
};

export const getUser = async (ctx: QueryCtx) => {
  return betterAuthComponent.getAuthUser(ctx);
};

export const getCurrentUser = query({
  args: {},
  handler: async (ctx) => {
    return safeGetUser(ctx);
  },
});
