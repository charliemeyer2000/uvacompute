"use client";

import Link from "next/link";
import { useQuery } from "convex/react";
import { api } from "../../../../../convex/_generated/api";
import { Button } from "@/components/ui/button";
import { useEarlyAccessEnabled } from "../_components/early-access-context";
import { authClient } from "@/lib/auth-client";
import OnboardingContent from "../dashboard/_components/onboarding-content";

export default function OnboardingPage() {
  const { data: session } = authClient.useSession();
  const earlyAccessEnabled = useEarlyAccessEnabled();
  const hasEarlyAccess = useQuery(
    api.earlyAccess.hasEarlyAccess,
    session?.user ? {} : "skip",
  );

  return (
    <div className="space-y-8">
      <h1 className="text-2xl font-semibold mb-2">onboarding</h1>

      {earlyAccessEnabled && hasEarlyAccess === false && (
        <div className="bg-orange-50 border border-orange-200 p-4">
          <p className="text-sm text-gray-800">
            <strong>note:</strong> your account is pending approval. you can
            install and configure the cli, but you'll need approval before
            creating vms and accessing your dashboard.
          </p>
        </div>
      )}

      <OnboardingContent />

      <div className="flex gap-4">
        {hasEarlyAccess ? (
          <Button asChild>
            <Link href="/vms">go to vms</Link>
          </Button>
        ) : (
          <Button asChild>
            <Link href="/early-access">request early access</Link>
          </Button>
        )}
      </div>
    </div>
  );
}
