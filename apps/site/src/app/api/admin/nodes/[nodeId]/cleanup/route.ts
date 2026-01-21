import { NextRequest, NextResponse } from "next/server";
import { requireAdmin } from "@/lib/admin-auth";
import { fetchMutation, fetchQuery } from "convex/nextjs";
import { api } from "../../../../../../../convex/_generated/api";

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ nodeId: string }> },
) {
  const authResult = await requireAdmin(request);
  if (authResult instanceof NextResponse) {
    return authResult;
  }

  const { nodeId } = await params;

  try {
    const node = await fetchQuery(api.nodes.getByNodeId, { nodeId });

    if (!node) {
      return NextResponse.json({ error: "Node not found" }, { status: 404 });
    }

    const result = await fetchMutation(api.nodes.forceCleanup, { nodeId });

    return NextResponse.json(
      {
        success: true,
        message: `Cleanup complete for node ${nodeId}`,
        vmsDeleted: result.vmsDeleted,
        jobsCancelled: result.jobsCancelled,
      },
      { status: 200 },
    );
  } catch (error) {
    console.error("Error cleaning up node:", error);
    return NextResponse.json(
      { error: "Failed to cleanup node" },
      { status: 500 },
    );
  }
}
