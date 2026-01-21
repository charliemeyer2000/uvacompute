"use client";

import { useRouter, usePathname } from "next/navigation";
import { useQuery, useMutation } from "convex/react";
import { authClient } from "@/lib/auth-client";
import { api } from "../../../../../convex/_generated/api";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import Link from "next/link";
import { toast } from "sonner";
import { EarlyAccessProvider } from "./early-access-context";
import { useRedirectLogic } from "./use-redirect-logic";

export default function ProtectedLayout({
  children,
  earlyAccessEnabled,
}: {
  children: React.ReactNode;
  earlyAccessEnabled: boolean;
}) {
  const router = useRouter();
  const pathname = usePathname();
  const user = useQuery(api.auth.getCurrentUser);
  const hasDevAccess = useQuery(api.devAccess.hasDevAccess);
  const hasEarlyAccess = useQuery(api.earlyAccess.hasEarlyAccess);
  const hasPendingRequest = useQuery(
    api.earlyAccess.hasPendingEarlyAccessRequest,
  );
  const syncEarlyAccess = useMutation(api.earlyAccess.syncEarlyAccessFromToken);

  const { isLoading: isRedirecting } = useRedirectLogic({
    user,
    earlyAccessEnabled,
    hasEarlyAccess,
    hasPendingRequest,
    pathname,
    syncEarlyAccess,
    router,
  });

  const handleSignOut = async () => {
    try {
      await authClient.signOut();
      router.push("/login");
    } catch (error) {
      toast.error("sign out failed", {
        description:
          error instanceof Error ? error.message : "an error occurred",
      });
    }
  };

  const firstName = user?.name ? user.name.split(" ")[0].toLowerCase() : "";
  const isOnProfile = pathname?.includes("/profile");
  const isOnVMs = pathname?.includes("/vms");
  const isOnJobs = pathname?.includes("/jobs");
  const isOnNodes = pathname?.includes("/my-nodes");
  const isOnAdmin = pathname?.includes("/admin");
  const isOnOnboarding = pathname?.includes("/onboarding");

  return (
    <EarlyAccessProvider earlyAccessEnabled={earlyAccessEnabled}>
      <main className="max-w-7xl mx-auto px-8 py-8 min-h-screen font-mono">
        <div>
          <div className="flex items-start justify-between mb-8">
            <div>
              <Link
                href="/vms"
                className="text-4xl font-normal leading-tight hover:text-gray-700"
              >
                uvacompute
              </Link>
              <div className="mt-2 text-base text-gray-600">
                {isOnOnboarding ? "welcome" : "welcome back"}
                {user ? (
                  firstName ? (
                    `, ${firstName}`
                  ) : (
                    ""
                  )
                ) : (
                  <>
                    ,{" "}
                    <Skeleton className="inline-block h-5 w-24 align-middle" />
                  </>
                )}
              </div>
            </div>
            <div className="flex gap-2">
              {isRedirecting ? (
                <>
                  <Skeleton className="h-10 w-24" />
                  <Skeleton className="h-10 w-20" />
                  <Skeleton className="h-10 w-20" />
                </>
              ) : (
                <>
                  {(!isOnOnboarding || hasEarlyAccess) && (
                    <>
                      <Button variant={isOnVMs ? "default" : "outline"} asChild>
                        <Link href="/vms">vms</Link>
                      </Button>
                      <Button
                        variant={isOnJobs ? "default" : "outline"}
                        asChild
                      >
                        <Link href="/jobs">jobs</Link>
                      </Button>
                      <Button
                        variant={isOnNodes ? "default" : "outline"}
                        asChild
                      >
                        <Link href="/my-nodes">nodes</Link>
                      </Button>
                      <Button
                        variant={isOnProfile ? "default" : "outline"}
                        asChild
                      >
                        <Link href="/profile">profile</Link>
                      </Button>
                      {hasDevAccess && (
                        <Button
                          variant={isOnAdmin ? "default" : "outline"}
                          asChild
                        >
                          <Link href="/admin">admin</Link>
                        </Button>
                      )}
                    </>
                  )}
                  <Button onClick={handleSignOut}>sign out</Button>
                </>
              )}
            </div>
          </div>

          {children}
        </div>
      </main>
    </EarlyAccessProvider>
  );
}
