import { NextRequest, NextResponse } from "next/server";
import { authClient } from "@/lib/auth-client";
import { fetchMutation, fetchQuery } from "convex/nextjs";
import { api } from "../../../../convex/_generated/api";
import { createAuthHeaders } from "@/lib/orchestration-auth";
import {
  JobCreationRequestSchema,
  JobCreationResponseSchema,
} from "@/lib/job-schemas";

const VM_ORCHESTRATION_SERVICE_URL =
  process.env.VM_ORCHESTRATION_SERVICE_URL || "http://localhost:8080";

export async function GET(request: NextRequest) {
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
    const jobs = await fetchQuery(api.jobs.listByUser, {
      userId: session.user.id,
    });

    return NextResponse.json({ jobs }, { status: 200 });
  } catch (error: unknown) {
    console.error("Error fetching jobs:", error);
    const message =
      error instanceof Error ? error.message : "Failed to fetch jobs";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

export async function POST(request: NextRequest) {
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
    const rawBody = await request.json();
    const body = JobCreationRequestSchema.parse(rawBody);

    const jobCreationRequest = {
      ...body,
      userId: session.user.id,
    };

    const requestBody = JSON.stringify(jobCreationRequest);
    const authHeaders = createAuthHeaders("POST", "/jobs", requestBody);

    const response = await fetch(`${VM_ORCHESTRATION_SERVICE_URL}/jobs`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        ...authHeaders,
      },
      body: requestBody,
    });

    if (!response.ok) {
      const errorText = await response.text();
      console.error(
        `Orchestration service error: ${response.status} ${errorText}`,
      );
      return NextResponse.json(
        {
          error: `Orchestration service error: ${response.status}`,
          details: errorText,
        },
        { status: response.status },
      );
    }

    const rawData = await response.json();
    const data = JobCreationResponseSchema.parse(rawData);

    if (response.ok && data.status === "success" && data.jobId) {
      try {
        await fetchMutation(api.jobs.create, {
          userId: session.user.id,
          jobId: data.jobId,
          name: body.name,
          image: body.image,
          command: body.command,
          env: body.env,
          cpus: body.cpus ?? 1,
          ram: body.ram ?? 4,
          gpus: body.gpus ?? 0,
        });
      } catch (convexError: unknown) {
        console.error(
          "Critical error: Failed to save job to Convex:",
          convexError,
        );

        try {
          const deleteAuthHeaders = createAuthHeaders(
            "DELETE",
            `/jobs/${data.jobId}`,
            "",
          );
          await fetch(`${VM_ORCHESTRATION_SERVICE_URL}/jobs/${data.jobId}`, {
            method: "DELETE",
            headers: deleteAuthHeaders,
          });
          console.log(
            `Rolled back job ${data.jobId} from orchestration service`,
          );
        } catch (rollbackError: unknown) {
          console.error(
            `Failed to rollback job ${data.jobId} from orchestration service:`,
            rollbackError,
          );
        }

        return NextResponse.json(
          {
            status: "internal_error",
            msg: "Failed to save job to database. Job creation has been rolled back.",
          },
          { status: 500 },
        );
      }
    }

    return NextResponse.json(data, { status: response.status });
  } catch (error: unknown) {
    console.error("Error creating job:", error);

    if (error instanceof Error && error.name === "ZodError") {
      return NextResponse.json(
        {
          status: "validation_failed",
          msg: "Invalid request data: " + error.message,
        },
        { status: 400 },
      );
    }

    const message =
      error instanceof Error ? error.message : "Failed to create job";
    return NextResponse.json(
      {
        status: "internal_error",
        msg: message,
      },
      { status: 500 },
    );
  }
}
