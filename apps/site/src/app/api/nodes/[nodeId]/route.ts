import { NextRequest, NextResponse } from "next/server";
import { verifyRequest } from "@/lib/orchestration-auth";
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

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ nodeId: string }> },
) {
  const body = "";
  if (!verifyRequest(request, body)) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
    const { nodeId } = await params;
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
  const body = await request.text();
  if (!verifyRequest(request, body)) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
    const { nodeId } = await params;
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
  const body = "";
  if (!verifyRequest(request, body)) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
    const { nodeId } = await params;
    await fetchMutation(api.nodes.unregister, { nodeId });
    return NextResponse.json({ success: true }, { status: 200 });
  } catch (error: any) {
    console.error("Failed to unregister node:", error);
    return NextResponse.json(
      { error: error.message || "Failed to unregister node" },
      { status: 500 },
    );
  }
}
