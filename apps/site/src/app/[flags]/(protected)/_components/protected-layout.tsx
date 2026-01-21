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

function NavLink({
  href,
  isActive,
  children,
}: {
  href: string;
  isActive: boolean;
  children: React.ReactNode;
}) {
  return (
    <Link
      href={href}
      className={`relative py-2 text-sm transition-colors ${
        isActive ? "text-black" : "text-gray-500 hover:text-black"
      }`}
    >
      {children}
      {isActive && (
        <span className="absolute bottom-0 left-0 right-0 h-[2px] bg-orange-accent" />
      )}
    </Link>
  );
}

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
  const isOnDocs = pathname?.includes("/docs");

  return (
    <EarlyAccessProvider earlyAccessEnabled={earlyAccessEnabled}>
      <main className="max-w-7xl mx-auto px-8 py-8 min-h-screen font-mono">
        <div>
          {/* Header Section */}
          <div className="mb-8">
            {/* Brand Row */}
            <div className="flex items-center justify-between">
              <Link
                href="/vms"
                className="text-3xl font-normal tracking-tight hover:text-gray-700 transition-colors"
              >
                uvacompute
              </Link>
              <div className="text-sm text-gray-500">
                {isOnOnboarding ? "welcome" : "welcome back"}
                {user ? (
                  firstName ? (
                    <span className="text-black">, {firstName}</span>
                  ) : (
                    ""
                  )
                ) : (
                  <>
                    ,{" "}
                    <Skeleton className="inline-block h-4 w-20 align-middle" />
                  </>
                )}
              </div>
            </div>

            {/* Orange Accent Bar */}
            <div className="h-[3px] bg-orange-accent mt-4 mb-4" />

            {/* Navigation Row */}
            <div className="flex items-center justify-between">
              {/* Main Navigation */}
              <nav className="flex items-center gap-6">
                {isRedirecting ? (
                  <>
                    <Skeleton className="h-5 w-12" />
                    <Skeleton className="h-5 w-12" />
                    <Skeleton className="h-5 w-14" />
                    <Skeleton className="h-5 w-12" />
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
              <div className="flex items-center gap-6">
                {isRedirecting ? (
                  <>
                    <Skeleton className="h-5 w-14" />
                    <Skeleton className="h-5 w-16" />
                  </>
                ) : (
                  <>
                    {(!isOnOnboarding || hasEarlyAccess) && (
                      <>
                        <span className="text-gray-200">|</span>
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

          {children}
        </div>
      </main>
    </EarlyAccessProvider>
  );
}
