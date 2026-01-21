import { mutation, query, internalMutation } from "./_generated/server";
import { v } from "convex/values";
import { VM_STATUSES } from "./schema";

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
      status: "creating", // Start with "creating" so UI shows VM immediately
      hours: args.hours,
      createdAt: now,
      expiresAt,
    });

    return vmDocId;
  },
});

export const updateStatus = mutation({
  args: {
    vmId: v.string(),
    status: v.union(...VM_STATUSES.map((s) => v.literal(s))),
    nodeId: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    const vm = await ctx.db
      .query("vms")
      .withIndex("by_vmId", (q) => q.eq("vmId", args.vmId))
      .first();

    if (!vm) {
      throw new Error(`VM ${args.vmId} not found`);
    }

    const updates: any = {
      status: args.status,
    };

    if (args.nodeId) {
      updates.nodeId = args.nodeId;
    }

    const provisioningStatuses = [
      "creating",
      "pending",
      "booting",
      "provisioning",
    ];

    // When VM becomes ready, reset the expiration timer (provisioning time doesn't count)
    if (args.status === "ready" && provisioningStatuses.includes(vm.status)) {
      const now = Date.now();
      updates.expiresAt = now + vm.hours * 60 * 60 * 1000;
    }

    if (args.status === "stopped") {
      updates.deletedAt = Date.now();
    }

    await ctx.db.patch(vm._id, updates);

    return vm._id;
  },
});

export const listByUser = query({
  args: {
    userId: v.string(),
  },
  handler: async (ctx, args) => {
    const vms = await ctx.db
      .query("vms")
      .withIndex("by_user", (q) => q.eq("userId", args.userId))
      .order("desc")
      .collect();

    return vms;
  },
});

export const listActiveByUser = query({
  args: {
    userId: v.string(),
  },
  handler: async (ctx, args) => {
    const allVms = await ctx.db
      .query("vms")
      .withIndex("by_user", (q) => q.eq("userId", args.userId))
      .order("desc")
      .collect();

    const activeStatuses = [
      "creating",
      "pending",
      "booting",
      "provisioning",
      "ready",
    ];

    const runningStatuses = ["ready"];

    return allVms.filter((vm) => {
      if (!activeStatuses.includes(vm.status)) {
        return false;
      }
      if (runningStatuses.includes(vm.status)) {
        return vm.expiresAt > Date.now();
      }
      return true;
    });
  },
});

export const listInactiveByUser = query({
  args: {
    userId: v.string(),
  },
  handler: async (ctx, args) => {
    const allVms = await ctx.db
      .query("vms")
      .withIndex("by_user", (q) => q.eq("userId", args.userId))
      .order("desc")
      .collect();

    const inactiveStatuses = [
      "failed",
      "stopped",
      "not_found",
      "stopping",
      "offline",
    ];

    return allVms.filter((vm) => inactiveStatuses.includes(vm.status));
  },
});

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

export const listAll = query({
  args: {},
  handler: async (ctx) => {
    return await ctx.db.query("vms").order("desc").collect();
  },
});

export const markNodeOffline = internalMutation({
  args: {
    nodeId: v.string(),
  },
  handler: async (ctx, args) => {
    const vms = await ctx.db
      .query("vms")
      .withIndex("by_nodeId", (q) => q.eq("nodeId", args.nodeId))
      .collect();

    const activeStatuses = [
      "creating",
      "pending",
      "booting",
      "provisioning",
      "ready",
    ];

    let count = 0;
    for (const vm of vms) {
      if (activeStatuses.includes(vm.status)) {
        await ctx.db.patch(vm._id, {
          status: "offline",
        });
        count++;
      }
    }

    return count;
  },
});
