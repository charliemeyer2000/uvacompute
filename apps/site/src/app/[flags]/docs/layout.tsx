"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { cn } from "@/lib/utils";

const navItems = [
  { href: "/docs", label: "getting started" },
  { href: "/docs/vms", label: "virtual machines" },
  { href: "/docs/jobs", label: "container jobs" },
  { href: "/docs/nodes", label: "node management" },
];

export default function DocsLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const pathname = usePathname();

  return (
    <main className="max-w-5xl mx-auto px-8 py-8 min-h-screen font-mono">
      <header className="mb-8">
        <Link href="/" className="text-orange-accent underline text-sm">
          &larr; back to home
        </Link>
        <h1 className="text-2xl font-semibold mt-4">documentation</h1>
        <p className="text-gray-600 text-sm mt-1">
          learn how to use uvacompute
        </p>
      </header>

      <div className="flex gap-8">
        <nav className="w-48 flex-shrink-0">
          <ul className="space-y-1">
            {navItems.map((item) => {
              const isActive = pathname === item.href;
              return (
                <li key={item.href}>
                  <Link
                    href={item.href}
                    className={cn(
                      "block py-2 px-3 text-sm border-l-2 transition-colors",
                      isActive
                        ? "border-black bg-gray-50 text-black font-medium"
                        : "border-transparent text-gray-600 hover:border-gray-300 hover:text-black",
                    )}
                  >
                    {item.label}
                  </Link>
                </li>
              );
            })}
          </ul>
        </nav>

        <article className="flex-1 min-w-0">{children}</article>
      </div>
    </main>
  );
}
