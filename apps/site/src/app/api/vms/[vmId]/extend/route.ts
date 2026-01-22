import { NextRequest, NextResponse } from "next/server";
import { authClient } from "@/lib/auth-client";
import { fetchMutation, fetchQuery } from "convex/nextjs";
import { api } from "../../../../../../convex/_generated/api";
import { createAuthHeaders } from "@/lib/orchestration-auth";
import {
  VMExtendRequestSchema,
  VMExtendResponseSchema,
} from "@/lib/vm-schemas";

const VM_ORCHESTRATION_SERVICE_URL =
  process.env.VM_ORCHESTRATION_SERVICE_URL || "http://localhost:8080";

export async function POST(
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
    const rawBody = await request.json();
    const body = VMExtendRequestSchema.parse(rawBody);

    const vm = await fetchQuery(api.vms.getByVmId, {
      vmId,
      userId: session.user.id,
    });
    if (!vm) {
      return NextResponse.json(
        {
          status: "extend_failed_not_found",
          vmId,
          msg: "VM not found",
        },
        { status: 404 },
      );
    }

    if (vm.status !== "ready") {
      return NextResponse.json(
        {
          status: "extend_failed_validation",
          vmId,
          msg: "VM is not running",
        },
        { status: 400 },
      );
    }

    const requestBody = JSON.stringify(body);
    const authHeaders = createAuthHeaders(
      "POST",
      `/vms/${vmId}/extend`,
      requestBody,
    );

    const response = await fetch(
      `${VM_ORCHESTRATION_SERVICE_URL}/vms/${vmId}/extend`,
      {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          ...authHeaders,
        },
        body: requestBody,
      },
    );

    if (!response.ok) {
      const errorText = await response.text();
      const status =
        response.status === 404
          ? "extend_failed_not_found"
          : response.status === 400
            ? "extend_failed_validation"
            : "extend_failed_internal";

      return NextResponse.json(
        {
          status,
          vmId,
          msg:
            errorText ||
            (status === "extend_failed_validation"
              ? "Invalid extend request"
              : "Orchestration service error"),
        },
        { status: response.status },
      );
    }

    const rawData = await response.json();
    const data = VMExtendResponseSchema.parse(rawData);

    if (data.status === "extend_success" && data.expiresAt) {
      try {
        await fetchMutation(api.vms.extend, {
          userId: session.user.id,
          vmId,
          expiresAt: data.expiresAt,
        });
      } catch (convexError: any) {
        console.error("Failed to update VM expiration in Convex:", convexError);
        return NextResponse.json(
          {
            status: "extend_failed_internal",
            vmId,
            msg: "VM extended, but failed to update expiration in database",
          },
          { status: 500 },
        );
      }
    }

    return NextResponse.json(data, { status: 200 });
  } catch (error: any) {
    if (error?.name === "ZodError") {
      return NextResponse.json(
        {
          status: "extend_failed_validation",
          msg: "Invalid request data: " + error.message,
        },
        { status: 400 },
      );
    }

    console.error("Error extending VM:", error);
    return NextResponse.json(
      {
        status: "extend_failed_internal",
        msg: error.message || "Failed to extend VM",
      },
      { status: 500 },
    );
  }
}
