import { NextRequest, NextResponse } from "next/server";
import { getStatusHistory } from "@/app/actions/status-actions";
import { SERVICE_IDS } from "@/types";
import type { ServiceId } from "@/types";

export async function GET(request: NextRequest) {
  const searchParams = request.nextUrl.searchParams;
  const serviceParam = searchParams.get("service") || "orchestrator";
  const daysParam = searchParams.get("days");
  const days = parseInt(daysParam || "7", 10);

  if (!SERVICE_IDS.includes(serviceParam as ServiceId)) {
    return NextResponse.json(
      { error: `Invalid service. Must be one of: ${SERVICE_IDS.join(", ")}` },
      { status: 400 },
    );
  }

  if (isNaN(days) || days < 1 || days > 30) {
    return NextResponse.json(
      {
        error: "Invalid 'days' parameter",
        details: "Must be a number between 1 and 30",
      },
      { status: 400 },
    );
  }

  try {
    const data = await getStatusHistory(serviceParam as ServiceId, days);

    return NextResponse.json(data, {
      headers: {
        "Cache-Control": "public, s-maxage=300, stale-while-revalidate=600",
        "Access-Control-Allow-Origin": "*",
        "Access-Control-Allow-Methods": "GET",
      },
    });
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
