import { redirect } from "next/navigation";
import { cookies } from "next/headers";

export default async function DeviceLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const cookieStore = await cookies();
  const sessionCookie = cookieStore.get("better-auth.session_token");

  if (!sessionCookie?.value) {
    redirect("/login?redirect=/device");
  }

  return children;
}
