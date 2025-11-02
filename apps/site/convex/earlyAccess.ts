import {
  query,
  mutation,
  internalMutation,
  internalAction,
} from "./_generated/server";
import { v } from "convex/values";
import { components, internal } from "./_generated/api";
import { authComponent } from "./auth";

export const hasEarlyAccess = query({
  args: {},
  returns: v.boolean(),
  handler: async (ctx) => {
    try {
      const user = await authComponent.getAuthUser(ctx);
      if (!user) return false;

      if (user.hasEarlyAccess) {
        return true;
      }

      const adminUsers =
        process.env.ADMIN_USERS?.split(",").map((email) => email.trim()) || [];
      if (adminUsers.includes(user.email)) {
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

export const hasPendingEarlyAccessRequest = query({
  args: {},
  returns: v.boolean(),
  handler: async (ctx) => {
    try {
      const user = await authComponent.getAuthUser(ctx);
      if (!user) return false;

      const token = await ctx.db
        .query("earlyAccessTokens")
        .withIndex("by_email", (q) => q.eq("email", user.email))
        .first();

      return !!token;
    } catch (error) {
      return false;
    }
  },
});

export const syncEarlyAccessFromToken = mutation({
  args: {},
  returns: v.boolean(),
  handler: async (ctx) => {
    try {
      const user = await authComponent.getAuthUser(ctx);
      if (!user) return false;

      if (user.hasEarlyAccess) {
        return true;
      }

      const adminUsers =
        process.env.ADMIN_USERS?.split(",").map((email) => email.trim()) || [];
      if (adminUsers.includes(user.email)) {
        await ctx.runMutation(
          components.betterAuth.userHelpers.updateUserEarlyAccess,
          {
            userId: user._id,
            hasEarlyAccess: true,
          },
        );
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
  args: { userId: v.string() },
  returns: v.null(),
  handler: async (ctx, args) => {
    const adminUser = await authComponent.getAuthUser(ctx);
    if (!adminUser?.email) {
      throw new Error("Unauthorized");
    }

    const allowedAdmins =
      process.env.ADMIN_USERS?.split(",").map((email) => email.trim()) || [];
    if (!allowedAdmins.includes(adminUser.email)) {
      throw new Error("Unauthorized");
    }

    const user = await ctx.runQuery(
      components.betterAuth.userHelpers.getUserById,
      { userId: args.userId as any },
    );

    if (!user) {
      throw new Error("User not found");
    }

    await approveUserAndSendEmail(ctx, user);

    return null;
  },
});

export const revokeAccess = mutation({
  args: { userId: v.string() },
  returns: v.null(),
  handler: async (ctx, args) => {
    const adminUser = await authComponent.getAuthUser(ctx);
    if (!adminUser?.email) {
      throw new Error("Unauthorized");
    }

    const allowedAdmins =
      process.env.ADMIN_USERS?.split(",").map((email) => email.trim()) || [];
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
  args: {},
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
  handler: async (ctx) => {
    try {
      const adminUser = await authComponent.getAuthUser(ctx);
      if (!adminUser?.email) {
        return [];
      }

      const allowedAdmins =
        process.env.ADMIN_USERS?.split(",").map((email) => email.trim()) || [];
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
  args: {},
  returns: v.array(
    v.object({
      _id: v.id("earlyAccessTokens"),
      email: v.string(),
      reason: v.string(),
      approved: v.boolean(),
      createdAt: v.number(),
    }),
  ),
  handler: async (ctx) => {
    try {
      const adminUser = await authComponent.getAuthUser(ctx);
      if (!adminUser?.email) {
        return [];
      }

      const allowedAdmins =
        process.env.ADMIN_USERS?.split(",").map((email) => email.trim()) || [];
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

async function approveUserAndSendEmail(
  ctx: any,
  user: { _id: string; email: string; name: string },
) {
  await ctx.runMutation(
    components.betterAuth.userHelpers.updateUserEarlyAccess,
    {
      userId: user._id,
      hasEarlyAccess: true,
    },
  );

  await ctx.scheduler.runAfter(0, internal.earlyAccess.sendApprovalEmail, {
    email: user.email,
    name: user.name,
  });
}

export const approveUserByEmail = internalMutation({
  args: { email: v.string() },
  returns: v.union(
    v.object({ success: v.literal(true), userId: v.string() }),
    v.object({ success: v.literal(false), error: v.string() }),
  ),
  handler: async (ctx, args) => {
    const user = await ctx.runQuery(
      components.betterAuth.userHelpers.getUserByEmail,
      {
        email: args.email,
      },
    );

    if (!user) {
      return { success: false as const, error: "User not found" };
    }

    await approveUserAndSendEmail(ctx, user);

    return { success: true as const, userId: user._id };
  },
});

export const sendApprovalEmail = internalAction({
  args: { email: v.string(), name: v.string() },
  returns: v.null(),
  handler: async (ctx, args) => {
    const { sendEarlyAccessApprovalEmail } = await import("../src/lib/email");
    await sendEarlyAccessApprovalEmail({
      email: args.email,
      name: args.name,
    });
    return null;
  },
});
