"use client";

import { useRouter, useSearchParams } from "next/navigation";
import { authClient } from "@/lib/auth-client";
import Link from "next/link";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { toast } from "sonner";
import { useState } from "react";

export default function DeviceApprovalPage() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const userCode = searchParams.get("user_code");
  const { data: session } = authClient.useSession();
  const [isProcessing, setIsProcessing] = useState(false);

  const handleApprove = async () => {
    if (!userCode) return;

    setIsProcessing(true);
    try {
      await authClient.device.approve({
        userCode: userCode,
      });
      toast.success("device approved", {
        description: "device has been authorized to access your account",
      });
      setTimeout(() => router.push("/vms"), 2000);
    } catch (error) {
      toast.error("approval failed", {
        description: "failed to approve device, please try again",
      });
      setIsProcessing(false);
    }
  };

  const handleDeny = async () => {
    if (!userCode) return;

    setIsProcessing(true);
    try {
      await authClient.device.deny({
        userCode: userCode,
      });
      toast.success("device denied", {
        description: "device access has been denied",
      });
      setTimeout(() => router.push("/vms"), 2000);
    } catch (error) {
      toast.error("denial failed", {
        description: "failed to deny device, please try again",
      });
      setIsProcessing(false);
    }
  };

  if (!userCode) {
    return (
      <main className="min-h-screen flex items-center justify-center px-8 font-mono">
        <div className="max-w-md w-full text-center">
          <h2 className="text-xl font-semibold mb-4 text-black">
            invalid request
          </h2>
          <p className="text-gray-500 mb-8 text-sm">
            no device code provided. please start the authorization process
            again
          </p>
          <Button asChild>
            <Link href="/device">enter device code</Link>
          </Button>
        </div>
      </main>
    );
  }

  return (
    <main className="min-h-screen flex items-center justify-center px-8 font-mono">
      <div className="max-w-md w-full">
        <h2 className="text-xl font-semibold mb-2 text-center text-black">
          device authorization request
        </h2>
        <p className="text-gray-500 text-center mb-8 text-sm">
          a device is requesting access to your account
        </p>

        <div className="border border-gray-200 p-6 mb-8">
          <p className="text-sm text-gray-500 mb-2 text-center">device code:</p>
          <p className="text-2xl font-mono font-bold text-center text-black mb-4">
            {userCode}
          </p>
          <div className="text-sm text-gray-500 text-center">
            logged in as{" "}
            {session ? (
              <span className="text-black">{session.user.email}</span>
            ) : (
              <Skeleton className="inline-block h-4 w-48 align-middle" />
            )}
          </div>
        </div>

        <div className="space-y-4">
          <Button
            onClick={handleApprove}
            disabled={isProcessing}
            className="w-full"
          >
            {isProcessing ? "processing..." : "approve"}
          </Button>

          <Button
            onClick={handleDeny}
            disabled={isProcessing}
            variant="outline"
            className="w-full"
          >
            {isProcessing ? "processing..." : "deny"}
          </Button>
        </div>

        <p className="text-xs text-gray-500 text-center mt-6">
          only approve if you recognize this request and trust the device
        </p>
      </div>
    </main>
  );
}
