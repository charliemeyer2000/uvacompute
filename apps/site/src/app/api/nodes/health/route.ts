import { NextRequest, NextResponse } from "next/server";
import { verifyRequest } from "@/lib/orchestration-auth";
import { api } from "../../../../../convex/_generated/api";
import { fetchMutation } from "convex/nextjs";
import { z } from "zod";

const NodeHealthSchema = z.object({
  nodeId: z.string(),
  k8sNodeName: z.string(),
  ready: z.boolean(),
  gpuBusy: z.boolean().optional(),
  lastHeartbeat: z.number(),
  reason: z.string().optional(),
});

const HealthRequestSchema = z.object({
  nodes: z.array(NodeHealthSchema),
});

export async function POST(request: NextRequest) {
  const body = await request.text();
  if (!verifyRequest(request, body)) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
    const requestData = JSON.parse(body);
    const { nodes } = HealthRequestSchema.parse(requestData);

    const result = await fetchMutation(api.nodes.syncHealth, { nodes });

    return NextResponse.json(
      {
        success: true,
        nodesUpdated: result.nodesUpdated,
        workloadsMarkedOffline: result.workloadsMarkedOffline,
      },
      { status: 200 },
    );
  } catch (error) {
    if (error instanceof Error) {
      console.error("Failed to sync node health: " + error.message);
      return NextResponse.json(
        { error: "Failed to sync node health: " + error.message },
        { status: 500 },
      );
    }
    console.error("Failed to sync node health: Unknown error");
    return NextResponse.json(
      { error: "Failed to sync node health: Unknown error" },
      { status: 500 },
    );
  }
}
