import { z } from "zod";

export const DeviceCodeResponseSchema = z.object({
  device_code: z.string().min(1),
  user_code: z.string().min(1),
  verification_uri: z.string().url().or(z.string().min(1)),
  verification_uri_complete: z.string().url().optional(),
  interval: z.number().int().positive().optional(),
  expires_in: z.number().int().positive().optional(),
});

export const TokenSuccessResponseSchema = z.object({
  access_token: z.string().min(1),
  token_type: z.string().optional(),
  scope: z.string().optional(),
});

export const TokenErrorResponseSchema = z.object({
  error: z.string().min(1),
  error_description: z.string().optional(),
});

export const TokenResponseSchema = z.union([
  TokenSuccessResponseSchema,
  TokenErrorResponseSchema,
]);

export const VMCreationRequestSchema = z.object({
  hours: z.number().int().min(1),
  name: z.string().max(255).optional(),
  cpus: z
    .number()
    .int()
    .min(1)
    .max(16)
    .refine((n) => n > 0 && (n & (n - 1)) === 0, {
      message: "CPUs must be a power of 2 (1, 2, 4, 8, 16)",
    })
    .optional(),
  ram: z
    .number()
    .int()
    .min(1)
    .max(64)
    .refine((n) => n > 0 && (n & (n - 1)) === 0, {
      message: "RAM must be a power of 2 (1, 2, 4, 8, 16, 32, 64)",
    })
    .optional(),
  disk: z
    .number()
    .int()
    .min(64)
    .max(1000)
    .refine((n) => n > 0 && (n & (n - 1)) === 0, {
      message: "Disk must be a power of 2 (64, 128, 256, 512)",
    })
    .optional(),
  gpus: z.number().int().min(0).max(1).optional(),
  "gpu-type": z.enum(["5090"]).optional(),
});

const VMCreationStatusEnum = z.enum([
  "success",
  "validation_failed",
  "internal_error",
  "resources_unavailable",
]);

export const VMCreationResponseSchema = z.object({
  status: VMCreationStatusEnum,
  vmId: z.string().optional(),
  msg: z.string(),
});

const VMDeletionStatusEnum = z.enum([
  "deletion_success",
  "deletion_failed_internal",
  "deletion_failed_not_found",
]);

export const VMDeletionResponseSchema = z.object({
  status: VMDeletionStatusEnum,
  vmId: z.string().optional(),
  msg: z.string(),
});

export const VMStatusEnum = z.enum([
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
]);
export type VMStatus = z.infer<typeof VMStatusEnum>;

export const VM_STATUS_GROUPS = {
  RUNNING: ["running"] as const,
  DELETABLE: [
    "creating",
    "initializing",
    "starting",
    "waiting_for_agent",
    "configuring",
    "running",
    "failed",
    "updating",
  ] as const,
} as const;

export function isVMStatusInGroup(
  status: VMStatus,
  group: readonly string[],
): boolean {
  return group.includes(status);
}

export const VMStatusResponseSchema = z.object({
  status: VMStatusEnum,
  msg: z.string(),
  info: z.any().optional(),
});

export const SSHKeySchema = z.object({
  _id: z.string(),
  _creationTime: z.number(),
  userId: z.string(),
  name: z.string(),
  publicKey: z.string(),
  fingerprint: z.string(),
  isPrimary: z.boolean(),
  createdAt: z.number(),
});

export const SSHKeyListResponseSchema = z.object({
  keys: z.array(SSHKeySchema),
});

export const SSHKeyAddResponseSchema = z.object({
  success: z.boolean(),
  keyId: z.string(),
  fingerprint: z.string(),
  keyType: z.string(),
  name: z.string(),
});

export const VMInfoSchema = z.object({
  _id: z.string(),
  _creationTime: z.number(),
  userId: z.string(),
  vmId: z.string(),
  name: z.string().optional(),
  cpus: z.number(),
  ram: z.number(),
  disk: z.number(),
  gpus: z.number(),
  gpuType: z.string(),
  status: VMStatusEnum,
  hours: z.number(),
  createdAt: z.number(),
  expiresAt: z.number(),
  deletedAt: z.number().optional(),
  orchestrationResponse: z.any().optional(),
});

export const VMListResponseSchema = z.object({
  vms: z.array(VMInfoSchema),
});

export const VMConnectionInfoSchema = z.object({
  vmId: z.string(),
  name: z.string().nullable(),
  sshHost: z.string(),
  sshPort: z.number(),
  user: z.string(),
  status: z.string(),
});

export const UserSchema = z.object({
  id: z.string(),
  name: z.string(),
  email: z.string().email(),
  emailVerified: z.boolean(),
  image: z.string().nullable().optional(),
  createdAt: z.number(),
});

export const UserResponseSchema = z.object({
  user: UserSchema,
});

export const ApiErrorResponseSchema = z.object({
  error: z.string(),
  message: z.string().optional(),
});

export const SSHKeyRemoveResponseSchema = z.object({
  success: z.boolean(),
  message: z.string().optional(),
});

export const SSHKeySetPrimaryResponseSchema = z.object({
  success: z.boolean(),
  message: z.string().optional(),
});

export const VersionResponseSchema = z.object({
  version: z.string(),
});
