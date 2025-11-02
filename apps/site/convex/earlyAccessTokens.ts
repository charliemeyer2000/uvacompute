import { mutation } from "./_generated/server";
import { v } from "convex/values";
import { components, internal } from "./_generated/api";

function generateToken(): string {
  return Array.from(crypto.getRandomValues(new Uint8Array(32)))
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");
}

export const createTokens = mutation({
  args: {
    email: v.string(),
    reason: v.string(),
  },
  returns: v.object({
    approveToken: v.string(),
    denyToken: v.string(),
  }),
  handler: async (ctx, args) => {
    const approveToken = generateToken();
    const denyToken = generateToken();
    const expiresAt = Date.now() + 7 * 24 * 60 * 60 * 1000;

    await ctx.db.insert("earlyAccessTokens", {
      email: args.email,
      approveToken,
      denyToken,
      expiresAt,
      used: false,
      approved: false,
      reason: args.reason,
      createdAt: Date.now(),
    });

    return { approveToken, denyToken };
  },
});

export const approveByToken = mutation({
  args: { token: v.string() },
  returns: v.union(
    v.object({ success: v.literal(true), email: v.string() }),
    v.object({ success: v.literal(false), error: v.string() }),
  ),
  handler: async (
    ctx,
    args,
  ): Promise<
    { success: true; email: string } | { success: false; error: string }
  > => {
    const tokenRecord = await ctx.db
      .query("earlyAccessTokens")
      .withIndex("by_approve_token", (q) => q.eq("approveToken", args.token))
      .first();

    if (!tokenRecord) {
      return { success: false as const, error: "Invalid token" };
    }

    if (tokenRecord.used) {
      return { success: false as const, error: "Token already used" };
    }

    if (tokenRecord.expiresAt < Date.now()) {
      return { success: false as const, error: "Token expired" };
    }

    await ctx.db.patch(tokenRecord._id, {
      used: true,
      approved: true,
    });

    const result = await ctx.runMutation(
      internal.earlyAccess.approveUserByEmail,
      {
        email: tokenRecord.email,
      },
    );

    if (!result.success) {
      return { success: false as const, error: result.error };
    }

    return { success: true as const, email: tokenRecord.email };
  },
});

export const denyByToken = mutation({
  args: { token: v.string() },
  returns: v.union(
    v.object({ success: v.literal(true), email: v.string() }),
    v.object({ success: v.literal(false), error: v.string() }),
  ),
  handler: async (
    ctx,
    args,
  ): Promise<
    { success: true; email: string } | { success: false; error: string }
  > => {
    const tokenRecord = await ctx.db
      .query("earlyAccessTokens")
      .withIndex("by_deny_token", (q) => q.eq("denyToken", args.token))
      .first();

    if (!tokenRecord) {
      return { success: false as const, error: "Invalid token" };
    }

    if (tokenRecord.used) {
      return { success: false as const, error: "Token already used" };
    }

    if (tokenRecord.expiresAt < Date.now()) {
      return { success: false as const, error: "Token expired" };
    }

    await ctx.db.patch(tokenRecord._id, {
      used: true,
      approved: false,
    });

    return { success: true as const, email: tokenRecord.email };
  },
});

export const approveTokenByEmail = mutation({
  args: { email: v.string() },
  returns: v.null(),
  handler: async (ctx, args) => {
    const token = await ctx.db
      .query("earlyAccessTokens")
      .withIndex("by_email", (q) => q.eq("email", args.email))
      .first();

    if (!token) {
      throw new Error("No early access token found for this email");
    }

    await ctx.db.patch(token._id, {
      approved: true,
      used: true,
    });

    const result = await ctx.runMutation(
      internal.earlyAccess.approveUserByEmail,
      {
        email: args.email,
      },
    );

    if (!result.success) {
      throw new Error(result.error);
    }

    return null;
  },
});

export const denyTokenByEmail = mutation({
  args: { email: v.string() },
  returns: v.null(),
  handler: async (ctx, args) => {
    const token = await ctx.db
      .query("earlyAccessTokens")
      .withIndex("by_email", (q) => q.eq("email", args.email))
      .first();

    if (token) {
      await ctx.db.patch(token._id, {
        approved: false,
        used: true,
      });
    }

    return null;
  },
});
