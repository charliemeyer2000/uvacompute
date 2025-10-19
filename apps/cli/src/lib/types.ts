import {
  DeviceCodeResponseSchema,
  TokenErrorResponseSchema,
  TokenResponseSchema,
  TokenSuccessResponseSchema,
  VMCreationRequestSchema,
  VMCreationResponseSchema,
  VMDeletionResponseSchema,
  VMStatusResponseSchema,
  SSHKeySchema,
  SSHKeyListResponseSchema,
  SSHKeyAddResponseSchema,
  VMInfoSchema,
  VMListResponseSchema,
  VMConnectionInfoSchema,
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

export type SSHKey = z.infer<typeof SSHKeySchema>;
export type SSHKeyListResponse = z.infer<typeof SSHKeyListResponseSchema>;
export type SSHKeyAddResponse = z.infer<typeof SSHKeyAddResponseSchema>;
export type VMInfo = z.infer<typeof VMInfoSchema>;
export type VMListResponse = z.infer<typeof VMListResponseSchema>;
export type VMConnectionInfo = z.infer<typeof VMConnectionInfoSchema>;
