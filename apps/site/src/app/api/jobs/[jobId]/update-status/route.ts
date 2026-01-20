import { NextRequest, NextResponse } from "next/server";
import { verifyRequest } from "@/lib/orchestration-auth";
import { api } from "../../../../../../convex/_generated/api";
import { fetchMutation } from "convex/nextjs";
import { z } from "zod";
import { JobStatusEnum } from "@/lib/job-schemas";

const UpdateStatusRequestSchema = z.object({
  status: JobStatusEnum,
  exitCode: z.number().optional(),
  errorMessage: z.string().optional(),
  nodeId: z.string().optional(),
  logsUrl: z.string().optional(),
});

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
    const requestData = JSON.parse(body);
    const { status, exitCode, errorMessage, nodeId, logsUrl } =
      UpdateStatusRequestSchema.parse(requestData);

    await fetchMutation(api.jobs.updateStatus, {
      jobId,
      status,
      exitCode,
      errorMessage,
      nodeId,
      logsUrl,
    });
    return NextResponse.json({ success: true }, { status: 200 });
  } catch (error) {
    if (error instanceof Error) {
      console.error("Failed to update job status: " + error.message);
      return NextResponse.json(
        { error: "Failed to update job status: " + error.message },
        { status: 500 },
      );
    }
    console.error("Failed to update job status: Unknown error");
    return NextResponse.json(
      { error: "Failed to update job status: Unknown error" },
      { status: 500 },
    );
  }
}
