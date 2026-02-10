import { mutation, query } from "./_generated/server";
import { v } from "convex/values";
import { authComponent } from "./auth";

export const create = mutation({
  args: {
    userId: v.string(),
    name: v.string(),
    githubToken: v.optional(v.string()),
  },
  returns: v.object({
    key: v.string(),
    keyPrefix: v.string(),
    webhookSecret: v.string(),
  }),
  handler: async (ctx, args) => {
    const rawBytes = new Uint8Array(32);
    crypto.getRandomValues(rawBytes);
    const rawKey =
      "uva_" +
      Array.from(rawBytes)
        .map((b) => b.toString(16).padStart(2, "0"))
        .join("");

    const keyPrefix = rawKey.slice(0, 8);

    const hashBuffer = await crypto.subtle.digest(
      "SHA-256",
      new TextEncoder().encode(rawKey),
    );
    const keyHash = Array.from(new Uint8Array(hashBuffer))
      .map((b) => b.toString(16).padStart(2, "0"))
      .join("");

    const secretBytes = new Uint8Array(32);
    crypto.getRandomValues(secretBytes);
    const webhookSecret = Array.from(secretBytes)
      .map((b) => b.toString(16).padStart(2, "0"))
      .join("");

    await ctx.db.insert("apiKeys", {
      userId: args.userId,
      keyHash,
      keyPrefix,
      name: args.name,
      webhookSecret,
      ...(args.githubToken ? { githubToken: args.githubToken } : {}),
      createdAt: Date.now(),
    });

    return { key: rawKey, keyPrefix, webhookSecret };
  },
});

export const list = query({
  args: {
    userId: v.string(),
  },
  handler: async (ctx, args) => {
    const keys = await ctx.db
      .query("apiKeys")
      .withIndex("by_userId", (q) => q.eq("userId", args.userId))
      .order("desc")
      .collect();

    return keys
      .filter((k) => !k.revokedAt)
      .map((k) => ({
        _id: k._id,
        keyPrefix: k.keyPrefix,
        name: k.name,
        hasGithubToken: !!k.githubToken,
        createdAt: k.createdAt,
        lastUsedAt: k.lastUsedAt,
      }));
  },
});

export const listForUser = query({
  args: {},
  handler: async (ctx) => {
    const user = await authComponent.getAuthUser(ctx);
    if (!user) throw new Error("Unauthenticated");

    const keys = await ctx.db
      .query("apiKeys")
      .withIndex("by_userId", (q) => q.eq("userId", user._id))
      .order("desc")
      .collect();

    return keys
      .filter((k) => !k.revokedAt)
      .map((k) => ({
        _id: k._id,
        keyPrefix: k.keyPrefix,
        name: k.name,
        hasGithubToken: !!k.githubToken,
        createdAt: k.createdAt,
        lastUsedAt: k.lastUsedAt,
      }));
  },
});

export const revoke = mutation({
  args: {
    userId: v.string(),
    keyId: v.id("apiKeys"),
  },
  returns: v.object({ success: v.boolean() }),
  handler: async (ctx, args) => {
    const key = await ctx.db.get(args.keyId);
    if (!key) throw new Error("API key not found");
    if (key.userId !== args.userId) throw new Error("Unauthorized");
    if (key.revokedAt) throw new Error("API key already revoked");

    await ctx.db.patch(args.keyId, { revokedAt: Date.now() });
    return { success: true };
  },
});

export const revokeForUser = mutation({
  args: {
    keyId: v.id("apiKeys"),
  },
  returns: v.object({ success: v.boolean() }),
  handler: async (ctx, args) => {
    const user = await authComponent.getAuthUser(ctx);
    if (!user) throw new Error("Unauthenticated");

    const key = await ctx.db.get(args.keyId);
    if (!key) throw new Error("API key not found");
    if (key.userId !== user._id) throw new Error("Unauthorized");
    if (key.revokedAt) throw new Error("API key already revoked");

    await ctx.db.patch(args.keyId, { revokedAt: Date.now() });
    return { success: true };
  },
});

export const validateByPrefix = query({
  args: {
    keyPrefix: v.string(),
  },
  handler: async (ctx, args) => {
    const key = await ctx.db
      .query("apiKeys")
      .withIndex("by_keyPrefix", (q) => q.eq("keyPrefix", args.keyPrefix))
      .first();

    if (!key || key.revokedAt) return null;

    return {
      _id: key._id,
      userId: key.userId,
      webhookSecret: key.webhookSecret,
      githubToken: key.githubToken,
    };
  },
});

export const updateGithubToken = mutation({
  args: {
    userId: v.string(),
    keyId: v.id("apiKeys"),
    githubToken: v.string(),
  },
  returns: v.object({ success: v.boolean() }),
  handler: async (ctx, args) => {
    const key = await ctx.db.get(args.keyId);
    if (!key) throw new Error("API key not found");
    if (key.userId !== args.userId) throw new Error("Unauthorized");
    if (key.revokedAt) throw new Error("API key is revoked");

    await ctx.db.patch(args.keyId, { githubToken: args.githubToken });
    return { success: true };
  },
});

export const updateGithubTokenForUser = mutation({
  args: {
    keyId: v.id("apiKeys"),
    githubToken: v.string(),
  },
  returns: v.object({ success: v.boolean() }),
  handler: async (ctx, args) => {
    const user = await authComponent.getAuthUser(ctx);
    if (!user) throw new Error("Unauthenticated");

    const key = await ctx.db.get(args.keyId);
    if (!key) throw new Error("API key not found");
    if (key.userId !== user._id) throw new Error("Unauthorized");
    if (key.revokedAt) throw new Error("API key is revoked");

    await ctx.db.patch(args.keyId, { githubToken: args.githubToken });
    return { success: true };
  },
});

export const recordUsage = mutation({
  args: {
    keyId: v.id("apiKeys"),
  },
  returns: v.null(),
  handler: async (ctx, args) => {
    await ctx.db.patch(args.keyId, { lastUsedAt: Date.now() });
    return null;
  },
});
