import { NextRequest, NextResponse } from "next/server";
import { authClient } from "@/lib/auth-client";
import { fetchAction, fetchMutation, fetchQuery } from "convex/nextjs";
import { api } from "../../../../../convex/_generated/api";
import { createAuthHeaders } from "@/lib/orchestration-auth";
import {
  VMDeletionResponseSchema,
  VMStatusResponseSchema,
} from "@/lib/vm-schemas";

const VM_ORCHESTRATION_SERVICE_URL =
  process.env.VM_ORCHESTRATION_SERVICE_URL || "http://localhost:8080";

export async function DELETE(
  request: NextRequest,
  { params }: { params: Promise<{ vmId: string }> },
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
    const { vmId } = await params;

    const vm = await fetchQuery(api.vms.getByVmId, {
      vmId,
      userId: session.user.id,
    });
    if (!vm) {
      return NextResponse.json(
        {
          status: "deletion_failed_not_found",
          msg: "VM not found",
        },
        { status: 404 },
      );
    }

    try {
      await fetchMutation(api.vms.markStopping, {
        vmId,
        userId: session.user.id,
      });
    } catch (e: unknown) {
      const message = e instanceof Error ? e.message : "Cannot delete VM";
      return NextResponse.json(
        {
          status: "deletion_failed_not_deletable",
          msg: message,
        },
        { status: 409 },
      );
    }

    const authHeaders = createAuthHeaders("DELETE", `/vms/${vmId}`, "");
    let response: Response;
    try {
      response = await fetch(`${VM_ORCHESTRATION_SERVICE_URL}/vms/${vmId}`, {
        method: "DELETE",
        headers: authHeaders,
      });
    } catch (networkError) {
      console.error(`Network error deleting VM ${vmId}:`, networkError);
      return NextResponse.json(
        {
          status: "deletion_pending",
          vmId,
          msg: "Deletion in progress - will be completed automatically",
        },
        { status: 202 },
      );
    }

    if (response.status === 404) {
      console.log(
        `VM ${vmId} not found in orchestration service - marking as stopped`,
      );
      try {
        await fetchMutation(api.vms.updateStatus, {
          vmId,
          status: "stopped",
        });
        try {
          await fetchAction(api.endpoints.release, {
            type: "vm",
            resourceId: vmId,
          });
        } catch (endpointError) {
          console.error("Warning: Failed to release endpoint:", endpointError);
        }
        return NextResponse.json(
          {
            status: "deletion_success",
            vmId,
            msg: "VM deleted",
          },
          { status: 200 },
        );
      } catch (convexError: unknown) {
        console.error("Failed to mark orphaned VM as stopped:", convexError);
        return NextResponse.json(
          {
            status: "deletion_pending",
            vmId,
            msg: "Deletion in progress - will be completed automatically",
          },
          { status: 202 },
        );
      }
    }

    if (!response.ok) {
      const errorText = await response.text();
      console.error(
        `Orchestration service error for VM ${vmId}: ${response.status} ${errorText}`,
      );
      return NextResponse.json(
        {
          status: "deletion_pending",
          vmId,
          msg: "Deletion in progress - will be completed automatically",
        },
        { status: 202 },
      );
    }

    const rawData = await response.json();
    const data = VMDeletionResponseSchema.parse(rawData);

    if (data.status === "deletion_success") {
      let convexUpdated = false;
      for (let attempt = 0; attempt < 3; attempt++) {
        try {
          await fetchMutation(api.vms.updateStatus, {
            vmId,
            status: "stopped",
          });
          convexUpdated = true;
          break;
        } catch (convexError: unknown) {
          console.error(
            `Attempt ${attempt + 1}/3: Failed to mark VM ${vmId} as stopped in Convex:`,
            convexError,
          );
          if (attempt < 2) {
            await new Promise((r) => setTimeout(r, 1000 * (attempt + 1)));
          }
        }
      }
      if (convexUpdated) {
        try {
          await fetchAction(api.endpoints.release, {
            type: "vm",
            resourceId: vmId,
          });
        } catch (endpointError) {
          console.error("Warning: Failed to release endpoint:", endpointError);
        }
      } else {
        console.error(
          `CRITICAL: VM ${vmId} deleted from K8s but Convex update failed after 3 attempts. Cron will catch this.`,
        );
      }
    }

    return NextResponse.json(data, { status: response.status });
  } catch (error: unknown) {
    console.error("Error deleting VM:", error);
    const message =
      error instanceof Error ? error.message : "Failed to delete VM";
    return NextResponse.json(
      {
        status: "deletion_failed_internal",
        msg: message,
      },
      { status: 500 },
    );
  }
}

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ vmId: string }> },
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
    const { vmId } = await params;

    const vm = await fetchQuery(api.vms.getByVmId, {
      vmId,
      userId: session.user.id,
    });
    if (!vm) {
      return NextResponse.json(
        {
          status: "not_found",
          msg: "VM not found",
        },
        { status: 404 },
      );
    }

    const authHeaders = createAuthHeaders("GET", `/vms/${vmId}`, "");
    const response = await fetch(
      `${VM_ORCHESTRATION_SERVICE_URL}/vms/${vmId}`,
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
    const data = VMStatusResponseSchema.parse(rawData);

    return NextResponse.json(data, { status: response.status });
  } catch (error: unknown) {
    console.error("Error getting VM status:", error);

    if (error instanceof Error && error.name === "ZodError") {
      return NextResponse.json(
        {
          status: "not_found",
          msg: "Invalid response from orchestration service",
        },
        { status: 500 },
      );
    }

    const message =
      error instanceof Error ? error.message : "Failed to get VM status";
    return NextResponse.json(
      {
        status: "not_found",
        msg: message,
      },
      { status: 500 },
    );
  }
}
