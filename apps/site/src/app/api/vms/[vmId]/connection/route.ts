import { NextRequest, NextResponse } from "next/server";
import { authClient } from "@/lib/auth-client";
import { fetchQuery } from "convex/nextjs";
import { api } from "../../../../../../convex/_generated/api";

const SSH2INCUS_HOST = process.env.SSH2INCUS_HOST || "localhost";
const SSH2INCUS_PORT = parseInt(process.env.SSH2INCUS_PORT || "2222", 10);

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
    });

    if (!vm) {
      return NextResponse.json({ error: "VM not found" }, { status: 404 });
    }

    if (vm.userId !== session.user.id) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 403 });
    }

    return NextResponse.json(
      {
        vmId: vm.vmId,
        name: vm.name || null,
        sshHost: SSH2INCUS_HOST,
        sshPort: SSH2INCUS_PORT,
        user: "root",
        status: vm.status,
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
