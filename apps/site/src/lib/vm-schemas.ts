import { z } from "zod";

export const VMStatusEnum = z.enum([
  "not_found",
  "creating",
  "pending",
  "booting",
  "provisioning",
  "ready",
  "stopping",
  "stopped",
  "failed",
  "offline",
]);

export type VMStatus = z.infer<typeof VMStatusEnum>;

export const VMCreationStatusEnum = z.enum([
  "success",
  "validation_failed",
  "internal_error",
  "resources_unavailable",
]);

export type VMCreationStatus = z.infer<typeof VMCreationStatusEnum>;

export const VMDeletionStatusEnum = z.enum([
  "deletion_success",
  "deletion_pending",
  "deletion_failed_internal",
  "deletion_failed_not_found",
]);

export type VMDeletionStatus = z.infer<typeof VMDeletionStatusEnum>;

export const VMExtendStatusEnum = z.enum([
  "extend_success",
  "extend_failed_validation",
  "extend_failed_not_found",
  "extend_failed_internal",
]);

export type VMExtendStatus = z.infer<typeof VMExtendStatusEnum>;

export const VMStatusResponseSchema = z.object({
  status: VMStatusEnum,
  msg: z.string(),
  info: z.any().optional(),
  exposeUrl: z.string().optional(),
});

export type VMStatusResponse = z.infer<typeof VMStatusResponseSchema>;

export const VMCreationResponseSchema = z.object({
  status: VMCreationStatusEnum,
  vmId: z.string().optional(),
  msg: z.string(),
});

export type VMCreationResponse = z.infer<typeof VMCreationResponseSchema>;

export const VMDeletionResponseSchema = z.object({
  status: VMDeletionStatusEnum,
  vmId: z.string().optional(),
  msg: z.string(),
});

export type VMDeletionResponse = z.infer<typeof VMDeletionResponseSchema>;

export const VMExtendRequestSchema = z.object({
  hours: z.number().int().min(1),
});

export type VMExtendRequest = z.infer<typeof VMExtendRequestSchema>;

export const VMExtendResponseSchema = z.object({
  status: VMExtendStatusEnum,
  vmId: z.string().optional(),
  expiresAt: z.number().optional(),
  msg: z.string(),
});

export type VMExtendResponse = z.infer<typeof VMExtendResponseSchema>;

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
  disk: z.number().int().min(10).max(500).optional(),
  gpus: z.number().int().min(0).max(1).optional(),
  "gpu-type": z.enum(["5090"]).optional(),
  startupScript: z
    .string()
    .max(1048576, "Startup script must be less than 1MB")
    .optional(),
  cloudInitConfig: z
    .string()
    .max(102400, "Cloud-init config must be less than 100KB")
    .optional(),
  expose: z
    .number()
    .int()
    .min(1, "Port must be at least 1")
    .max(65535, "Port must be at most 65535")
    .optional(),
});

export type VMCreationRequest = z.infer<typeof VMCreationRequestSchema>;
