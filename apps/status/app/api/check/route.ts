import { NextRequest, NextResponse } from "next/server";
import { checkHub, checkPlatformAPI } from "@/lib/health-check";
import { recordStatusCheck } from "@/lib/redis";
import type { HealthCheckResult, ServiceId } from "@/types";

export async function GET(request: NextRequest) {
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
    const [hubResults, platformResult] = await Promise.all([
      checkHub(),
      checkPlatformAPI(),
    ]);

    const checks: { serviceId: ServiceId; result: HealthCheckResult }[] = [
      { serviceId: "orchestrator", result: hubResults.orchestrator },
      { serviceId: "frp", result: hubResults.frp },
      { serviceId: "platform", result: platformResult },
    ];

    await Promise.all(
      checks.map(({ serviceId, result }) =>
        recordStatusCheck(
          serviceId,
          result.status,
          result.responseTime,
          result.timestamp.getTime(),
          result.error,
        ),
      ),
    );

    return NextResponse.json({
      success: true,
      checks: checks.map(({ serviceId, result }) => ({
        serviceId,
        status: result.status,
        responseTime: result.responseTime,
        timestamp: result.timestamp.toISOString(),
        ...(result.error && { error: result.error }),
      })),
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
