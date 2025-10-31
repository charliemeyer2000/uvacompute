"use client";

import { useQuery } from "convex/react";
import { api } from "../../../../../../convex/_generated/api";
import { authClient } from "@/lib/auth-client";
import ActiveVMs from "./active-vms";
import VMHistory from "./vm-history";
import OnboardingContent from "./onboarding-content";

export default function VMList() {
  const { data: session } = authClient.useSession();

  const allVMs = useQuery(
    api.vms.listByUser,
    session?.user?.id ? { userId: session.user.id } : "skip",
  );

  if (allVMs && allVMs.length === 0) {
    return (
      <div className="space-y-6">
        <div>
          <h2 className="text-xl font-semibold text-black mb-2">
            getting started
          </h2>
          <p className="text-sm text-gray-600">
            follow these steps to create your first vm
          </p>
        </div>
        <OnboardingContent />
      </div>
    );
  }

  return (
    <div className="space-y-8">
      <ActiveVMs />
      <VMHistory />
    </div>
  );
}
