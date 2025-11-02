import { z } from "zod";

export const VMStatusEnum = z.enum([
  "not_found",
  "creating",
  "initializing",
  "starting",
  "waiting_for_agent",
  "configuring",
  "failed",
  "running",
  "deleting",
  "deleted",
  "updating",
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
  "deletion_failed_internal",
  "deletion_failed_not_found",
]);

export type VMDeletionStatus = z.infer<typeof VMDeletionStatusEnum>;

export const VMStatusResponseSchema = z.object({
  status: VMStatusEnum,
  msg: z.string(),
  info: z.any().optional(),
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

export type VMCreationRequest = z.infer<typeof VMCreationRequestSchema>;
