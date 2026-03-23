import { NextRequest, NextResponse } from "next/server";
import {
  verifyRequest,
  verifyNodeRequest,
  isNodeAuthRequest,
} from "@/lib/orchestration-auth";
import { getAuthenticatedUser } from "@/lib/admin-auth";
import { api } from "../../../../../convex/_generated/api";
import { fetchMutation, fetchQuery } from "convex/nextjs";
import { z } from "zod";

const HeartbeatSchema = z.object({
  action: z.literal("heartbeat"),
});

const SetStatusSchema = z.object({
  action: z.literal("setStatus"),
  status: z.enum(["online", "offline", "draining"]),
});

const UpdateSchema = z.union([HeartbeatSchema, SetStatusSchema]);

async function verifyAuth(
  request: NextRequest,
  body: string,
  nodeId: string,
): Promise<boolean> {
  if (isNodeAuthRequest(request)) {
    return verifyNodeRequest(request, body, nodeId);
  }
  return verifyRequest(request, body);
}

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ nodeId: string }> },
) {
  const { nodeId } = await params;

  if (!(await verifyAuth(request, "", nodeId))) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
    const node = await fetchQuery(api.nodes.getByNodeId, { nodeId });

    if (!node) {
      return NextResponse.json({ error: "Node not found" }, { status: 404 });
    }

    return NextResponse.json(node, { status: 200 });
  } catch (error: any) {
    console.error("Failed to get node:", error);
    return NextResponse.json(
      { error: error.message || "Failed to get node" },
      { status: 500 },
    );
  }
}

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ nodeId: string }> },
) {
  const { nodeId } = await params;
  const body = await request.text();

  if (!(await verifyAuth(request, body, nodeId))) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
    const requestData = JSON.parse(body);
    const data = UpdateSchema.parse(requestData);

    if (data.action === "heartbeat") {
      await fetchMutation(api.nodes.heartbeat, { nodeId });
    } else if (data.action === "setStatus") {
      await fetchMutation(api.nodes.setStatus, { nodeId, status: data.status });
    }

    return NextResponse.json({ success: true }, { status: 200 });
  } catch (error: any) {
    console.error("Failed to update node:", error);
    return NextResponse.json(
      { error: error.message || "Failed to update node" },
      { status: 500 },
    );
  }
}

export async function DELETE(
  request: NextRequest,
  { params }: { params: Promise<{ nodeId: string }> },
) {
  const { nodeId } = await params;

  // Try HMAC auth first (node self-auth), then fall back to user bearer token with ownership check
  const hmacAuthed = await verifyAuth(request, "", nodeId);
  if (!hmacAuthed) {
    const auth = await getAuthenticatedUser(request);
    if (!auth) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }
    const ownership = await fetchQuery(api.nodes.verifyOwnership, {
      nodeId,
      ownerId: auth.user.id,
    });
    if (!ownership.owned) {
      return NextResponse.json(
        { error: "Forbidden: you do not own this node" },
        { status: 403 },
      );
    }
  }

  try {
    const node = await fetchQuery(api.nodes.getByNodeId, { nodeId });
    if (!node) {
      return NextResponse.json(
        { success: true, vmsDeleted: 0, jobsCancelled: 0 },
        { status: 200 },
      );
    }

    const cleanup = await fetchMutation(api.nodes.forceCleanup, { nodeId });
    await fetchMutation(api.nodes.unregister, { nodeId });

    return NextResponse.json(
      {
        success: true,
        vmsDeleted: cleanup.vmsDeleted,
        jobsCancelled: cleanup.jobsCancelled,
      },
      { status: 200 },
    );
  } catch (error: any) {
    console.error("Failed to unregister node:", error);
    return NextResponse.json(
      { error: error.message || "Failed to unregister node" },
      { status: 500 },
    );
  }
}
