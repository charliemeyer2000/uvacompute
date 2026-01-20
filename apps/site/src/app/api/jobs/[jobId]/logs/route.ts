import { NextRequest, NextResponse } from "next/server";
import { authClient } from "@/lib/auth-client";
import { fetchQuery } from "convex/nextjs";
import { api } from "../../../../../../convex/_generated/api";
import { createAuthHeaders } from "@/lib/orchestration-auth";

const VM_ORCHESTRATION_SERVICE_URL =
  process.env.VM_ORCHESTRATION_SERVICE_URL || "http://localhost:8080";

const TERMINAL_STATUSES = ["completed", "failed", "cancelled"];

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ jobId: string }> },
) {
  const { data: session, error } = await authClient.getSession({
    fetchOptions: {
      headers: request.headers,
    },
  });

  if (error || !session) {
    return NextResponse.json(
      { error: error?.message || "Unauthorized" },
      { status: 401 },
    );
  }

  try {
    const { jobId } = await params;

    const job = await fetchQuery(api.jobs.getByJobId, { jobId });
    if (!job) {
      return new NextResponse("Job not found", { status: 404 });
    }

    if (job.userId !== session.user.id) {
      return new NextResponse("Job not found", { status: 404 });
    }

    if (TERMINAL_STATUSES.includes(job.status)) {
      const logUrl = await fetchQuery(api.logs.getLogUrl, { jobId });
      if (logUrl) {
        const archivedResponse = await fetch(logUrl);
        if (archivedResponse.ok) {
          const archivedLogs = await archivedResponse.text();
          return new NextResponse(archivedLogs, {
            status: 200,
            headers: {
              "Content-Type": "text/plain; charset=utf-8",
              "X-Log-Source": "archived",
            },
          });
        }
      }
    }

    const authHeaders = createAuthHeaders("GET", `/jobs/${jobId}/logs`, "");
    const response = await fetch(
      `${VM_ORCHESTRATION_SERVICE_URL}/jobs/${jobId}/logs`,
      {
        method: "GET",
        headers: authHeaders,
      },
    );

    if (!response.ok) {
      const errorText = await response.text();
      return new NextResponse(errorText || "Failed to fetch logs", {
        status: response.status,
      });
    }

    const logs = await response.text();

    return new NextResponse(logs, {
      status: 200,
      headers: {
        "Content-Type": "text/plain; charset=utf-8",
        "X-Log-Source": "live",
      },
    });
  } catch (error: unknown) {
    console.error("Error fetching job logs:", error);
    const message =
      error instanceof Error ? error.message : "Failed to fetch job logs";
    return new NextResponse(message, { status: 500 });
  }
}
