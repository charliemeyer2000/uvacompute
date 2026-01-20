import { NextRequest, NextResponse } from "next/server";
import { requireAuth } from "@/lib/admin-auth";
import { fetchMutation, fetchQuery } from "convex/nextjs";
import { api } from "../../../../../../../convex/_generated/api";

export async function POST(
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

    await fetchMutation(api.nodes.setStatus, {
      nodeId,
      status: "draining",
    });

    return NextResponse.json(
      { success: true, message: `Node ${nodeId} is now paused (draining)` },
      { status: 200 },
    );
  } catch (error) {
    console.error("Error pausing node:", error);
    return NextResponse.json(
      { error: "Failed to pause node" },
      { status: 500 },
    );
  }
}
