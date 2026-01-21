"use client";

import Link from "next/link";
import { useQuery } from "convex/react";
import { api } from "../../../../../convex/_generated/api";
import { authClient } from "@/lib/auth-client";
import ActiveJobs from "../dashboard/_components/active-jobs";
import JobHistory from "../dashboard/_components/job-history";

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
        <div className="border border-gray-200 p-8 text-center">
          <h2 className="text-xl font-semibold text-black mb-2">no jobs yet</h2>
          <p className="text-sm text-gray-600 mb-4">
            you haven&apos;t run any container jobs yet.
          </p>
          <Link href="/docs/jobs" className="text-orange-accent underline">
            learn how to run a job &rarr;
          </Link>
        </div>
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
