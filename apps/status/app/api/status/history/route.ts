import { NextRequest, NextResponse } from "next/server";
import { getHistoricalData, StatusCheck } from "@/lib/redis";

interface DayAggregate {
  date: string;
  operational: number;
  degraded: number;
  down: number;
  total: number;
  uptimePercentage: number;
  avgResponseTime: number;
}

function aggregateByDay(checks: StatusCheck[]): DayAggregate[] {
  const dayMap = new Map<string, StatusCheck[]>();

  for (const check of checks) {
    const date = new Date(check.timestamp);
    const dateKey = date.toISOString().split("T")[0];

    if (!dayMap.has(dateKey)) {
      dayMap.set(dateKey, []);
    }
    dayMap.get(dateKey)!.push(check);
  }

  const aggregates: DayAggregate[] = [];

  for (const [date, dayChecks] of dayMap.entries()) {
    const operational = dayChecks.filter(
      (c) => c.status === "operational",
    ).length;
    const degraded = dayChecks.filter((c) => c.status === "degraded").length;
    const down = dayChecks.filter((c) => c.status === "down").length;
    const total = dayChecks.length;
    const uptimePercentage = (operational / total) * 100;
    const avgResponseTime =
      dayChecks.reduce((sum, c) => sum + c.responseTime, 0) / total;

    aggregates.push({
      date,
      operational,
      degraded,
      down,
      total,
      uptimePercentage: Math.round(uptimePercentage * 100) / 100,
      avgResponseTime: Math.round(avgResponseTime),
    });
  }

  return aggregates.sort((a, b) => a.date.localeCompare(b.date));
}

export async function GET(request: NextRequest) {
  const searchParams = request.nextUrl.searchParams;
  const daysParam = searchParams.get("days");
  const days = Math.min(Math.max(parseInt(daysParam || "7", 10), 1), 90);

  try {
    const checks = await getHistoricalData(days);
    const aggregated = aggregateByDay(checks);

    return NextResponse.json(
      {
        days,
        aggregated,
        totalChecks: checks.length,
      },
      {
        headers: {
          "Cache-Control": "public, s-maxage=300, stale-while-revalidate=600",
          "Access-Control-Allow-Origin": "*",
          "Access-Control-Allow-Methods": "GET",
        },
      },
    );
  } catch (error) {
    console.error("Failed to fetch historical data:", error);
    return NextResponse.json(
      {
        error: "Failed to fetch historical data",
        details: error instanceof Error ? error.message : "Unknown error",
      },
      { status: 500 },
    );
  }
}
