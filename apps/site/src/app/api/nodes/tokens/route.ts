import { NextRequest, NextResponse } from "next/server";
import { fetchMutation, fetchQuery } from "convex/nextjs";
import { api } from "../../../../../convex/_generated/api";
import { authClient } from "@/lib/auth-client";

export async function POST(request: NextRequest) {
  // Require authentication for token creation (admin only in future)
  const { data: session, error } = await authClient.getSession({
    fetchOptions: {
      headers: request.headers,
    },
  });

  if (error || !session) {
    return NextResponse.json(
      { error: "Unauthorized - login required" },
      { status: 401 },
    );
  }

  try {
    const body = await request.json().catch(() => ({}));

    const result = await fetchMutation(api.nodeTokens.createToken, {
      createdBy: session.user.id,
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
  // Require authentication for listing tokens
  const { data: session, error } = await authClient.getSession({
    fetchOptions: {
      headers: request.headers,
    },
  });

  if (error || !session) {
    return NextResponse.json(
      { error: "Unauthorized - login required" },
      { status: 401 },
    );
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
