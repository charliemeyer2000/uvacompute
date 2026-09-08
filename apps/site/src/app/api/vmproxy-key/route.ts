import { NextRequest, NextResponse } from "next/server";
import { authClient } from "@/lib/auth-client";

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

  const vmproxyKey = process.env.VMPROXY_PRIVATE_KEY;
  if (!vmproxyKey) {
    console.error("VMPROXY_PRIVATE_KEY environment variable not set");
    return NextResponse.json(
      { error: "Server configuration error: vmproxy key not configured" },
      { status: 500 },
    );
  }

  return new NextResponse(vmproxyKey, {
    headers: {
      "Content-Type": "text/plain",
    },
  });
}
