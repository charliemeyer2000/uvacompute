import { NextRequest, NextResponse } from "next/server";
import { authClient } from "@/lib/auth-client";
import { fetchMutation, fetchQuery } from "convex/nextjs";
import { api } from "../../../../convex/_generated/api";
import { createAuthHeaders } from "@/lib/orchestration-auth";

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
    const vms = await fetchQuery(api.vms.listByUser, {
      userId: session.user.id,
    });

    return NextResponse.json({ vms }, { status: 200 });
  } catch (error: any) {
    console.error("Error fetching VMs:", error);
    return NextResponse.json(
      { error: error.message || "Failed to fetch VMs" },
      { status: 500 },
    );
  }
}

export async function POST(request: NextRequest) {
  // Authenticate user
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
    const body = await request.json();

    const sshPublicKeys = await fetchQuery(api.sshKeys.getAllPublicKeys, {
      userId: session.user.id,
    });

    if (sshPublicKeys.length === 0) {
      console.warn(`User ${session.user.id} has no SSH keys configured`);
    }

    const vmCreationRequest = {
      ...body,
      userId: session.user.id,
      sshPublicKeys,
    };

    const requestBody = JSON.stringify(vmCreationRequest);
    const authHeaders = createAuthHeaders("POST", "/vms", requestBody);

    const response = await fetch(`${VM_ORCHESTRATION_SERVICE_URL}/vms`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        ...authHeaders,
      },
      body: requestBody,
    });

    const data = await response.json();

    if (response.ok && data.status === "success" && data.vmId) {
      try {
        await fetchMutation(api.vms.create, {
          userId: session.user.id,
          vmId: data.vmId,
          name: body.name,
          cpus: body.cpus || 1,
          ram: body.ram || 8,
          disk: body.disk || 64,
          gpus: body.gpus || 0,
          gpuType: body["gpu-type"] || "5090",
          hours: body.hours,
          orchestrationResponse: data,
        });

        await fetchMutation(api.vms.markAsRunning, {
          vmId: data.vmId,
        });
      } catch (convexError: any) {
        console.error(
          "Critical error: Failed to save VM to Convex:",
          convexError,
        );

        try {
          const deleteAuthHeaders = createAuthHeaders(
            "DELETE",
            `/vms/${data.vmId}`,
            "",
          );
          await fetch(`${VM_ORCHESTRATION_SERVICE_URL}/vms/${data.vmId}`, {
            method: "DELETE",
            headers: deleteAuthHeaders,
          });
          console.log(`Rolled back VM ${data.vmId} from orchestration service`);
        } catch (rollbackError: any) {
          console.error(
            `Failed to rollback VM ${data.vmId} from orchestration service:`,
            rollbackError,
          );
        }

        return NextResponse.json(
          {
            status: "internal_error",
            msg: "Failed to save VM to database. VM creation has been rolled back.",
          },
          { status: 500 },
        );
      }
    }

    return NextResponse.json(data, { status: response.status });
  } catch (error: any) {
    console.error("Error creating VM:", error);
    return NextResponse.json(
      {
        status: "internal_error",
        msg: error.message || "Failed to create VM",
      },
      { status: 500 },
    );
  }
}
