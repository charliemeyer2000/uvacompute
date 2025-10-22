import { z } from "zod";

export const deviceSchema = z.object({
  userCode: z
    .string()
    .min(1, "please enter the device code")
    .min(4, "device code must be at least 4 characters")
    .transform((val) => val.trim().replace(/-/g, "").toUpperCase()),
});

export type DeviceFormData = z.infer<typeof deviceSchema>;
