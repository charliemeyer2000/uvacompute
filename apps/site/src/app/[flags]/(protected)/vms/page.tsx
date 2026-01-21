"use client";

import { useEffect, useState } from "react";
import { useSearchParams } from "next/navigation";
import Link from "next/link";
import { useQuery } from "convex/react";
import { api } from "../../../../../convex/_generated/api";
import { authClient } from "@/lib/auth-client";
import { toast } from "sonner";
import ActiveVMs from "../dashboard/_components/active-vms";
import VMHistory from "../dashboard/_components/vm-history";
import { Monitor, Server } from "lucide-react";

type Tab = "active" | "history";

function TabButton({
  active,
  onClick,
  children,
  count,
}: {
  active: boolean;
  onClick: () => void;
  children: React.ReactNode;
  count?: number;
}) {
  return (
    <button
      onClick={onClick}
      className={`relative px-4 py-2 text-sm font-medium transition-colors ${
        active ? "text-black" : "text-gray-500 hover:text-black"
      }`}
    >
      <span className="flex items-center gap-2">
        {children}
        {count !== undefined && (
          <span
            className={`text-xs px-1.5 py-0.5 rounded ${
              active
                ? "bg-orange-accent/10 text-orange-accent"
                : "bg-gray-100 text-gray-500"
            }`}
          >
            {count}
          </span>
        )}
      </span>
      {active && (
        <span className="absolute bottom-0 left-0 right-0 h-[2px] bg-orange-accent" />
      )}
    </button>
  );
}

export default function VMsPage() {
  const { data: session } = authClient.useSession();
  const searchParams = useSearchParams();
  const [activeTab, setActiveTab] = useState<Tab>("active");

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

  const activeVMs = useQuery(
    api.vms.listActiveByUser,
    session?.user?.id ? { userId: session.user.id } : "skip",
  );

  const inactiveVMs = useQuery(
    api.vms.listInactiveByUser,
    session?.user?.id ? { userId: session.user.id } : "skip",
  );

  const hasNoVMs = allVMs && allVMs.length === 0;

  if (hasNoVMs) {
    return (
      <div className="space-y-6">
        {/* Page Header */}
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-2xl font-semibold text-black">
              virtual machines
            </h1>
            <p className="text-sm text-gray-500 mt-1">
              manage your cloud compute instances
            </p>
          </div>
        </div>

        {/* Empty State */}
        <div className="border border-gray-200 bg-white p-12 text-center">
          <div className="mx-auto w-12 h-12 bg-gray-100 rounded-lg flex items-center justify-center mb-4">
            <Monitor className="w-6 h-6 text-gray-400" />
          </div>
          <h2 className="text-lg font-semibold text-black mb-2">no vms yet</h2>
          <p className="text-sm text-gray-500 mb-6 max-w-md mx-auto">
            you haven&apos;t created any virtual machines yet. get started by
            creating your first vm using the cli.
          </p>
          <div className="bg-gray-50 border border-gray-200 px-4 py-3 inline-block mb-4">
            <code className="text-sm text-gray-700">
              uva vm create -h 1 -n my-vm
            </code>
          </div>
          <div>
            <Link
              href="/docs/vms"
              className="text-orange-accent hover:underline text-sm"
            >
              learn how to create a vm &rarr;
            </Link>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Page Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-semibold text-black">
            virtual machines
          </h1>
          <p className="text-sm text-gray-500 mt-1">
            manage your cloud compute instances
          </p>
        </div>

        {/* Stats Summary */}
        <div className="flex items-center gap-6 text-sm">
          <div className="flex items-center gap-2">
            <span className="w-2 h-2 rounded-full bg-green-500" />
            <span className="text-gray-500">
              {activeVMs?.length ?? "—"} active
            </span>
          </div>
          <div className="flex items-center gap-2">
            <span className="w-2 h-2 rounded-full bg-gray-300" />
            <span className="text-gray-500">
              {inactiveVMs?.length ?? "—"} historical
            </span>
          </div>
        </div>
      </div>

      {/* Tab Navigation */}
      <div className="border-b border-gray-200">
        <div className="flex gap-2">
          <TabButton
            active={activeTab === "active"}
            onClick={() => setActiveTab("active")}
            count={activeVMs?.length}
          >
            active
          </TabButton>
          <TabButton
            active={activeTab === "history"}
            onClick={() => setActiveTab("history")}
            count={inactiveVMs?.length}
          >
            history
          </TabButton>
        </div>
      </div>

      {/* Tab Content */}
      <div>{activeTab === "active" ? <ActiveVMs /> : <VMHistory />}</div>
    </div>
  );
}
