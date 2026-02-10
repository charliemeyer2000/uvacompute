import { NextRequest, NextResponse } from "next/server";
import { authClient } from "@/lib/auth-client";
import { validateGithubToken } from "@/lib/github-token";
import { fetchMutation } from "convex/nextjs";
import { api } from "../../../../../convex/_generated/api";
import { Id } from "../../../../../convex/_generated/dataModel";

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
    const { keyId: keyIdParam } = await params;
    const keyId = keyIdParam as Id<"apiKeys">;
    const body = await request.json();
    const githubToken = body.githubToken as string;

    if (!githubToken) {
      return NextResponse.json(
        { error: "githubToken is required" },
        { status: 400 },
      );
    }

    const tokenValidation = await validateGithubToken(githubToken);
    if (!tokenValidation.valid) {
      return NextResponse.json(
        { error: tokenValidation.error },
        { status: 400 },
      );
    }

    await fetchMutation(api.apiKeys.updateGithubToken, {
      userId: session.user.id,
      keyId,
      githubToken,
    });

    return NextResponse.json(
      {
        success: true,
        githubTokenStatus: {
          valid: true,
          username: tokenValidation.username,
          tokenType: tokenValidation.tokenType,
        },
      },
      { status: 200 },
    );
  } catch (error: any) {
    console.error("Error updating GitHub token:", error);
    return NextResponse.json(
      { error: error.message || "Failed to update GitHub token" },
      { status: 400 },
    );
  }
}

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
