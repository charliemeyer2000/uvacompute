import { NextRequest, NextResponse } from "next/server";
import { authClient } from "@/lib/auth-client";

export async function POST(request: NextRequest) {
  const { data: session, error } = await authClient.getSession({
    fetchOptions: {
      headers: request.headers,
    },
  });

  if (error || !session) {
    return NextResponse.json(
      { error: error?.message || "Unauthorized" },
      { status: 401 },
    );
  }

  return NextResponse.json({
    message: "Counter incremented mock.",
    session: session,
  });
}
