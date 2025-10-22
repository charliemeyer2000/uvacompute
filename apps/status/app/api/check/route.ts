import { NextRequest, NextResponse } from "next/server";
import { checkVMOrchestrationService } from "@/lib/health-check";
import { recordStatusCheck } from "@/lib/redis";

export async function POST(request: NextRequest) {
  const authHeader = request.headers.get("authorization");
  const cronSecret = process.env.CRON_SECRET;

  if (!cronSecret) {
    return NextResponse.json(
      { error: "CRON_SECRET not configured" },
      { status: 500 },
    );
  }

  if (authHeader !== `Bearer ${cronSecret}`) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
    const result = await checkVMOrchestrationService();

    await recordStatusCheck(
      result.status,
      result.responseTime,
      result.timestamp.getTime(),
      result.error,
    );

    return NextResponse.json({
      success: true,
      check: {
        status: result.status,
        responseTime: result.responseTime,
        timestamp: result.timestamp.toISOString(),
        ...(result.error && { error: result.error }),
      },
    });
  } catch (error) {
    console.error("Health check failed:", error);
    return NextResponse.json(
      {
        error: "Health check failed",
        details: error instanceof Error ? error.message : "Unknown error",
      },
      { status: 500 },
    );
  }
}
