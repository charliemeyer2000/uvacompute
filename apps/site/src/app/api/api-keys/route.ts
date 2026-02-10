import { NextRequest, NextResponse } from "next/server";
import { authClient } from "@/lib/auth-client";
import { validateGithubToken } from "@/lib/github-token";
import { fetchMutation, fetchQuery } from "convex/nextjs";
import { api } from "../../../../convex/_generated/api";

export async function GET(request: NextRequest) {
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
    const keys = await fetchQuery(api.apiKeys.list, {
      userId: session.user.id,
    });

    return NextResponse.json({ keys }, { status: 200 });
  } catch (error: any) {
    console.error("Error fetching API keys:", error);
    return NextResponse.json(
      { error: error.message || "Failed to fetch API keys" },
      { status: 500 },
    );
  }
}

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

  try {
    const body = await request.json();
    const name = body.name || "Unnamed Key";
    const githubToken = body.githubToken as string | undefined;

    let tokenValidation;
    if (githubToken) {
      tokenValidation = await validateGithubToken(githubToken);
      if (!tokenValidation.valid) {
        return NextResponse.json(
          { error: tokenValidation.error },
          { status: 400 },
        );
      }
    }

    const result = await fetchMutation(api.apiKeys.create, {
      userId: session.user.id,
      name,
      ...(githubToken ? { githubToken } : {}),
    });

    return NextResponse.json(
      {
        ...result,
        ...(tokenValidation
          ? {
              githubTokenStatus: {
                valid: true,
                username: tokenValidation.username,
                tokenType: tokenValidation.tokenType,
              },
            }
          : {}),
      },
      { status: 201 },
    );
  } catch (error: any) {
    console.error("Error creating API key:", error);
    return NextResponse.json(
      { error: error.message || "Failed to create API key" },
      { status: 500 },
    );
  }
}
