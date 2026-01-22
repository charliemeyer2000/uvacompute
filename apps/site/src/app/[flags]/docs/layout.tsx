"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { cn } from "@/lib/utils";
import { authClient } from "@/lib/auth-client";
import { useQuery } from "convex/react";
import { api } from "../../../../convex/_generated/api";
import { Button } from "@/components/ui/button";
import { toast } from "sonner";
import { useRouter } from "next/navigation";
import { Skeleton } from "@/components/ui/skeleton";

const docNavItems = [
  { href: "/docs", label: "getting started" },
  { href: "/docs/vms", label: "virtual machines" },
  { href: "/docs/jobs", label: "container jobs" },
  { href: "/docs/nodes", label: "node management" },
  { href: "/docs/configuration", label: "configuration" },
];

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

export default function DocsLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const pathname = usePathname();
  const router = useRouter();
  const { data: session, isPending } = authClient.useSession();
  const isLoggedIn = !isPending && !!session?.user;

  const user = useQuery(api.auth.getCurrentUser, isLoggedIn ? {} : "skip");
  const hasDevAccess = useQuery(
    api.devAccess.hasDevAccess,
    isLoggedIn ? {} : "skip",
  );

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

  function isActiveDocSection(href: string): boolean {
    if (href === "/docs") {
      return pathname === "/docs" || pathname?.endsWith("/docs") || false;
    }
    return pathname?.includes(href) ?? false;
  }

  return (
    <main className="max-w-7xl mx-auto px-8 py-8 min-h-screen font-mono">
      <div>
        {/* Header Section - Matches Dashboard */}
        <div className="mb-8">
          {/* Brand Row */}
          <div className="flex items-center justify-between">
            <Link
              href={isLoggedIn ? "/vms" : "/"}
              className="text-3xl font-normal tracking-tight hover:text-gray-700 transition-colors"
            >
              uvacompute
            </Link>
            {isLoggedIn ? (
              <div className="text-sm text-gray-500">
                welcome back
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
            ) : (
              <div className="flex items-center gap-4">
                <Link
                  href="/login"
                  className="text-sm text-gray-500 hover:text-black transition-colors"
                >
                  sign in
                </Link>
                <Link
                  href="/early-access"
                  className="text-sm text-orange-accent hover:underline transition-colors"
                >
                  get early access
                </Link>
              </div>
            )}
          </div>

          {/* Orange Accent Bar */}
          <div className="h-[3px] bg-orange-accent mt-4 mb-4" />

          {/* Navigation Row */}
          <div className="flex items-center justify-between">
            {/* Main Navigation */}
            <nav className="flex items-center gap-6">
              {isLoggedIn ? (
                <>
                  <NavLink href="/vms" isActive={false}>
                    vms
                  </NavLink>
                  <NavLink href="/jobs" isActive={false}>
                    jobs
                  </NavLink>
                  <NavLink href="/my-nodes" isActive={false}>
                    nodes
                  </NavLink>
                  <NavLink href="/docs" isActive={true}>
                    docs
                  </NavLink>
                </>
              ) : (
                <>
                  <NavLink href="/" isActive={false}>
                    home
                  </NavLink>
                  <NavLink href="/docs" isActive={true}>
                    docs
                  </NavLink>
                </>
              )}
            </nav>

            {/* User Actions */}
            <div className="flex items-center gap-6">
              {isLoggedIn ? (
                <>
                  <span className="text-gray-200">|</span>
                  <NavLink href="/profile" isActive={false}>
                    profile
                  </NavLink>
                  {hasDevAccess && (
                    <NavLink href="/admin" isActive={false}>
                      admin
                    </NavLink>
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
              ) : null}
            </div>
          </div>
        </div>

        {/* Docs Content with Sidebar */}
        <div className="flex gap-8">
          {/* Sidebar Navigation */}
          <nav className="w-48 flex-shrink-0">
            <ul className="space-y-1">
              {docNavItems.map((item) => (
                <li key={item.href}>
                  <Link
                    href={item.href}
                    className={cn(
                      "block py-2 px-3 text-sm border-l-2 transition-colors",
                      isActiveDocSection(item.href)
                        ? "border-orange-accent bg-orange-accent/5 text-black font-medium"
                        : "border-transparent text-gray-500 hover:border-gray-300 hover:text-black",
                    )}
                  >
                    {item.label}
                  </Link>
                </li>
              ))}
            </ul>
          </nav>

          {/* Main Content */}
          <article className="flex-1 min-w-0">{children}</article>
        </div>
      </div>
    </main>
  );
}
