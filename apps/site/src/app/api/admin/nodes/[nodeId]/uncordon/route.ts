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

    await fetchMutation(api.nodes.setStatus, {
      nodeId,
      status: "online",
    });

    return NextResponse.json(
      { success: true, message: `Node ${nodeId} is now online` },
      { status: 200 },
    );
  } catch (error) {
    console.error("Error uncordoning node:", error);
    return NextResponse.json(
      { error: "Failed to uncordon node" },
      { status: 500 },
    );
  }
}
