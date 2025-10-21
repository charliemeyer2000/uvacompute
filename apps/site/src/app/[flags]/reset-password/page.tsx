"use client";

import { useEffect, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { useForm } from "@tanstack/react-form";
import { authClient } from "@/lib/auth-client";
import Link from "next/link";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Field, FieldGroup, FieldLabel } from "@/components/ui/field";
import { toast } from "sonner";
import { Eye, EyeOff } from "lucide-react";
import { resetPasswordSchema } from "./_schemas/reset-password-schema";

export default function ResetPasswordPage() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const token = searchParams.get("token");
  const [showPassword, setShowPassword] = useState(false);
  const [tokenError, setTokenError] = useState(false);

  useEffect(() => {
    if (!token) {
      setTokenError(true);
      toast.error("invalid reset link", {
        description: "no token found in the URL",
      });
    }
  }, [token]);

  const form = useForm({
    defaultValues: {
      password: "",
      confirmPassword: "",
    },
    validators: {
      onSubmit: resetPasswordSchema,
    },
    onSubmit: async ({ value }) => {
      if (!token) {
        toast.error("invalid reset link");
        return;
      }

      try {
        await authClient.resetPassword({
          newPassword: value.password,
          token,
        });

        toast.success("password reset successfully!", {
          description: "you can now sign in with your new password",
        });

        setTimeout(() => {
          router.push("/login");
        }, 2000);
      } catch (error) {
        const errorMessage =
          error instanceof Error ? error.message : "failed to reset password";

        if (
          errorMessage.toLowerCase().includes("expired") ||
          errorMessage.toLowerCase().includes("invalid")
        ) {
          setTokenError(true);
        }

        toast.error("password reset failed", {
          description: errorMessage,
        });
      }
    },
    onSubmitInvalid: ({ formApi }) => {
      const firstErrorField = Object.values(formApi.state.fieldMeta).find(
        (field) => field.errors.length > 0,
      );

      const error = firstErrorField?.errors[0];
      const errorMessage = typeof error === "string" ? error : error?.message;

      if (errorMessage) {
        toast.error("validation error", {
          description: errorMessage,
        });
      }
    },
  });

  if (tokenError) {
    return (
      <main className="min-h-screen flex items-center justify-center px-8 font-mono">
        <div className="max-w-md w-full">
          <h1 className="text-4xl font-normal mb-8 leading-tight">
            uvacompute
          </h1>

          <div className="space-y-6">
            <div>
              <h2 className="text-xl font-semibold mb-2 text-black">
                invalid or expired link
              </h2>
              <p className="text-sm text-gray-600 mb-4">
                this password reset link is invalid or has expired.
              </p>
              <p className="text-sm text-gray-600">
                reset links expire after 1 hour for security reasons. please
                request a new password reset link.
              </p>
            </div>

            <div className="space-y-2">
              <Button asChild className="w-full">
                <Link href="/forgot-password">request new reset link</Link>
              </Button>

              <Button asChild variant="outline" className="w-full">
                <Link href="/login">back to login</Link>
              </Button>
            </div>
          </div>
        </div>
      </main>
    );
  }

  return (
    <main className="min-h-screen flex items-center justify-center px-8 font-mono">
      <div className="max-w-md w-full">
        <h1 className="text-4xl font-normal mb-8 leading-tight">uvacompute</h1>

        <h2 className="text-xl font-semibold mt-8 mb-4 text-black">
          set new password
        </h2>

        <form
          className="space-y-4"
          onSubmit={(e) => {
            e.preventDefault();
            form.handleSubmit();
          }}
          noValidate
        >
          <FieldGroup>
            <form.Field
              name="password"
              children={(field) => (
                <Field>
                  <FieldLabel htmlFor={field.name}>new password</FieldLabel>
                  <div className="relative">
                    <Input
                      id={field.name}
                      name={field.name}
                      type={showPassword ? "text" : "password"}
                      value={field.state.value}
                      onBlur={field.handleBlur}
                      onChange={(e: React.ChangeEvent<HTMLInputElement>) =>
                        field.handleChange(e.target.value)
                      }
                      aria-invalid={!field.state.meta.isValid}
                      placeholder="••••••••"
                      autoComplete="new-password"
                      className="pr-10"
                    />
                    <button
                      type="button"
                      onClick={() => setShowPassword(!showPassword)}
                      className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-500 hover:text-black cursor-pointer"
                    >
                      {showPassword ? (
                        <EyeOff className="h-4 w-4" />
                      ) : (
                        <Eye className="h-4 w-4" />
                      )}
                    </button>
                  </div>
                  <p className="text-xs text-gray-600 mt-2">
                    must be at least 8 characters
                  </p>
                </Field>
              )}
            />

            <form.Field
              name="confirmPassword"
              children={(field) => (
                <Field>
                  <FieldLabel htmlFor={field.name}>
                    confirm new password
                  </FieldLabel>
                  <div className="relative">
                    <Input
                      id={field.name}
                      name={field.name}
                      type={showPassword ? "text" : "password"}
                      value={field.state.value}
                      onBlur={field.handleBlur}
                      onChange={(e: React.ChangeEvent<HTMLInputElement>) =>
                        field.handleChange(e.target.value)
                      }
                      aria-invalid={!field.state.meta.isValid}
                      placeholder="••••••••"
                      autoComplete="new-password"
                      className="pr-10"
                    />
                    <button
                      type="button"
                      onClick={() => setShowPassword(!showPassword)}
                      className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-500 hover:text-black cursor-pointer"
                    >
                      {showPassword ? (
                        <EyeOff className="h-4 w-4" />
                      ) : (
                        <Eye className="h-4 w-4" />
                      )}
                    </button>
                  </div>
                </Field>
              )}
            />
          </FieldGroup>

          <div className="pt-2">
            <Button
              type="submit"
              disabled={form.state.isSubmitting}
              className="w-full"
            >
              {form.state.isSubmitting
                ? "resetting password..."
                : "reset password"}
            </Button>
          </div>

          <div className="pt-4 text-sm">
            <Link href="/login" className="text-orange-accent underline">
              back to login
            </Link>
          </div>
        </form>
      </div>
    </main>
  );
}
