"use client";

import { useEffect } from "react";
import { useSearchParams } from "next/navigation";
import Link from "next/link";
import { useQuery } from "convex/react";
import { api } from "../../../../../convex/_generated/api";
import { authClient } from "@/lib/auth-client";
import { toast } from "sonner";
import ActiveVMs from "../dashboard/_components/active-vms";
import VMHistory from "../dashboard/_components/vm-history";

export default function VMsPage() {
  const { data: session } = authClient.useSession();
  const searchParams = useSearchParams();

  useEffect(() => {
    if (searchParams.get("verified") === "true") {
      toast.success("email verified successfully!", {
        description: "welcome to uvacompute",
      });
    }
  }, [searchParams]);

  const allVMs = useQuery(
    api.vms.listByUser,
    session?.user?.id ? { userId: session.user.id } : "skip",
  );

  const hasNoVMs = allVMs && allVMs.length === 0;

  if (hasNoVMs) {
    return (
      <div className="border-t border-gray-200 pt-8 space-y-6">
        <div className="border border-gray-200 p-8 text-center">
          <h2 className="text-xl font-semibold text-black mb-2">no vms yet</h2>
          <p className="text-sm text-gray-600 mb-4">
            you haven&apos;t created any virtual machines yet.
          </p>
          <Link href="/docs/vms" className="text-orange-accent underline">
            learn how to create a vm &rarr;
          </Link>
        </div>
      </div>
    );
  }

  return (
    <div className="border-t border-gray-200 pt-8 space-y-8">
      <ActiveVMs />
      <VMHistory />
    </div>
  );
}
