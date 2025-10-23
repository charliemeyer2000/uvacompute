import { mutation, query, internalQuery } from "./_generated/server";
import { v } from "convex/values";

export const add = mutation({
  args: {
    userId: v.string(),
    name: v.string(),
    publicKey: v.string(),
    fingerprint: v.string(),
  },
  handler: async (ctx, args) => {
    const existingKeys = await ctx.db
      .query("sshKeys")
      .withIndex("by_user", (q) => q.eq("userId", args.userId))
      .collect();

    const isPrimary = existingKeys.length === 0;

    const keyId = await ctx.db.insert("sshKeys", {
      userId: args.userId,
      name: args.name,
      publicKey: args.publicKey,
      fingerprint: args.fingerprint,
      isPrimary,
      createdAt: Date.now(),
    });

    return keyId;
  },
});

export const remove = mutation({
  args: {
    userId: v.string(),
    keyId: v.id("sshKeys"),
  },
  handler: async (ctx, args) => {
    const key = await ctx.db.get(args.keyId);

    if (!key) {
      throw new Error("SSH key not found");
    }

    if (key.userId !== args.userId) {
      throw new Error("Unauthorized");
    }

    await ctx.db.delete(args.keyId);

    if (key.isPrimary) {
      const remainingKeys = await ctx.db
        .query("sshKeys")
        .withIndex("by_user", (q) => q.eq("userId", args.userId))
        .collect();

      if (remainingKeys.length > 0) {
        await ctx.db.patch(remainingKeys[0]._id, { isPrimary: true });
      }
    }

    return { success: true };
  },
});

export const setPrimary = mutation({
  args: {
    userId: v.string(),
    keyId: v.id("sshKeys"),
  },
  handler: async (ctx, args) => {
    const key = await ctx.db.get(args.keyId);

    if (!key) {
      throw new Error("SSH key not found");
    }

    if (key.userId !== args.userId) {
      throw new Error("Unauthorized");
    }

    const currentPrimaryKeys = await ctx.db
      .query("sshKeys")
      .withIndex("by_user_and_primary", (q) =>
        q.eq("userId", args.userId).eq("isPrimary", true),
      )
      .collect();

    for (const primaryKey of currentPrimaryKeys) {
      await ctx.db.patch(primaryKey._id, { isPrimary: false });
    }

    await ctx.db.patch(args.keyId, { isPrimary: true });

    return { success: true };
  },
});

export const list = query({
  args: {
    userId: v.string(),
  },
  handler: async (ctx, args) => {
    const keys = await ctx.db
      .query("sshKeys")
      .withIndex("by_user", (q) => q.eq("userId", args.userId))
      .order("desc")
      .collect();

    return keys;
  },
});

export const getPrimary = query({
  args: {
    userId: v.string(),
  },
  handler: async (ctx, args) => {
    const primaryKey = await ctx.db
      .query("sshKeys")
      .withIndex("by_user_and_primary", (q) =>
        q.eq("userId", args.userId).eq("isPrimary", true),
      )
      .first();

    return primaryKey;
  },
});

export const getAllPublicKeys = query({
  args: {
    userId: v.string(),
  },
  handler: async (ctx, args) => {
    const keys = await ctx.db
      .query("sshKeys")
      .withIndex("by_user", (q) => q.eq("userId", args.userId))
      .collect();

    return keys.map((key) => key.publicKey);
  },
});
