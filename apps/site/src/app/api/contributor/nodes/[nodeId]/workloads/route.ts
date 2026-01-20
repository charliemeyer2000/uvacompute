import { NextRequest, NextResponse } from "next/server";
import { requireAuth } from "@/lib/admin-auth";
import { fetchQuery } from "convex/nextjs";
import { api } from "../../../../../../../convex/_generated/api";

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ nodeId: string }> },
) {
  const authResult = await requireAuth(request);
  if (authResult instanceof NextResponse) {
    return authResult;
  }

  const { nodeId } = await params;

  try {
    const ownership = await fetchQuery(api.nodes.verifyOwnership, {
      nodeId,
      ownerId: authResult.user.id,
    });

    if (!ownership.exists) {
      return NextResponse.json({ error: "Node not found" }, { status: 404 });
    }

    if (!ownership.owned) {
      return NextResponse.json(
        { error: "You do not own this node" },
        { status: 403 },
      );
    }

    const workloads = await fetchQuery(api.nodes.getWorkloadsOnNode, {
      nodeId,
    });

    return NextResponse.json(workloads, { status: 200 });
  } catch (error) {
    console.error("Error fetching workloads:", error);
    return NextResponse.json(
      { error: "Failed to fetch workloads" },
      { status: 500 },
    );
  }
}
