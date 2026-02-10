import { NextRequest, NextResponse } from "next/server";
import { authClient } from "@/lib/auth-client";
import { fetchMutation } from "convex/nextjs";
import { api } from "../../../../../convex/_generated/api";
import { Id } from "../../../../../convex/_generated/dataModel";

export async function DELETE(
  request: NextRequest,
  { params }: { params: Promise<{ keyId: string }> },
) {
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

  try {
    const { keyId: keyIdParam } = await params;
    const keyId = keyIdParam as Id<"apiKeys">;

    await fetchMutation(api.apiKeys.revoke, {
      userId: session.user.id,
      keyId,
    });

    return NextResponse.json({ success: true }, { status: 200 });
  } catch (error: any) {
    console.error("Error revoking API key:", error);
    return NextResponse.json(
      { error: error.message || "Failed to revoke API key" },
      { status: 400 },
    );
  }
}
