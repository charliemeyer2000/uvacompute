import { z } from "zod";

export const earlyAccessSchema = z.object({
  email: z
    .string()
    .min(1, "please enter your email address")
    .email("please enter a valid email address"),
  reason: z
    .string()
    .min(1, "please tell us why you're interested")
    .max(500, "please keep it under 500 characters"),
});

export type EarlyAccessFormData = z.infer<typeof earlyAccessSchema>;
