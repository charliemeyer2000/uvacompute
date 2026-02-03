"use client";

import { useState } from "react";
import Link from "next/link";
import { usePreloadedQuery, Preloaded } from "convex/react";
import { api } from "../../../../../../convex/_generated/api";
import ActiveJobs from "../../dashboard/_components/active-jobs";
import JobHistory from "../../dashboard/_components/job-history";
import { Container } from "lucide-react";

type Tab = "active" | "history";

function TabButton({
  active,
  onClick,
  children,
  count,
}: {
  active: boolean;
  onClick: () => void;
  children: React.ReactNode;
  count?: number;
}) {
  return (
    <button
      onClick={onClick}
      className={`relative px-4 py-2 text-sm font-medium transition-colors ${
        active ? "text-black" : "text-gray-500 hover:text-black"
      }`}
    >
      <span className="flex items-center gap-2">
        {children}
        {count !== undefined && (
          <span
            className={`text-xs px-1.5 py-0.5 rounded ${
              active
                ? "bg-orange-accent/10 text-orange-accent"
                : "bg-gray-100 text-gray-500"
            }`}
          >
            {count}
          </span>
        )}
      </span>
      {active && (
        <span className="absolute bottom-0 left-0 right-0 h-[2px] bg-orange-accent" />
      )}
    </button>
  );
}

export default function JobsPageClient({
  preloadedAllJobs,
  preloadedActiveJobs,
  preloadedInactiveJobs,
  userId,
}: {
  preloadedAllJobs: Preloaded<typeof api.jobs.listByUser>;
  preloadedActiveJobs: Preloaded<typeof api.jobs.listActiveByUser>;
  preloadedInactiveJobs: Preloaded<typeof api.jobs.listInactiveByUser>;
  userId: string;
}) {
  const [activeTab, setActiveTab] = useState<Tab>("active");

  const allJobs = usePreloadedQuery(preloadedAllJobs);
  const activeJobs = usePreloadedQuery(preloadedActiveJobs);
  const inactiveJobs = usePreloadedQuery(preloadedInactiveJobs);

  const hasNoJobs = allJobs && allJobs.length === 0;

  if (hasNoJobs) {
    return (
      <div className="space-y-6">
        {/* Page Header */}
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-2xl font-semibold text-black">
              container jobs
            </h1>
            <p className="text-sm text-gray-500 mt-1">
              run containerized workloads on the cluster
            </p>
          </div>
        </div>

        {/* Empty State */}
        <div className="border border-gray-200 bg-white p-12 text-center">
          <div className="mx-auto w-12 h-12 bg-gray-100 rounded-lg flex items-center justify-center mb-4">
            <Container className="w-6 h-6 text-gray-400" />
          </div>
          <h2 className="text-lg font-semibold text-black mb-2">no jobs yet</h2>
          <p className="text-sm text-gray-500 mb-6 max-w-md mx-auto">
            you haven&apos;t run any container jobs yet. get started by running
            your first job using the cli.
          </p>
          <div className="bg-gray-50 border border-gray-200 px-4 py-3 inline-block mb-4">
            <code className="text-sm text-gray-700">
              uva jobs run alpine echo hello
            </code>
          </div>
          <div>
            <Link
              href="/docs/jobs"
              className="text-orange-accent hover:underline text-sm"
            >
              learn how to run a job &rarr;
            </Link>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Page Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-semibold text-black">container jobs</h1>
          <p className="text-sm text-gray-500 mt-1">
            run containerized workloads on the cluster
          </p>
        </div>

        {/* Stats Summary */}
        <div className="flex items-center gap-6 text-sm">
          <div className="flex items-center gap-2">
            <span className="w-2 h-2 rounded-full bg-green-500" />
            <span className="text-gray-500">
              {activeJobs?.length ?? "—"} running
            </span>
          </div>
          <div className="flex items-center gap-2">
            <span className="w-2 h-2 rounded-full bg-gray-300" />
            <span className="text-gray-500">
              {inactiveJobs?.length ?? "—"} completed
            </span>
          </div>
        </div>
      </div>

      {/* Tab Navigation */}
      <div className="border-b border-gray-200">
        <div className="flex gap-2">
          <TabButton
            active={activeTab === "active"}
            onClick={() => setActiveTab("active")}
            count={activeJobs?.length}
          >
            active
          </TabButton>
          <TabButton
            active={activeTab === "history"}
            onClick={() => setActiveTab("history")}
            count={inactiveJobs?.length}
          >
            history
          </TabButton>
        </div>
      </div>

      {/* Tab Content */}
      <div>
        {activeTab === "active" ? (
          <ActiveJobs userId={userId} />
        ) : (
          <JobHistory userId={userId} />
        )}
      </div>
    </div>
  );
}
