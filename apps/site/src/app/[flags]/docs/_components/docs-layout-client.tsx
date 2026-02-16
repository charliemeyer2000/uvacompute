"use client";

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { cn } from "@/lib/utils";
import { authClient } from "@/lib/auth-client";
import { useQuery } from "convex/react";
import { api } from "../../../../../convex/_generated/api";
import { Button } from "@/components/ui/button";
import { NavLink } from "@/components/nav-link";
import { toast } from "sonner";
import { AnimatePresence, motion } from "motion/react";
import { useState, ViewTransition } from "react";

const docNavItems = [
  {
    href: "/docs",
    label: "getting started",
    subheadings: [
      { label: "install the cli", id: "install-the-cli" },
      { label: "create an account", id: "create-an-account" },
      { label: "authenticate your cli", id: "authenticate-your-cli" },
      { label: "what's next?", id: "whats-next" },
    ],
  },
  {
    href: "/docs/vms",
    label: "virtual machines",
    subheadings: [
      { label: "prerequisites", id: "prerequisites" },
      { label: "create a vm", id: "create-a-vm" },
      { label: "managing vms", id: "managing-vms" },
      { label: "vm options", id: "vm-options" },
    ],
  },
  {
    href: "/docs/jobs",
    label: "container jobs",
    subheadings: [
      { label: "prerequisites", id: "prerequisites" },
      { label: "examples", id: "examples" },
      { label: "managing jobs", id: "managing-jobs" },
      { label: "github actions runners", id: "github-actions-runner" },
      { label: "job options", id: "job-options" },
    ],
  },
  {
    href: "/docs/nodes",
    label: "node management",
    subheadings: [
      { label: "prerequisites", id: "prerequisites" },
      { label: "installing a node", id: "installing-a-node" },
      { label: "pausing a node", id: "pausing-a-node" },
      { label: "resuming a node", id: "resuming-a-node" },
      { label: "uninstalling a node", id: "uninstalling-a-node" },
      { label: "status reference", id: "status-reference" },
      { label: "additional commands", id: "additional-commands" },
    ],
  },
  {
    href: "/docs/configuration",
    label: "configuration",
    subheadings: [
      { label: "cli config", id: "cli-configuration" },
      { label: "node system config", id: "node-system-configuration" },
      { label: "node data storage", id: "node-data-storage" },
      { label: "ssh keys", id: "ssh-keys" },
      { label: "gpu mode management", id: "gpu-mode-scripts" },
      { label: "directory summary", id: "directory-summary" },
    ],
  },
];

function UserGreeting() {
  const { data: session } = authClient.useSession();
  const user = useQuery(api.auth.getCurrentUser, session?.user ? {} : "skip");
  const firstName = user?.name ? user.name.split(" ")[0].toLowerCase() : "";
  return firstName ? <span className="text-black">, {firstName}</span> : null;
}

function AdminLink() {
  const { data: session } = authClient.useSession();
  const hasDevAccess = useQuery(
    api.devAccess.hasDevAccess,
    session?.user ? {} : "skip",
  );
  if (!hasDevAccess) return null;
  return (
    <NavLink href="/admin" isActive={false}>
      admin
    </NavLink>
  );
}

