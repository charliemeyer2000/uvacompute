import { mutation } from "./_generated/server";
import { convexToJson, v } from "convex/values";

export const increment = mutation({
  args: { id: v.id("users") },
  handler: async (ctx, args) => {
    const { id } = args;
    console.log();
  },
});
