"use client";

import { useRouter, useSearchParams } from "next/navigation";
import { useForm } from "@tanstack/react-form";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Field, FieldGroup, FieldLabel } from "@/components/ui/field";
import { toast } from "sonner";
import { deviceSchema } from "./_schemas/device-schema";

export default function DeviceAuthorizationPage() {
  const router = useRouter();
  const searchParams = useSearchParams();

  const form = useForm({
    defaultValues: {
      userCode: searchParams.get("user_code") || "",
    },
    validators: {
      onSubmit: deviceSchema,
    },
    onSubmit: async ({ value }) => {
      try {
        const response = await fetch(
          `/api/auth/device?user_code=${value.userCode}`,
        );

        if (response.ok) {
          const data = await response.json();
          if (data) {
            router.push(`/device/approve?user_code=${value.userCode}`);
          } else {
            toast.error("verification failed", {
              description: "invalid or expired code",
            });
          }
        } else {
          toast.error("verification failed", {
            description: "invalid or expired code",
          });
        }
      } catch (error) {
        toast.error("verification failed", {
          description: "unable to verify device code",
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

  return (
    <main className="min-h-screen flex items-center justify-center px-8 font-mono">
      <div className="max-w-md w-full">
        <h2 className="text-xl font-semibold mt-8 mb-2 text-center text-black">
          device authorization
        </h2>
        <p className="text-gray-500 text-center mb-8 text-sm">
          enter the code displayed on your device
        </p>

        <form
          onSubmit={(e) => {
            e.preventDefault();
            form.handleSubmit();
          }}
          noValidate
        >
          <FieldGroup>
            <form.Field
              name="userCode"
              children={(field) => (
                <Field>
                  <FieldLabel htmlFor={field.name}>device code</FieldLabel>
                  <Input
                    id={field.name}
                    name={field.name}
                    type="text"
                    value={field.state.value}
                    onBlur={field.handleBlur}
                    onChange={(e: React.ChangeEvent<HTMLInputElement>) =>
                      field.handleChange(e.target.value.toUpperCase())
                    }
                    aria-invalid={!field.state.meta.isValid}
                    placeholder="ABCD-1234"
                    maxLength={12}
                    className="text-center text-lg uppercase"
                    autoComplete="off"
                  />
                </Field>
              )}
            />
          </FieldGroup>

          <div className="pt-6">
            <Button
              type="submit"
              disabled={form.state.isSubmitting}
              className="w-full"
            >
              {form.state.isSubmitting ? "verifying..." : "continue"}
            </Button>
          </div>
        </form>

        <p className="text-xs text-gray-500 text-center mt-6">
          this code was provided by your device or application
        </p>
      </div>
    </main>
  );
}
