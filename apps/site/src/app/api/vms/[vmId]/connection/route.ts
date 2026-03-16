import { NextRequest, NextResponse } from "next/server";
import { authClient } from "@/lib/auth-client";
import { fetchQuery } from "convex/nextjs";
import { api } from "../../../../../../convex/_generated/api";
import crypto from "crypto";

// VM proxy configuration
const VM_PROXY_HOST = process.env.VM_PROXY_HOST!;
const VM_PROXY_PORT = parseInt(process.env.VM_PROXY_PORT || "22", 10);
const VM_PROXY_USER = process.env.VM_PROXY_USER || "vmproxy";
const VM_PROXY_SECRET = process.env.VM_PROXY_SECRET || "";
const TOKEN_TTL_SECONDS = 60; // Token valid for 60 seconds

function generateAccessToken(
  userId: string,
  vmId: string,
  secret: string,
): string {
  const expires = Math.floor(Date.now() / 1000) + TOKEN_TTL_SECONDS;
  const payload = `${userId}:${vmId}:${expires}`;
  const signature = crypto
    .createHmac("sha256", secret)
    .update(payload)
    .digest("hex")
    .substring(0, 16); // Short signature for easier passing
  return Buffer.from(`${payload}:${signature}`).toString("base64url");
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
      return NextResponse.json({ error: "VM not found" }, { status: 404 });
    }

    if (vm.status !== "ready") {
      return NextResponse.json(
        {
          error: "VM is not ready",
          vmId: vm.vmId,
          status: vm.status,
          message: `Cannot connect to VM in '${vm.status}' state. Please wait for the VM to be ready.`,
        },
        { status: 409 },
      );
    }

    if (!VM_PROXY_SECRET) {
      console.error("VM_PROXY_SECRET not configured");
      return NextResponse.json(
        { error: "Server misconfigured" },
        { status: 500 },
      );
    }

    // Generate short-lived access token
    const token = generateAccessToken(session.user.id, vmId, VM_PROXY_SECRET);

    return NextResponse.json(
      {
        vmId: vm.vmId,
        name: vm.name || null,
        status: vm.status,
        proxy: {
          host: VM_PROXY_HOST,
          port: VM_PROXY_PORT,
          user: VM_PROXY_USER,
        },
        token,
      },
      { status: 200 },
    );
  } catch (error: any) {
    console.error("Error fetching VM connection info:", error);
    return NextResponse.json(
      { error: error.message || "Failed to fetch VM connection info" },
      { status: 500 },
    );
  }
}
