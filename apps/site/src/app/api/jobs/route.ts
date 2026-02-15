import { NextRequest, NextResponse } from "next/server";
import { authClient } from "@/lib/auth-client";
import { fetchMutation, fetchQuery, fetchAction } from "convex/nextjs";
import { api } from "../../../../convex/_generated/api";
import {
  createAuthHeaders,
  parseOrchestrationError,
} from "@/lib/orchestration-auth";
import {
  JobCreationRequestSchema,
  JobCreationResponseSchema,
} from "@/lib/job-schemas";

const VM_ORCHESTRATION_SERVICE_URL =
  process.env.VM_ORCHESTRATION_SERVICE_URL || "http://localhost:8080";

interface EndpointReservation {
  subdomain: string;
  exposeUrl: string;
}

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

  const jobId = crypto.randomUUID();
  let endpointReservation: EndpointReservation | null = null;

  try {
    const rawBody = await request.json();
    const body = JobCreationRequestSchema.parse(rawBody);

    if (body.expose) {
      try {
        endpointReservation = await fetchAction(api.endpoints.reserve, {
          type: "job",
          resourceId: jobId,
          port: body.expose,
        });
      } catch (endpointError: unknown) {
        console.error("Failed to reserve endpoint subdomain:", endpointError);
        return NextResponse.json(
          {
            status: "internal_error",
            msg: "Failed to reserve endpoint subdomain.",
          },
          { status: 500 },
        );
      }
    }

    const jobCreationRequest = {
      ...body,
      jobId,
      userId: session.user.id,
      ...(body.expose && { expose: body.expose }),
      ...(endpointReservation && {
        exposeSubdomain: endpointReservation.subdomain,
      }),
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

      const errorMsg = parseOrchestrationError(errorText, response.status);

      if (endpointReservation) {
        try {
          await fetchAction(api.endpoints.release, {
            type: "job",
            resourceId: jobId,
          });
        } catch {
          // Ignore release error
        }
      }

      return NextResponse.json(
        {
          error: errorMsg,
        },
        { status: response.status },
      );
    }

    const rawData = await response.json();
    const data = JobCreationResponseSchema.parse(rawData);

    if (data.status === "success" && data.jobId) {
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
          disk: body.disk ?? 0,
          exposePort: body.expose,
          exposeSubdomain: endpointReservation?.subdomain,
          exposeUrl: endpointReservation?.exposeUrl,
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

        if (endpointReservation) {
          try {
            await fetchAction(api.endpoints.release, {
              type: "job",
              resourceId: data.jobId,
            });
          } catch {
            // Ignore release error
          }
        }

        return NextResponse.json(
          {
            status: "internal_error",
            msg: "Failed to save job to database. Job creation has been rolled back.",
          },
          { status: 500 },
        );
      }
    } else if (endpointReservation) {
      try {
        await fetchAction(api.endpoints.release, {
          type: "job",
          resourceId: jobId,
        });
      } catch {
        // Ignore release error
      }
    }

    const responseData = endpointReservation
      ? { ...data, exposeUrl: endpointReservation.exposeUrl }
      : data;

    return NextResponse.json(responseData, { status: response.status });
  } catch (error: unknown) {
    console.error("Error creating job:", error);

    if (endpointReservation) {
      try {
        await fetchAction(api.endpoints.release, {
          type: "job",
          resourceId: jobId,
        });
      } catch {
        // Ignore release error
      }
    }

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
