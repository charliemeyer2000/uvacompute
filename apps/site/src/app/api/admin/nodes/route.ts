import { NextRequest, NextResponse } from "next/server";
import { requireAdmin } from "@/lib/admin-auth";
import { fetchQuery } from "convex/nextjs";
import { api } from "../../../../../convex/_generated/api";

export async function GET(request: NextRequest) {
  const authResult = await requireAdmin(request);
  if (authResult instanceof NextResponse) {
    return authResult;
  }

  try {
    const nodes = await fetchQuery(api.nodes.listAll, {});

    return NextResponse.json({ nodes }, { status: 200 });
  } catch (error) {
    console.error("Error fetching nodes:", error);
    return NextResponse.json(
      { error: "Failed to fetch nodes" },
      { status: 500 },
    );
  }
}
