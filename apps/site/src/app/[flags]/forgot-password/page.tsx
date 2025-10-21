"use client";

import { useState } from "react";
import { useForm } from "@tanstack/react-form";
import { authClient } from "@/lib/auth-client";
import Link from "next/link";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Field, FieldGroup, FieldLabel } from "@/components/ui/field";
import { toast } from "sonner";
import { forgotPasswordSchema } from "./_schemas/forgot-password-schema";

export default function ForgotPasswordPage() {
  const [isSuccess, setIsSuccess] = useState(false);

  const form = useForm({
    defaultValues: {
      email: "",
    },
    validators: {
      onSubmit: forgotPasswordSchema,
    },
    onSubmit: async ({ value }) => {
      try {
        await authClient.forgetPassword({
          email: value.email,
          redirectTo: "/reset-password",
        });

        setIsSuccess(true);
        toast.success("password reset email sent!", {
          description: "check your inbox for the reset link",
        });
      } catch (error) {
        toast.error("failed to send reset email", {
          description:
            error instanceof Error ? error.message : "please try again",
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

  if (isSuccess) {
    return (
      <main className="min-h-screen flex items-center justify-center px-8 font-mono">
        <div className="max-w-md w-full">
          <h1 className="text-4xl font-normal mb-8 leading-tight">
            uvacompute
          </h1>

          <div className="space-y-6">
            <div>
              <h2 className="text-xl font-semibold mb-2 text-black">
                check your email
              </h2>
              <p className="text-sm text-gray-600 mb-4">
                we've sent a password reset link to your email address.
              </p>
              <p className="text-sm text-gray-600">
                click the link in the email to reset your password. the link
                will expire in 1 hour.
              </p>
            </div>

            <div className="bg-gray-50 border border-gray-200 p-4">
              <p className="text-xs text-gray-600">
                didn't receive the email? check your spam folder or try again.
              </p>
            </div>

            <div className="pt-4 text-sm space-y-2">
              <Link
                href="/login"
                className="text-orange-accent underline block"
              >
                back to login
              </Link>
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
          reset your password
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
              name="email"
              children={(field) => (
                <Field>
                  <FieldLabel htmlFor={field.name}>email address</FieldLabel>
                  <Input
                    id={field.name}
                    name={field.name}
                    type="email"
                    value={field.state.value}
                    onBlur={field.handleBlur}
                    onChange={(e: React.ChangeEvent<HTMLInputElement>) =>
                      field.handleChange(e.target.value)
                    }
                    aria-invalid={!field.state.meta.isValid}
                    placeholder="your@email.com"
                    autoComplete="email"
                  />
                  <p className="text-xs text-gray-600 mt-2">
                    enter the email address associated with your account and
                    we'll send you a link to reset your password.
                  </p>
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
              {form.state.isSubmitting ? "sending..." : "send reset link"}
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
