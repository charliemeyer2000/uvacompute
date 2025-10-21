"use client";

import { useEffect } from "react";
import { useSearchParams } from "next/navigation";
import { toast } from "sonner";
import { Suspense } from "react";
import VMList from "./_components/vm-list";

function DashboardContent() {
  const searchParams = useSearchParams();

  useEffect(() => {
    if (searchParams.get("verified") === "true") {
      toast.success("email verified successfully!", {
        description: "welcome to uvacompute",
      });
    }
  }, [searchParams]);

  return (
    <div className="border-t border-gray-200 pt-8">
      <VMList />
    </div>
  );
}

export default function DashboardPage() {
  return (
    <Suspense
      fallback={
        <div className="border-t border-gray-200 pt-8">
          <VMList />
        </div>
      }
    >
      <DashboardContent />
    </Suspense>
  );
}
