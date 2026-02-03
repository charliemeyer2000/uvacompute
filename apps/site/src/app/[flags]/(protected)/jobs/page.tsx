import { headers } from "next/headers";
import { preloadQuery } from "convex/nextjs";
import { getToken } from "@/lib/auth";
import { authClient } from "@/lib/auth-client";
import { api } from "../../../../../convex/_generated/api";
import JobsPageClient from "./_components/jobs-page-client";

export default async function JobsPage() {
  const headersList = await headers();
  const { data: session } = await authClient.getSession({
    fetchOptions: { headers: headersList },
  });
  const userId = session!.user.id;
  const token = await getToken();

  const [preloadedAllJobs, preloadedActiveJobs, preloadedInactiveJobs] =
    await Promise.all([
      preloadQuery(api.jobs.listByUser, { userId }, { token }),
      preloadQuery(api.jobs.listActiveByUser, { userId }, { token }),
      preloadQuery(api.jobs.listInactiveByUser, { userId }, { token }),
    ]);

  return (
    <JobsPageClient
      preloadedAllJobs={preloadedAllJobs}
      preloadedActiveJobs={preloadedActiveJobs}
      preloadedInactiveJobs={preloadedInactiveJobs}
      userId={userId}
    />
  );
}
