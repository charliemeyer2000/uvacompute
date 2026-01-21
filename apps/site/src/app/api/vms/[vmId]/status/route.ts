import { NextRequest, NextResponse } from "next/server";
import { authClient } from "@/lib/auth-client";
import { fetchQuery } from "convex/nextjs";
import { api } from "../../../../../../convex/_generated/api";
import { createAuthHeaders } from "@/lib/orchestration-auth";
import { VMStatusResponseSchema } from "@/lib/vm-schemas";

const VM_ORCHESTRATION_SERVICE_URL =
  process.env.VM_ORCHESTRATION_SERVICE_URL || "http://localhost:8080";

function getStatusMessage(status: string): string {
  const messages: Record<string, string> = {
    creating: "VM creation in progress",
    pending: "VM is pending",
    booting: "VM is booting",
    provisioning: "VM is being provisioned",
    ready: "VM is ready",
    stopping: "VM is stopping",
    stopped: "VM has stopped",
    failed: "VM creation failed",
    offline: "VM is offline (node unreachable)",
  };
  return messages[status] || `VM status: ${status}`;
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

    const authHeaders = createAuthHeaders("GET", `/vms/${vmId}`, "");
    const response = await fetch(
      `${VM_ORCHESTRATION_SERVICE_URL}/vms/${vmId}`,
      {
        method: "GET",
        headers: authHeaders,
      },
    );

    if (!response.ok) {
      // Orchestration doesn't know about this VM - fall back to Convex status
      if (response.status === 404) {
        return NextResponse.json(
          {
            status: vm.status,
            msg: getStatusMessage(vm.status),
          },
          { status: 200 },
        );
      }

      return NextResponse.json(
        {
          status: "not_found",
          msg: "Failed to get VM status from orchestration service",
        },
        { status: response.status },
      );
    }

    const rawData = await response.json();
    const data = VMStatusResponseSchema.parse(rawData);
    return NextResponse.json(data, { status: 200 });
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
