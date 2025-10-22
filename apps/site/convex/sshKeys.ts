import { mutation, query } from "./_generated/server";
import { v } from "convex/values";
import { authComponent } from "./auth";

export const add = mutation({
  args: {
    name: v.string(),
    publicKey: v.string(),
    fingerprint: v.string(),
  },
  handler: async (ctx, args) => {
    const user = await authComponent.getAuthUser(ctx);
    if (!user) {
      throw new Error("Unauthenticated");
    }

    const existingKeys = await ctx.db
      .query("sshKeys")
      .withIndex("by_user", (q) => q.eq("userId", user._id))
      .collect();

    const isPrimary = existingKeys.length === 0;

    const keyId = await ctx.db.insert("sshKeys", {
      userId: user._id,
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
    keyId: v.id("sshKeys"),
  },
  handler: async (ctx, args) => {
    const user = await authComponent.getAuthUser(ctx);
    if (!user) {
      throw new Error("Unauthenticated");
    }

    const key = await ctx.db.get(args.keyId);

    if (!key) {
      throw new Error("SSH key not found");
    }

    if (key.userId !== user._id) {
      throw new Error("Unauthorized");
    }

    await ctx.db.delete(args.keyId);

    if (key.isPrimary) {
      const remainingKeys = await ctx.db
        .query("sshKeys")
        .withIndex("by_user", (q) => q.eq("userId", user._id))
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
    keyId: v.id("sshKeys"),
  },
  handler: async (ctx, args) => {
    const user = await authComponent.getAuthUser(ctx);
    if (!user) {
      throw new Error("Unauthenticated");
    }

    const key = await ctx.db.get(args.keyId);

    if (!key) {
      throw new Error("SSH key not found");
    }

    if (key.userId !== user._id) {
      throw new Error("Unauthorized");
    }

    const currentPrimaryKeys = await ctx.db
      .query("sshKeys")
      .withIndex("by_user_and_primary", (q) =>
        q.eq("userId", user._id).eq("isPrimary", true),
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
  args: {},
  handler: async (ctx) => {
    const user = await authComponent.getAuthUser(ctx);
    if (!user) {
      throw new Error("Unauthenticated");
    }

    const keys = await ctx.db
      .query("sshKeys")
      .withIndex("by_user", (q) => q.eq("userId", user._id))
      .order("desc")
      .collect();

    return keys;
  },
});

export const getPrimary = query({
  args: {},
  handler: async (ctx) => {
    const user = await authComponent.getAuthUser(ctx);
    if (!user) {
      throw new Error("Unauthenticated");
    }

    const primaryKey = await ctx.db
      .query("sshKeys")
      .withIndex("by_user_and_primary", (q) =>
        q.eq("userId", user._id).eq("isPrimary", true),
      )
      .first();

    return primaryKey;
  },
});

export const getAllPublicKeys = query({
  args: {},
  handler: async (ctx) => {
    const user = await authComponent.getAuthUser(ctx);
    if (!user) {
      throw new Error("Unauthenticated");
    }

    const keys = await ctx.db
      .query("sshKeys")
      .withIndex("by_user", (q) => q.eq("userId", user._id))
      .collect();

    return keys.map((key) => key.publicKey);
  },
});
