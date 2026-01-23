import { NextRequest, NextResponse } from "next/server";
import { fetchQuery } from "convex/nextjs";
import { api } from "../../../../../convex/_generated/api";
import { verifyRequest } from "@/lib/orchestration-auth";

export async function GET(request: NextRequest) {
  if (!verifyRequest(request, "")) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
    const activeJobs = await fetchQuery(api.jobs.listActive, {});
    return NextResponse.json({ jobs: activeJobs }, { status: 200 });
  } catch (error: any) {
    console.error("Error fetching active jobs:", error);
    return NextResponse.json(
      { error: error.message || "Failed to fetch active jobs" },
      { status: 500 },
    );
  }
}
