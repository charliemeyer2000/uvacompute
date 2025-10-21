import { query } from "./_generated/server";
import { v } from "convex/values";
import { components } from "./_generated/api";

export const hasDevAccess = query({
  args: { token: v.string() },
  handler: async (ctx, args) => {
    try {
      const user = await ctx.runQuery(
        components.betterAuth.currentUser.getCurrentUserByToken,
        { token: args.token },
      );

      if (!user?.email) {
        return false;
      }

      const allowedUsers =
        process.env.DEV_TOOLS_ALLOWED_USERS?.split(",").map((email) =>
          email.trim(),
        ) || [];

      if (allowedUsers.length === 0) {
        return false;
      }

      return allowedUsers.includes(user.email);
    } catch (error) {
      return false;
    }
  },
});
