import { mutation } from "./_generated/server";
import { v } from "convex/values";
import { authComponent } from "./auth";

const VM_NAMES = [
  "ml-training-gpu",
  "data-processing",
  "web-scraper",
  "model-inference",
  "batch-processor",
  "dev-environment",
  "test-server",
  "build-machine",
  "analytics-worker",
  "compute-node",
  "jupyter-notebook",
  "pytorch-training",
  "tensorflow-gpu",
  "cuda-workstation",
  "parallel-compute",
  "distributed-training",
  "edge-processor",
  "video-rendering",
  "simulation-engine",
  "data-pipeline",
];

const GPU_TYPES = ["A100", "H100", "RTX-4090", "V100", "T4", "none"];

function randomChoice<T>(arr: T[]): T {
  return arr[Math.floor(Math.random() * arr.length)];
}

function randomInt(min: number, max: number): number {
  return Math.floor(Math.random() * (max - min + 1)) + min;
}

function generateVmId(): string {
  return `vm-${Math.random().toString(36).substring(2, 15)}`;
}

export const seedVMs = mutation({
  args: {
    activeCount: v.optional(v.number()),
    inactiveCount: v.optional(v.number()),
  },
  handler: async (ctx, args) => {
    const user = await authComponent.getAuthUser(ctx);
    if (!user) {
      throw new Error("Unauthenticated");
    }

    const activeCount = args.activeCount ?? 8;
    const inactiveCount = args.inactiveCount ?? 25;
    const now = Date.now();

    const createdVMs = [];

    for (let i = 0; i < activeCount; i++) {
      const hasGpu = Math.random() > 0.5;
      const gpus = hasGpu ? randomInt(1, 4) : 0;
      const gpuType = hasGpu ? randomChoice(GPU_TYPES.slice(0, -1)) : "none";

      const hours = randomInt(1, 48);
      const createdHoursAgo = randomInt(0, Math.floor(hours * 0.8));
      const createdAt = now - createdHoursAgo * 60 * 60 * 1000;
      const expiresAt = createdAt + hours * 60 * 60 * 1000;

      const status = Math.random() > 0.15 ? "running" : "creating";

      const vmId = await ctx.db.insert("vms", {
        userId: user._id,
        vmId: generateVmId(),
        name: `${randomChoice(VM_NAMES)}-${randomInt(1, 999)}`,
        cpus: randomChoice([2, 4, 8, 16, 32]),
        ram: randomChoice([8, 16, 32, 64, 128]),
        disk: randomChoice([50, 100, 250, 500, 1000]),
        gpus,
        gpuType,
        status: status as "running" | "creating",
        hours,
        createdAt,
        expiresAt,
      });

      createdVMs.push(vmId);
    }

    for (let i = 0; i < inactiveCount; i++) {
      const hasGpu = Math.random() > 0.4;
      const gpus = hasGpu ? randomInt(1, 4) : 0;
      const gpuType = hasGpu ? randomChoice(GPU_TYPES.slice(0, -1)) : "none";

      const hours = randomInt(1, 168);
      const daysAgo = randomInt(1, 90);
      const createdAt = now - daysAgo * 24 * 60 * 60 * 1000;
      const expiresAt = createdAt + hours * 60 * 60 * 1000;

      const statusOptions: Array<"deleted" | "expired" | "failed"> = [
        "deleted",
        "deleted",
        "deleted",
        "expired",
        "expired",
        "failed",
      ];
      const status = randomChoice(statusOptions);

      const deletedAt =
        status === "deleted"
          ? expiresAt + randomInt(0, 60 * 60 * 1000)
          : status === "expired"
            ? expiresAt
            : createdAt + randomInt(60 * 1000, hours * 60 * 60 * 1000);

      const vmId = await ctx.db.insert("vms", {
        userId: user._id,
        vmId: generateVmId(),
        name: `${randomChoice(VM_NAMES)}-${randomInt(1, 999)}`,
        cpus: randomChoice([2, 4, 8, 16, 32]),
        ram: randomChoice([8, 16, 32, 64, 128]),
        disk: randomChoice([50, 100, 250, 500, 1000]),
        gpus,
        gpuType,
        status,
        hours,
        createdAt,
        expiresAt,
        deletedAt,
      });

      createdVMs.push(vmId);
    }

    return {
      success: true,
      created: createdVMs.length,
      active: activeCount,
      inactive: inactiveCount,
    };
  },
});

export const clearAllVMs = mutation({
  args: {},
  handler: async (ctx) => {
    const user = await authComponent.getAuthUser(ctx);
    if (!user) {
      throw new Error("Unauthenticated");
    }

    const vms = await ctx.db
      .query("vms")
      .withIndex("by_user", (q) => q.eq("userId", user._id))
      .collect();

    for (const vm of vms) {
      await ctx.db.delete(vm._id);
    }

    return {
      success: true,
      deleted: vms.length,
    };
  },
});

export const clearInactiveVMs = mutation({
  args: {},
  handler: async (ctx) => {
    const user = await authComponent.getAuthUser(ctx);
    if (!user) {
      throw new Error("Unauthenticated");
    }

    const vms = await ctx.db
      .query("vms")
      .withIndex("by_user", (q) => q.eq("userId", user._id))
      .collect();

    const inactiveVMs = vms.filter(
      (vm) =>
        vm.status === "deleted" ||
        vm.status === "expired" ||
        vm.status === "failed",
    );

    for (const vm of inactiveVMs) {
      await ctx.db.delete(vm._id);
    }

    return {
      success: true,
      deleted: inactiveVMs.length,
    };
  },
});
