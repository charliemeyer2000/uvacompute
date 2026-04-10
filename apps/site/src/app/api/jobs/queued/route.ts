import { NextRequest, NextResponse } from "next/server";
import { fetchQuery } from "convex/nextjs";
import { api } from "../../../../../convex/_generated/api";
import { verifyRequest } from "@/lib/orchestration-auth";

export async function GET(request: NextRequest) {
  if (!verifyRequest(request, "")) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
    const queuedJobs = await fetchQuery(api.jobs.listQueued, {});
    return NextResponse.json({ jobs: queuedJobs }, { status: 200 });
  } catch (error: unknown) {
    console.error("Error fetching queued jobs:", error);
    const message =
      error instanceof Error ? error.message : "Failed to fetch queued jobs";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
