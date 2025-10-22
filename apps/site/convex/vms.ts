import { mutation, query } from "./_generated/server";
import { v } from "convex/values";
import { authComponent } from "./auth";

/**
 * Create a new VM record in the database
 */
export const create = mutation({
  args: {
    userId: v.string(),
    vmId: v.string(),
    name: v.optional(v.string()),
    cpus: v.number(),
    ram: v.number(),
    disk: v.number(),
    gpus: v.number(),
    gpuType: v.string(),
    hours: v.number(),
    orchestrationResponse: v.optional(v.any()),
  },
  handler: async (ctx, args) => {
    const now = Date.now();
    const expiresAt = now + args.hours * 60 * 60 * 1000;

    const vmDocId = await ctx.db.insert("vms", {
      userId: args.userId,
      vmId: args.vmId,
      name: args.name,
      cpus: args.cpus,
      ram: args.ram,
      disk: args.disk,
      gpus: args.gpus,
      gpuType: args.gpuType,
      status: "creating",
      hours: args.hours,
      createdAt: now,
      expiresAt,
      orchestrationResponse: args.orchestrationResponse,
    });

    return vmDocId;
  },
});

/**
 * Update VM status to running after successful creation
 */
export const markAsRunning = mutation({
  args: {
    vmId: v.string(),
  },
  handler: async (ctx, args) => {
    const vm = await ctx.db
      .query("vms")
      .withIndex("by_vmId", (q) => q.eq("vmId", args.vmId))
      .first();

    if (!vm) {
      throw new Error(`VM ${args.vmId} not found`);
    }

    await ctx.db.patch(vm._id, {
      status: "running",
    });

    return vm._id;
  },
});

/**
 * Mark VM as deleted
 */
export const markAsDeleted = mutation({
  args: {
    vmId: v.string(),
  },
  handler: async (ctx, args) => {
    const vm = await ctx.db
      .query("vms")
      .withIndex("by_vmId", (q) => q.eq("vmId", args.vmId))
      .first();

    if (!vm) {
      throw new Error(`VM ${args.vmId} not found`);
    }

    await ctx.db.patch(vm._id, {
      status: "deleted",
      deletedAt: Date.now(),
    });

    return vm._id;
  },
});

/**
 * Mark VM as failed
 */
export const markAsFailed = mutation({
  args: {
    vmId: v.string(),
  },
  handler: async (ctx, args) => {
    const vm = await ctx.db
      .query("vms")
      .withIndex("by_vmId", (q) => q.eq("vmId", args.vmId))
      .first();

    if (!vm) {
      throw new Error(`VM ${args.vmId} not found`);
    }

    await ctx.db.patch(vm._id, {
      status: "failed",
    });

    return vm._id;
  },
});

/**
 * Get all VMs for the authenticated user
 */
export const listByUser = query({
  args: {},
  handler: async (ctx) => {
    const user = await authComponent.getAuthUser(ctx);
    if (!user) {
      throw new Error("Unauthenticated");
    }

    const vms = await ctx.db
      .query("vms")
      .withIndex("by_user", (q) => q.eq("userId", user._id))
      .order("desc")
      .collect();

    return vms;
  },
});

/**
 * Get active (running) VMs for the authenticated user
 */
export const listActiveByUser = query({
  args: {},
  handler: async (ctx) => {
    const user = await authComponent.getAuthUser(ctx);
    if (!user) {
      throw new Error("Unauthenticated");
    }

    const vms = await ctx.db
      .query("vms")
      .withIndex("by_user_and_status", (q) =>
        q.eq("userId", user._id).eq("status", "running"),
      )
      .order("desc")
      .collect();

    return vms.filter((vm) => vm.expiresAt > Date.now());
  },
});

/**
 * Get inactive (deleted, expired, failed) VMs for the authenticated user
 */
export const listInactiveByUser = query({
  args: {},
  handler: async (ctx) => {
    const user = await authComponent.getAuthUser(ctx);
    if (!user) {
      throw new Error("Unauthenticated");
    }

    const allVms = await ctx.db
      .query("vms")
      .withIndex("by_user", (q) => q.eq("userId", user._id))
      .order("desc")
      .collect();

    return allVms.filter(
      (vm) =>
        vm.status === "deleted" ||
        vm.status === "expired" ||
        vm.status === "failed",
    );
  },
});

/**
 * Get a single VM by vmId
 */
export const getByVmId = query({
  args: {
    vmId: v.string(),
  },
  handler: async (ctx, args) => {
    const vm = await ctx.db
      .query("vms")
      .withIndex("by_vmId", (q) => q.eq("vmId", args.vmId))
      .first();

    return vm;
  },
});

/**
 * Check and mark expired VMs (to be run periodically)
 */
export const checkExpiredVMs = mutation({
  args: {},
  handler: async (ctx) => {
    const now = Date.now();

    const runningVms = await ctx.db
      .query("vms")
      .filter((q) => q.eq(q.field("status"), "running"))
      .collect();

    const expiredVmIds = [];

    for (const vm of runningVms) {
      if (vm.expiresAt <= now) {
        await ctx.db.patch(vm._id, {
          status: "expired",
          deletedAt: now,
        });
        expiredVmIds.push(vm.vmId);
      }
    }

    return { expiredVmIds, count: expiredVmIds.length };
  },
});
