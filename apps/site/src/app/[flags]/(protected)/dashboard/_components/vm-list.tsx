"use client";

import Link from "next/link";
import { useQuery } from "convex/react";
import { api } from "../../../../../../convex/_generated/api";
import ActiveVMs from "./active-vms";
import VMHistory from "./vm-history";
import ActiveJobs from "./active-jobs";
import JobHistory from "./job-history";

export default function VMList({ userId }: { userId: string }) {
  const allVMs = useQuery(api.vms.listByUser, { userId });

  const allJobs = useQuery(api.jobs.listByUser, { userId });

  const hasNoResources =
    allVMs && allJobs && allVMs.length === 0 && allJobs.length === 0;

  if (hasNoResources) {
    return (
      <div className="space-y-6">
        <div className="border border-gray-200 p-8 text-center">
          <h2 className="text-xl font-semibold text-black mb-2">
            welcome to uvacompute
          </h2>
          <p className="text-sm text-gray-600 mb-4">
            you haven&apos;t created any vms or run any jobs yet.
          </p>
          <Link href="/docs" className="text-orange-accent underline">
            get started with the documentation &rarr;
          </Link>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-8">
      <ActiveVMs userId={userId} />
      <ActiveJobs userId={userId} />
      <VMHistory userId={userId} />
      <JobHistory userId={userId} />
    </div>
  );
}
