import { headers } from "next/headers";
import { authClient } from "@/lib/auth-client";
import { preloadQuery } from "convex/nextjs";
import { getToken } from "@/lib/auth";
import { api } from "../../../convex/_generated/api";
import LandingPageClient from "./_components/landing-page-client";

export default async function Page() {
  const headersList = await headers();
  const { data: session } = await authClient.getSession({
    fetchOptions: { headers: headersList },
  });

  const isLoggedIn = !!session?.user;

  if (isLoggedIn) {
    const token = await getToken();
    const preloadedEarlyAccess = await preloadQuery(
      api.earlyAccess.hasEarlyAccess,
      {},
      { token },
    );
    return (
      <LandingPageClient
        isLoggedIn={true}
        preloadedEarlyAccess={preloadedEarlyAccess}
      />
    );
  }

  return <LandingPageClient isLoggedIn={false} />;
}
