"use client";

import Link from "next/link";
import { Button } from "@/components/ui/button";
import LandingHeader from "./_components/landing-header";
import { authClient } from "@/lib/auth-client";
import { useQuery } from "convex/react";
import { api } from "../../../convex/_generated/api";
import { FooterStatus } from "@/components/footer-status";

export default function Page() {
  const { data: session, isPending } = authClient.useSession();
  const isLoggedIn = !isPending && !!session?.user;
  const hasEarlyAccess = useQuery(
    api.earlyAccess.hasEarlyAccess,
    isLoggedIn ? {} : "skip",
  );

  const shouldShowAccessSection = !isLoggedIn || hasEarlyAccess === false;

  return (
    <main className="max-w-3xl mx-auto px-8 py-8 min-h-screen font-mono">
      <div>
        <LandingHeader />
        <p className="mb-4 text-base leading-relaxed">
          your friendly local supercomputing company (at uva)
        </p>

        <h2 className="text-xl font-semibold mt-8 mb-4 text-black">
          gpus instantly
        </h2>
        <p className="mb-4 text-base leading-relaxed">
          the fastest way to run GPU-intensive workloads right now. get access
          to our fleet of 5090s, up to 2TB NVMe SSD, 16 vCPUs, and 64GB RAM. get
          an ssh shell in under 10 seconds.
        </p>

        <h2 className="text-xl font-semibold mt-8 mb-4 text-black">
          coming soon
        </h2>
        <p className="mb-4 text-base leading-relaxed">
          we're working to build serverless containers and k8s vclusters.
        </p>

        {shouldShowAccessSection && (
          <>
            <h2 className="text-xl font-semibold mt-8 mb-4 text-black">
              access
            </h2>
            <p className="mb-4 text-base leading-relaxed">
              uvacompute is currently in closed beta. fill out the form to be an
              early adopter.
            </p>
            <div className="flex gap-3 mt-6">
              <Button asChild>
                <Link href="/early-access">get early access</Link>
              </Button>
            </div>
          </>
        )}

        <footer className="mt-16 pt-4 border-t border-gray-200">
          <h3 className="text-base font-normal text-footer-grey italic">
            all content © 2025 the university of virginia compute company
          </h3>
          <ul className="list-none mb-2 space-y-1 italic">
            <li>
              <a
                href="mailto:charlie@charliemeyer.xyz"
                className="text-orange-accent underline"
              >
                contact us
              </a>
            </li>
          </ul>
          <div className="mt-4">
            <FooterStatus />
          </div>
        </footer>
      </div>
    </main>
  );
}
