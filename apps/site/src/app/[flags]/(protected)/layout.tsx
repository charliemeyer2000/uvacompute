import { redirect } from "next/navigation";
import { headers } from "next/headers";
import { earlyAccessEnabled, rootFlags } from "@/lib/flags";
import { authClient } from "@/lib/auth-client";
import { preloadQuery } from "convex/nextjs";
import { getToken } from "@/lib/auth";
import { api } from "../../../../convex/_generated/api";
import ProtectedLayout from "./_components/protected-layout";

export default async function Layout({
  children,
  params,
}: {
  children: React.ReactNode;
  params: Promise<{ flags: string }>;
}) {
  const { flags } = await params;
  const headersList = await headers();

  const { data: session, error } = await authClient.getSession({
    fetchOptions: {
      headers: headersList,
    },
  });

  if (error || !session) {
    redirect("/login");
  }

  if (!session.user.emailVerified) {
    redirect(`/verify-email?email=${encodeURIComponent(session.user.email)}`);
  }

  const earlyAccessIsEnabled = await earlyAccessEnabled(flags, rootFlags);
  const token = await getToken();

  const [
    preloadedUser,
    preloadedDevAccess,
    preloadedEarlyAccess,
    preloadedPendingRequest,
  ] = await Promise.all([
    preloadQuery(api.auth.getCurrentUser, {}, { token }),
    preloadQuery(api.devAccess.hasDevAccess, {}, { token }),
    preloadQuery(api.earlyAccess.hasEarlyAccess, {}, { token }),
    preloadQuery(api.earlyAccess.hasPendingEarlyAccessRequest, {}, { token }),
  ]);

  return (
    <ProtectedLayout
      earlyAccessEnabled={earlyAccessIsEnabled}
      preloadedUser={preloadedUser}
      preloadedDevAccess={preloadedDevAccess}
      preloadedEarlyAccess={preloadedEarlyAccess}
      preloadedPendingRequest={preloadedPendingRequest}
      userId={session.user.id}
    >
      {children}
    </ProtectedLayout>
  );
}
