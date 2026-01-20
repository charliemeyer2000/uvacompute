import { NextRequest, NextResponse } from "next/server";
import { verifyRequest } from "@/lib/orchestration-auth";
import { api } from "../../../../../../../convex/_generated/api";
import { fetchMutation } from "convex/nextjs";

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ jobId: string }> },
) {
  const body = await request.text();
  if (!verifyRequest(request, body)) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { jobId } = await params;

  try {
    const uploadUrl = await fetchMutation(api.logs.generateUploadUrl, {});

    const uploadResponse = await fetch(uploadUrl, {
      method: "POST",
      headers: {
        "Content-Type": "text/plain",
      },
      body: body,
    });

    if (!uploadResponse.ok) {
      throw new Error(`Failed to upload logs: ${uploadResponse.statusText}`);
    }

    const { storageId } = await uploadResponse.json();

    await fetchMutation(api.logs.storeLogFile, {
      jobId,
      storageId,
    });

    return NextResponse.json({ success: true, storageId }, { status: 200 });
  } catch (error) {
    const message =
      error instanceof Error ? error.message : "Failed to upload logs";
    console.error(`Failed to upload logs for job ${jobId}: ${message}`);
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
