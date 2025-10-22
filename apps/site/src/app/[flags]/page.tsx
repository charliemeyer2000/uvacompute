import Link from "next/link";
import { areWeLive, rootFlags } from "@/lib/flags";
import { Button } from "@/components/ui/button";

export default async function Page({
  params,
}: {
  params: Promise<{ flags: string }>;
}) {
  const { flags } = await params;
  let live = false;
  try {
    live = await areWeLive(flags, rootFlags);
  } catch {
    live = false;
  }

  return (
    <main className="max-w-3xl mx-auto px-8 py-8 min-h-screen font-mono">
      <div>
        <div className="flex justify-between items-center mb-8">
          <h1 className="text-4xl font-normal leading-tight">uvacompute</h1>
          {live && (
            <Link href="/login" className="text-orange-accent underline">
              sign in
            </Link>
          )}
        </div>
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

        <h2 className="text-xl font-semibold mt-8 mb-4 text-black">access</h2>
        <p className="mb-4 text-base leading-relaxed">
          uvacompute is currently in closed beta. fill out the form to be an
          early adopter.
        </p>
        <div className="flex gap-3 mt-6">
          {!live && (
            <Button asChild>
              <Link href="/early-access">get early access</Link>
            </Button>
          )}
        </div>

        <footer className="mt-16 pt-4 border-t border-gray-200">
          <h3 className="text-base font-normal text-footer-grey italic">
            all content © 2025 the university of virginia compute company
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
        </footer>
      </div>
    </main>
  );
}
