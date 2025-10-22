"use client";

import { useEffect } from "react";
import { useSearchParams } from "next/navigation";
import { toast } from "sonner";
import VMList from "./_components/vm-list";

export default function DashboardPage() {
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
