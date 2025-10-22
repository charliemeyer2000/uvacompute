import { query } from "./_generated/server";
import { authComponent } from "./auth";

export const hasDevAccess = query({
  args: {},
  handler: async (ctx) => {
    try {
      const user = await authComponent.getAuthUser(ctx);

      if (!user?.email) {
        return false;
      }

      const adminUsers =
        process.env.ADMIN_USERS?.split(",").map((email) => email.trim()) || [];

      if (adminUsers.length === 0) {
        return false;
      }

      return adminUsers.includes(user.email);
    } catch (error) {
      return false;
    }
  },
});
