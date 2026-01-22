import { NextRequest, NextResponse } from "next/server";
import {
  verifyRequest,
  verifyNodeRequest,
  isNodeAuthRequest,
} from "@/lib/orchestration-auth";
import { api } from "../../../../../../convex/_generated/api";
import { fetchMutation, fetchQuery } from "convex/nextjs";
import { z } from "zod";

const SetGpuModeSchema = z.object({
  gpuMode: z.enum(["nvidia", "vfio"]),
  verified: z.boolean(),
});

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
    const result = await fetchQuery(api.nodes.getActiveGpuWorkloads, {
      nodeId,
    });

    return NextResponse.json(
      {
        canSwitch: result.canSwitch,
        currentMode: result.currentMode,
        gpuVmCount: result.gpuVms.length,
        gpuJobCount: result.gpuJobs.length,
      },
      { status: 200 },
    );
  } catch (error: any) {
    console.error("Failed to check GPU workloads:", error);
    return NextResponse.json(
      { error: error.message || "Failed to check GPU workloads" },
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
    const { gpuMode, verified } = SetGpuModeSchema.parse(requestData);

    if (!verified) {
      return NextResponse.json(
        { error: "GPU mode switch verification failed" },
        { status: 400 },
      );
    }

    const result = await fetchMutation(api.nodes.setGpuMode, {
      nodeId,
      gpuMode,
    });

    return NextResponse.json(result, { status: 200 });
  } catch (error: any) {
    console.error("Failed to set GPU mode:", error);
    return NextResponse.json(
      { error: error.message || "Failed to set GPU mode" },
      { status: 500 },
    );
  }
}
