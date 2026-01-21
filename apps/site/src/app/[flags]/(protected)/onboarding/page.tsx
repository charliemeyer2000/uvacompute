"use client";

import Link from "next/link";
import { useQuery } from "convex/react";
import { api } from "../../../../../convex/_generated/api";
import { Button } from "@/components/ui/button";
import { useEarlyAccessEnabled } from "../_components/early-access-context";
import { authClient } from "@/lib/auth-client";

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

      <div className="border border-gray-200 p-6 space-y-4">
        <h2 className="text-lg font-semibold">getting started</h2>
        <p className="text-sm text-gray-600">
          check out our documentation to learn how to use uvacompute:
        </p>
        <ul className="space-y-2 text-sm">
          <li>
            <Link href="/docs" className="text-orange-accent underline">
              getting started guide
            </Link>{" "}
            - install the cli and authenticate
          </li>
          <li>
            <Link href="/docs/vms" className="text-orange-accent underline">
              virtual machines
            </Link>{" "}
            - create and manage gpu-powered vms
          </li>
          <li>
            <Link href="/docs/jobs" className="text-orange-accent underline">
              container jobs
            </Link>{" "}
            - run docker containers on demand
          </li>
        </ul>
      </div>

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
