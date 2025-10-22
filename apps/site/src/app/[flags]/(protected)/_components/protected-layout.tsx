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
  const { data: session } = authClient.useSession();
  const sessionToken = session?.session?.token;
  const user = useQuery(
    api.auth.getCurrentUser,
    sessionToken ? { token: sessionToken } : "skip",
  );
  const hasDevAccess = useQuery(
    api.devAccess.hasDevAccess,
    sessionToken ? { token: sessionToken } : "skip",
  );
  const hasEarlyAccess = useQuery(
    api.earlyAccess.hasEarlyAccess,
    sessionToken ? { token: sessionToken } : "skip",
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
    if (user && earlyAccessEnabled && sessionToken) {
      syncEarlyAccess({ token: sessionToken });
    }
  }, [user, earlyAccessEnabled, sessionToken, syncEarlyAccess]);

  useEffect(() => {
    if (!user) return;

    if (earlyAccessEnabled && hasEarlyAccess === false) {
      router.push("/pending-approval");
    }
  }, [user, hasEarlyAccess, earlyAccessEnabled, router]);

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

  return (
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
              welcome back
              {user ? (
                firstName ? (
                  `, ${firstName}`
                ) : (
                  ""
                )
              ) : (
                <>
                  , <Skeleton className="inline-block h-5 w-24 align-middle" />
                </>
              )}
            </div>
          </div>
          <div className="flex gap-2">
            <Button variant={isOnDashboard ? "default" : "outline"} asChild>
              <Link href="/dashboard">dashboard</Link>
            </Button>
            <Button variant={isOnProfile ? "default" : "outline"} asChild>
              <Link href="/profile">profile</Link>
            </Button>
            {hasDevAccess && (
              <Button variant={isOnDevTools ? "default" : "outline"} asChild>
                <Link href="/dev-tools">dev tools</Link>
              </Button>
            )}
            <Button onClick={handleSignOut}>sign out</Button>
          </div>
        </div>

        {children}
      </div>
    </main>
  );
}
