import { NextRequest, NextResponse } from "next/server";
import { fetchQuery } from "convex/nextjs";
import { api } from "../../../../../convex/_generated/api";
import { verifyRequest } from "@/lib/orchestration-auth";

export async function GET(request: NextRequest) {
  if (!verifyRequest(request, "")) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
    const activeVms = await fetchQuery(api.vms.listActive, {});
    return NextResponse.json({ vms: activeVms }, { status: 200 });
  } catch (error: any) {
    console.error("Error fetching active VMs:", error);
    return NextResponse.json(
      { error: error.message || "Failed to fetch active VMs" },
      { status: 500 },
    );
  }
}
