"use client";

import { useEffect, useState } from "react";
import { useQuery, useMutation } from "convex/react";
import { useRouter, usePathname } from "next/navigation";
import { authClient } from "@/lib/auth-client";
import { api } from "../../../../../convex/_generated/api";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import Link from "next/link";
import { toast } from "sonner";
import { EarlyAccessProvider } from "./early-access-context";

export default function ProtectedLayout({
  children,
  earlyAccessEnabled,
}: {
  children: React.ReactNode;
  earlyAccessEnabled: boolean;
}) {
  const router = useRouter();
  const pathname = usePathname();
  const [mounted, setMounted] = useState(false);
  const user = useQuery(api.auth.getCurrentUser);
  const hasDevAccess = useQuery(api.devAccess.hasDevAccess);
  const hasEarlyAccess = useQuery(api.earlyAccess.hasEarlyAccess);
  const hasPendingRequest = useQuery(
    api.earlyAccess.hasPendingEarlyAccessRequest,
  );
  const syncEarlyAccess = useMutation(api.earlyAccess.syncEarlyAccessFromToken);

  useEffect(() => {
    setMounted(true);
  }, []);

  useEffect(() => {
    if (user && !user.emailVerified) {
      router.push(`/verify-email?email=${encodeURIComponent(user.email)}`);
    }
  }, [user, router]);

  useEffect(() => {
    if (user && earlyAccessEnabled) {
      syncEarlyAccess();
    }
  }, [user, earlyAccessEnabled, syncEarlyAccess]);

  useEffect(() => {
    if (!user) return;

    const isOnOnboarding = mounted && pathname?.includes("/onboarding");

    if (earlyAccessEnabled && hasEarlyAccess === false && !isOnOnboarding) {
      if (hasPendingRequest) {
        router.push("/pending-approval");
      } else {
        router.push("/early-access");
      }
    }
  }, [
    user,
    hasEarlyAccess,
    hasPendingRequest,
    earlyAccessEnabled,
    router,
    mounted,
    pathname,
  ]);

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
  const isOnProfile = mounted && pathname?.includes("/profile");
  const isOnDevTools = mounted && pathname?.includes("/dev-tools");
  const isOnDashboard = mounted && pathname?.includes("/dashboard");
  const isOnOnboarding = mounted && pathname?.includes("/onboarding");

  return (
    <EarlyAccessProvider earlyAccessEnabled={earlyAccessEnabled}>
      <main className="max-w-7xl mx-auto px-8 py-8 min-h-screen font-mono">
        <div>
          <div className="flex items-start justify-between mb-8">
            <div>
              <Link
                href="/dashboard"
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
              {(!isOnOnboarding || hasEarlyAccess) && (
                <>
                  <Button
                    variant={isOnDashboard ? "default" : "outline"}
                    asChild
                  >
                    <Link href="/dashboard">dashboard</Link>
                  </Button>
                  <Button variant={isOnProfile ? "default" : "outline"} asChild>
                    <Link href="/profile">profile</Link>
                  </Button>
                  {hasDevAccess && (
                    <Button
                      variant={isOnDevTools ? "default" : "outline"}
                      asChild
                    >
                      <Link href="/dev-tools">dev tools</Link>
                    </Button>
                  )}
                </>
              )}
              <Button onClick={handleSignOut}>sign out</Button>
            </div>
          </div>

          {children}
        </div>
      </main>
    </EarlyAccessProvider>
  );
}
