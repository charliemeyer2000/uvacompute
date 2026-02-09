"use client";

import { useRouter, usePathname } from "next/navigation";
import { usePreloadedQuery, useMutation, Preloaded } from "convex/react";
import { authClient } from "@/lib/auth-client";
import { api } from "../../../../../convex/_generated/api";
import { Button } from "@/components/ui/button";
import { NavLink } from "@/components/nav-link";
import Link from "next/link";
import { toast } from "sonner";
import { EarlyAccessProvider } from "./early-access-context";
import { ViewTransition } from "react";
import { useRedirectLogic } from "./use-redirect-logic";

export default function ProtectedLayout({
  children,
  earlyAccessEnabled,
  preloadedUser,
  preloadedDevAccess,
  preloadedEarlyAccess,
  preloadedPendingRequest,
  userId,
}: {
  children: React.ReactNode;
  earlyAccessEnabled: boolean;
  preloadedUser: Preloaded<typeof api.auth.getCurrentUser>;
  preloadedDevAccess: Preloaded<typeof api.devAccess.hasDevAccess>;
  preloadedEarlyAccess: Preloaded<typeof api.earlyAccess.hasEarlyAccess>;
  preloadedPendingRequest: Preloaded<
    typeof api.earlyAccess.hasPendingEarlyAccessRequest
  >;
  userId: string;
}) {
  const router = useRouter();
  const pathname = usePathname();
  const user = usePreloadedQuery(preloadedUser);
  const hasDevAccess = usePreloadedQuery(preloadedDevAccess);
  const hasEarlyAccess = usePreloadedQuery(preloadedEarlyAccess);
  const hasPendingRequest = usePreloadedQuery(preloadedPendingRequest);
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
  const isOnDocs = pathname?.includes("/docs");

  return (
    <EarlyAccessProvider earlyAccessEnabled={earlyAccessEnabled}>
      <main className="max-w-7xl mx-auto px-4 py-6 sm:px-8 sm:py-8 min-h-screen font-mono">
        <div>
          {/* Header Section */}
          <div className="mb-8">
            {/* Brand Row */}
            <div className="flex items-center justify-between">
              <Link
                href="/vms"
                className="text-2xl sm:text-3xl font-normal tracking-tight hover:text-gray-700 transition-colors"
              >
                uvacompute
              </Link>
              <div className="text-sm text-gray-500">
                {isOnOnboarding ? "welcome" : "welcome back"}
                {firstName ? (
                  <span className="text-black">, {firstName}</span>
                ) : (
                  ""
                )}
              </div>
            </div>

            {/* Orange Accent Bar */}
            <div className="h-[3px] bg-orange-accent mt-4 mb-4" />

            {/* Navigation Row */}
            <div className="flex items-center justify-between flex-wrap gap-y-2">
              {/* Main Navigation */}
              <nav className="flex items-center gap-3 sm:gap-6">
                {isRedirecting ? (
                  <>
                    <span className="h-5 w-12" />
                    <span className="h-5 w-12" />
                    <span className="h-5 w-14" />
                    <span className="h-5 w-12" />
                  </>
                ) : (
                  <>
                    {(!isOnOnboarding || hasEarlyAccess) && (
                      <>
                        <NavLink href="/vms" isActive={isOnVMs ?? false}>
                          vms
                        </NavLink>
                        <NavLink href="/jobs" isActive={isOnJobs ?? false}>
                          jobs
                        </NavLink>
                        <NavLink href="/my-nodes" isActive={isOnNodes ?? false}>
                          nodes
                        </NavLink>
                        <NavLink href="/docs" isActive={isOnDocs ?? false}>
                          docs
                        </NavLink>
                      </>
                    )}
                  </>
                )}
              </nav>

              {/* User Actions */}
              <div className="flex items-center gap-3 sm:gap-6">
                {isRedirecting ? (
                  <>
                    <span className="h-5 w-14" />
                    <span className="h-5 w-16" />
                  </>
                ) : (
                  <>
                    {(!isOnOnboarding || hasEarlyAccess) && (
                      <>
                        <span className="text-gray-200 hidden sm:inline">
                          |
                        </span>
                        <NavLink
                          href="/profile"
                          isActive={isOnProfile ?? false}
                        >
                          profile
                        </NavLink>
                        {hasDevAccess && (
                          <NavLink href="/admin" isActive={isOnAdmin ?? false}>
                            admin
                          </NavLink>
                        )}
                      </>
                    )}
                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={handleSignOut}
                      className="text-gray-500 hover:text-black hover:bg-transparent px-0"
                    >
                      sign out
                    </Button>
                  </>
                )}
              </div>
            </div>
          </div>

          <ViewTransition name="page-content">{children}</ViewTransition>
        </div>
      </main>
    </EarlyAccessProvider>
  );
}
