"use client";

import { useQuery } from "convex/react";
import { api } from "../../../../../convex/_generated/api";
import { authClient } from "@/lib/auth-client";
import ActiveJobs from "../dashboard/_components/active-jobs";
import JobHistory from "../dashboard/_components/job-history";
import OnboardingContent from "../dashboard/_components/onboarding-content";

export default function JobsPage() {
  const { data: session } = authClient.useSession();

  const allJobs = useQuery(
    api.jobs.listByUser,
    session?.user?.id ? { userId: session.user.id } : "skip",
  );

  const hasNoJobs = allJobs && allJobs.length === 0;

  if (hasNoJobs) {
    return (
      <div className="border-t border-gray-200 pt-8 space-y-6">
        <div>
          <h2 className="text-xl font-semibold text-black mb-2">
            getting started with jobs
          </h2>
          <p className="text-sm text-gray-600">
            run container jobs with a single command
          </p>
        </div>
        <OnboardingContent showOnlyJobs />
      </div>
    );
  }

  return (
    <div className="border-t border-gray-200 pt-8 space-y-8">
      <ActiveJobs />
      <JobHistory />
    </div>
  );
}
