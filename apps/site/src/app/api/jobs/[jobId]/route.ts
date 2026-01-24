import { NextRequest, NextResponse } from "next/server";
import { authClient } from "@/lib/auth-client";
import { fetchAction, fetchMutation, fetchQuery } from "convex/nextjs";
import { api } from "../../../../../convex/_generated/api";
import { createAuthHeaders } from "@/lib/orchestration-auth";
import {
  JobCancellationResponseSchema,
  JobStatusResponseSchema,
} from "@/lib/job-schemas";

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
    return NextResponse.json(
      { error: error?.message || "Unauthorized" },
      { status: 401 },
    );
  }

  try {
    const { jobId } = await params;

    const job = await fetchQuery(api.jobs.getByJobId, { jobId });
    if (!job) {
      return NextResponse.json(
        {
          status: "failed",
          msg: "Job not found",
        },
        { status: 404 },
      );
    }

    if (job.userId !== session.user.id) {
      return NextResponse.json(
        {
          status: "failed",
          msg: "Job not found",
        },
        { status: 404 },
      );
    }

    const authHeaders = createAuthHeaders("GET", `/jobs/${jobId}`, "");
    const response = await fetch(
      `${VM_ORCHESTRATION_SERVICE_URL}/jobs/${jobId}`,
      {
        method: "GET",
        headers: authHeaders,
      },
    );

    if (!response.ok) {
      const errorText = await response.text();
      console.error(
        `Orchestration service error: ${response.status} ${errorText}`,
      );
      return NextResponse.json(
        {
          status: "failed",
          msg: `Orchestration service error: ${response.status}`,
        },
        { status: response.status },
      );
    }

    const rawData = await response.json();
    const data = JobStatusResponseSchema.parse(rawData);

    // Add exposeUrl from Convex if job is running and has an endpoint
    const responseData = {
      ...data,
      ...(data.status === "running" &&
        job.exposeUrl && { exposeUrl: job.exposeUrl }),
    };

    return NextResponse.json(responseData, { status: response.status });
  } catch (error: unknown) {
    console.error("Error getting job status:", error);

    if (error instanceof Error && error.name === "ZodError") {
      return NextResponse.json(
        {
          status: "failed",
          msg: "Invalid response from orchestration service",
        },
        { status: 500 },
      );
    }

    const message =
      error instanceof Error ? error.message : "Failed to get job status";
    return NextResponse.json(
      {
        status: "failed",
        msg: message,
      },
      { status: 500 },
    );
  }
}

export async function DELETE(
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
      return NextResponse.json(
        {
          status: "cancellation_failed_not_found",
          msg: "Job not found",
        },
        { status: 404 },
      );
    }

    if (job.userId !== session.user.id) {
      return NextResponse.json(
        {
          status: "cancellation_failed_not_found",
          msg: "Job not found",
        },
        { status: 404 },
      );
    }

    try {
      await fetchMutation(api.jobs.markCancelling, {
        jobId,
        userId: session.user.id,
      });
    } catch (e: unknown) {
      const message = e instanceof Error ? e.message : "Cannot cancel job";
      return NextResponse.json(
        {
          status: "cancellation_failed_not_cancellable",
          msg: message,
        },
        { status: 409 },
      );
    }

    const authHeaders = createAuthHeaders("DELETE", `/jobs/${jobId}`, "");
    let response: Response;
    try {
      response = await fetch(`${VM_ORCHESTRATION_SERVICE_URL}/jobs/${jobId}`, {
        method: "DELETE",
        headers: authHeaders,
      });
    } catch (networkError) {
      console.error(`Network error cancelling job ${jobId}:`, networkError);
      return NextResponse.json(
        {
          status: "cancellation_pending",
          jobId,
          msg: "Cancellation in progress - will be completed automatically",
        },
        { status: 202 },
      );
    }

    if (response.status === 404) {
      console.log(
        `Job ${jobId} not found in orchestration service - marking as cancelled`,
      );
      try {
        await fetchMutation(api.jobs.cancel, {
          jobId,
          userId: session.user.id,
        });
        try {
          await fetchAction(api.endpoints.release, {
            type: "job",
            resourceId: jobId,
          });
        } catch (endpointError) {
          console.error("Warning: Failed to release endpoint:", endpointError);
        }
        return NextResponse.json(
          {
            status: "cancellation_success",
            jobId,
            msg: "Job cancelled",
          },
          { status: 200 },
        );
      } catch (convexError: unknown) {
        console.error("Failed to mark orphaned job as cancelled:", convexError);
        return NextResponse.json(
          {
            status: "cancellation_pending",
            jobId,
            msg: "Cancellation in progress - will be completed automatically",
          },
          { status: 202 },
        );
      }
    }

    if (!response.ok) {
      const errorText = await response.text();
      console.error(
        `Orchestration service error for job ${jobId}: ${response.status} ${errorText}`,
      );
      return NextResponse.json(
        {
          status: "cancellation_pending",
          jobId,
          msg: "Cancellation in progress - will be completed automatically",
        },
        { status: 202 },
      );
    }

    const rawData = await response.json();
    const data = JobCancellationResponseSchema.parse(rawData);

    if (data.status === "cancellation_success") {
      try {
        await fetchMutation(api.jobs.cancel, {
          jobId,
          userId: session.user.id,
        });
        try {
          await fetchAction(api.endpoints.release, {
            type: "job",
            resourceId: jobId,
          });
        } catch (endpointError) {
          console.error("Warning: Failed to release endpoint:", endpointError);
        }
      } catch (convexError: unknown) {
        console.error(
          "Warning: Failed to mark job as cancelled in Convex:",
          convexError,
        );
      }
    }

    return NextResponse.json(data, { status: response.status });
  } catch (error: unknown) {
    console.error("Error cancelling job:", error);
    const message =
      error instanceof Error ? error.message : "Failed to cancel job";
    return NextResponse.json(
      {
        status: "cancellation_failed_internal",
        msg: message,
      },
      { status: 500 },
    );
  }
}
