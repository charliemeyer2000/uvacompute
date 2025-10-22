"use client";

import { useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { useForm } from "@tanstack/react-form";
import { authClient } from "@/lib/auth-client";
import Link from "next/link";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Field, FieldGroup, FieldLabel } from "@/components/ui/field";
import { toast } from "sonner";
import { Eye, EyeOff } from "lucide-react";
import { loginSchema } from "./_schemas/login-schema";

export default function LoginPage() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const [showPassword, setShowPassword] = useState(false);
  const [socialLoading, setSocialLoading] = useState<
    "github" | "google" | null
  >(null);

  const redirectTo = searchParams.get("redirect") || "/dashboard";

  const form = useForm({
    defaultValues: {
      email: "",
      password: "",
    },
    validators: {
      onSubmit: loginSchema,
    },
    onSubmit: async ({ value }) => {
      await authClient.signIn.email(
        {
          email: value.email,
          password: value.password,
        },
        {
          onSuccess: () => {
            toast.success("signed in successfully!");
            router.push(redirectTo);
          },
          onError: (ctx) => {
            if (ctx.error.status === 403) {
              toast.error("email not verified", {
                description: "please verify your email to continue",
              });
              router.push(
                `/verify-email?email=${encodeURIComponent(value.email)}`,
              );
              return;
            }

            toast.error("sign in failed", {
              description: ctx.error.message,
            });
          },
        },
      );
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

  const handleSocialSignIn = async (provider: "github" | "google") => {
    setSocialLoading(provider);
    await authClient.signIn.social(
      {
        provider,
        callbackURL: redirectTo,
        newUserCallbackURL: "/onboarding",
      },
      {
        onError: (ctx) => {
          toast.error(`${provider} sign in failed`, {
            description: ctx.error.message,
          });
          setSocialLoading(null);
        },
      },
    );
  };

  return (
    <main className="min-h-screen flex items-center justify-center px-8 font-mono">
      <div className="max-w-md w-full">
        <h1 className="text-4xl font-normal mb-8 leading-tight">uvacompute</h1>

        <h2 className="text-xl font-semibold mt-8 mb-4 text-black">
          sign in to your account
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
                </Field>
              )}
            />

            <form.Field
              name="password"
              children={(field) => (
                <Field>
                  <FieldLabel htmlFor={field.name}>password</FieldLabel>
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
                      autoComplete="current-password"
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
                  <div className="mt-2 text-right">
                    <Link
                      href="/forgot-password"
                      className="text-sm text-orange-accent underline"
                    >
                      forgot password?
                    </Link>
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
              {form.state.isSubmitting ? "signing in..." : "sign in"}
            </Button>
          </div>

          <div className="relative py-4">
            <div className="absolute inset-0 flex items-center">
              <div className="w-full border-t border-gray-200" />
            </div>
            <div className="relative flex justify-center text-sm">
              <span className="px-2 bg-white text-gray-500">
                or continue with
              </span>
            </div>
          </div>

          <div className="grid grid-cols-2 gap-3">
            <Button
              type="button"
              variant="outline"
              onClick={() => handleSocialSignIn("github")}
              disabled={form.state.isSubmitting || socialLoading !== null}
              className="w-full"
            >
              {socialLoading === "github" ? (
                <span className="text-gray-500">loading...</span>
              ) : (
                <>
                  <svg
                    className="w-5 h-5"
                    fill="currentColor"
                    viewBox="0 0 24 24"
                  >
                    <path d="M12 0c-6.626 0-12 5.373-12 12 0 5.302 3.438 9.8 8.207 11.387.599.111.793-.261.793-.577v-2.234c-3.338.726-4.033-1.416-4.033-1.416-.546-1.387-1.333-1.756-1.333-1.756-1.089-.745.083-.729.083-.729 1.205.084 1.839 1.237 1.839 1.237 1.07 1.834 2.807 1.304 3.492.997.107-.775.418-1.305.762-1.604-2.665-.305-5.467-1.334-5.467-5.931 0-1.311.469-2.381 1.236-3.221-.124-.303-.535-1.524.117-3.176 0 0 1.008-.322 3.301 1.23.957-.266 1.983-.399 3.003-.404 1.02.005 2.047.138 3.006.404 2.291-1.552 3.297-1.23 3.297-1.23.653 1.653.242 2.874.118 3.176.77.84 1.235 1.911 1.235 3.221 0 4.609-2.807 5.624-5.479 5.921.43.372.823 1.102.823 2.222v3.293c0 .319.192.694.801.576 4.765-1.589 8.199-6.086 8.199-11.386 0-6.627-5.373-12-12-12z" />
                  </svg>
                  <span className="ml-2">github</span>
                </>
              )}
            </Button>

            <Button
              type="button"
              variant="outline"
              onClick={() => handleSocialSignIn("google")}
              disabled={form.state.isSubmitting || socialLoading !== null}
              className="w-full"
            >
              {socialLoading === "google" ? (
                <span className="text-gray-500">loading...</span>
              ) : (
                <>
                  <svg className="w-5 h-5" viewBox="0 0 24 24">
                    <path
                      fill="#4285F4"
                      d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z"
                    />
                    <path
                      fill="#34A853"
                      d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z"
                    />
                    <path
                      fill="#FBBC05"
                      d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z"
                    />
                    <path
                      fill="#EA4335"
                      d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z"
                    />
                  </svg>
                  <span className="ml-2">google</span>
                </>
              )}
            </Button>
          </div>

          <div className="pt-4 text-sm">
            don&apos;t have an account?{" "}
            <Link href="/signup" className="text-orange-accent underline">
              sign up
            </Link>
          </div>
        </form>
      </div>
    </main>
  );
}
