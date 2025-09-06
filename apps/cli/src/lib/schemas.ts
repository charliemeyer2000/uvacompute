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
