import { defineSchema, defineTable } from "convex/server";
import { v } from "convex/values";

export default defineSchema({
  users: defineTable({
    email: v.string(),
    name: v.string(),
    count: v.number(),
  }).index("email", ["email"]),

  vms: defineTable({
    userId: v.string(),

    vmId: v.string(),
    name: v.optional(v.string()),

    cpus: v.number(),
    ram: v.number(),
    disk: v.number(),
    gpus: v.number(),
    gpuType: v.string(),

    status: v.union(
      v.literal("creating"),
      v.literal("running"),
      v.literal("failed"),
      v.literal("deleting"),
      v.literal("deleted"),
      v.literal("expired"),
    ),
    hours: v.number(),
    createdAt: v.number(),
    expiresAt: v.number(),
    deletedAt: v.optional(v.number()),

    orchestrationResponse: v.optional(v.any()),
  })
    .index("by_user", ["userId"])
    .index("by_user_and_status", ["userId", "status"])
    .index("by_vmId", ["vmId"]),

  sshKeys: defineTable({
    userId: v.string(),
    name: v.string(),
    publicKey: v.string(),
    fingerprint: v.string(),
    isPrimary: v.boolean(),
    createdAt: v.number(),
  })
    .index("by_user", ["userId"])
    .index("by_user_and_primary", ["userId", "isPrimary"]),
});
