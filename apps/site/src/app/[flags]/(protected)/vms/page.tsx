import { headers } from "next/headers";
import { preloadQuery } from "convex/nextjs";
import { getToken } from "@/lib/auth";
import { authClient } from "@/lib/auth-client";
import { api } from "../../../../../convex/_generated/api";
import VMsPageClient from "./_components/vms-page-client";

export default async function VMsPage() {
  const headersList = await headers();
  const { data: session } = await authClient.getSession({
    fetchOptions: { headers: headersList },
  });
  const userId = session!.user.id;
  const token = await getToken();

  const [preloadedAllVMs, preloadedActiveVMs, preloadedInactiveVMs] =
    await Promise.all([
      preloadQuery(api.vms.listByUser, { userId }, { token }),
      preloadQuery(api.vms.listActiveByUser, { userId }, { token }),
      preloadQuery(api.vms.listInactiveByUser, { userId }, { token }),
    ]);

  return (
    <VMsPageClient
      preloadedAllVMs={preloadedAllVMs}
      preloadedActiveVMs={preloadedActiveVMs}
      preloadedInactiveVMs={preloadedInactiveVMs}
      userId={userId}
    />
  );
}
