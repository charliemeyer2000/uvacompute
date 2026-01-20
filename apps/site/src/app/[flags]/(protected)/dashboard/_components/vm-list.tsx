"use client";

import { useQuery } from "convex/react";
import { api } from "../../../../../../convex/_generated/api";
import { authClient } from "@/lib/auth-client";
import ActiveVMs from "./active-vms";
import VMHistory from "./vm-history";
import ActiveJobs from "./active-jobs";
import JobHistory from "./job-history";
import OnboardingContent from "./onboarding-content";

export default function VMList() {
  const { data: session } = authClient.useSession();

  const allVMs = useQuery(
    api.vms.listByUser,
    session?.user?.id ? { userId: session.user.id } : "skip",
  );

  const allJobs = useQuery(
    api.jobs.listByUser,
    session?.user?.id ? { userId: session.user.id } : "skip",
  );

  const hasNoResources =
    allVMs && allJobs && allVMs.length === 0 && allJobs.length === 0;

  if (hasNoResources) {
    return (
      <div className="space-y-6">
        <div>
          <h2 className="text-xl font-semibold text-black mb-2">
            getting started
          </h2>
          <p className="text-sm text-gray-600">
            follow these steps to create your first vm or run a container job
          </p>
        </div>
        <OnboardingContent />
      </div>
    );
  }

  return (
    <div className="space-y-8">
      <ActiveVMs />
      <ActiveJobs />
      <VMHistory />
      <JobHistory />
    </div>
  );
}
