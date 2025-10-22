import { z } from "zod";

export const signupSchema = z
  .object({
    name: z
      .string()
      .min(1, "please enter your full name")
      .refine(
        (name) => {
          const parts = name.trim().split(/\s+/);
          return parts.length >= 2;
        },
        {
          message: "please enter both first and last name",
        },
      )
      .refine(
        (name) => {
          const parts = name.trim().split(/\s+/);
          return parts.every((part) => part.length >= 2);
        },
        {
          message: "each name must be at least 2 characters",
        },
      ),
    email: z
      .string()
      .min(1, "please enter your email address")
      .email("please enter a valid email address"),
    password: z
      .string()
      .min(1, "please enter a password")
      .min(8, "password must be at least 8 characters"),
    confirmPassword: z.string().min(1, "please confirm your password"),
  })
  .refine((data) => data.password === data.confirmPassword, {
    message: "passwords do not match",
    path: ["confirmPassword"],
  });

export type SignupFormData = z.infer<typeof signupSchema>;
