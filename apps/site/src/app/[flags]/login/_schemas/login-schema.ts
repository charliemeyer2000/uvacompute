import { z } from "zod";

export const loginSchema = z.object({
  email: z
    .string()
    .min(1, "please enter your email address")
    .email("please enter a valid email address"),
  password: z.string().min(1, "please enter your password"),
});

export type LoginFormData = z.infer<typeof loginSchema>;
