"use client";

import { useRouter } from "next/navigation";
import { authClient } from "@/lib/auth-client";
import { Button } from "@/components/ui/button";
import { toast } from "sonner";

export default function PendingApprovalPage() {
  const router = useRouter();

  const handleSignOut = async () => {
    try {
      await authClient.signOut();
      router.push("/login");
      toast.success("signed out successfully");
    } catch (error) {
      toast.error("sign out failed", {
        description:
          error instanceof Error ? error.message : "an error occurred",
      });
    }
  };

  return (
    <main className="min-h-screen flex items-center justify-center px-8 font-mono">
      <div className="max-w-md w-full">
        <h1 className="text-4xl font-normal mb-8 leading-tight">uvacompute</h1>

        <div className="space-y-6">
          <div>
            <h2 className="text-xl font-semibold mb-2 text-black">
              pending approval
            </h2>
            <p className="text-sm text-gray-600 mb-4">
              your account is awaiting approval for early access. we'll review
              your request and notify you once approved.
            </p>
            <p className="text-sm text-gray-600">
              this typically takes 24-48 hours.
            </p>
          </div>

          <div className="bg-gray-50 border border-gray-200 p-4">
            <p className="text-xs text-gray-600">
              check your email for updates. we'll send you a notification once
              your account has been approved.
            </p>
          </div>

          <Button onClick={handleSignOut} variant="outline" className="w-full">
            sign out
          </Button>
        </div>
      </div>
    </main>
  );
}
