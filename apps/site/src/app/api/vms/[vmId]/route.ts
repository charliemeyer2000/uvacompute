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

    const authHeaders = createAuthHeaders("DELETE", `/vms/${vmId}`, "");
    const response = await fetch(
      `${VM_ORCHESTRATION_SERVICE_URL}/vms/${vmId}`,
      {
        method: "DELETE",
        headers: authHeaders,
      },
    );

    if (response.status === 404) {
      console.log(
        `VM ${vmId} not found in orchestration service - cleaning up orphaned DB entry`,
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
            msg: "VM was not found in orchestration service (possibly failed creation). Database entry has been cleaned up.",
          },
          { status: 200 },
        );
      } catch (convexError: any) {
        console.error(
          "Warning: Failed to mark orphaned VM as deleted in Convex:",
          convexError,
        );
        return NextResponse.json(
          {
            status: "deletion_failed_internal",
            msg: "VM not found in orchestration and failed to clean up database entry",
          },
          { status: 500 },
        );
      }
    }

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
    const data = VMDeletionResponseSchema.parse(rawData);

    if (data.status === "deletion_success") {
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
      } catch (convexError: any) {
        console.error(
          "Warning: Failed to mark VM as deleted in Convex:",
          convexError,
        );

        return NextResponse.json(
          {
            status: "deletion_success",
            vmId,
            msg: "VM deleted from orchestration service, but database update failed. This will be corrected automatically.",
          },
          { status: 200 },
        );
      }
    }

    return NextResponse.json(data, { status: response.status });
  } catch (error: any) {
    console.error("Error deleting VM:", error);
    return NextResponse.json(
      {
        status: "deletion_failed_internal",
        msg: error.message || "Failed to delete VM",
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
  } catch (error: any) {
    console.error("Error getting VM status:", error);

    if (error.name === "ZodError") {
      return NextResponse.json(
        {
          status: "not_found",
          msg: "Invalid response from orchestration service",
        },
        { status: 500 },
      );
    }

    return NextResponse.json(
      {
        status: "not_found",
        msg: error.message || "Failed to get VM status",
      },
      { status: 500 },
    );
  }
}
