import { redirect } from "next/navigation";
import { cookies } from "next/headers";
import { areWeLive, earlyAccessEnabled, rootFlags } from "@/lib/flags";
import ProtectedLayout from "./_components/protected-layout";

export default async function Layout({
  children,
  params,
}: {
  children: React.ReactNode;
  params: Promise<{ flags: string }>;
}) {
  const { flags } = await params;
  const live = await areWeLive(flags, rootFlags);
  if (!live) redirect("/");

  const cookieStore = await cookies();
  const sessionCookie = cookieStore.get("better-auth.session_token");

  if (!sessionCookie?.value) {
    redirect("/login");
  }

  const earlyAccessIsEnabled = await earlyAccessEnabled(flags, rootFlags);

  return (
    <ProtectedLayout earlyAccessEnabled={earlyAccessIsEnabled}>
      {children}
    </ProtectedLayout>
  );
}
