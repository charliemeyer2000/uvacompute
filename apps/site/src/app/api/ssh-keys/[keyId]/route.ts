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
    const keyId = keyIdParam as Id<"sshKeys">;

    await fetchMutation(api.sshKeys.remove, {
      keyId,
      userId: session.user.id,
    });

    return NextResponse.json({ success: true }, { status: 200 });
  } catch (error: any) {
    console.error("Error deleting SSH key:", error);
    return NextResponse.json(
      { error: error.message || "Failed to delete SSH key" },
      { status: 400 },
    );
  }
}

export async function PATCH(
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
    const body = await request.json();
    const { isPrimary } = body;

    if (isPrimary === true) {
      const { keyId: keyIdParam } = await params;
      const keyId = keyIdParam as Id<"sshKeys">;

      await fetchMutation(api.sshKeys.setPrimary, {
        keyId,
        userId: session.user.id,
      });

      return NextResponse.json({ success: true }, { status: 200 });
    }

    return NextResponse.json({ error: "Invalid request" }, { status: 400 });
  } catch (error: any) {
    console.error("Error updating SSH key:", error);
    return NextResponse.json(
      { error: error.message || "Failed to update SSH key" },
      { status: 400 },
    );
  }
}
