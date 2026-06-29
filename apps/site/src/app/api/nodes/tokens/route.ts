import { NextRequest, NextResponse } from "next/server";
import { fetchMutation, fetchQuery } from "convex/nextjs";
import { api } from "../../../../../convex/_generated/api";
import { requireAdmin } from "@/lib/admin-auth";

export async function POST(request: NextRequest) {
  const authResult = await requireAdmin(request);
  if (authResult instanceof NextResponse) {
    return authResult;
  }

  try {
    const body = await request.json().catch(() => ({}));

    const result = await fetchMutation(api.nodeTokens.createToken, {
      createdBy: authResult.user.id,
    });

    return NextResponse.json(result, { status: 201 });
  } catch (error: any) {
    console.error("Failed to create token:", error);
    return NextResponse.json(
      { error: error.message || "Failed to create token" },
      { status: 500 },
    );
  }
}

export async function GET(request: NextRequest) {
  const authResult = await requireAdmin(request);
  if (authResult instanceof NextResponse) {
    return authResult;
  }

  try {
    const tokens = await fetchQuery(api.nodeTokens.listTokens, {
      includeUsed: true,
    });

    return NextResponse.json({ tokens }, { status: 200 });
  } catch (error: any) {
    console.error("Failed to list tokens:", error);
    return NextResponse.json(
      { error: error.message || "Failed to list tokens" },
      { status: 500 },
    );
  }
}
