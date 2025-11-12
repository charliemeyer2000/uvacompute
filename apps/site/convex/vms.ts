import { mutation, query } from "./_generated/server";
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

export const updateStatus = mutation({
  args: {
    vmId: v.string(),
    status: v.union(...VM_STATUSES.map((s) => v.literal(s))),
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

    const provisioningStatuses = [
      "creating",
      "initializing",
      "starting",
      "waiting_for_agent",
      "configuring",
    ];

    if (args.status === "running" && provisioningStatuses.includes(vm.status)) {
      const now = Date.now();
      updates.expiresAt = now + vm.hours * 60 * 60 * 1000;
    }

    if (args.status === "deleted" || args.status === "expired") {
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
      "initializing",
      "starting",
      "waiting_for_agent",
      "configuring",
      "running",
      "updating",
    ];

    const runningStatuses = ["running", "updating"];

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
      "deleted",
      "expired",
      "not_found",
      "deleting",
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
