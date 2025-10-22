import { query, mutation } from "./_generated/server";
import { v } from "convex/values";

export const getCurrentUserByToken = query({
  args: { token: v.string() },
  handler: async (ctx, args) => {
    const session = await ctx.db
      .query("session")
      .withIndex("token", (q) => q.eq("token", args.token))
      .first();

    if (!session || session.expiresAt < Date.now()) {
      return null;
    }

    return await ctx.db.get(session.userId as any);
  },
});

export const getCurrentUserByTokenMutation = mutation({
  args: { token: v.string() },
  handler: async (ctx, args) => {
    const session = await ctx.db
      .query("session")
      .withIndex("token", (q) => q.eq("token", args.token))
      .first();

    if (!session || session.expiresAt < Date.now()) {
      return null;
    }

    return await ctx.db.get(session.userId as any);
  },
});
