import { internalMutation, query, action } from "./_generated/server";
import { v } from "convex/values";
import { internal } from "./_generated/api";

const SUBDOMAIN_CHARS = "abcdefghijklmnopqrstuvwxyz0123456789";
const SUBDOMAIN_LENGTH = 8;

const HUB_IP = "***REDACTED_IP***";

function generateRandomSubdomain(): string {
  let result = "";
  for (let i = 0; i < SUBDOMAIN_LENGTH; i++) {
    result += SUBDOMAIN_CHARS.charAt(
      Math.floor(Math.random() * SUBDOMAIN_CHARS.length),
    );
  }
  return result;
}

/**
 * Reserve a unique subdomain for a VM or Job (internal, called by action)
 */
export const reserveInternal = internalMutation({
  args: {
    type: v.union(v.literal("vm"), v.literal("job")),
    resourceId: v.string(),
    port: v.number(),
    subdomain: v.string(),
    cloudflareRecordId: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    const existing = await ctx.db
      .query("endpoints")
      .withIndex("by_subdomain", (q) => q.eq("subdomain", args.subdomain))
      .first();

    if (existing) {
      return { success: false, error: "subdomain_taken" };
    }

    await ctx.db.insert("endpoints", {
      subdomain: args.subdomain,
      type: args.type,
      resourceId: args.resourceId,
      port: args.port,
      cloudflareRecordId: args.cloudflareRecordId,
      createdAt: Date.now(),
    });

    return { success: true };
  },
});

export const reserve = action({
  args: {
    type: v.union(v.literal("vm"), v.literal("job")),
    resourceId: v.string(),
    port: v.number(),
  },
  handler: async (
    ctx,
    args,
  ): Promise<{ subdomain: string; exposeUrl: string }> => {
    const cfApiToken = process.env.CLOUDFLARE_API_TOKEN;
    const cfZoneId = process.env.CLOUDFLARE_ZONE_ID;

    if (!cfApiToken || !cfZoneId) {
      throw new Error("Cloudflare API credentials not configured");
    }

    for (let attempt = 0; attempt < 10; attempt++) {
      const subdomain = generateRandomSubdomain();
      const fullDomain = `${subdomain}.uvacompute.com`;

      const cfResponse = await fetch(
        `https://api.cloudflare.com/client/v4/zones/${cfZoneId}/dns_records`,
        {
          method: "POST",
          headers: {
            Authorization: `Bearer ${cfApiToken}`,
            "Content-Type": "application/json",
          },
          body: JSON.stringify({
            type: "A",
            name: fullDomain,
            content: HUB_IP,
            proxied: true,
            ttl: 1,
            comment: `Ephemeral endpoint for ${args.type}:${args.resourceId}`,
          }),
        },
      );

      const cfResult = await cfResponse.json();

      if (!cfResult.success) {
        const alreadyExists = cfResult.errors?.some(
          (e: { code: number }) => e.code === 81057,
        );
        if (alreadyExists) {
          continue;
        }
        throw new Error(
          `Failed to create DNS record: ${JSON.stringify(cfResult.errors)}`,
        );
      }

      const cloudflareRecordId = cfResult.result.id;

      const reserveResult = await ctx.runMutation(
        internal.endpoints.reserveInternal,
        {
          type: args.type,
          resourceId: args.resourceId,
          port: args.port,
          subdomain,
          cloudflareRecordId,
        },
      );

      if (!reserveResult.success) {
        await fetch(
          `https://api.cloudflare.com/client/v4/zones/${cfZoneId}/dns_records/${cloudflareRecordId}`,
          {
            method: "DELETE",
            headers: {
              Authorization: `Bearer ${cfApiToken}`,
            },
          },
        );
        continue;
      }

      const exposeUrl = `https://${subdomain}.uvacompute.com`;
      return { subdomain, exposeUrl };
    }

    throw new Error("Failed to generate unique subdomain after 10 attempts");
  },
});

/**
 * Release a subdomain - internal mutation to delete from DB
 */
export const releaseInternal = internalMutation({
  args: {
    type: v.union(v.literal("vm"), v.literal("job")),
    resourceId: v.string(),
  },
  handler: async (ctx, args) => {
    const endpoint = await ctx.db
      .query("endpoints")
      .withIndex("by_resource", (q) =>
        q.eq("type", args.type).eq("resourceId", args.resourceId),
      )
      .first();

    if (endpoint) {
      await ctx.db.delete(endpoint._id);
      return {
        released: true,
        subdomain: endpoint.subdomain,
        cloudflareRecordId: endpoint.cloudflareRecordId,
      };
    }

    return { released: false };
  },
});

/**
 * Release a subdomain and delete Cloudflare DNS record
 */
export const release = action({
  args: {
    type: v.union(v.literal("vm"), v.literal("job")),
    resourceId: v.string(),
  },
  handler: async (
    ctx,
    args,
  ): Promise<{ released: boolean; subdomain?: string }> => {
    const cfApiToken = process.env.CLOUDFLARE_API_TOKEN;
    const cfZoneId = process.env.CLOUDFLARE_ZONE_ID;

    const result = await ctx.runMutation(internal.endpoints.releaseInternal, {
      type: args.type,
      resourceId: args.resourceId,
    });

    if (!result.released) {
      return { released: false };
    }

    if (cfApiToken && cfZoneId && result.cloudflareRecordId) {
      try {
        await fetch(
          `https://api.cloudflare.com/client/v4/zones/${cfZoneId}/dns_records/${result.cloudflareRecordId}`,
          {
            method: "DELETE",
            headers: {
              Authorization: `Bearer ${cfApiToken}`,
            },
          },
        );
      } catch (error) {
        console.error("Failed to delete Cloudflare DNS record:", error);
      }
    }

    return { released: true, subdomain: result.subdomain };
  },
});

/**
 * Get endpoint info for a VM or Job
 */
export const getByResource = query({
  args: {
    type: v.union(v.literal("vm"), v.literal("job")),
    resourceId: v.string(),
  },
  handler: async (ctx, args) => {
    return await ctx.db
      .query("endpoints")
      .withIndex("by_resource", (q) =>
        q.eq("type", args.type).eq("resourceId", args.resourceId),
      )
      .first();
  },
});

/**
 * Get endpoint info by subdomain
 */
export const getBySubdomain = query({
  args: {
    subdomain: v.string(),
  },
  handler: async (ctx, args) => {
    return await ctx.db
      .query("endpoints")
      .withIndex("by_subdomain", (q) => q.eq("subdomain", args.subdomain))
      .first();
  },
});
