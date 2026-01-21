import { z } from "zod";

export const JobStatusEnum = z.enum([
  "pending",
  "scheduled",
  "pulling",
  "running",
  "completed",
  "failed",
  "cancelled",
  "node_offline",
]);

export type JobStatus = z.infer<typeof JobStatusEnum>;

export const JobCreationStatusEnum = z.enum([
  "success",
  "validation_failed",
  "internal_error",
  "resources_unavailable",
]);

export type JobCreationStatus = z.infer<typeof JobCreationStatusEnum>;

export const JobCancellationStatusEnum = z.enum([
  "cancellation_success",
  "cancellation_failed_internal",
  "cancellation_failed_not_found",
  "cancellation_failed_not_cancellable",
]);

export type JobCancellationStatus = z.infer<typeof JobCancellationStatusEnum>;

export const JobCreationRequestSchema = z.object({
  image: z.string().min(1, "Image is required"),
  command: z.array(z.string()).optional(),
  env: z.record(z.string(), z.string()).optional(),
  name: z.string().max(255).optional(),
  cpus: z.number().int().min(1).max(16).optional().default(1),
  ram: z.number().int().min(1).max(64).optional().default(4),
  gpus: z.number().int().min(0).max(1).optional().default(0),
  disk: z.number().int().min(0).max(100).optional().default(0),
});

export type JobCreationRequest = z.infer<typeof JobCreationRequestSchema>;

export const JobCreationResponseSchema = z.object({
  status: JobCreationStatusEnum,
  jobId: z.string().optional(),
  msg: z.string(),
});

export type JobCreationResponse = z.infer<typeof JobCreationResponseSchema>;

export const JobCancellationResponseSchema = z.object({
  status: JobCancellationStatusEnum,
  jobId: z.string().optional(),
  msg: z.string(),
});

export type JobCancellationResponse = z.infer<
  typeof JobCancellationResponseSchema
>;

export const JobStatusResponseSchema = z.object({
  status: JobStatusEnum,
  msg: z.string(),
  exitCode: z.number().optional(),
  errorMessage: z.string().optional(),
});

export type JobStatusResponse = z.infer<typeof JobStatusResponseSchema>;
