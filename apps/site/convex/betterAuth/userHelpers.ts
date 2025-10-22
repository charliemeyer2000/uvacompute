import { query, mutation } from "./_generated/server";
import { v } from "convex/values";

export const getUserByEmail = query({
  args: { email: v.string() },
  handler: async (ctx, args) => {
    return await ctx.db
      .query("user")
      .filter((q) => q.eq(q.field("email"), args.email))
      .first();
  },
});

export const getAllUsers = query({
  args: {},
  handler: async (ctx) => {
    return await ctx.db.query("user").collect();
  },
});

export const updateUserEarlyAccess = mutation({
  args: {
    userId: v.id("user"),
    hasEarlyAccess: v.boolean(),
  },
  handler: async (ctx, args) => {
    await ctx.db.patch(args.userId, {
      hasEarlyAccess: args.hasEarlyAccess,
    });
  },
});
