import { mutation, query, internalMutation } from "./_generated/server";
import { v } from "convex/values";
import { JOB_STATUSES } from "./schema";
import { api } from "./_generated/api";

export const create = mutation({
  args: {
    userId: v.string(),
    jobId: v.string(),
    name: v.optional(v.string()),
    image: v.string(),
    command: v.optional(v.array(v.string())),
    env: v.optional(v.any()),
    cpus: v.number(),
    ram: v.number(),
    gpus: v.number(),
    disk: v.optional(v.number()),
    exposePort: v.optional(v.number()),
    exposeSubdomain: v.optional(v.string()),
    exposeUrl: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    const now = Date.now();

    const jobDocId = await ctx.db.insert("jobs", {
      userId: args.userId,
      jobId: args.jobId,
      name: args.name,
      image: args.image,
      command: args.command,
      env: args.env,
      cpus: args.cpus,
      ram: args.ram,
      gpus: args.gpus,
      disk: args.disk,
      status: "pending",
      createdAt: now,
      exposePort: args.exposePort,
      exposeSubdomain: args.exposeSubdomain,
      exposeUrl: args.exposeUrl,
    });

    return jobDocId;
  },
});

export const updateStatus = mutation({
  args: {
    jobId: v.string(),
    status: v.union(...JOB_STATUSES.map((s) => v.literal(s))),
    exitCode: v.optional(v.number()),
    errorMessage: v.optional(v.string()),
    nodeId: v.optional(v.string()),
    logsUrl: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    const job = await ctx.db
      .query("jobs")
      .withIndex("by_jobId", (q) => q.eq("jobId", args.jobId))
      .first();

    if (!job) {
      throw new Error(`Job ${args.jobId} not found`);
    }

    const updates: Record<string, unknown> = {
      status: args.status,
    };

    if (args.status === "running" && !job.startedAt) {
      updates.startedAt = Date.now();
    }

    if (
      args.status === "completed" ||
      args.status === "failed" ||
      args.status === "cancelled"
    ) {
      updates.completedAt = Date.now();

      // Schedule endpoint release (handles both Convex DB and Cloudflare DNS cleanup)
      if (job.exposeSubdomain) {
        await ctx.scheduler.runAfter(0, api.endpoints.release, {
          type: "job",
          resourceId: args.jobId,
        });
      }
    }

    if (args.exitCode !== undefined) {
      updates.exitCode = args.exitCode;
    }

    if (args.errorMessage !== undefined) {
      updates.errorMessage = args.errorMessage;
    }

    if (args.nodeId !== undefined) {
      updates.nodeId = args.nodeId;
    }

    if (args.logsUrl !== undefined) {
      updates.logsUrl = args.logsUrl;
    }

    await ctx.db.patch(job._id, updates);

    return job._id;
  },
});

export const listByUser = query({
  args: {
    userId: v.string(),
  },
  handler: async (ctx, args) => {
    const jobs = await ctx.db
      .query("jobs")
      .withIndex("by_user", (q) => q.eq("userId", args.userId))
      .order("desc")
      .collect();

    return jobs;
  },
});

export const listActiveByUser = query({
  args: {
    userId: v.string(),
  },
  handler: async (ctx, args) => {
    const allJobs = await ctx.db
      .query("jobs")
      .withIndex("by_user", (q) => q.eq("userId", args.userId))
      .order("desc")
      .collect();

    const activeStatuses = ["pending", "scheduled", "pulling", "running"];

    return allJobs.filter((job) => activeStatuses.includes(job.status));
  },
});

export const listInactiveByUser = query({
  args: {
    userId: v.string(),
  },
  handler: async (ctx, args) => {
    const allJobs = await ctx.db
      .query("jobs")
      .withIndex("by_user", (q) => q.eq("userId", args.userId))
      .order("desc")
      .collect();

    const inactiveStatuses = [
      "completed",
      "failed",
      "cancelled",
      "node_offline",
    ];

    return allJobs.filter((job) => inactiveStatuses.includes(job.status));
  },
});

export const getByJobId = query({
  args: {
    jobId: v.string(),
  },
  handler: async (ctx, args) => {
    const job = await ctx.db
      .query("jobs")
      .withIndex("by_jobId", (q) => q.eq("jobId", args.jobId))
      .first();

    return job;
  },
});

export const cancel = mutation({
  args: {
    jobId: v.string(),
    userId: v.string(),
  },
  handler: async (ctx, args) => {
    const job = await ctx.db
      .query("jobs")
      .withIndex("by_jobId", (q) => q.eq("jobId", args.jobId))
      .first();

    if (!job) {
      throw new Error(`Job ${args.jobId} not found`);
    }

    if (job.userId !== args.userId) {
      throw new Error("Unauthorized: Job belongs to another user");
    }

    const cancellableStatuses = ["pending", "scheduled", "pulling", "running"];
    if (!cancellableStatuses.includes(job.status)) {
      throw new Error(`Cannot cancel job in status: ${job.status}`);
    }

    // Schedule endpoint release (handles both Convex DB and Cloudflare DNS cleanup)
    if (job.exposeSubdomain) {
      await ctx.scheduler.runAfter(0, api.endpoints.release, {
        type: "job",
        resourceId: args.jobId,
      });
    }

    await ctx.db.patch(job._id, {
      status: "cancelled",
      completedAt: Date.now(),
    });

    return job._id;
  },
});

export const listAll = query({
  args: {},
  handler: async (ctx) => {
    return await ctx.db.query("jobs").order("desc").collect();
  },
});

export const markNodeOffline = internalMutation({
  args: {
    nodeId: v.string(),
  },
  handler: async (ctx, args) => {
    const jobs = await ctx.db
      .query("jobs")
      .withIndex("by_nodeId", (q) => q.eq("nodeId", args.nodeId))
      .collect();

    const activeStatuses = ["pending", "scheduled", "pulling", "running"];

    let count = 0;
    for (const job of jobs) {
      if (activeStatuses.includes(job.status)) {
        await ctx.db.patch(job._id, {
          status: "node_offline",
        });
        count++;
      }
    }

    return count;
  },
});
