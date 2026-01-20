import { NextRequest, NextResponse } from "next/server";
import { requireAuth } from "@/lib/admin-auth";
import { fetchQuery } from "convex/nextjs";
import { api } from "../../../../../convex/_generated/api";

export async function GET(request: NextRequest) {
  const authResult = await requireAuth(request);
  if (authResult instanceof NextResponse) {
    return authResult;
  }

  try {
    console.log("[DEBUG] User ID from session:", authResult.user.id);
    console.log("[DEBUG] User email:", authResult.user.email);

    const nodes = await fetchQuery(api.nodes.listByOwner, {
      ownerId: authResult.user.id,
    });

    console.log("[DEBUG] Nodes found:", nodes.length, nodes);

    return NextResponse.json(
      { nodes, _debug: { userId: authResult.user.id } },
      { status: 200 },
    );
  } catch (error) {
    console.error("Error fetching contributor nodes:", error);
    return NextResponse.json(
      { error: "Failed to fetch nodes" },
      { status: 500 },
    );
  }
}
