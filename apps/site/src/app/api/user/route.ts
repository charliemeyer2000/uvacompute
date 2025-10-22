import { NextRequest, NextResponse } from "next/server";
import { authClient } from "@/lib/auth-client";

export async function GET(request: NextRequest) {
  try {
    const { data: session, error } = await authClient.getSession({
      fetchOptions: {
        headers: request.headers,
      },
    });

    if (error || !session) {
      return NextResponse.json(
        { error: error?.message || "unauthorized" },
        { status: 401 },
      );
    }

    const user = session.user;

    return NextResponse.json(
      {
        user: {
          id: user.id,
          name: user.name,
          email: user.email,
          emailVerified: user.emailVerified,
          image: user.image || null,
          createdAt: user.createdAt,
        },
      },
      { status: 200 },
    );
  } catch (error) {
    return NextResponse.json(
      {
        error: error instanceof Error ? error.message : "internal server error",
      },
      { status: 500 },
    );
  }
}
