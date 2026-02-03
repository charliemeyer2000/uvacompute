import { headers } from "next/headers";
import { preloadQuery } from "convex/nextjs";
import { getToken } from "@/lib/auth";
import { authClient } from "@/lib/auth-client";
import { api } from "../../../../convex/_generated/api";
import DocsLayoutClient from "./_components/docs-layout-client";

export default async function DocsLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const headersList = await headers();
  const { data: session } = await authClient.getSession({
    fetchOptions: { headers: headersList },
  });

  const isLoggedIn = !!session?.user;

  if (isLoggedIn) {
    const token = await getToken();
    const [preloadedUser, preloadedDevAccess] = await Promise.all([
      preloadQuery(api.auth.getCurrentUser, {}, { token }),
      preloadQuery(api.devAccess.hasDevAccess, {}, { token }),
    ]);

    return (
      <DocsLayoutClient
        isLoggedIn={true}
        preloadedUser={preloadedUser}
        preloadedDevAccess={preloadedDevAccess}
      >
        {children}
      </DocsLayoutClient>
    );
  }

  return <DocsLayoutClient isLoggedIn={false}>{children}</DocsLayoutClient>;
}
