import { NextRequest, NextResponse } from "next/server";
import { authClient } from "@/lib/auth-client";
import { fetchQuery } from "convex/nextjs";
import { api } from "../../../../../../convex/_generated/api";

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

    let nodeInfo = null;
    if (vm.nodeId) {
      const node = await fetchQuery(api.nodes.getByNodeId, {
        nodeId: vm.nodeId,
      });
      if (node) {
        nodeInfo = {
          nodeId: node.nodeId,
          tunnelHost: node.tunnelHost,
          tunnelPort: node.tunnelPort,
          tunnelUser: node.tunnelUser || "root",
          kubeconfigPath: node.kubeconfigPath || "/etc/rancher/k3s/k3s.yaml",
        };
      }
    }

    return NextResponse.json(
      {
        vmId: vm.vmId,
        name: vm.name || null,
        status: vm.status,
        nodeId: vm.nodeId || null,
        node: nodeInfo,
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
