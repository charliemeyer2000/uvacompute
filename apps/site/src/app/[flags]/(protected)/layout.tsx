import { redirect } from "next/navigation";
import { cookies } from "next/headers";
import { earlyAccessEnabled, rootFlags } from "@/lib/flags";
import ProtectedLayout from "./_components/protected-layout";

export default async function Layout({
  children,
  params,
}: {
  children: React.ReactNode;
  params: Promise<{ flags: string }>;
}) {
  const { flags } = await params;
  const cookieStore = await cookies();
  const sessionCookie = cookieStore.get("better-auth.session_token");

  console.log("[PROTECTED LAYOUT] Session cookie:", {
    exists: !!sessionCookie,
    value: sessionCookie?.value?.substring(0, 10) + "...",
    allCookies: cookieStore.getAll().map((c) => c.name),
  });

  if (!sessionCookie?.value) {
    console.log("[PROTECTED LAYOUT] No session cookie, redirecting to /login");
    redirect("/login");
  }

  const earlyAccessIsEnabled = await earlyAccessEnabled(flags, rootFlags);

  return (
    <ProtectedLayout earlyAccessEnabled={earlyAccessIsEnabled}>
      {children}
    </ProtectedLayout>
  );
}
