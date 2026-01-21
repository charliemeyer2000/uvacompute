import { NextRequest, NextResponse } from "next/server";
import { authClient } from "@/lib/auth-client";
import { fetchMutation, fetchQuery } from "convex/nextjs";
import { api } from "../../../../convex/_generated/api";
import { createAuthHeaders } from "@/lib/orchestration-auth";
import {
  VMCreationRequestSchema,
  VMCreationResponseSchema,
} from "@/lib/vm-schemas";
import { randomUUID } from "crypto";

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

  // Generate vmId upfront so we can create Convex record immediately
  const vmId = randomUUID();

  try {
    const rawBody = await request.json();

    const body = VMCreationRequestSchema.parse(rawBody);

    const sshPublicKeys = await fetchQuery(api.sshKeys.getAllPublicKeys, {
      userId: session.user.id,
    });

    if (sshPublicKeys.length === 0) {
      console.warn(`User ${session.user.id} has no SSH keys configured`);
    }

    // Create Convex record FIRST with "creating" status so it shows up in UI immediately
    try {
      await fetchMutation(api.vms.create, {
        userId: session.user.id,
        vmId,
        name: body.name,
        cpus: body.cpus || 1,
        ram: body.ram || 8,
        disk: body.disk || 64,
        gpus: body.gpus || 0,
        gpuType: body["gpu-type"] || "5090",
        hours: body.hours,
      });
    } catch (convexError: any) {
      console.error("Failed to create VM record in Convex:", convexError);
      return NextResponse.json(
        {
          status: "internal_error",
          msg: "Failed to create VM record in database.",
        },
        { status: 500 },
      );
    }

    // Now call orchestration service with the pre-generated vmId
    const vmCreationRequest = {
      ...body,
      vmId, // Pass the pre-generated vmId
      userId: session.user.id,
      sshPublicKeys,
      ...(body.startupScript && { startupScript: body.startupScript }),
      ...(body.cloudInitConfig && { cloudInitConfig: body.cloudInitConfig }),
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

    if (!response.ok) {
      const errorText = await response.text();
      console.error(
        `Orchestration service error: ${response.status} ${errorText}`,
      );

      // Mark VM as failed in Convex since orchestration failed
      try {
        await fetchMutation(api.vms.updateStatus, {
          vmId,
          status: "failed",
        });
      } catch (updateError: any) {
        console.error("Failed to mark VM as failed in Convex:", updateError);
      }

      return NextResponse.json(
        {
          status: "internal_error",
          vmId,
          msg: `Orchestration service error: ${response.status}`,
          details: errorText,
        },
        { status: response.status },
      );
    }

    const rawData = await response.json();
    const data = VMCreationResponseSchema.parse(rawData);

    // If orchestration returned a failure status (validation, resources), mark as failed
    if (data.status !== "success") {
      try {
        await fetchMutation(api.vms.updateStatus, {
          vmId,
          status: "failed",
        });
      } catch (updateError: any) {
        console.error("Failed to mark VM as failed in Convex:", updateError);
      }

      return NextResponse.json(
        { ...data, vmId },
        { status: data.status === "resources_unavailable" ? 409 : 400 },
      );
    }

    // Success - orchestration accepted the request and will update status via callbacks
    return NextResponse.json(
      { status: "success", vmId, msg: "VM creation started" },
      { status: 200 },
    );
  } catch (error: any) {
    console.error("Error creating VM:", error);

    // If we already created the Convex record, mark it as failed
    try {
      await fetchMutation(api.vms.updateStatus, {
        vmId,
        status: "failed",
      });
    } catch {
      // Ignore - record might not exist if the error was before Convex insert
    }

    if (error.name === "ZodError") {
      return NextResponse.json(
        {
          status: "validation_failed",
          msg: "Invalid request data: " + error.message,
        },
        { status: 400 },
      );
    }

    return NextResponse.json(
      {
        status: "internal_error",
        msg: error.message || "Failed to create VM",
      },
      { status: 500 },
    );
  }
}
