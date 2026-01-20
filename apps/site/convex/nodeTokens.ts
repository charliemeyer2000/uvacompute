import { mutation, query } from "./_generated/server";
import { v } from "convex/values";

const BASE_TUNNEL_PORT = 2222;
const TOKEN_EXPIRY_MS = 24 * 60 * 60 * 1000; // 24 hours

function generateToken(): string {
  const chars =
    "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789";
  let token = "";
  for (let i = 0; i < 32; i++) {
    token += chars.charAt(Math.floor(Math.random() * chars.length));
  }
  return token;
}

export const createToken = mutation({
  args: {
    createdBy: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    const token = generateToken();
    const now = Date.now();

    // Find the next available port
    const assignedPort = await getNextAvailablePortInternal(ctx);

    await ctx.db.insert("nodeRegistrationTokens", {
      token,
      assignedPort,
      expiresAt: now + TOKEN_EXPIRY_MS,
      used: false,
      createdAt: now,
      createdBy: args.createdBy,
    });

    return {
      token,
      assignedPort,
      expiresAt: now + TOKEN_EXPIRY_MS,
    };
  },
});

export const validateToken = query({
  args: {
    token: v.string(),
  },
  handler: async (ctx, args) => {
    const tokenRecord = await ctx.db
      .query("nodeRegistrationTokens")
      .withIndex("by_token", (q) => q.eq("token", args.token))
      .first();

    if (!tokenRecord) {
      return { valid: false, error: "Token not found" };
    }

    if (tokenRecord.used) {
      return { valid: false, error: "Token already used" };
    }

    if (tokenRecord.expiresAt < Date.now()) {
      return { valid: false, error: "Token expired" };
    }

    return {
      valid: true,
      assignedPort: tokenRecord.assignedPort,
      createdBy: tokenRecord.createdBy,
    };
  },
});

export const consumeToken = mutation({
  args: {
    token: v.string(),
    nodeId: v.string(),
  },
  handler: async (ctx, args) => {
    const tokenRecord = await ctx.db
      .query("nodeRegistrationTokens")
      .withIndex("by_token", (q) => q.eq("token", args.token))
      .first();

    if (!tokenRecord) {
      throw new Error("Token not found");
    }

    if (tokenRecord.used) {
      throw new Error("Token already used");
    }

    if (tokenRecord.expiresAt < Date.now()) {
      throw new Error("Token expired");
    }

    await ctx.db.patch(tokenRecord._id, {
      used: true,
      usedByNodeId: args.nodeId,
    });

    return {
      assignedPort: tokenRecord.assignedPort,
    };
  },
});

export const getNextAvailablePort = query({
  args: {},
  handler: async (ctx) => {
    return await getNextAvailablePortInternal(ctx);
  },
});

async function getNextAvailablePortInternal(ctx: any): Promise<number> {
  // Get all assigned ports from tokens (including unused ones to avoid conflicts)
  const tokens = await ctx.db.query("nodeRegistrationTokens").collect();
  const tokenPorts = new Set(tokens.map((t: any) => t.assignedPort));

  // Get all ports from registered nodes
  const nodes = await ctx.db.query("nodes").collect();
  const nodePorts = new Set(nodes.map((n: any) => n.tunnelPort));

  // Find the next available port starting from BASE_TUNNEL_PORT
  let port = BASE_TUNNEL_PORT;
  while (tokenPorts.has(port) || nodePorts.has(port)) {
    port++;
  }

  return port;
}

export const listTokens = query({
  args: {
    includeUsed: v.optional(v.boolean()),
  },
  handler: async (ctx, args) => {
    let tokens;
    if (args.includeUsed) {
      tokens = await ctx.db.query("nodeRegistrationTokens").collect();
    } else {
      tokens = await ctx.db
        .query("nodeRegistrationTokens")
        .withIndex("by_used", (q) => q.eq("used", false))
        .collect();
    }

    return tokens.map((t) => ({
      token: t.token,
      assignedPort: t.assignedPort,
      expiresAt: t.expiresAt,
      used: t.used,
      usedByNodeId: t.usedByNodeId,
      createdAt: t.createdAt,
      expired: t.expiresAt < Date.now(),
    }));
  },
});

export const deleteToken = mutation({
  args: {
    token: v.string(),
  },
  handler: async (ctx, args) => {
    const tokenRecord = await ctx.db
      .query("nodeRegistrationTokens")
      .withIndex("by_token", (q) => q.eq("token", args.token))
      .first();

    if (!tokenRecord) {
      throw new Error("Token not found");
    }

    await ctx.db.delete(tokenRecord._id);
    return { success: true };
  },
});
