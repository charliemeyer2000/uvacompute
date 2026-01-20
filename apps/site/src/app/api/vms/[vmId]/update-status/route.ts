import { NextRequest, NextResponse } from "next/server";
import { verifyRequest } from "@/lib/orchestration-auth";
import { api } from "../../../../../../convex/_generated/api";
import { fetchMutation } from "convex/nextjs";
import { z } from "zod";
import { VMStatusEnum } from "@/lib/vm-schemas";

const UpdateStatusRequestSchema = z.object({
  status: VMStatusEnum,
  nodeId: z.string().optional(),
});

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ vmId: string }> },
) {
  const body = await request.text();
  if (!verifyRequest(request, body)) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { vmId } = await params;

  try {
    const requestData = JSON.parse(body);
    const { status, nodeId } = UpdateStatusRequestSchema.parse(requestData);

    await fetchMutation(api.vms.updateStatus, { vmId, status, nodeId });
    return NextResponse.json({ success: true }, { status: 200 });
  } catch (error) {
    if (error instanceof Error) {
      console.error("Failed to update VM status: " + error.message);
      return NextResponse.json(
        { error: "Failed to update VM status: " + error.message },
        { status: 500 },
      );
    }
    console.error("Failed to update VM status: Unknown error");
    return NextResponse.json(
      { error: "Failed to update VM status: Unknown error" },
      { status: 500 },
    );
  }
}
