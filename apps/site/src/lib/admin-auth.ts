import { NextRequest, NextResponse } from "next/server";
import { authClient } from "@/lib/auth-client";

export function isAdmin(userEmail?: string | null): boolean {
  if (!userEmail) return false;

  const adminUsers =
    process.env.ADMIN_USERS?.split(",").map((email) => email.trim()) || [];

  if (adminUsers.length === 0) {
    return false;
  }

  return adminUsers.includes(userEmail);
}

export function getAdminUsers(): string[] {
  return process.env.ADMIN_USERS?.split(",").map((email) => email.trim()) || [];
}

export type AuthResult = {
  user: {
    id: string;
    email: string;
    name: string;
    emailVerified: boolean;
  };
  isAdmin: boolean;
};

export async function getAuthenticatedUser(
  request: NextRequest,
): Promise<AuthResult | null> {
  const { data: session, error } = await authClient.getSession({
    fetchOptions: {
      headers: request.headers,
    },
  });

  if (error || !session) {
    return null;
  }

  return {
    user: {
      id: session.user.id,
      email: session.user.email,
      name: session.user.name,
      emailVerified: session.user.emailVerified,
    },
    isAdmin: isAdmin(session.user.email),
  };
}

export async function requireAuth(
  request: NextRequest,
): Promise<AuthResult | NextResponse> {
  const auth = await getAuthenticatedUser(request);

  if (!auth) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  return auth;
}

export async function requireAdmin(
  request: NextRequest,
): Promise<AuthResult | NextResponse> {
  const auth = await getAuthenticatedUser(request);

  if (!auth) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  if (!auth.isAdmin) {
    return NextResponse.json(
      { error: "Admin access required" },
      { status: 403 },
    );
  }

  return auth;
}
