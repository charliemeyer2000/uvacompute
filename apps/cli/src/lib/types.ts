import {
  DeviceCodeResponseSchema,
  TokenErrorResponseSchema,
  TokenResponseSchema,
  TokenSuccessResponseSchema,
  VMCreationRequestSchema,
  VMCreationResponseSchema,
  VMDeletionResponseSchema,
  VMStatusResponseSchema,
} from "./schemas";
import type { z } from "zod";

export type DeviceCodeResponse = z.infer<typeof DeviceCodeResponseSchema>;
export type TokenSuccessResponse = z.infer<typeof TokenSuccessResponseSchema>;
export type TokenErrorResponse = z.infer<typeof TokenErrorResponseSchema>;
export type TokenResponse = z.infer<typeof TokenResponseSchema>;

export type VMCreationRequest = z.infer<typeof VMCreationRequestSchema>;
export type VMCreationResponse = z.infer<typeof VMCreationResponseSchema>;
export type VMDeletionResponse = z.infer<typeof VMDeletionResponseSchema>;
export type VMStatusResponse = z.infer<typeof VMStatusResponseSchema>;
