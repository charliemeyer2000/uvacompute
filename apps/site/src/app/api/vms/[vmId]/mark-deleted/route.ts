import { NextRequest, NextResponse } from "next/server";
import { verifyRequest } from "@/lib/orchestration-auth";
import { api } from "../../../../../../convex/_generated/api";
import { fetchMutation } from "convex/nextjs";

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
    await fetchMutation(api.vms.markAsDeleted, { vmId });
    return NextResponse.json({ success: true }, { status: 200 });
  } catch (error) {
    if (error instanceof Error) {
      console.error("Failed to mark VM as deleted: " + error.message);
      return NextResponse.json(
        { error: "Failed to mark VM as deleted: " + error.message },
        { status: 500 },
      );
    }
    console.error("Failed to mark VM as deleted: Unknown error");
    return NextResponse.json(
      { error: "Failed to mark VM as deleted: Unknown error" },
      { status: 500 },
    );
  }
}
