import { NextRequest, NextResponse } from "next/server";
import { fetchQuery } from "convex/nextjs";
import { api } from "../../../../../convex/_generated/api";

export async function GET(request: NextRequest) {
  // Verify the sync secret
  const syncSecret = request.headers.get("X-Sync-Secret");
  const expectedSecret = process.env.NODE_KEYS_SYNC_SECRET;

  if (!expectedSecret) {
    console.error("NODE_KEYS_SYNC_SECRET not configured");
    return NextResponse.json(
      { error: "Server misconfigured" },
      { status: 500 },
    );
  }

  if (syncSecret !== expectedSecret) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
    const keys = await fetchQuery(api.nodes.getPublicKeys, {});

    return NextResponse.json({ keys }, { status: 200 });
  } catch (error: any) {
    console.error("Failed to fetch node keys:", error);
    return NextResponse.json(
      { error: error.message || "Failed to fetch keys" },
      { status: 500 },
    );
  }
}
