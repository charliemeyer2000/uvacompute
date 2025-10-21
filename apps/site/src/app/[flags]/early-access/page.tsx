"use client";

import { useState } from "react";
import { useForm } from "@tanstack/react-form";
import Link from "next/link";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import {
  Field,
  FieldDescription,
  FieldGroup,
  FieldLabel,
} from "@/components/ui/field";
import { toast } from "sonner";
import { earlyAccessSchema } from "./_schemas/early-access-schema";
import { submitEarlyAccess } from "./_actions/submit-early-access";

export default function EarlyAccessPage() {
  const [isSuccess, setIsSuccess] = useState(false);

  const form = useForm({
    defaultValues: {
      email: "",
      reason: "",
    },
    validators: {
      onSubmit: earlyAccessSchema,
    },
    onSubmit: async ({ value }) => {
      try {
        await submitEarlyAccess({
          email: value.email,
          reason: value.reason,
        });

        setIsSuccess(true);
        toast.success("request submitted!", {
          description: "we'll be in touch soon",
        });
      } catch (error) {
        toast.error("submission failed", {
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
                request submitted
              </h2>
              <p className="text-sm text-gray-600 mb-4">
                thanks for your interest in uvacompute! we'll review your
                request and get back to you soon.
              </p>
            </div>

            <div className="bg-gray-50 border border-gray-200 p-4">
              <p className="text-xs text-gray-600">
                keep an eye on your inbox. we typically respond within 24-48
                hours.
              </p>
            </div>

            <Button asChild variant="outline" className="w-full">
              <Link href="/">back to home</Link>
            </Button>
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
          early access
        </h2>

        <p className="text-sm text-gray-600 mb-6">
          interested in trying uvacompute? tell us a bit about yourself and
          we'll get you set up.
        </p>

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
              name="reason"
              children={(field) => (
                <Field>
                  <FieldLabel htmlFor={field.name}>
                    why do you want to use uvacompute?
                  </FieldLabel>
                  <Textarea
                    id={field.name}
                    name={field.name}
                    value={field.state.value}
                    onBlur={field.handleBlur}
                    onChange={(e: React.ChangeEvent<HTMLTextAreaElement>) =>
                      field.handleChange(e.target.value)
                    }
                    aria-invalid={!field.state.meta.isValid}
                    placeholder="tell us briefly what you'd like to use it for..."
                    rows={4}
                  />
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
                ? "submitting..."
                : "request early access"}
            </Button>
          </div>

          <div className="pt-4 text-sm text-center">
            <Link href="/" className="text-orange-accent underline">
              back to home
            </Link>
          </div>
        </form>
      </div>
    </main>
  );
}
