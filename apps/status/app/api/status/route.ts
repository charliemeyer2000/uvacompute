import { NextResponse } from "next/server";
import { getStatus } from "@/app/actions/status-actions";

export async function GET() {
  try {
    const data = await getStatus();

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