export default function DocsLayoutClient({
  children,
}: {
  children: React.ReactNode;
}) {
  const { data: session, isPending } = authClient.useSession();
  const isLoggedIn = !isPending && !!session?.user;
  const pathname = usePathname();
  const router = useRouter();

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

  function isActiveDocSection(href: string): boolean {
    if (href === "/docs") {
      return pathname === "/docs" || pathname?.endsWith("/docs") || false;
    }
    return pathname?.includes(href) ?? false;
  }

  const [sidebarOpen, setSidebarOpen] = useState(false);

  return (
    <main className="max-w-7xl mx-auto px-4 py-6 sm:px-8 sm:py-8 min-h-screen font-mono">
      <div>
        {/* Header Section */}
        <div className="mb-8">
          <div className="flex items-center justify-between">
            <Link
              href={isLoggedIn ? "/vms" : "/"}
              className="text-2xl sm:text-3xl font-normal tracking-tight hover:text-gray-700 transition-colors"
            >
              uvacompute
            </Link>
            {isPending ? (
              <div className="h-4 w-20 bg-gray-100 animate-pulse rounded" />
            ) : isLoggedIn ? (
              <div className="text-sm text-gray-500">
                welcome back
                <UserGreeting />
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

          <div className="h-[3px] bg-orange-accent mt-4 mb-4" />

          <div className="flex items-center justify-between flex-wrap gap-y-2">
            <nav className="flex items-center gap-3 sm:gap-6">
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

            <div className="flex items-center gap-3 sm:gap-6">
              {isLoggedIn ? (
                <>
                  <span className="text-gray-200 hidden sm:inline">|</span>
                  <NavLink href="/profile" isActive={false}>
                    profile
                  </NavLink>
                  <AdminLink />
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

        {/* Mobile sidebar toggle */}
        <button
          onClick={() => setSidebarOpen(!sidebarOpen)}
          className="md:hidden text-sm text-gray-500 hover:text-black transition-colors mb-4"
        >
          {sidebarOpen ? "— hide menu" : "+ show menu"}
        </button>

        {/* Docs Content with Sidebar */}
        <div className="flex flex-col md:flex-row gap-4 md:gap-8">
          {/* Sidebar Navigation (desktop) */}
          <nav className="hidden md:block w-48 flex-shrink-0">
            <ul className="space-y-1">
              {docNavItems.map((item) => {
                const isActive = isActiveDocSection(item.href);
                return (
                  <li key={item.href}>
                    <Link
                      href={item.href}
                      className={cn(
                        "block py-2 px-3 text-sm border-l-2 transition-colors",
                        isActive
                          ? "border-orange-accent bg-orange-accent/5 text-black font-medium"
                          : "border-transparent text-gray-500 hover:border-gray-300 hover:text-black",
                      )}
                    >
                      {item.label}
                    </Link>
                    <AnimatePresence initial={false}>
                      {isActive && item.subheadings.length > 0 && (
                        <motion.ul
                          initial={{ height: 0, opacity: 0 }}
                          animate={{ height: "auto", opacity: 1 }}
                          exit={{ height: 0, opacity: 0 }}
                          transition={{ duration: 0.2, ease: "easeInOut" }}
                          className="overflow-hidden"
                        >
                          {item.subheadings.map((sub, i) => (
                            <motion.li
                              key={sub.id}
                              initial={{ opacity: 0, x: -4 }}
                              animate={{ opacity: 1, x: 0 }}
                              transition={{
                                duration: 0.15,
                                delay: 0.05 + i * 0.03,
                              }}
                            >
                              <a
                                href={`#${sub.id}`}
                                className="block py-1 pl-6 pr-3 text-xs border-l-2 border-transparent text-gray-400 hover:text-gray-700 transition-colors"
                              >
                                {sub.label}
                              </a>
                            </motion.li>
                          ))}
                        </motion.ul>
                      )}
                    </AnimatePresence>
                  </li>
                );
              })}
            </ul>
          </nav>

          {/* Sidebar Navigation (mobile) */}
          <AnimatePresence>
            {sidebarOpen && (
              <motion.nav
                initial={{ height: 0, opacity: 0 }}
                animate={{ height: "auto", opacity: 1 }}
                exit={{ height: 0, opacity: 0 }}
                transition={{ duration: 0.2, ease: "easeInOut" }}
                className="md:hidden w-full overflow-hidden"
              >
                <ul className="space-y-1">
                  {docNavItems.map((item, index) => {
                    const isActive = isActiveDocSection(item.href);
                    return (
                      <motion.li
                        key={item.href}
                        initial={{ opacity: 0, x: -8 }}
                        animate={{ opacity: 1, x: 0 }}
                        transition={{
                          duration: 0.15,
                          delay: 0.03 + index * 0.04,
                        }}
                      >
                        <Link
                          href={item.href}
                          onClick={() => setSidebarOpen(false)}
                          className={cn(
                            "block py-2 px-3 text-sm border-l-2 transition-colors",
                            isActive
                              ? "border-orange-accent bg-orange-accent/5 text-black font-medium"
                              : "border-transparent text-gray-500 hover:border-gray-300 hover:text-black",
                          )}
                        >
                          {item.label}
                        </Link>
                        {isActive && item.subheadings.length > 0 && (
                          <ul>
                            {item.subheadings.map((sub, i) => (
                              <motion.li
                                key={sub.id}
                                initial={{ opacity: 0, x: -4 }}
                                animate={{ opacity: 1, x: 0 }}
                                transition={{
                                  duration: 0.15,
                                  delay: 0.08 + index * 0.04 + i * 0.03,
                                }}
                              >
                                <a
                                  href={`#${sub.id}`}
                                  onClick={() => setSidebarOpen(false)}
                                  className="block py-1 pl-6 pr-3 text-xs border-l-2 border-transparent text-gray-400 hover:text-gray-700 transition-colors"
                                >
                                  {sub.label}
                                </a>
                              </motion.li>
                            ))}
                          </ul>
                        )}
                      </motion.li>
                    );
                  })}
                </ul>
              </motion.nav>
            )}
          </AnimatePresence>

          {/* Main Content */}
          <ViewTransition name="docs-content">
            <article className="flex-1 min-w-0">{children}</article>
          </ViewTransition>
        </div>
      </div>
    </main>
  );
}
