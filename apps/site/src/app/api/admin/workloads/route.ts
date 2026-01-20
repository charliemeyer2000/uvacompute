import { NextRequest, NextResponse } from "next/server";
import { requireAdmin } from "@/lib/admin-auth";
import { fetchQuery } from "convex/nextjs";
import { api } from "../../../../../convex/_generated/api";

export async function GET(request: NextRequest) {
  const authResult = await requireAdmin(request);
  if (authResult instanceof NextResponse) {
    return authResult;
  }

  try {
    const vms = await fetchQuery(api.vms.listAll, {});
    const jobs = await fetchQuery(api.jobs.listAll, {});

    const activeVms = vms.filter(
      (vm: any) => vm.status !== "deleted" && vm.status !== "expired",
    );
    const activeJobs = jobs.filter(
      (job: any) =>
        job.status !== "completed" &&
        job.status !== "failed" &&
        job.status !== "cancelled",
    );

    return NextResponse.json(
      {
        vms: activeVms,
        jobs: activeJobs,
        totals: {
          activeVms: activeVms.length,
          activeJobs: activeJobs.length,
        },
      },
      { status: 200 },
    );
  } catch (error) {
    console.error("Error fetching workloads:", error);
    return NextResponse.json(
      { error: "Failed to fetch workloads" },
      { status: 500 },
    );
  }
}
