import {
  DeviceCodeResponseSchema,
  TokenErrorResponseSchema,
  TokenResponseSchema,
  TokenSuccessResponseSchema,
} from "./schemas";
import type { z } from "zod";

export type DeviceCodeResponse = z.infer<typeof DeviceCodeResponseSchema>;
export type TokenSuccessResponse = z.infer<typeof TokenSuccessResponseSchema>;
export type TokenErrorResponse = z.infer<typeof TokenErrorResponseSchema>;
export type TokenResponse = z.infer<typeof TokenResponseSchema>;
