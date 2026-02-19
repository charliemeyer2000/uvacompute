import { NextRequest, NextResponse } from "next/server";
import { getStatus } from "@/app/actions/status-actions";
import { SERVICE_IDS } from "@/types";
import type { ServiceId } from "@/types";

export async function GET(request: NextRequest) {
  const serviceParam =
    request.nextUrl.searchParams.get("service") || "orchestrator";

  if (!SERVICE_IDS.includes(serviceParam as ServiceId)) {
    return NextResponse.json(
      { error: `Invalid service. Must be one of: ${SERVICE_IDS.join(", ")}` },
      { status: 400 },
    );
  }

  try {
    const data = await getStatus(serviceParam as ServiceId);

    return NextResponse.json(data, {
      headers: {
        "Cache-Control": "public, s-maxage=30, stale-while-revalidate=60",
        "Access-Control-Allow-Origin": "*",
        "Access-Control-Allow-Methods": "GET",
      },
    });
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
