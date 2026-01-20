import { NextRequest } from "next/server";
import { authClient } from "@/lib/auth-client";
import { fetchQuery } from "convex/nextjs";
import { api } from "../../../../../../../convex/_generated/api";
import { createAuthHeaders } from "@/lib/orchestration-auth";

const VM_ORCHESTRATION_SERVICE_URL =
  process.env.VM_ORCHESTRATION_SERVICE_URL || "http://localhost:8080";

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
    return new Response(JSON.stringify({ error: "Unauthorized" }), {
      status: 401,
      headers: { "Content-Type": "application/json" },
    });
  }

  try {
    const { jobId } = await params;

    const job = await fetchQuery(api.jobs.getByJobId, { jobId });
    if (!job) {
      return new Response("Job not found", { status: 404 });
    }

    if (job.userId !== session.user.id) {
      return new Response("Job not found", { status: 404 });
    }

    const activeStatuses = ["pending", "scheduled", "pulling", "running"];
    if (!activeStatuses.includes(job.status)) {
      return new Response(
        "Job is not active. Use GET /logs for archived logs.",
        {
          status: 409,
        },
      );
    }

    const authHeaders = createAuthHeaders(
      "GET",
      `/jobs/${jobId}/logs/stream`,
      "",
    );
    const response = await fetch(
      `${VM_ORCHESTRATION_SERVICE_URL}/jobs/${jobId}/logs/stream`,
      {
        method: "GET",
        headers: authHeaders,
      },
    );

    if (!response.ok) {
      const errorText = await response.text();
      return new Response(errorText || "Failed to stream logs", {
        status: response.status,
      });
    }

    if (!response.body) {
      return new Response("No stream available", { status: 500 });
    }

    return new Response(response.body, {
      status: 200,
      headers: {
        "Content-Type": "text/event-stream",
        "Cache-Control": "no-cache",
        Connection: "keep-alive",
        "X-Accel-Buffering": "no",
      },
    });
  } catch (error: unknown) {
    console.error("Error streaming job logs:", error);
    const message =
      error instanceof Error ? error.message : "Failed to stream job logs";
    return new Response(message, { status: 500 });
  }
}
