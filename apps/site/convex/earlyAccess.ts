import { query, mutation } from "./_generated/server";
import { v } from "convex/values";
import { components } from "./_generated/api";

export const hasEarlyAccess = query({
  args: { token: v.string() },
  returns: v.boolean(),
  handler: async (ctx, args) => {
    try {
      const user = await ctx.runQuery(
        components.betterAuth.currentUser.getCurrentUserByToken,
        { token: args.token },
      );
      if (!user) return false;

      if (user.hasEarlyAccess) {
        return true;
      }

      const approvedToken = await ctx.db
        .query("earlyAccessTokens")
        .withIndex("by_email_and_approved", (q) =>
          q.eq("email", user.email).eq("approved", true),
        )
        .first();

      return !!approvedToken;
    } catch (error) {
      return false;
    }
  },
});

export const syncEarlyAccessFromToken = mutation({
  args: { token: v.string() },
  returns: v.boolean(),
  handler: async (ctx, args) => {
    try {
      const user = await ctx.runMutation(
        components.betterAuth.currentUser.getCurrentUserByTokenMutation,
        { token: args.token },
      );
      if (!user) return false;

      if (user.hasEarlyAccess) {
        return true;
      }

      const approvedToken = await ctx.db
        .query("earlyAccessTokens")
        .withIndex("by_email_and_approved", (q) =>
          q.eq("email", user.email).eq("approved", true),
        )
        .first();

      if (approvedToken) {
        await ctx.runMutation(
          components.betterAuth.userHelpers.updateUserEarlyAccess,
          {
            userId: user._id,
            hasEarlyAccess: true,
          },
        );
        return true;
      }

      return false;
    } catch (error) {
      return false;
    }
  },
});

export const grantAccess = mutation({
  args: { userId: v.string(), token: v.string() },
  returns: v.null(),
  handler: async (ctx, args) => {
    const adminUser = await ctx.runMutation(
      components.betterAuth.currentUser.getCurrentUserByTokenMutation,
      { token: args.token },
    );
    if (!adminUser?.email) {
      throw new Error("Unauthorized");
    }

    const allowedAdmins =
      process.env.DEV_TOOLS_ALLOWED_USERS?.split(",").map((email) =>
        email.trim(),
      ) || [];
    if (!allowedAdmins.includes(adminUser.email)) {
      throw new Error("Unauthorized");
    }

    await ctx.runMutation(
      components.betterAuth.userHelpers.updateUserEarlyAccess,
      {
        userId: args.userId as any,
        hasEarlyAccess: true,
      },
    );

    return null;
  },
});

export const revokeAccess = mutation({
  args: { userId: v.string(), token: v.string() },
  returns: v.null(),
  handler: async (ctx, args) => {
    const adminUser = await ctx.runMutation(
      components.betterAuth.currentUser.getCurrentUserByTokenMutation,
      { token: args.token },
    );
    if (!adminUser?.email) {
      throw new Error("Unauthorized");
    }

    const allowedAdmins =
      process.env.DEV_TOOLS_ALLOWED_USERS?.split(",").map((email) =>
        email.trim(),
      ) || [];
    if (!allowedAdmins.includes(adminUser.email)) {
      throw new Error("Unauthorized");
    }

    await ctx.runMutation(
      components.betterAuth.userHelpers.updateUserEarlyAccess,
      {
        userId: args.userId as any,
        hasEarlyAccess: false,
      },
    );

    return null;
  },
});

export const listEarlyAccessRequests = query({
  args: { token: v.string() },
  returns: v.array(
    v.object({
      _id: v.string(),
      name: v.string(),
      email: v.string(),
      hasEarlyAccess: v.boolean(),
      emailVerified: v.boolean(),
      createdAt: v.number(),
      hasApprovedToken: v.boolean(),
    }),
  ),
  handler: async (ctx, args) => {
    try {
      const adminUser = await ctx.runQuery(
        components.betterAuth.currentUser.getCurrentUserByToken,
        { token: args.token },
      );
      if (!adminUser?.email) {
        return [];
      }

      const allowedAdmins =
        process.env.DEV_TOOLS_ALLOWED_USERS?.split(",").map((email) =>
          email.trim(),
        ) || [];
      if (!allowedAdmins.includes(adminUser.email)) {
        return [];
      }

      const users = await ctx.runQuery(
        components.betterAuth.userHelpers.getAllUsers,
      );
      const tokens = await ctx.db.query("earlyAccessTokens").collect();

      const tokensByEmail = new Map(tokens.map((t) => [t.email, t.approved]));

      return users.map((user: any) => ({
        _id: user._id,
        name: user.name,
        email: user.email,
        hasEarlyAccess: user.hasEarlyAccess ?? false,
        emailVerified: user.emailVerified,
        createdAt: user.createdAt,
        hasApprovedToken: tokensByEmail.get(user.email) ?? false,
      }));
    } catch (error) {
      return [];
    }
  },
});

export const listPendingTokens = query({
  args: { token: v.string() },
  returns: v.array(
    v.object({
      _id: v.id("earlyAccessTokens"),
      email: v.string(),
      reason: v.string(),
      approved: v.boolean(),
      createdAt: v.number(),
    }),
  ),
  handler: async (ctx, args) => {
    try {
      const adminUser = await ctx.runQuery(
        components.betterAuth.currentUser.getCurrentUserByToken,
        { token: args.token },
      );
      if (!adminUser?.email) {
        return [];
      }

      const allowedAdmins =
        process.env.DEV_TOOLS_ALLOWED_USERS?.split(",").map((email) =>
          email.trim(),
        ) || [];
      if (!allowedAdmins.includes(adminUser.email)) {
        return [];
      }

      const tokens = await ctx.db.query("earlyAccessTokens").collect();
      const users = await ctx.runQuery(
        components.betterAuth.userHelpers.getAllUsers,
      );
      const userEmails = new Set(users.map((u: any) => u.email));

      return tokens
        .filter((token) => !userEmails.has(token.email))
        .map((token) => ({
          _id: token._id,
          email: token.email,
          reason: token.reason,
          approved: token.approved,
          createdAt: token.createdAt,
        }));
    } catch (error) {
      return [];
    }
  },
});
