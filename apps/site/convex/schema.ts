import { defineSchema, defineTable } from "convex/server";
import { v } from "convex/values";

export const VM_STATUSES = [
  "not_found",
  "creating",
  "initializing",
  "starting",
  "waiting_for_agent",
  "configuring",
  "running",
  "failed",
  "deleting",
  "deleted",
  "expired",
  "updating",
] as const;

export const JOB_STATUSES = [
  "pending",
  "scheduled",
  "pulling",
  "running",
  "completed",
  "failed",
  "cancelled",
] as const;

export default defineSchema({
  vms: defineTable({
    userId: v.string(),

    vmId: v.string(),
    name: v.optional(v.string()),

    cpus: v.number(),
    ram: v.number(),
    disk: v.number(),
    gpus: v.number(),
    gpuType: v.string(),

    status: v.union(...VM_STATUSES.map((s) => v.literal(s))),
    hours: v.number(),
    createdAt: v.number(),
    expiresAt: v.number(),
    deletedAt: v.optional(v.number()),

    orchestrationResponse: v.optional(v.any()),
    nodeId: v.optional(v.string()),
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

  earlyAccessTokens: defineTable({
    email: v.string(),
    approveToken: v.string(),
    denyToken: v.string(),
    expiresAt: v.number(),
    used: v.boolean(),
    approved: v.boolean(),
    reason: v.string(),
    createdAt: v.number(),
  })
    .index("by_approve_token", ["approveToken"])
    .index("by_deny_token", ["denyToken"])
    .index("by_email", ["email"])
    .index("by_email_and_approved", ["email", "approved"]),

  jobs: defineTable({
    userId: v.string(),
    jobId: v.string(),
    name: v.optional(v.string()),
    image: v.string(),
    command: v.optional(v.array(v.string())),
    env: v.optional(v.any()),
    cpus: v.number(),
    ram: v.number(),
    gpus: v.number(),
    status: v.union(...JOB_STATUSES.map((s) => v.literal(s))),
    exitCode: v.optional(v.number()),
    errorMessage: v.optional(v.string()),
    createdAt: v.number(),
    startedAt: v.optional(v.number()),
    completedAt: v.optional(v.number()),
    nodeId: v.optional(v.string()),
    logsUrl: v.optional(v.string()),
    logsStorageId: v.optional(v.id("_storage")),
  })
    .index("by_user", ["userId"])
    .index("by_user_and_status", ["userId", "status"])
    .index("by_jobId", ["jobId"]),

  nodes: defineTable({
    nodeId: v.string(),
    name: v.optional(v.string()),
    tunnelPort: v.number(),
    tunnelHost: v.string(),
    tunnelUser: v.optional(v.string()), // SSH user on the node (default: root)
    kubeconfigPath: v.optional(v.string()), // Path to kubeconfig (default: /etc/rancher/k3s/k3s.yaml)
    sshPublicKey: v.optional(v.string()), // Node's SSH public key for DO VPS tunnel
    status: v.union(
      v.literal("online"),
      v.literal("offline"),
      v.literal("draining"),
    ),
    lastHeartbeat: v.number(),
    registeredAt: v.number(),
    cpus: v.optional(v.number()),
    ram: v.optional(v.number()),
    gpus: v.optional(v.number()),
  })
    .index("by_nodeId", ["nodeId"])
    .index("by_status", ["status"]),

  nodeRegistrationTokens: defineTable({
    token: v.string(),
    assignedPort: v.number(),
    expiresAt: v.number(),
    used: v.boolean(),
    usedByNodeId: v.optional(v.string()),
    createdAt: v.number(),
    createdBy: v.optional(v.string()),
  })
    .index("by_token", ["token"])
    .index("by_used", ["used"]),
});
