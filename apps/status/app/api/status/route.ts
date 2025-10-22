import { NextResponse } from "next/server";
import { getCurrentStatus, getRecentChecks } from "@/lib/redis";

export async function GET() {
  try {
    const current = await getCurrentStatus();
    const history = await getRecentChecks(24);

    const operationalChecks = history.filter(
      (check) => check.status === "operational",
    ).length;
    const uptime =
      history.length > 0 ? (operationalChecks / history.length) * 100 : 0;

    return NextResponse.json(
      {
        current: current || {
          status: "down",
          responseTime: 0,
          timestamp: Date.now(),
          error: "No data available",
        },
        history,
        uptime: Math.round(uptime * 100) / 100,
      },
      {
        headers: {
          "Cache-Control": "public, s-maxage=30, stale-while-revalidate=60",
          "Access-Control-Allow-Origin": "*",
          "Access-Control-Allow-Methods": "GET",
        },
      },
    );
  } catch (error) {
    console.error("Failed to fetch status:", error);
    return NextResponse.json(
      {
        error: "Failed to fetch status",
        details: error instanceof Error ? error.message : "Unknown error",
      },
      { status: 500 },
    );
  }
}
