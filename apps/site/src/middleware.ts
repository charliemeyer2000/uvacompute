import { NextResponse, NextRequest } from "next/server";
import { precompute } from "flags/next";
import { rootFlags } from "@/lib/flags";

export const config = { matcher: ["/((?!_next|api|\.well-known|.*\\..*).*)"] };

export async function middleware(request: NextRequest) {
  const segments = request.nextUrl.pathname.split("/").filter(Boolean);
  const alreadyHasFlags = segments.length > 0 && segments[0].includes(".");

  if (alreadyHasFlags) {
    return NextResponse.next();
  }

  const flags = await precompute(rootFlags);
  const nextUrl = new URL(
    `/${flags}${request.nextUrl.pathname}${request.nextUrl.search}`,
    request.url,
  );

  const response = NextResponse.rewrite(nextUrl, { request });
  response.headers.set("x-invoke-path", request.nextUrl.pathname);

  return response;
}
