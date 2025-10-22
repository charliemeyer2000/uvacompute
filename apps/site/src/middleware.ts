import { NextResponse, NextRequest } from "next/server";
import { precompute } from "flags/next";
import { rootFlags } from "@/lib/flags";
import { getSessionCookie } from "better-auth/cookies";

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

  // Handle auth redirect for /device route
  const sessionCookie = getSessionCookie(request);
  if (request.nextUrl.pathname === "/device" && !sessionCookie) {
    const redirectUrl = `/device${request.nextUrl.search}`;
    const loginUrl = new URL(`/${flags}/login`, request.url);
    loginUrl.searchParams.set("redirect", redirectUrl);
    return NextResponse.redirect(loginUrl);
  }

  const response = NextResponse.rewrite(nextUrl, { request });
  response.headers.set("x-invoke-path", request.nextUrl.pathname);

  return response;
}
