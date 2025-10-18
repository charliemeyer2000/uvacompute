import { NextRequest, NextResponse } from "next/server";
import { authClient } from "@/lib/auth-client";
import { fetchMutation, fetchQuery } from "convex/nextjs";
import { api } from "../../../../../convex/_generated/api";

const VM_ORCHESTRATION_SERVICE_URL =
  process.env.VM_ORCHESTRATION_SERVICE_URL || "http://localhost:8080";

export async function DELETE(
  request: NextRequest,
  { params }: { params: { vmId: string } },
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
    const { vmId } = params;

    const vm = await fetchQuery(api.vms.getByVmId, { vmId });
    if (!vm) {
      return NextResponse.json(
        {
          status: "deletion_failed_not_found",
          msg: "VM not found",
        },
        { status: 404 },
      );
    }

    if (vm.userId !== session.user.id) {
      return NextResponse.json(
        {
          status: "deletion_failed_internal",
          msg: "Unauthorized: VM does not belong to this user",
        },
        { status: 403 },
      );
    }

    const response = await fetch(
      `${VM_ORCHESTRATION_SERVICE_URL}/vms/${vmId}`,
      {
        method: "DELETE",
      },
    );

    const data = await response.json();

    if (response.ok && data.status === "deletion_success") {
      try {
        await fetchMutation(api.vms.markAsDeleted, { vmId });
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
  { params }: { params: { vmId: string } },
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
    const { vmId } = params;

    const vm = await fetchQuery(api.vms.getByVmId, { vmId });
    if (!vm) {
      return NextResponse.json(
        {
          status: "not_found",
          msg: "VM not found",
        },
        { status: 404 },
      );
    }

    if (vm.userId !== session.user.id) {
      return NextResponse.json(
        {
          status: "not_found",
          msg: "VM not found",
        },
        { status: 404 },
      );
    }

    const response = await fetch(
      `${VM_ORCHESTRATION_SERVICE_URL}/vms/${vmId}`,
      {
        method: "GET",
      },
    );

    const data = await response.json();

    return NextResponse.json(data, { status: response.status });
  } catch (error: any) {
    console.error("Error getting VM status:", error);
    return NextResponse.json(
      {
        status: "not_found",
        msg: error.message || "Failed to get VM status",
      },
      { status: 500 },
    );
  }
}
