import Link from "next/link";
import { areWeLive, rootFlags } from "@/lib/flags";

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
        <h1 className="text-4xl font-normal mb-8 leading-tight">uvacompute</h1>
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
        <div className="mt-8">
          uvacompute is currently in closed beta. email{" "}
          <Link
            href="mailto:***REDACTED_EMAIL***"
            className="text-orange-accent no-underline hover:underline"
          >
            ***REDACTED_EMAIL***
          </Link>{" "}
          if you want to be an early adopter.
        </div>

        <footer className="mt-16 pt-4 border-t border-gray-200">
          <h3 className="text-base font-normal text-footer-grey italic">
            All content © 2025 UVA Compute LLC
          </h3>
          <ul className="list-none mb-2 space-y-1 italic">
            <li>
              <a href="mailto:***REDACTED_EMAIL***">Contact us</a>
            </li>
          </ul>
        </footer>
      </div>
    </main>
  );
}
