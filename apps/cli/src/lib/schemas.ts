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

export const VMCreationResponseSchema = z.object({
  status: z.enum([
    "success",
    "validation_failed",
    "internal_error",
    "resources_unavailable",
  ]),
  vmId: z.string().optional(),
  msg: z.string(),
});

export const VMDeletionResponseSchema = z.object({
  status: z.enum([
    "deletion_success",
    "deletion_failed_internal",
    "deletion_failed_not_found",
  ]),
  vmId: z.string().optional(),
  msg: z.string(),
});

export const VMStatusResponseSchema = z.object({
  status: z.enum([
    "not_found",
    "creating",
    "failed",
    "running",
    "deleting",
    "deleted",
    "updating",
  ]),
  msg: z.string(),
  info: z.any().optional(),
});
