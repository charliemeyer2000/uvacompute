import { mutation, query } from "./_generated/server";
import { v } from "convex/values";

export const register = mutation({
  args: {
    nodeId: v.string(),
    name: v.optional(v.string()),
    tunnelPort: v.number(),
    tunnelHost: v.string(),
    tunnelUser: v.optional(v.string()),
    kubeconfigPath: v.optional(v.string()),
    sshPublicKey: v.optional(v.string()),
    ownerId: v.optional(v.string()),
    cpus: v.optional(v.number()),
    ram: v.optional(v.number()),
    gpus: v.optional(v.number()),
  },
  handler: async (ctx, args) => {
    const existing = await ctx.db
      .query("nodes")
      .withIndex("by_nodeId", (q) => q.eq("nodeId", args.nodeId))
      .first();

    const now = Date.now();

    if (existing) {
      await ctx.db.patch(existing._id, {
        tunnelPort: args.tunnelPort,
        tunnelHost: args.tunnelHost,
        tunnelUser: args.tunnelUser,
        kubeconfigPath: args.kubeconfigPath,
        sshPublicKey: args.sshPublicKey,
        status: "online",
        lastHeartbeat: now,
        cpus: args.cpus,
        ram: args.ram,
        gpus: args.gpus,
        ...(args.ownerId && !existing.ownerId ? { ownerId: args.ownerId } : {}),
      });
      return existing._id;
    }

    return await ctx.db.insert("nodes", {
      nodeId: args.nodeId,
      name: args.name,
      tunnelPort: args.tunnelPort,
      tunnelHost: args.tunnelHost,
      tunnelUser: args.tunnelUser,
      kubeconfigPath: args.kubeconfigPath,
      sshPublicKey: args.sshPublicKey,
      ownerId: args.ownerId,
      status: "online",
      lastHeartbeat: now,
      registeredAt: now,
      cpus: args.cpus,
      ram: args.ram,
      gpus: args.gpus,
    });
  },
});

export const heartbeat = mutation({
  args: {
    nodeId: v.string(),
  },
  handler: async (ctx, args) => {
    const node = await ctx.db
      .query("nodes")
      .withIndex("by_nodeId", (q) => q.eq("nodeId", args.nodeId))
      .first();

    if (!node) {
      throw new Error(`Node ${args.nodeId} not found`);
    }

    await ctx.db.patch(node._id, {
      lastHeartbeat: Date.now(),
      status: "online",
    });

    return node._id;
  },
});

export const setStatus = mutation({
  args: {
    nodeId: v.string(),
    status: v.union(
      v.literal("online"),
      v.literal("offline"),
      v.literal("draining"),
    ),
  },
  handler: async (ctx, args) => {
    const node = await ctx.db
      .query("nodes")
      .withIndex("by_nodeId", (q) => q.eq("nodeId", args.nodeId))
      .first();

    if (!node) {
      throw new Error(`Node ${args.nodeId} not found`);
    }

    await ctx.db.patch(node._id, {
      status: args.status,
    });

    return node._id;
  },
});

export const unregister = mutation({
  args: {
    nodeId: v.string(),
  },
  handler: async (ctx, args) => {
    const node = await ctx.db
      .query("nodes")
      .withIndex("by_nodeId", (q) => q.eq("nodeId", args.nodeId))
      .first();

    if (!node) {
      throw new Error(`Node ${args.nodeId} not found`);
    }

    await ctx.db.delete(node._id);
    return node._id;
  },
});

export const getByNodeId = query({
  args: {
    nodeId: v.string(),
  },
  handler: async (ctx, args) => {
    return await ctx.db
      .query("nodes")
      .withIndex("by_nodeId", (q) => q.eq("nodeId", args.nodeId))
      .first();
  },
});

export const listOnline = query({
  args: {},
  handler: async (ctx) => {
    return await ctx.db
      .query("nodes")
      .withIndex("by_status", (q) => q.eq("status", "online"))
      .collect();
  },
});

export const listAll = query({
  args: {},
  handler: async (ctx) => {
    return await ctx.db.query("nodes").collect();
  },
});

export const getPublicKeys = query({
  args: {},
  handler: async (ctx) => {
    const nodes = await ctx.db.query("nodes").collect();
    return nodes
      .filter((node) => node.sshPublicKey)
      .map((node) => ({
        nodeId: node.nodeId,
        sshPublicKey: node.sshPublicKey,
      }));
  },
});

export const listByOwner = query({
  args: {
    ownerId: v.string(),
  },
  handler: async (ctx, args) => {
    return await ctx.db
      .query("nodes")
      .withIndex("by_ownerId", (q) => q.eq("ownerId", args.ownerId))
      .collect();
  },
});

export const getWorkloadsOnNode = query({
  args: {
    nodeId: v.string(),
  },
  handler: async (ctx, args) => {
    const vms = await ctx.db
      .query("vms")
      .withIndex("by_nodeId", (q) => q.eq("nodeId", args.nodeId))
      .collect();

    const jobs = await ctx.db
      .query("jobs")
      .withIndex("by_nodeId", (q) => q.eq("nodeId", args.nodeId))
      .collect();

    const activeVms = vms.filter(
      (vm) => vm.status !== "deleted" && vm.status !== "expired",
    );
    const activeJobs = jobs.filter(
      (job) =>
        job.status !== "completed" &&
        job.status !== "failed" &&
        job.status !== "cancelled",
    );

    return {
      vms: activeVms,
      jobs: activeJobs,
    };
  },
});

export const verifyOwnership = query({
  args: {
    nodeId: v.string(),
    ownerId: v.string(),
  },
  handler: async (ctx, args) => {
    const node = await ctx.db
      .query("nodes")
      .withIndex("by_nodeId", (q) => q.eq("nodeId", args.nodeId))
      .first();

    if (!node) {
      return { owned: false, exists: false };
    }

    return {
      owned: node.ownerId === args.ownerId,
      exists: true,
      node: node.ownerId === args.ownerId ? node : null,
    };
  },
});

export const setOwner = mutation({
  args: {
    nodeId: v.string(),
    ownerId: v.string(),
  },
  handler: async (ctx, args) => {
    const node = await ctx.db
      .query("nodes")
      .withIndex("by_nodeId", (q) => q.eq("nodeId", args.nodeId))
      .first();

    if (!node) {
      throw new Error(`Node ${args.nodeId} not found`);
    }

    await ctx.db.patch(node._id, {
      ownerId: args.ownerId,
    });

    return node._id;
  },
});
