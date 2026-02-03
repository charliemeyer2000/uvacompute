import { headers } from "next/headers";
import { preloadQuery } from "convex/nextjs";
import { getToken } from "@/lib/auth";
import { authClient } from "@/lib/auth-client";
import { api } from "../../../../../../convex/_generated/api";
import VMDetailPageClient from "./_components/vm-detail-page-client";

export default async function VMDetailPage({
  params,
}: {
  params: Promise<{ vmid: string }>;
}) {
  const { vmid } = await params;
  const headersList = await headers();
  const { data: session } = await authClient.getSession({
    fetchOptions: { headers: headersList },
  });
  const userId = session!.user.id;
  const token = await getToken();

  const preloadedVM = await preloadQuery(
    api.vms.getByVmId,
    { vmId: vmid, userId },
    { token },
  );

  return <VMDetailPageClient preloadedVM={preloadedVM} userId={userId} />;
}
