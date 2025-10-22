import { redirect } from "next/navigation";
import { headers } from "next/headers";
import { earlyAccessEnabled, rootFlags } from "@/lib/flags";
import { authClient } from "@/lib/auth-client";
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

  return (
    <ProtectedLayout earlyAccessEnabled={earlyAccessIsEnabled}>
      {children}
    </ProtectedLayout>
  );
}
