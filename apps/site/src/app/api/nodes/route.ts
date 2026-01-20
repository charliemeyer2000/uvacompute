import { NextRequest, NextResponse } from "next/server";
import { verifyRequest } from "@/lib/orchestration-auth";
import { api } from "../../../../convex/_generated/api";
import { fetchMutation, fetchQuery } from "convex/nextjs";
import { z } from "zod";

const RegisterNodeSchema = z.object({
  nodeId: z.string(),
  name: z.string().optional(),
  tunnelPort: z.number(),
  tunnelHost: z.string(),
  cpus: z.number().optional(),
  ram: z.number().optional(),
  gpus: z.number().optional(),
});

export async function POST(request: NextRequest) {
  const body = await request.text();
  if (!verifyRequest(request, body)) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
    const requestData = JSON.parse(body);
    const data = RegisterNodeSchema.parse(requestData);

    await fetchMutation(api.nodes.register, data);

    return NextResponse.json({ success: true }, { status: 200 });
  } catch (error: any) {
    console.error("Failed to register node:", error);
    return NextResponse.json(
      { error: error.message || "Failed to register node" },
      { status: 500 },
    );
  }
}

export async function GET(request: NextRequest) {
  const body = "";
  if (!verifyRequest(request, body)) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
    const nodes = await fetchQuery(api.nodes.listAll, {});
    return NextResponse.json({ nodes }, { status: 200 });
  } catch (error: any) {
    console.error("Failed to list nodes:", error);
    return NextResponse.json(
      { error: error.message || "Failed to list nodes" },
      { status: 500 },
    );
  }
}
