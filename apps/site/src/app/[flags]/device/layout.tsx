import { redirect } from "next/navigation";
import { headers } from "next/headers";
import { authClient } from "@/lib/auth-client";

export default async function DeviceLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const headersList = await headers();

  const { data: session, error } = await authClient.getSession({
    fetchOptions: {
      headers: headersList,
    },
  });

  if (error || !session) {
    const queryString = headersList.get("x-invoke-query") || "";
    const redirectUrl = `/device${queryString}`;
    redirect(`/login?redirect=${encodeURIComponent(redirectUrl)}`);
  }

  return children;
}
