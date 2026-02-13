"use client";

import Link from "next/link";
import { Button } from "@/components/ui/button";
import { authClient } from "@/lib/auth-client";
import { useQuery } from "convex/react";
import { api } from "../../../../convex/_generated/api";
import { FooterStatus } from "@/components/footer-status";

function EarlyAccessGate() {
  const { data: session } = authClient.useSession();
  const hasEarlyAccess = useQuery(
    api.earlyAccess.hasEarlyAccess,
    session?.user ? {} : "skip",
  );

  if (hasEarlyAccess !== false) return null;

  return (
    <>
      <h2 className="text-xl font-semibold mt-8 mb-4 text-black">access</h2>
      <p className="mb-4 text-base leading-relaxed">
        uvacompute is currently in closed beta. fill out the form to be an early
        adopter.
      </p>
      <div className="flex gap-3 mt-6">
        <Button asChild>
          <Link href="/early-access">get early access</Link>
        </Button>
      </div>
    </>
  );
}

export default function LandingPageClient() {
  const { data: session, isPending } = authClient.useSession();
  const isLoggedIn = !isPending && !!session?.user;

  return (
    <main className="max-w-3xl mx-auto px-8 py-8 min-h-screen font-mono">
      <div>
        <div className="flex justify-between items-center mb-8">
          <h1 className="text-4xl font-normal leading-tight">uvacompute</h1>
          {isLoggedIn ? (
            <Link href="/vms" className="text-orange-accent underline">
              dashboard
            </Link>
          ) : (
            <Link href="/login" className="text-orange-accent underline">
              sign in
            </Link>
          )}
        </div>
        <p className="mb-4 text-base leading-relaxed">
          your friendly local supercomputing company (at uva)
        </p>

        <h2 className="text-xl font-semibold mt-8 mb-4 text-black">
          virtual machines
        </h2>
        <p className="mb-4 text-base leading-relaxed">
          get instant access to gpu-powered vms with rtx 5090s, up to 2tb nvme
          ssd, 16 vcpus, and 64gb ram. get an ssh shell in under 10 seconds.
        </p>

        <h2 className="text-xl font-semibold mt-8 mb-4 text-black">
          container jobs
        </h2>
        <p className="mb-4 text-base leading-relaxed">
          run any docker container on our network with a single command. perfect
          for ml training, batch processing, and data pipelines.
        </p>

        <h2 className="text-xl font-semibold mt-8 mb-4 text-black">
          distributed network
        </h2>
        <p className="mb-4 text-base leading-relaxed">
          our federated compute network spans multiple nodes. contributors can
          share their gpu hardware and join the network with a simple install
          script.
        </p>

        <h2 className="text-xl font-semibold mt-8 mb-4 text-black">
          documentation
        </h2>
        <p className="mb-4 text-base leading-relaxed">
          learn how to use uvacompute with our{" "}
          <Link href="/docs" className="text-orange-accent underline">
            documentation
          </Link>
          .
        </p>

        {isLoggedIn ? (
          <EarlyAccessGate />
        ) : (
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
            all content © 2026 the university of virginia compute company
          </h3>
          <ul className="list-none mb-2 space-y-1 italic">
            <li>
              <a
                href="mailto:***REDACTED_EMAIL***"
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
