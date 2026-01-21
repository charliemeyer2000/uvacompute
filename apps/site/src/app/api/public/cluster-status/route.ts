import { NextResponse } from "next/server";
import { fetchQuery } from "convex/nextjs";
import { api } from "../../../../../convex/_generated/api";

export const dynamic = "force-dynamic";
export const revalidate = 0;

export async function GET() {
  try {
    const clusterStatus = await fetchQuery(api.publicStatus.getClusterStatus);

    return NextResponse.json(clusterStatus, {
      status: 200,
      headers: {
        "Cache-Control": "no-store, max-age=0",
        "Access-Control-Allow-Origin": "*",
      },
    });
  } catch (error) {
    console.error("Failed to fetch cluster status:", error);
    return NextResponse.json(
      {
        error: "Failed to fetch cluster status",
        timestamp: Date.now(),
        overall: "down",
        resources: {
          nodes: { total: 0, online: 0, offline: 0, draining: 0 },
          vcpus: { total: 0, available: 0 },
          ram: { total: 0, available: 0 },
          gpus: { total: 0, available: 0, byType: {} },
        },
        nodes: [],
      },
      { status: 500 },
    );
  }
}
