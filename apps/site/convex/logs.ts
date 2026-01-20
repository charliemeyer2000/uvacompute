import { mutation, query } from "./_generated/server";
import { v } from "convex/values";

export const generateUploadUrl = mutation({
  args: {},
  handler: async (ctx) => {
    return await ctx.storage.generateUploadUrl();
  },
});

export const storeLogFile = mutation({
  args: {
    jobId: v.string(),
    storageId: v.id("_storage"),
  },
  handler: async (ctx, args) => {
    const job = await ctx.db
      .query("jobs")
      .withIndex("by_jobId", (q) => q.eq("jobId", args.jobId))
      .first();

    if (!job) {
      throw new Error(`Job ${args.jobId} not found`);
    }

    await ctx.db.patch(job._id, { logsStorageId: args.storageId });

    return { success: true };
  },
});

export const getLogUrl = query({
  args: {
    jobId: v.string(),
  },
  handler: async (ctx, args) => {
    const job = await ctx.db
      .query("jobs")
      .withIndex("by_jobId", (q) => q.eq("jobId", args.jobId))
      .first();

    if (!job) {
      return null;
    }

    if (!job.logsStorageId) {
      return null;
    }

    const url = await ctx.storage.getUrl(job.logsStorageId);
    return url;
  },
});
